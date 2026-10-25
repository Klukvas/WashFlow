"""Docker/SSH protocol fixtures exercise failure ordering without production access."""
import argparse
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import signal
import sys
import tarfile
import tempfile
import threading
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/deploy'))
import common
import remote
import transport

SHA = 'a' * 40
OLD = {'backend': 'sha256:' + '1' * 64, 'frontend': 'sha256:' + '2' * 64}
NEW = {'backend': 'sha256:' + '3' * 64, 'frontend': 'sha256:' + '4' * 64}
CATALOG = b'{"tables":[],"columns":[]}'


def tar_bytes(*, unsafe=False):
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode='w:') as archive:
        member = tarfile.TarInfo('photo.jpg' if not unsafe else '../outside')
        member.size = 5
        archive.addfile(member, io.BytesIO(b'photo'))
    return buffer.getvalue()


class DockerFixture:
    def __init__(self, root):
        self.root, self.calls, self.fail = root, [], None
        self.rows = [{'name': '20260101000000_initial', 'checksum': 'e' * 64,
                      'complete': True, 'rolled_back': False}]
        self.schema, self.sessions, self.arch = CATALOG, 0, 'amd64'
        self.upload = {'Source': '/owned/uploads', 'Destination': '/app/uploads',
                       'Type': 'volume', 'RW': True, 'Name': 'washflow_uploads'}
        self.items = {}
        self.generation = 0
        self.commands = {'backend': ['sh', '-c', 'npx prisma migrate deploy && node dist/main.js'],
                         'frontend': ['nginx', '-g', 'daemon off;']}
        self.frontend_test = ['CMD', 'wget', '-qO-', 'http://localhost:80/']
        self.health_recent = [{'exit_code': 1, 'connection_refused': True}]
        for name in ['backend', 'frontend', 'postgres', 'redis']:
            self.items[name] = {'id': name, 'image': OLD.get(name, name + '-image'),
                                'running': True, 'health': 'healthy', 'project': 'washflow',
                                'service': name, 'oneoff': 'False', 'directory': str(root),
                                'files': str(root / 'docker-compose.yml'),
                                'mounts': [copy.deepcopy(self.upload)] if name == 'backend' else []}

    def __call__(self, args, *, data=None, input_file=None, output=None, timeout=60):
        args = [str(x) for x in args]
        self.calls.append(args)
        result = b''
        if args[:3] == ['docker', 'ps', '-aq']:
            result = ' '.join(x['id'] for x in self.items.values()).encode()
        elif args[:3] == ['docker', 'ps', '-q']:
            service = args[-1].split('=')[-1]
            result = self.items[service]['id'].encode() if self.items[service]['running'] else b''
        elif args[:2] == ['docker', 'inspect']:
            item = next(x for x in self.items.values() if x['id'] == args[-1])
            if args[3] == common.FRONTEND_HEALTH_PROOF:
                return json.dumps({'known_localhost_wget': self.frontend_test ==
                    ['CMD', 'wget', '-qO-', 'http://localhost:80/'], 'recent': self.health_recent}).encode()
            result = json.dumps(self.commands[item['service']]
                                if args[3] == '{{json .Config.Cmd}}' else item).encode()
            if self.fail == 'health' and item['image'] in NEW.values():
                result = json.dumps({**item, 'health': 'unhealthy'}).encode()
        elif args[:2] == ['docker', 'info']:
            result = b'{"os":"linux","arch":"x86_64"}'
        elif args[:3] == ['docker', 'image', 'inspect']:
            service = 'frontend' if 'frontend:' in args[-1] else 'backend'
            result = json.dumps({'id': NEW[service], 'os': 'linux', 'arch': self.arch,
                                 'revision': SHA, 'digests': ['repo@sha256:' + '5' * 64]}).encode()
        elif args[:2] == ['docker', 'exec']:
            command = ' '.join(args)
            if args[3:] == ['wget', '-q', '-O', '-', '-T', '5', 'http://127.0.0.1:80/']:
                if self.fail == 'ipv4': raise common.Refusal('synthetic_ipv4_get_failure')
            elif 'psql' in command:
                if b'pg_database_size' in data:
                    result = json.dumps({'major': 16, 'size': 1000, 'encoding': 'UTF8',
                                         'other_sessions': self.sessions}).encode()
                elif b'migration_name' in data:
                    result = json.dumps(self.rows).encode()
                else:
                    result = self.schema
            elif 'du -sk' in command:
                result = b'1 /app/uploads\n'
            elif 'pg_dump' in command:
                if self.fail == 'dump':
                    raise common.Refusal('synthetic_dump_failure')
                result = b'PGDMPsynthetic'
            elif 'pg_restore' in command and '--version' in command:
                result = b'pg_restore (PostgreSQL) 16.10'
            elif 'pg_restore' in command and '--list' in command:
                if self.fail == 'restore_list':
                    raise common.Refusal('synthetic_listing_failure')
                assert input_file.read().startswith(b'PGDMP')
        elif args[:2] == ['docker', 'cp']:
            result = tar_bytes(unsafe=self.fail == 'archive')
        elif args[:2] == ['docker', 'stop']:
            self.items['backend']['running'] = False
            if self.fail == 'stop':
                raise common.Refusal('synthetic_partial_stop')
        elif args[:2] == ['docker', 'compose'] and 'up' in args:
            override = Path(args[args.index('-f', args.index('-f') + 1) + 1])
            value = json.loads(override.read_text())['services']
            self.generation += 1
            for service in ['backend', 'frontend']:
                command = value[service].get('command', self.commands[service])
                health_test = value[service].get('healthcheck', {}).get('test',
                    ['CMD', 'wget', '-qO-', 'http://localhost:80/']) if service == 'frontend' else None
                changed = (self.items[service]['image'] != value[service]['image'] or
                           self.commands[service] != command or
                           (service == 'frontend' and self.frontend_test != health_test))
                if changed or '--force-recreate' in args:
                    self.items[service]['image'] = value[service]['image']
                    self.items[service]['id'] = service + '-' + str(self.generation)
                    self.items[service]['files'] = str(self.root / 'docker-compose.yml') + ',' + str(override)
                    self.commands[service] = command
                    if service == 'frontend':
                        self.frontend_test = health_test
                        self.items[service]['health'] = 'healthy'
                self.items[service]['running'] = True
                # A real partial recreate can replace backend and fail before frontend.
                if service == 'backend' and self.fail in {'compose', 'interrupt'} and override.name == 'images.json':
                    if self.fail == 'interrupt':
                        raise KeyboardInterrupt()
                    raise common.Refusal('synthetic_partial_compose')
        elif args[:2] == ['docker', 'pull'] or args == ['docker', 'compose', 'version']:
            pass
        else:
            raise AssertionError('Unexpected fixture command: ' + repr(args))
        if output:
            output.write(result)
            return b''
        return result


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(dir=ROOT / 'test/deploy')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.release = self.root / 'releases' / (SHA + '-1-1')
        self.release.mkdir(parents=True, mode=0o700)
        (self.release.parent).chmod(0o700)
        (self.root / '.env').write_bytes(b'PRIVATE_SENTINEL_MUST_NEVER_APPEAR')
        (self.root / 'docker-compose.yml').write_text('existing compose\n')
        (self.release / 'expected.json').write_text(json.dumps({
            'format': 'washflow-deploy-expected-v1', 'postgres_major': 16,
            'migrations': {'20260101000000_initial': 'e' * 64},
            'schema_hash': common.catalog_hash(CATALOG)}))
        (self.release / 'catalog.sql').write_bytes(b'catalog fixture')
        self.fixture = DockerFixture(self.root)
        self.deployment = remote.Deployment(self.release, 'owner/backend:' + SHA,
                                             'owner/frontend:' + SHA, SHA, self.root)
        self.addCleanup(patch.stopall)
        patch('remote.run', side_effect=self.fixture).start()
        patch('common.run', side_effect=self.fixture).start()
        patch('remote.shutil.disk_usage', return_value=argparse.Namespace(free=20 * 1024**3)).start()
        patch('remote.os.sysconf', side_effect=lambda key: 1024**3 if key == 'SC_AVPHYS_PAGES' else 1).start()
        def wait(check, **_):
            common.require(check(), 'health_deadline_exceeded')
        patch('remote.wait_until', side_effect=wait).start()
        previous = {s: signal.getsignal(s) for s in [signal.SIGTERM, signal.SIGINT, signal.SIGHUP]}
        self.addCleanup(lambda: [signal.signal(s, h) for s, h in previous.items()])

    def no_update(self):
        self.assertFalse(any(c[:2] == ['docker', 'stop'] or 'up' in c for c in self.fixture.calls))

    def assert_original(self):
        self.assertEqual((self.root / '.env').read_bytes(), b'PRIVATE_SENTINEL_MUST_NEVER_APPEAR')
        self.assertEqual((self.root / 'docker-compose.yml').read_text(), 'existing compose\n')
        for service in OLD:
            self.assertTrue(self.fixture.items[service]['running'])
            self.assertEqual(self.fixture.items[service]['image'], OLD[service])
        self.assertEqual(self.fixture.commands['backend'], ['node', 'dist/main.js'])
        self.assertNotEqual(self.fixture.items['frontend']['id'], 'frontend')
        self.assertEqual(self.fixture.frontend_test, list(common.FRONTEND_HEALTH_TEST))

    def legacy_frontend_defect(self):
        self.fixture.items['frontend'].update({'id': '6' * 64, 'health': 'unhealthy'})

    def test_proven_localhost_defect_uses_fixed_health_for_new_and_rollback(self):
        self.legacy_frontend_defect()
        self.deployment.execute()
        for name in ['images.json', 'rollback.json']:
            value = json.loads((self.release/name).read_text())['services']
            self.assertEqual(value['frontend']['healthcheck'], {'test': list(common.FRONTEND_HEALTH_TEST)})
            self.assertEqual(value['backend']['command'], ['node', 'dist/main.js'])
        calls = self.fixture.calls
        get = next(i for i,c in enumerate(calls) if c[:3] == ['docker','exec','6'*64])
        stop = next(i for i,c in enumerate(calls) if c[:2] == ['docker','stop'])
        self.assertLess(get, stop)

    def test_health_exception_is_narrow_and_all_other_services_must_be_healthy(self):
        for failure in ['unknown_cmd','other_error','empty','wrong_exit','ipv4','backend','postgres','redis']:
            with self.subTest(failure=failure):
                self.setUp()
                self.legacy_frontend_defect()
                if failure == 'unknown_cmd': self.fixture.frontend_test = ['CMD-SHELL','arbitrary']
                if failure == 'other_error': self.fixture.health_recent[0]['connection_refused'] = False
                if failure == 'empty': self.fixture.health_recent = []
                if failure == 'wrong_exit': self.fixture.health_recent[0]['exit_code'] = True
                if failure == 'ipv4': self.fixture.fail = 'ipv4'
                if failure in {'backend','postgres','redis'}: self.fixture.items[failure]['health'] = 'unhealthy'
                with self.assertRaisesRegex(common.Refusal, 'existing_stack_not_healthy'):
                    self.deployment.execute()
                self.no_update()
                if failure in {'backend','postgres','redis'}:
                    self.assertFalse(any(c[3:4] == [common.FRONTEND_HEALTH_PROOF] for c in self.fixture.calls))

    def test_success_backup_precedes_app_only_update_and_preserves_config(self):
        self.deployment.execute()
        manifest = json.loads((self.release / 'backup/manifest.json').read_text())
        for name, digest in manifest['sha256'].items():
            self.assertEqual(common.digest(self.release / 'backup' / name), digest)
        commands = self.fixture.calls
        pull = next(i for i,c in enumerate(commands) if c[:2] == ['docker','pull'])
        stop = next(i for i,c in enumerate(commands) if c[:2] == ['docker','stop'])
        listing = next(i for i,c in enumerate(commands) if 'pg_restore' in c and '--list' in c)
        update = next(i for i,c in enumerate(commands) if 'up' in c)
        self.assertLess(pull, stop)
        self.assertLess(stop, listing)
        self.assertLess(listing, update)
        self.assertEqual(commands[update][-2:], ['backend','frontend'])
        for flag in ['--force-recreate','--no-deps','--no-build','never']:
            self.assertIn(flag, commands[update])
        self.assertFalse(any(x in str(commands) for x in ['prune','remove-orphans','migrate deploy']))
        self.assertEqual((self.root / '.env').read_bytes(), b'PRIVATE_SENTINEL_MUST_NEVER_APPEAR')

    def test_pending_failed_checksum_and_schema_drift_fail_before_stop(self):
        for failure in ['pending','failed','checksum','schema']:
            with self.subTest(failure=failure):
                self.fixture.calls.clear()
                original = copy.deepcopy(self.fixture.rows)
                if failure == 'pending': self.fixture.rows = []
                if failure == 'failed': self.fixture.rows[0]['complete'] = False
                if failure == 'checksum': self.fixture.rows[0]['checksum'] = 'f' * 64
                if failure == 'schema': self.fixture.schema = b'{}'
                with self.assertRaises(common.Refusal): self.deployment.execute()
                self.no_update()
                self.fixture.rows, self.fixture.schema = original, CATALOG

    def test_other_upload_writer_and_platform_mismatch_fail_before_stop(self):
        self.fixture.items['other'] = {**self.fixture.items['frontend'], 'id':'other',
                                      'project':'unrelated','mounts':[self.fixture.upload]}
        with self.assertRaises(common.Refusal): self.deployment.execute()
        self.no_update()
        del self.fixture.items['other']
        self.fixture.arch = 'arm64'
        with self.assertRaises(common.Refusal): self.deployment.execute()
        self.no_update()

    def test_resolved_failed_migration_attempt_does_not_block_successful_history(self):
        self.fixture.rows.append({**self.fixture.rows[0], 'complete':False,'rolled_back':True})
        self.deployment.execute()
        self.assertEqual(self.deployment.phase,'complete')

    def test_preflight_refuses_symlink_environment_and_low_disk(self):
        (self.root / '.env').unlink()
        (self.root / '.env').symlink_to(self.root / 'docker-compose.yml')
        with self.assertRaises(common.Refusal): self.deployment.execute()
        self.no_update()
        (self.root / '.env').unlink()
        (self.root / '.env').write_text('private')
        with patch('remote.shutil.disk_usage', return_value=argparse.Namespace(free=1)):
            with self.assertRaises(common.Refusal): self.deployment.execute()
        self.no_update()

    def test_backup_failures_recreate_both_old_images_with_node_only_legacy_cmd_override(self):
        for failure in ['stop','dump','restore_list','archive']:
            with self.subTest(failure=failure):
                # Each backup attempt owns fresh artifacts.
                self.setUp()
                self.fixture.fail = failure
                self.assertIn('prisma migrate deploy', self.fixture.commands['backend'][2])
                with self.assertRaises(common.Refusal): self.deployment.execute()
                self.assert_original()
                updates = [c for c in self.fixture.calls if 'up' in c]
                self.assertEqual(len(updates), 1)
                self.assertEqual(updates[0][-2:], ['backend', 'frontend'])
                self.assertFalse(any(c[:2] == ['docker','start'] for c in self.fixture.calls))
                override = json.loads((self.release/'rollback.json').read_text())['services']
                self.assertEqual({s:v['image'] for s,v in override.items()}, OLD)
                self.assertEqual(override['backend']['command'], ['node','dist/main.js'])

    def test_other_database_clients_after_stop_resume_old_stack(self):
        self.fixture.sessions = 1
        with self.assertRaisesRegex(common.Refusal,'database_has_other_clients'):
            self.deployment.execute()
        self.assert_original()

    def test_partial_compose_health_failure_and_interrupt_roll_back_both_exact_ids(self):
        for failure in ['compose','health','interrupt']:
            with self.subTest(failure=failure):
                self.setUp()
                self.fixture.fail = failure
                with self.assertRaises((common.Refusal,KeyboardInterrupt)): self.deployment.execute()
                self.assert_original()
                self.assertEqual(len([c for c in self.fixture.calls if 'up' in c]),2)
                rollback=json.loads((self.release/'rollback.json').read_text())['services']
                self.assertEqual({s:v['image'] for s,v in rollback.items()},OLD)

    def next_deployment(self, attempt):
        previous = self.release
        self.release = previous.parent / (SHA + '-' + str(attempt) + '-1')
        self.release.mkdir(mode=0o700)
        for name in ['expected.json','catalog.sql']:
            (self.release/name).write_bytes((previous/name).read_bytes())
        return remote.Deployment(self.release, 'owner/backend:'+SHA,
                                 'owner/frontend:'+SHA, SHA, self.root)

    def retry_release(self):
        deployment = self.next_deployment(2)
        self.fixture.fail = None
        deployment.execute()
        self.assertEqual(deployment.phase, 'complete')
        for service in NEW:
            self.assertEqual(self.fixture.items[service]['image'], NEW[service])
            self.assertEqual(self.fixture.items[service]['files'],
                             str(self.root/'docker-compose.yml')+','+str(self.release/'images.json'))
        self.assertEqual(self.fixture.frontend_test, list(common.FRONTEND_HEALTH_TEST))

    def test_rollback_metadata_allows_fresh_deployment(self):
        self.fixture.fail='compose'
        with self.assertRaises(common.Refusal):self.deployment.execute()
        self.assert_original()
        self.assertTrue(self.fixture.items['backend']['files'].endswith('/rollback.json'))
        self.retry_release()

    def test_failed_backup_recovery_metadata_allows_retry(self):
        self.legacy_frontend_defect()
        self.fixture.fail='dump'
        with self.assertRaises(common.Refusal):self.deployment.execute()
        self.assert_original()
        self.assertTrue(self.fixture.items['backend']['files'].endswith('/rollback.json'))
        self.retry_release()

    def test_legacy_image_only_private_override_remains_accepted(self):
        self.fixture.fail = 'dump'
        with self.assertRaises(common.Refusal): self.deployment.execute()
        path = self.release/'rollback.json'
        value = json.loads(path.read_text())
        del value['services']['frontend']['healthcheck']
        path.write_text(json.dumps(value))
        self.fixture.frontend_test = ['CMD', 'wget', '-qO-', 'http://localhost:80/']
        self.retry_release()

    def test_multi_generation_partial_rollback_refreshes_frontend_before_next_deploy(self):
        self.fixture.fail = 'dump'
        with self.assertRaises(common.Refusal):self.deployment.execute()
        self.assert_original()
        first_frontend = self.fixture.items['frontend']['id']
        second = self.next_deployment(2)
        self.fixture.fail = 'compose'
        with self.assertRaises(common.Refusal):second.execute()
        self.assert_original()
        self.assertNotEqual(self.fixture.items['frontend']['id'], first_frontend)
        second_files = str(self.root/'docker-compose.yml') + ',' + str(self.release/'rollback.json')
        self.assertEqual(self.fixture.items['frontend']['files'], second_files)
        self.assertEqual(self.fixture.items['backend']['files'], second_files)
        third = self.next_deployment(3)
        self.fixture.fail = None
        third.execute()
        self.assertEqual(third.phase, 'complete')
        for service in NEW:
            self.assertEqual(self.fixture.items[service]['image'], NEW[service])
            self.assertTrue(self.fixture.items[service]['files'].endswith(str(self.release/'images.json')))

    def test_existing_rollback_override_rejects_non_image_policy_and_mismatched_ids(self):
        self.fixture.fail='dump'
        with self.assertRaises(common.Refusal):self.deployment.execute()
        path=self.release/'rollback.json'
        original=json.loads(path.read_text())
        for mutation in ['command','image','extra','health_extra','health_url']:
            value=copy.deepcopy(original)
            if mutation=='command':value['services']['backend']['command']=['sh','-c','npx prisma migrate deploy && node dist/main.js']
            if mutation=='image':value['services']['frontend']['image']='owner/frontend:latest'
            if mutation=='extra':value['services']['frontend']['environment']={'UNOWNED':'value'}
            if mutation=='health_extra':value['services']['frontend']['healthcheck']['interval']='1s'
            if mutation=='health_url':value['services']['frontend']['healthcheck']['test'][-1]='http://localhost:80/'
            path.write_text(json.dumps(value))
            with self.assertRaises(common.Refusal):self.deployment.preflight()
        path.write_text(json.dumps(original))


class ProtocolTests(unittest.TestCase):
    def test_heartbeat_open_silent_pipe_and_eof_notify(self):
        for eof in [False,True]:
            reader,writer=os.pipe()
            try:
                if eof: os.close(writer)
                hit=threading.Event()
                with os.fdopen(reader,'rb') as stream:
                    thread=threading.Thread(target=remote.watch_heartbeat,args=(stream,),
                                            kwargs={'seconds':0.03,'notify':hit.set})
                    thread.start();thread.join(1)
                    self.assertTrue(hit.is_set())
            finally:
                if not eof: os.close(writer)

    def test_transport_archive_explicit_members_and_ssh_options(self):
        with tempfile.TemporaryDirectory(dir=ROOT/'test/deploy') as tmp:
            p=Path(tmp)/'expected.json';p.write_text('{}')
            data=transport.archive_payload(ROOT/'scripts/deploy',p)
            with tarfile.open(fileobj=io.BytesIO(data),mode='r:') as archive:
                self.assertEqual({m.name for m in archive},
                                 {'common.py','remote.py','catalog.sql','expected.json','payload.json'})
            args=argparse.Namespace(host='deploy.example.test',user='deploy',key=Path('/existing-key'),
                revision=SHA,attempt='1-1',backend='owner/backend:'+SHA,frontend='owner/frontend:'+SHA,expected=p)
            calls=[]
            def denied(command,*_,**kwargs):
                calls.append(command)
                raise common.Refusal('synthetic_ssh_denied')
            with patch('transport.bootstrap_run',side_effect=denied):
                with self.assertRaises(common.Refusal):transport.connect(args)
            text=' '.join(calls[0])
            for value in ['BatchMode=yes','IdentitiesOnly=yes','StrictHostKeyChecking=yes','UpdateHostKeys=no','ConnectTimeout=10']:
                self.assertIn(value,text)
            self.assertNotIn('StrictHostKeyChecking=no',text)

    def test_subprocess_error_and_timeout_withhold_raw_output(self):
        with self.assertRaisesRegex(common.Refusal,'command_failed_output_withheld'):
            common.run([sys.executable,'-c','import sys;print("PRIVATE_SENTINEL");sys.exit(1)'])
        with self.assertRaisesRegex(common.Refusal,'command_interrupted_or_timed_out'):
            common.run([sys.executable,'-c','import time;time.sleep(10)'],timeout=0.03)


if __name__=='__main__':unittest.main()

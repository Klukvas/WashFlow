#!/usr/bin/env python3
"""Zero-migration, paired-backup app-only deployment on the existing Compose host."""
import argparse
from datetime import datetime, timezone
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import select
import signal
import sys
import threading

from common import (FRONTEND_HEALTH_TEST, Refusal, catalog_hash, digest, frontend_localhost_exception,
                    linux_available_memory, private_directory, private_path,
                    require, run, save_json, verify_uploads, wait_until)

META = '''{"id":{{json .Id}},"image":{{json .Image}},"running":{{json .State.Running}},
"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}"missing"{{end}},
"project":{{json (index .Config.Labels "com.docker.compose.project")}},
"service":{{json (index .Config.Labels "com.docker.compose.service")}},
"oneoff":{{json (index .Config.Labels "com.docker.compose.oneoff")}},
"directory":{{json (index .Config.Labels "com.docker.compose.project.working_dir")}},
"files":{{json (index .Config.Labels "com.docker.compose.project.config_files")}},
"mounts":{{json .Mounts}}}'''
IMAGE = '''{"id":{{json .Id}},"os":{{json .Os}},"arch":{{json .Architecture}},
"digests":{{json .RepoDigests}},"revision":{{json (index .Config.Labels "org.opencontainers.image.revision")}}}'''
AUTH = '-U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-postgres}"'


def now():
    return datetime.now(timezone.utc).isoformat()


class Deployment:
    def __init__(self, release, backend, frontend, revision, root=Path('/opt/washflow')):
        self.root, self.release = Path(root), Path(release)
        self.refs = {'backend': backend, 'frontend': frontend}
        self.revision = revision
        self.phase = 'preflight'
        self.old = {}
        self.new = {}

    def containers(self):
        ids = run(['docker', 'ps', '-aq'], timeout=30).decode().split()
        return [json.loads(run(['docker', 'inspect', '--format', META, cid])) for cid in ids]

    def postgres(self, sql):
        wrapped = b"BEGIN READ ONLY; SET LOCAL statement_timeout='30s';\n" + sql + b'\nCOMMIT;'
        return run(['docker', 'exec', '-i', self.old['postgres']['id'], 'sh', '-c',
                    'exec psql -XqAt --no-password -v ON_ERROR_STOP=1 ' + AUTH], data=wrapped)

    def db_info(self):
        return json.loads(self.postgres(b'''SELECT json_build_object(
          'major',current_setting('server_version_num')::int/10000,
          'size',pg_database_size(current_database()),
          'encoding',pg_encoding_to_char(encoding),
          'other_sessions',(SELECT count(*) FROM pg_stat_activity
            WHERE datname=current_database() AND pid<>pg_backend_pid()
              AND backend_type='client backend')) FROM pg_database WHERE datname=current_database();'''))

    def schema_gate(self):
        rows = json.loads(self.postgres(b'''SELECT coalesce(json_agg(json_build_object(
          'name',migration_name,'checksum',checksum,'complete',finished_at IS NOT NULL,
          'rolled_back',rolled_back_at IS NOT NULL) ORDER BY migration_name),'[]')
          FROM _prisma_migrations;'''))
        require(all(x['complete'] or x['rolled_back'] for x in rows), 'unfinished_migration')
        completed = [x for x in rows if x['complete'] and not x['rolled_back']]
        require(len(completed) == len({x['name'] for x in completed}) == len(self.expected['migrations']),
                'pending_extra_or_duplicate_migration')
        require({x['name']: x['checksum'] for x in completed} == self.expected['migrations'],
                'migration_checksum_drift')
        # catalog.sql owns a READ ONLY transaction and emits one JSON document.
        raw = run(['docker', 'exec', '-i', self.old['postgres']['id'], 'sh', '-c',
                   'exec psql -XqAt --no-password -v ON_ERROR_STOP=1 ' + AUTH],
                  data=(self.release / 'catalog.sql').read_bytes())
        require(catalog_hash(raw) == self.expected['schema_hash'], 'schema_drift')

    def unchanged(self):
        require(all(digest(path) == value for path, value in self.original_hashes.items()),
                'live_configuration_changed')

    def only_writers(self, *, stopped=False):
        all_containers = self.containers()
        active = [x for x in all_containers if x['running']]
        for c in active:
            if c['id'] != self.old['backend']['id']:
                require(not any(m['Source'] == self.upload['Source'] for m in c['mounts']),
                        'other_upload_writer')
                require(c['image'] not in {self.old['backend']['image'], self.new.get('backend', {}).get('id')},
                        'other_backend_writer')
        project = [x for x in active if x['project'] == self.project]
        expected = {'frontend', 'postgres', 'redis'} | (set() if stopped else {'backend'})
        require({x['service'] for x in project} == expected and len(project) == len(expected),
                'project_writer_topology_changed')
        if stopped:
            require(self.db_info()['other_sessions'] == 0, 'database_has_other_clients')

    def preflight(self):
        require(sys.version_info >= (3, 11), 'python_3_11_required')
        private_path(self.root, directory=True)
        private_directory(self.release)
        require(self.release.parent == self.root / 'releases', 'release_outside_owned_root')
        require(re.fullmatch(r'[0-9a-f]{40}', self.revision), 'invalid_revision')
        for ref in self.refs.values():
            require(re.fullmatch(r'[a-z0-9][a-z0-9._/-]*:' + self.revision, ref), 'invalid_sha_image')
        self.base = private_path(self.root / 'docker-compose.yml')
        self.env = private_path(self.root / '.env')
        self.expected = json.loads(private_path(self.release / 'expected.json').read_bytes())
        require(self.expected['format'] == 'washflow-deploy-expected-v1', 'invalid_expected_format')
        require(self.expected['postgres_major'] == 16 and self.expected['migrations'], 'invalid_expected_database')
        containers = self.containers()
        apps = [x for x in containers if x['running'] and x['service'] == 'backend'
                and x['directory'] == str(self.root)]
        require(len(apps) == 1, 'single_existing_backend_required')
        self.project = apps[0]['project']
        require(re.fullmatch(r'[a-z0-9][a-z0-9_-]*', self.project or ''), 'invalid_project')
        current = [x for x in containers if x['running'] and x['project'] == self.project]
        require(len(current) == 4 and {x['service'] for x in current} ==
                {'backend', 'frontend', 'postgres', 'redis'}, 'unexpected_project_topology')
        self.old = {x['service']: x for x in current}
        command = json.loads(run(['docker', 'inspect', '--format', '{{json .Config.Cmd}}',
                                  self.old['backend']['id']]))
        require(command in [['sh', '-c', 'npx prisma migrate deploy && node dist/main.js'],
                            ['node', 'dist/main.js']], 'unknown_backend_command')
        require(all(c['health'] == 'healthy' for c in current if c['service'] != 'frontend'),
                'existing_stack_not_healthy')
        frontend = self.old['frontend']
        require(frontend['health'] == 'healthy' or (frontend['running'] and frontend['health'] == 'unhealthy'
                and frontend_localhost_exception(frontend['id'])), 'existing_stack_not_healthy')
        for c in current:
            require(c['oneoff'] == 'False', 'existing_stack_not_healthy')
            require(c['directory'] == str(self.root), 'project_directory_mismatch')
        files = self.old['backend']['files']
        require(files == self.old['frontend']['files'], 'app_compose_files_differ')
        paths = [private_path(Path(x)) for x in files.split(',')]
        require(paths[0] == self.base, 'unexpected_base_compose')
        for path in paths[1:]:
            require(path.name in {'images.json', 'rollback.json'} and
                    path.parent.parent == self.root / 'releases',
                    'unknown_existing_compose_override')
            private_directory(path.parent)
            doc = json.loads(path.read_bytes())
            require(set(doc) == {'services'} and set(doc['services']) == {'backend', 'frontend'},
                    'non_image_existing_override')
            front_policy = doc['services']['frontend']
            require(set(doc['services']['backend']) == {'image', 'command'} and
                    (set(front_policy) == {'image'} or (set(front_policy) == {'image', 'healthcheck'}
                     and front_policy['healthcheck'] == {'test': list(FRONTEND_HEALTH_TEST)})) and
                    doc['services']['backend']['command'] == ['node', 'dist/main.js'],
                    'unknown_existing_runtime_policy')
            require(all(re.fullmatch(r'sha256:[0-9a-f]{64}', doc['services'][service]['image'])
                        and doc['services'][service]['image'] == self.old[service]['image']
                        for service in ['backend', 'frontend']), 'existing_override_image_mismatch')
        self.original_hashes = {path: digest(path) for path in [self.env, *paths]}
        mounts = [m for m in self.old['backend']['mounts'] if m['Destination'] == '/app/uploads']
        require(len(mounts) == 1 and mounts[0]['Type'] == 'volume' and mounts[0]['RW'],
                'uploads_volume_required')
        self.upload = mounts[0]
        require(all(m['Destination'] == '/app/uploads' for m in self.old['backend']['mounts']),
                'unexpected_backend_mount')
        self.only_writers()
        info = json.loads(run(['docker', 'info', '--format',
                              '{"os":{{json .OSType}},"arch":{{json .Architecture}}}']))
        require(info['os'] == 'linux', 'linux_docker_required')
        arch = {'x86_64': 'amd64', 'aarch64': 'arm64'}.get(info['arch'], info['arch'])
        require(arch in {'amd64', 'arm64'}, 'unsupported_architecture')
        db = self.db_info()
        require(db['major'] == 16 and db['encoding'] == 'UTF8', 'postgres16_utf8_required')
        require(run(['docker', 'exec', self.old['postgres']['id'], 'pg_restore', '--version']).startswith(
            b'pg_restore (PostgreSQL) 16.'), 'pg_restore16_required')
        run(['docker', 'compose', 'version'])
        upload_kib = int(run(['docker', 'exec', self.old['backend']['id'],
                              'du', '-sk', '/app/uploads']).decode().split()[0])
        required = 2 * (db['size'] + upload_kib * 1024) + 2 * 1024**3
        require(shutil.disk_usage(self.root).free >= required, 'insufficient_disk_for_backup')
        require((os.cpu_count() or 0) >= 1 and linux_available_memory() >= 256 * 1024**2,
                'insufficient_host_capacity')
        self.schema_gate()
        for service, ref in self.refs.items():
            run(['docker', 'pull', ref], timeout=600)
            image = json.loads(run(['docker', 'image', 'inspect', '--format', IMAGE, ref]))
            require(image['os'] == 'linux' and image['arch'] == arch, 'new_image_platform_mismatch')
            require(image['revision'] == self.revision and image['digests'], 'new_image_revision_missing')
            require(re.fullmatch(r'sha256:[0-9a-f]{64}', image['id']), 'invalid_image_id')
            self.new[service] = image
        require(shutil.disk_usage(self.root).free >= required, 'insufficient_disk_after_pull')
        self.unchanged()
        save_json(self.release / 'preflight.json', {
            'at': now(), 'revision': self.revision, 'project': self.project,
            'old': self.old, 'new': self.new, 'platform': 'linux/' + arch,
            'configuration_hashes': {str(p): h for p, h in self.original_hashes.items()},
            'database_bytes': db['size'], 'uploads_bytes': upload_kib * 1024,
            'free_bytes': shutil.disk_usage(self.root).free, 'backup_required_bytes': required,
        })

    def compose(self, override):
        return ['docker', 'compose', '--project-name', self.project, '--project-directory',
                str(self.root), '--env-file', str(self.env), '-f', str(self.base), '-f', str(override)]

    def override(self, name, images):
        path = self.release / name
        save_json(path, {'services': {
            'backend': {'image': images['backend'], 'command': ['node', 'dist/main.js']},
            'frontend': {'image': images['frontend'], 'healthcheck': {'test': list(FRONTEND_HEALTH_TEST)}},
        }})
        return path

    def healthy(self, service, image=None):
        ids = run(['docker', 'ps', '-q', '--filter', 'label=com.docker.compose.project=' + self.project,
                   '--filter', 'label=com.docker.compose.service=' + service]).decode().split()
        if len(ids) != 1:
            return False
        meta = json.loads(run(['docker', 'inspect', '--format', META, ids[0]]))
        return meta['running'] and meta['health'] == 'healthy' and (image is None or meta['image'] == image)

    def activate(self, override, images):
        run(self.compose(override) + ['up', '-d', '--force-recreate', '--no-deps', '--no-build', '--pull', 'never',
                                     'backend', 'frontend'], timeout=180)
        for service in self.refs:
            wait_until(lambda: self.healthy(service, images[service]), seconds=180)

    def backup(self):
        self.unchanged()
        self.only_writers()
        self.schema_gate()
        self.phase = 'stopped'  # Set before stop: partial/timeout stop still needs resume.
        run(['docker', 'stop', '--time', '45', self.old['backend']['id']], timeout=60)
        self.only_writers(stopped=True)
        self.schema_gate()
        self.unchanged()
        backup = self.release / 'backup'
        backup.mkdir(mode=0o700)
        private_directory(backup)
        started = now()
        with (backup / 'database.dump').open('xb') as stream:
            run(['docker', 'exec', self.old['postgres']['id'], 'sh', '-c',
                 'exec pg_dump --format=custom --no-owner --no-acl --no-password ' + AUTH],
                output=stream, timeout=1800)
        with (backup / 'uploads.tar').open('xb') as stream:
            run(['docker', 'cp', self.old['backend']['id'] + ':/app/uploads/.', '-'],
                output=stream, timeout=1800)
        with (backup / 'database.dump').open('rb') as stream:
            # Existing private postgres container; no DB connection or restore mutation.
            run(['docker', 'exec', '-i', self.old['postgres']['id'], 'pg_restore', '--list'],
                input_file=stream, timeout=120)
        uploads = verify_uploads(backup / 'uploads.tar')
        self.only_writers(stopped=True)
        self.unchanged()
        hashes = {n: digest(backup / n) for n in ['database.dump', 'uploads.tar']}
        save_json(backup / 'manifest.json', {'format': 'washflow-deploy-backup-v1',
                  'quiesced_from': started, 'verified_at': now(), 'revision': self.revision,
                  'sha256': hashes, 'uploads': uploads})
        require(all(digest(backup / n) == h for n, h in hashes.items()), 'backup_integrity_failed')

    def execute(self):
        self.preflight()
        new_override = self.override('images.json', {s: x['id'] for s, x in self.new.items()})
        rollback = self.override('rollback.json', {s: self.old[s]['image'] for s in self.refs})
        try:
            self.backup()
            self.unchanged()
            self.phase = 'cutover'  # Includes partial compose failure; exact-ID rollback required.
            self.activate(new_override, {s: x['id'] for s, x in self.new.items()})
            self.unchanged()
            self.phase = 'complete'
            save_json(self.release / 'result.json', {'status': 'deployed', 'at': now()})
        except BaseException:
            # Recovery ignores a second disconnect/signal but remains bounded per command.
            for sig in [signal.SIGTERM, signal.SIGINT, signal.SIGHUP]:
                signal.signal(sig, signal.SIG_IGN)
            if self.phase in {'cutover', 'stopped'}:
                # docker start would rerun the legacy migration-bearing CMD. Recreate both
                # old image IDs with the node-only override, also refreshing nginx DNS.
                self.activate(rollback, {s: self.old[s]['image'] for s in self.refs})
            raise


def interrupted(_sig, _frame):
    raise Refusal('deployment_interrupted')


def watch_heartbeat(stream, *, seconds=30, notify=lambda: os.kill(os.getpid(), signal.SIGTERM)):
    # Open-but-stalled SSH pipes are failures too, not only a clean EOF.
    while select.select([stream], [], [], seconds)[0]:
        if not os.read(stream.fileno(), 1):
            break
    notify()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--release', type=Path, required=True)
    parser.add_argument('--backend', required=True)
    parser.add_argument('--frontend', required=True)
    parser.add_argument('--revision', required=True)
    parser.add_argument('--watch-stdin', action='store_true')
    args = parser.parse_args()
    os.umask(0o077)
    try:
        require(sys.version_info >= (3, 11), 'python_3_11_required')
        require(args.release.parent == Path('/opt/washflow/releases'), 'release_outside_owned_root')
        private_directory(args.release.parent)
        lock = os.open(args.release.parent / '.deploy.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        require(os.fstat(lock).st_uid == os.getuid() and os.fstat(lock).st_mode & 0o077 == 0,
                'unsafe_existing_lock')
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        for sig in [signal.SIGTERM, signal.SIGINT, signal.SIGHUP]:
            signal.signal(sig, interrupted)
        if args.watch_stdin:
            threading.Thread(target=watch_heartbeat, args=(sys.stdin.buffer,), daemon=True).start()
        deployment = Deployment(args.release, args.backend, args.frontend, args.revision)
        deployment.execute()
        print(json.dumps({'deployment': 'deployed', 'revision': args.revision}))
        return 0
    except (Refusal, OSError, ValueError, KeyError, TypeError) as error:
        code = str(error) if isinstance(error, Refusal) else 'preflight_or_recovery_failed'
        print(json.dumps({'deployment': 'failed', 'reason': code}))
        return 1


if __name__ == '__main__':
    sys.exit(main())

"""Synthetic read-only SSH/Docker protocol; never connects to a deployment host."""
import argparse
import ast
import contextlib
import copy
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/deploy'))
import diagnose
import transport

SENTINEL = 'PRIVATE_CREDENTIAL_NEVER_PRINT'
IMAGE = 'sha256:' + '1' * 64


def database_sample(total=0):
    return {'total': total, **{group: {name: total if index == 0 else 0 for index, name in enumerate(names)}
                              for group, names in diagnose.DB_GROUPS.items()}}


class DiagnosticTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(dir=ROOT / 'test/deploy')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.release = self.root / 'releases' / diagnose.FAILED_RELEASE
        self.release.mkdir(parents=True, mode=0o700)
        self.release.parent.chmod(0o700)
        self.calls = []
        self.requests = []

    def fixture(self, args, **_):
        self.calls.append(args)
        if args == ['docker', 'version', '--format', '{{.Server.Version}}']:
            return b'27.5.1\n'
        if args == ['docker', 'compose', 'version', '--short']:
            return b'2.33.1\n'
        if args[:2] == ['docker', 'ps']:
            self.assertIn('label=com.docker.compose.project.working_dir=/opt/washflow', args)
            return ('2' * 64).encode()
        if args[:3] == ['docker', 'exec', '-i']:
            self.assertEqual(args, ['docker','exec','-i','2'*64,'sh','-c',diagnose.PG_COMMAND])
            self.assertEqual(_['data'], diagnose.CLIENT_COUNTS_SQL)
            self.assertEqual(_['timeout'], 8)
            return json.dumps(database_sample()).encode()
        if args[:2] == ['docker', 'inspect']:
            if args[3] == diagnose.HEALTH_DETAIL:
                return json.dumps({'known_localhost_wget': True, 'known_ipv4_wget': False,
                    'recent': [{'exit_code': 1, 'failure_class': 'connection_refused', 'Output': SENTINEL}],
                    'command': SENTINEL}).encode()
            self.assertEqual(args[2:4], ['--format', diagnose.META])
            return json.dumps({'running': True, 'health': 'healthy', 'image': IMAGE,
                               'environment': SENTINEL}).encode()
        raise AssertionError('Unapproved read-only fixture command')

    def report(self):
        def get(container, url):
            self.requests.append((container, url))
            return 'ok' if url == diagnose.GET_URLS[1] else 'nonzero'
        with patch('diagnose.capture', side_effect=self.fixture), patch('diagnose.http_get', side_effect=get), patch('diagnose.time.sleep'):
            return diagnose.probe(self.root)

    def test_probe_only_selected_reads_and_no_remote_writes(self):
        before = {str(p.relative_to(self.root)) for p in self.root.rglob('*')}
        value = self.report()
        self.assertTrue(value['docker_probe_ok'])
        self.assertEqual(value['docker'], '27.5.1')
        self.assertEqual(value['apps']['backend'][0]['image'], IMAGE)
        self.assertEqual({str(p.relative_to(self.root)) for p in self.root.rglob('*')}, before)
        self.assertEqual(len(self.calls), 11)
        self.assertTrue(all(c[1] in {'version', 'compose', 'ps', 'inspect', 'exec'} for c in self.calls))
        self.assertEqual([url for _, url in self.requests], list(diagnose.GET_URLS))
        self.assertNotIn(SENTINEL, json.dumps(value))

    def test_frontend_health_only_closed_classes_codes_and_fixed_get_results(self):
        detail = self.report()['apps']['frontend'][0]['healthcheck']
        self.assertEqual(detail, {'known_localhost_wget': True, 'known_ipv4_wget': False,
            'recent': [{'exit_code': 1, 'failure_class': 'connection_refused'}],
            'localhost_get': 'nonzero', 'ipv4_get': 'ok'})
        malicious = {'known_localhost_wget': SENTINEL, 'recent': [
            {'exit_code': SENTINEL, 'failure_class': SENTINEL, 'Output': SENTINEL}],
            'localhost_get': SENTINEL, 'ipv4_get': SENTINEL, 'command': SENTINEL}
        filtered = diagnose.filter_health_detail(malicious)
        self.assertNotIn(SENTINEL, json.dumps(filtered))
        self.assertEqual(filtered['recent'], [{'exit_code': None, 'failure_class': 'unknown_failure'}])
        for recent in [SENTINEL, [SENTINEL], [{}] * 6]:
            with self.assertRaises(ValueError): diagnose.filter_health_detail({'recent': recent})
        # No raw log or configured command JSON is selected for transport.
        self.assertNotIn('{{json $entry.Output}}', diagnose.HEALTH_DETAIL)
        self.assertIn('"connection_refused"', diagnose.HEALTH_DETAIL)
        self.assertIn('eq (json .Config.Healthcheck.Test)', diagnose.HEALTH_DETAIL)
        self.assertIn('known_ipv4_wget', diagnose.HEALTH_DETAIL)
        self.assertTrue(diagnose.filter_health_detail({'known_ipv4_wget':True})['known_ipv4_wget'])

    def test_http_get_exact_allowlist_discards_bodies_and_errors(self):
        container = '2' * 64
        with patch('diagnose.subprocess.run', return_value=argparse.Namespace(returncode=0)) as run:
            for url in diagnose.GET_URLS:
                self.assertEqual(diagnose.http_get(container, url), 'ok')
                run.assert_called_with(['docker', 'exec', container, 'wget', '-q', '-O', '-', '-T', '5', url],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=8, check=False)
            with self.assertRaises(ValueError): diagnose.http_get(container, 'https://unrelated.example/')
            with self.assertRaises(ValueError): diagnose.http_get('untrusted-id', diagnose.GET_URLS[0])
        with patch('diagnose.subprocess.run', return_value=argparse.Namespace(returncode=1)):
            self.assertEqual(diagnose.http_get(container, diagnose.GET_URLS[0]), 'nonzero')
        with patch('diagnose.subprocess.run', side_effect=subprocess.TimeoutExpired(['fixture'], 8, stderr=SENTINEL)):
            self.assertEqual(diagnose.http_get(container, diagnose.GET_URLS[0]), 'unavailable')

    def test_meminfo_only_selected_valid_unique_kib_fields(self):
        parsed = diagnose.parse_meminfo(b'MemTotal: 16384 kB\nMemFree:\t256 kB\nMemAvailable: 4096 kB\nPrivate: secret\n')
        self.assertEqual(parsed, {'memory_total_bytes': 16384*1024, 'memory_free_bytes': 256*1024,
                                  'memory_available_bytes': 4096*1024})
        unknown = {key: None for key in diagnose.MEMINFO_KEYS.values()}
        self.assertEqual(diagnose.parse_meminfo(b''), unknown)
        self.assertEqual(diagnose.parse_meminfo(b'\xff'), unknown)
        self.assertEqual(diagnose.parse_meminfo(b'x'*65537), unknown)
        for entry in [b'-1 kB', b'12 MB', b'1.5 kB', b'12', b'text kB', b'9'*100+b' kB',
                      str(diagnose.MAX_BYTES//1024+1).encode()+b' kB']:
            with self.subTest(entry=entry):
                self.assertIsNone(diagnose.parse_meminfo(b'MemTotal: '+entry+b'\n')['memory_total_bytes'])
        for duplicate in [b'MemFree: 2 kB\n', b'MemFree: malformed\n']:
            self.assertIsNone(diagnose.parse_meminfo(b'MemFree: 1 kB\n'+duplicate)['memory_free_bytes'])

    def test_capacity_fixed_platform_reads_and_null_when_unavailable(self):
        disk = argparse.Namespace(f_blocks=100, f_bfree=30, f_bavail=20, f_frsize=4096)
        with patch('diagnose.os.cpu_count', return_value=2), patch('diagnose.os.sysconf', side_effect=[10,4096]), \
             patch('diagnose.Path.open', return_value=io.BytesIO(b'MemTotal: 100 kB\nMemFree: 4 kB\nMemAvailable: 40 kB\n')) as opened, \
             patch('diagnose.os.statvfs', return_value=disk) as stat:
            value = diagnose.host_capacity(self.root)
        opened.assert_called_once_with('rb')
        stat.assert_called_once_with(self.root)
        self.assertEqual(value, {'cpu_count': 2, 'sysconf_free_bytes': 40960,
            'memory_total_bytes': 102400, 'memory_free_bytes': 4096, 'memory_available_bytes': 40960,
            'disk_total_bytes': 409600, 'disk_free_bytes': 122880, 'disk_available_bytes': 81920})
        with patch('diagnose.os.cpu_count', return_value=None), patch('diagnose.os.sysconf', side_effect=ValueError(SENTINEL)), \
             patch('diagnose.Path.open', side_effect=OSError(SENTINEL)), patch('diagnose.os.statvfs', side_effect=OSError(SENTINEL)):
            self.assertEqual(diagnose.host_capacity(self.root), diagnose.filter_capacity({}))

    def test_capacity_projection_bounds_and_unknown_strings_never_leak(self):
        data = {name: 1024 for name in diagnose.CAPACITY_BYTES}
        data.update({'cpu_count': 2, 'private': SENTINEL})
        report = self.report()
        report['capacity'] = data
        self.assertEqual(diagnose.filter_report(report)['capacity'], {k:v for k,v in data.items() if k != 'private'})
        for invalid in [None, -1, True, 0.5, SENTINEL, diagnose.MAX_BYTES+1]:
            for name in diagnose.CAPACITY_BYTES:
                bad = {**data, name: invalid}
                self.assertIsNone(diagnose.filter_capacity(bad)[name])
        for invalid in [0, -1, True, 1.5, SENTINEL, 65537]:
            self.assertIsNone(diagnose.filter_capacity({'cpu_count':invalid})['cpu_count'])
        self.assertIsNone(diagnose.bounded_bytes(diagnose.MAX_BYTES, 1024))
        self.assertIsNone(diagnose.bounded_bytes(1, 0))
        self.assertEqual(diagnose.filter_capacity({'cpu_count':65536})['cpu_count'], 65536)
        self.assertNotIn(SENTINEL, json.dumps(diagnose.filter_capacity(SENTINEL)))
        self.assertEqual(diagnose.FAILED_RELEASE, '67493a6a4aedbfb5f193de08403989ebf9c462ef-40240991478-1')

    def test_database_sql_is_fixed_read_only_current_database_aggregate(self):
        sql = diagnose.CLIENT_COUNTS_SQL.decode()
        self.assertTrue(sql.startswith("BEGIN READ ONLY; SET LOCAL statement_timeout='3s';"))
        self.assertTrue(sql.endswith('COMMIT;'))
        self.assertIn('FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()', sql)
        self.assertNotRegex(sql, r'(?i)\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|COPY|pg_terminate_backend|pg_cancel_backend|query|usename|client_hostname)\b')
        for literal in ["application_name='pg_isready'", "application_name='psql'", 'client_addr IS NULL', 'count(*)']:
            self.assertIn(literal, sql)

    def test_database_count_projection_rejects_bad_counts_and_drops_raw_fields(self):
        value = database_sample(2)
        value.update({'query':SENTINEL, 'application_name':SENTINEL, 'client_addr':SENTINEL})
        value['by_state']['private'] = SENTINEL
        filtered = diagnose.filter_db_sample(value)
        self.assertNotIn(SENTINEL, json.dumps(filtered))
        for invalid in [None, -1, True, 0.5, SENTINEL, 1000001]:
            with self.subTest(invalid=invalid):
                with self.assertRaises(ValueError): diagnose.filter_db_sample({**database_sample(), 'total':invalid})
                bad = database_sample();bad['by_state']['idle'] = invalid
                with self.assertRaises(ValueError): diagnose.filter_db_sample(bad)
        for malformed in [None, {}, {'total':0}, {**database_sample(), 'by_state':SENTINEL}, database_sample(1000001)]:
            with self.assertRaises(ValueError): diagnose.filter_db_sample(malformed)
        inconsistent = database_sample(2);inconsistent['by_client_addr']['null'] = 1
        with self.assertRaises(ValueError): diagnose.filter_db_sample(inconsistent)
        with self.assertRaises(ValueError): diagnose.filter_database({'status':'ok','samples':[]})
        self.assertEqual(diagnose.filter_database({'status':SENTINEL}), {'status':'unavailable','samples':[]})

    def test_database_samples_are_three_bounded_reads_and_two_one_second_gaps(self):
        responses = [('2'*64).encode(), *[json.dumps(database_sample(n)).encode() for n in [2,2,0]]]
        with patch('diagnose.capture', side_effect=responses) as capture, patch('diagnose.time.sleep') as sleep:
            result = diagnose.database_samples()
        self.assertEqual(result['status'],'ok')
        self.assertEqual([x['total'] for x in result['samples']], [2,2,0])
        self.assertEqual(sleep.call_args_list, [unittest.mock.call(1),unittest.mock.call(1)])
        for call in capture.call_args_list[1:]:
            self.assertEqual(call.args[0], ['docker','exec','-i','2'*64,'sh','-c',diagnose.PG_COMMAND])
            self.assertEqual(call.kwargs, {'data':diagnose.CLIENT_COUNTS_SQL,'timeout':8})
        report = self.report();report['database'] = {**result, 'private':SENTINEL}
        self.assertNotIn(SENTINEL, json.dumps(diagnose.filter_report(report)))

    def test_database_sample_failure_is_static_and_never_returns_partial_or_raw_data(self):
        for responses in [[b''], [b'bad-id'], [('2'*64).encode(), SENTINEL.encode()],
                          [('2'*64).encode(), json.dumps(database_sample()).encode(), ValueError(SENTINEL)]]:
            with patch('diagnose.capture', side_effect=responses), patch('diagnose.time.sleep'):
                self.assertEqual(diagnose.database_samples(), {'status':'unavailable','samples':[]})

    def test_python_old_version_still_reports_known_bootstrap_refusal(self):
        with patch('diagnose.sys.version_info', (3, 8, 10)):
            value = self.report()
        self.assertEqual(value['python'], [3, 8, 10])
        self.assertIn('python_3_11_required', value['observed_prerequisite_refusals'])
        ast.parse((ROOT/'scripts/deploy/diagnose.py').read_text(), feature_version=(3, 6))

    def test_phase_file_presence_and_hash_booleans_never_print_values(self):
        expected = {}
        for name in ['.env', 'docker-compose.yml']:
            path = self.root/name
            path.write_text(SENTINEL)
            expected[str(path)] = hashlib.sha256(SENTINEL.encode()).hexdigest()
        (self.release/'preflight.json').write_text(json.dumps({'configuration_hashes': expected,
                                                              'project': SENTINEL}))
        value = self.report()
        self.assertTrue(value['release']['files']['preflight.json'])
        self.assertTrue(value['release']['configuration_hashes_match'])
        self.assertFalse(value['release']['files']['backup/manifest.json'])
        self.assertNotIn(SENTINEL, json.dumps(value))
        (self.root/'.env').write_text('changed fixture')
        self.assertFalse(self.report()['release']['configuration_hashes_match'])

    def test_untrusted_protocol_is_projected_and_malformed_shapes_fail_closed(self):
        value = self.report()
        value.update({'secret': SENTINEL, 'docker': SENTINEL,
                      'observed_prerequisite_refusals': ['schema_drift', SENTINEL]})
        value['apps']['backend'][0].update({'health': SENTINEL, 'image': SENTINEL, 'secret': SENTINEL})
        filtered = diagnose.filter_report(value)
        self.assertNotIn(SENTINEL, json.dumps(filtered))
        self.assertEqual(filtered['apps']['backend'][0]['health'], 'unknown')
        self.assertIsNone(filtered['apps']['backend'][0]['image'])
        for key in ['apps', 'release', 'python']:
            bad = copy.deepcopy(value)
            bad[key] = SENTINEL
            with self.assertRaises(ValueError): diagnose.filter_report(bad)

    def test_symlink_release_and_failed_docker_do_not_escape_or_leak(self):
        alias = self.root/'alias'
        alias.symlink_to(self.root)
        self.assertFalse(diagnose.release_state(alias)['release_private'])
        with patch('diagnose.capture', side_effect=ValueError(SENTINEL)):
            value = diagnose.probe(self.root)
        self.assertFalse(value['docker_probe_ok'])
        self.assertNotIn(SENTINEL, json.dumps(value))

    def test_ssh_probe_stdin_no_upload_bootstrap_and_strict_options(self):
        args = argparse.Namespace(host='fixture.example.test', user='deploy', key='/fixture/key')
        value = self.report()
        calls = []
        def capture(command, **kwargs):
            calls.append(command)
            self.assertEqual(kwargs['data'], (ROOT/'scripts/deploy/diagnose.py').read_bytes())
            self.assertEqual(kwargs['timeout'], 150)
            return json.dumps({**value, 'extra': SENTINEL}).encode()
        with patch('diagnose.capture', side_effect=capture):
            result = diagnose.connect(args)
        self.assertEqual(calls[0][-1], 'python3 -B - --probe')
        for option in ['BatchMode=yes', 'IdentitiesOnly=yes', 'StrictHostKeyChecking=yes', 'UpdateHostKeys=no']:
            self.assertIn(option, calls[0])
        self.assertNotIn(SENTINEL, json.dumps(result))

    def test_normal_jobs_disabled_for_diagnostic_input_and_no_production_record(self):
        source = (ROOT/'.github/workflows/ci.yml').read_text().split('jobs:\n', 1)[1]
        blocks = re.split(r'(?m)^  ([a-z][a-z0-9-]+):\n', source)[1:]
        jobs = dict(zip(blocks[::2], blocks[1::2]))
        self.assertEqual(len(jobs), 10)
        for name, job in jobs.items():
            if name not in {'diagnose', 'close-idle-psql'}:
                self.assertIn('!inputs.diagnostic_only', job)
        operation = jobs['close-idle-psql']
        self.assertIn('inputs.diagnostic_only || inputs.skip_unit_tests || inputs.skip_e2e', operation)
        self.assertIn('run: test "$CONFLICT" = false', operation)
        self.assertLess(operation.index('Reject conflicting operational inputs'),
                        operation.index('Setup existing operational SSH access'))
        self.assertIn('!inputs.close_idle_psql', jobs['diagnose'])
        self.assertNotIn('environment:', jobs['diagnose'])
        self.assertIn("startsWith(github.ref, 'refs/heads/codex/')", jobs['diagnose'])
        self.assertNotIn('transport.py', jobs['diagnose'])

    def test_diagnostic_failure_stages_keep_static_codes_without_raw_details(self):
        args = ['diagnose.py', '--host', 'fixture.test', '--user', 'deploy', '--key', '/fixture']
        for error, stage in [(diagnose.ProbeFailure('validation'), 'validation'),
                             (diagnose.ProbeFailure('ssh'), 'ssh'), (ValueError(SENTINEL), 'protocol')]:
            with patch.object(sys, 'argv', args), patch('diagnose.connect', side_effect=error):
                output = io.StringIO()
                with contextlib.redirect_stdout(output): self.assertEqual(diagnose.main(), 1)
                self.assertEqual(json.loads(output.getvalue()), {'diagnostic': 'failed', 'stage': stage,
                                                                'reason': diagnose.FAILURES[stage]})
                self.assertNotIn(SENTINEL, output.getvalue())

    def test_connect_classifies_metadata_ssh_and_protocol_failures(self):
        args = argparse.Namespace(host='invalid host', user='deploy', key='/fixture')
        with self.assertRaisesRegex(diagnose.ProbeFailure, 'invalid_access_metadata'):
            diagnose.connect(args)
        args.host = 'fixture.test'
        with patch('diagnose.capture', side_effect=ValueError(SENTINEL)):
            with self.assertRaisesRegex(diagnose.ProbeFailure, 'ssh_command_failed'):
                diagnose.connect(args)
        with patch('diagnose.capture', return_value=SENTINEL.encode()):
            with self.assertRaisesRegex(diagnose.ProbeFailure, 'interpreter_or_protocol_failed'):
                diagnose.connect(args)


class TransportRedactionTests(unittest.TestCase):
    def test_main_reports_only_static_stage_reason_and_no_exception_text(self):
        args = ['transport.py', '--host', 'fixture.test', '--user', 'deploy', '--key', '/fixture',
                '--expected', '/fixture', '--backend', 'owner/backend:'+'a'*40,
                '--frontend', 'owner/frontend:'+'a'*40, '--revision', 'a'*40, '--attempt', '1-1']
        for error, stage, reason in [
            (transport.StageFailure('bootstrap', 'python_3_11_required'), 'bootstrap', 'python_3_11_required'),
            (transport.StageFailure('remote', 'schema_drift'), 'remote', 'schema_drift'),
            (transport.StageFailure('remote', SENTINEL), 'remote', 'invalid_protocol'),
            (ValueError(SENTINEL), 'validation', 'invalid_protocol')]:
            with self.subTest(reason=reason), patch.object(sys, 'argv', args), patch('transport.connect', side_effect=error):
                output = io.StringIO()
                with contextlib.redirect_stdout(output): self.assertEqual(transport.main(), 1)
                self.assertEqual(json.loads(output.getvalue()), {'deployment': 'failed', 'stage': stage, 'reason': reason})
                self.assertNotIn(SENTINEL, output.getvalue())

    def test_bootstrap_validated_reason_not_raw_stderr(self):
        for stdout, expected in [(b'{"reason":"python_3_11_required"}', 'python_3_11_required'),
                                 (json.dumps({'reason': SENTINEL}).encode(), 'command_failed_output_withheld'),
                                 (SENTINEL.encode(), 'command_failed_output_withheld')]:
            proc = unittest.mock.Mock(returncode=1)
            proc.communicate.return_value = (stdout, SENTINEL.encode())
            with patch('transport.subprocess.Popen', return_value=proc):
                with self.assertRaisesRegex(transport.Refusal, expected):
                    transport.bootstrap_run(['fixture'], b'fixture')

    def test_remote_refusal_is_reprojected_through_actual_connect(self):
        with tempfile.TemporaryDirectory(dir=ROOT/'test/deploy') as tmp:
            expected = Path(tmp)/'expected.json'
            expected.write_text('{}')
            args = argparse.Namespace(host='fixture.test', user='deploy', key=Path('/fixture'),
                revision='a'*40, attempt='1-1', backend='owner/backend:'+'a'*40,
                frontend='owner/frontend:'+'a'*40, expected=expected)
            for reason, safe in [('schema_drift', 'schema_drift'), (SENTINEL, 'invalid_protocol')]:
                proc = unittest.mock.Mock(returncode=1)
                proc.stdout = io.BytesIO(json.dumps({'deployment': 'failed', 'reason': reason,
                                                     'untrusted': SENTINEL}).encode())
                proc.poll.return_value = 1
                with patch('transport.bootstrap_run', return_value=b'payload_verified'), patch('transport.subprocess.Popen', return_value=proc):
                    with self.assertRaises(transport.StageFailure) as result:
                        transport.connect(args)
                self.assertEqual(result.exception.stage, 'remote')
                self.assertEqual(str(result.exception), safe)


if __name__ == '__main__':
    unittest.main()

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


class DiagnosticTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(dir=ROOT / 'test/deploy')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.release = self.root / 'releases' / diagnose.FAILED_RELEASE
        self.release.mkdir(parents=True, mode=0o700)
        self.release.parent.chmod(0o700)
        self.calls = []

    def fixture(self, args, **_):
        self.calls.append(args)
        if args == ['docker', 'version', '--format', '{{.Server.Version}}']:
            return b'27.5.1\n'
        if args == ['docker', 'compose', 'version', '--short']:
            return b'2.33.1\n'
        if args[:2] == ['docker', 'ps']:
            self.assertIn('label=com.docker.compose.project.working_dir=/opt/washflow', args)
            return ('2' * 64).encode()
        if args[:2] == ['docker', 'inspect']:
            self.assertEqual(args[2:4], ['--format', diagnose.META])
            return json.dumps({'running': True, 'health': 'healthy', 'image': IMAGE,
                               'environment': SENTINEL}).encode()
        raise AssertionError('Unapproved read-only fixture command')

    def report(self):
        with patch('diagnose.capture', side_effect=self.fixture):
            return diagnose.probe(self.root)

    def test_probe_only_selected_reads_and_no_remote_writes(self):
        before = {str(p.relative_to(self.root)) for p in self.root.rglob('*')}
        value = self.report()
        self.assertTrue(value['docker_probe_ok'])
        self.assertEqual(value['docker'], '27.5.1')
        self.assertEqual(value['apps']['backend'][0]['image'], IMAGE)
        self.assertEqual({str(p.relative_to(self.root)) for p in self.root.rglob('*')}, before)
        self.assertEqual(len(self.calls), 6)
        self.assertTrue(all(c[1] in {'version', 'compose', 'ps', 'inspect'} for c in self.calls))
        self.assertNotIn(SENTINEL, json.dumps(value))

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
        self.assertEqual(len(jobs), 9)
        for name, job in jobs.items():
            if name != 'diagnose': self.assertIn('!inputs.diagnostic_only', job)
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

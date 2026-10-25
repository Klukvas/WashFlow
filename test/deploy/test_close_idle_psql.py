"""Synthetic operational protocol; no production connection or actual session termination."""
import argparse
import ast
import contextlib
import io
import json
import os
from pathlib import Path
import re
import sys
import subprocess
import time
import uuid
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'scripts/deploy'))
import close_idle_psql as operation

IDENTITY = {'pid': 12345, 'started': '1793045000.123456'}
INITIAL = {'all_count': 1, 'eligible_count': 1, 'identity': IDENTITY}
DECISION = {'all_count': 1, 'eligible_count': 1, 'identity_match': True, 'terminated': True}
SENTINEL = 'UNTRUSTED_SECRET_NEVER_FORWARD'


class CloseIdlePsqlTests(unittest.TestCase):
    def run_operation(self, replies):
        with patch.object(operation, 'capture', return_value=b'a'*64), \
             patch.object(operation, 'query', side_effect=replies) as query, \
             patch.object(operation.time, 'sleep') as sleep:
            result = operation.operate()
            return result, query.call_args_list, sleep.call_args_list

    def test_one_candidate_killed_once_and_absence_confirmed(self):
        result, calls, _ = self.run_operation([INITIAL, DECISION, {'absent': True}])
        self.assertEqual(result, {'operation': 'closed', 'terminated': True, 'absent': True})
        self.assertEqual([c.args[1] for c in calls],
                         [operation.CAPTURE_SQL, operation.TERMINATE_SQL, operation.ABSENCE_SQL])
        self.assertEqual(calls[1].args[2], IDENTITY)
        self.assertNotIn(str(IDENTITY['pid']), json.dumps(result))

    def test_zero_psql_noop_without_termination(self):
        result, calls, _ = self.run_operation([{'all_count': 0, 'eligible_count': 0}])
        self.assertEqual(result, {'operation': 'noop', 'reason': 'approved_psql_absent'})
        self.assertEqual(len(calls), 1)

    def test_multiple_active_or_open_transaction_refuse_before_mutation(self):
        for total, eligible in [(2, 2), (2, 1), (1, 0), (2, 0)]:
            with self.subTest(total=total, eligible=eligible), \
                 patch.object(operation, 'capture', return_value=b'a'*64), \
                 patch.object(operation, 'query', return_value={'all_count': total, 'eligible_count': eligible}) as query:
                with self.assertRaisesRegex(operation.Refusal, '^unsafe_candidate_count$'):
                    operation.operate()
                self.assertEqual(query.call_count, 1)

    def test_changed_identity_conditions_or_count_refuse_without_kill_retry(self):
        for changed in [{'all_count': 1, 'eligible_count': 1, 'identity_match': False, 'terminated': False},
                        {'all_count': 2, 'eligible_count': 1, 'identity_match': False, 'terminated': False},
                        {'all_count': 1, 'eligible_count': 0, 'identity_match': False, 'terminated': False}]:
            with self.subTest(changed=changed), patch.object(operation, 'capture', return_value=b'a'*64), \
                 patch.object(operation, 'query', side_effect=[INITIAL, changed]) as query:
                with self.assertRaisesRegex(operation.Refusal, '^candidate_changed$'):
                    operation.operate()
                self.assertEqual(query.call_count, 2)

    def test_terminate_false_refuses_without_retry(self):
        with self.assertRaisesRegex(operation.Refusal, '^termination_not_confirmed$'):
            self.run_operation([INITIAL, {**DECISION, 'terminated': False}])

    def test_absence_read_retries_bounded_but_never_repeats_kill(self):
        result, calls, sleeps = self.run_operation([INITIAL, DECISION, {'absent': False}, {'absent': False}, {'absent': True}])
        self.assertEqual(result['operation'], 'closed')
        self.assertEqual(sum(c.args[1] == operation.TERMINATE_SQL for c in calls), 1)
        self.assertEqual([c.args for c in sleeps], [(1,), (1,)])
        with self.assertRaisesRegex(operation.Refusal, '^absence_not_confirmed$'):
            self.run_operation([INITIAL, DECISION] + [{'absent': False}]*3)

    def test_invalid_counts_identity_confirmation_fail_closed(self):
        for initial in [[], {'all_count': True, 'eligible_count': 1},
                        {'all_count': 1000001, 'eligible_count': 1},
                        {'all_count': 0, 'eligible_count': 1},
                        {**INITIAL, 'identity': {'pid': "1;kill", 'started': SENTINEL}},
                        {**INITIAL, 'identity': {'pid': 1, 'started': "1'; SELECT 1"}}]:
            with self.subTest(initial=initial), self.assertRaises(operation.Refusal):
                self.run_operation([initial])
        with self.assertRaises(operation.Refusal):
            self.run_operation([INITIAL, DECISION, {'absent': 1}])

    def test_fixed_sql_has_all_predicates_identity_binding_and_no_data_mutation(self):
        for sql in [operation.CAPTURE_SQL, operation.TERMINATE_SQL]:
            for predicate in ["datname=current_database()", "pid<>pg_backend_pid()", "backend_type='client backend'",
                              "application_name='psql'", 'client_addr IS NOT NULL', "state='idle'", 'xact_start IS NULL']:
                self.assertIn(predicate.encode(), sql)
        self.assertIn(b'AS MATERIALIZED', operation.TERMINATE_SQL)
        self.assertIn(b"pid=:'target_pid'::integer", operation.TERMINATE_SQL)
        self.assertIn(b"extract(epoch FROM backend_start)=:'target_started'::numeric", operation.TERMINATE_SQL)
        self.assertEqual(operation.TERMINATE_SQL.count(b'pg_terminate_backend('), 1)
        self.assertIn(b'all_count=1 AND eligible_count=1', operation.TERMINATE_SQL)
        for sql in [operation.CAPTURE_SQL, operation.TERMINATE_SQL, operation.ABSENCE_SQL]:
            self.assertNotRegex(sql.upper(), rb'\b(UPDATE|INSERT|DELETE|DROP|ALTER|CREATE|COPY)\b')
            self.assertIn(b"statement_timeout='3s'", sql)

    def test_query_uses_fixed_container_auth_and_psql_variable_parameters(self):
        with patch.object(operation, 'capture', return_value=b'{}') as capture:
            operation.query('a'*64, operation.TERMINATE_SQL, IDENTITY)
        args = capture.call_args.args[0]
        self.assertEqual(args[:6], ['docker', 'exec', '-i', 'a'*64, 'sh', '-c'])
        self.assertIn('target_pid=12345', args[6])
        self.assertIn('target_started=1793045000.123456', args[6])
        self.assertEqual(capture.call_args.kwargs['data'], operation.TERMINATE_SQL)
        self.assertEqual(capture.call_args.kwargs['timeout'], 8)
        self.assertNotIn('PASSWORD', args[6])

    def test_projection_and_failures_never_forward_identity_or_untrusted_strings(self):
        value = operation.project({'operation': 'closed', 'terminated': True, 'absent': True, 'pid': 12345, 'raw': SENTINEL})
        self.assertNotIn(SENTINEL, json.dumps(value))
        self.assertNotIn('pid', value)
        for bad in [{'operation': SENTINEL}, {'operation': 'refused', 'reason': SENTINEL}]:
            with self.assertRaises(operation.Refusal): operation.project(bad)
        output = io.StringIO()
        with patch.object(sys, 'argv', ['helper', '--operate']), \
             patch.object(operation, 'operate', side_effect=ValueError(SENTINEL)), contextlib.redirect_stdout(output):
            self.assertEqual(operation.main(), 0)
        self.assertEqual(json.loads(output.getvalue()), {'operation': 'refused', 'reason': 'command_or_protocol_failed'})

    def test_ssh_stdin_strict_trust_no_upload_or_deployment(self):
        args = argparse.Namespace(host='synthetic.example', user='deploy', key='/synthetic/key')
        with patch.object(operation, 'capture', return_value=b'{"operation":"noop","reason":"approved_psql_absent"}') as capture:
            operation.connect(args)
        command = capture.call_args.args[0]
        self.assertEqual(command[0], 'ssh')
        for option in ['StrictHostKeyChecking=yes', 'UpdateHostKeys=no', 'BatchMode=yes', 'IdentitiesOnly=yes']:
            self.assertIn(option, command)
        self.assertEqual(command[-1], 'python3 -B - --operate')
        self.assertEqual(capture.call_args.kwargs['data'], Path(operation.__file__).read_bytes())
        source = Path(operation.__file__).read_text()
        imports = [node for node in ast.walk(ast.parse(source)) if isinstance(node, (ast.Import, ast.ImportFrom))]
        self.assertNotRegex(str([ast.dump(n) for n in imports]), r"name='(diagnose|remote|transport|common)'")

    def test_remote_static_refusal_survives_transport_then_local_exit_is_failure(self):
        args = argparse.Namespace(host='synthetic.example', user='deploy', key='/synthetic/key')
        with patch.object(operation, 'capture', return_value=b'{"operation":"refused","reason":"candidate_changed","raw":"SECRET"}'):
            self.assertEqual(operation.connect(args), {'operation': 'refused', 'reason': 'candidate_changed'})
        with patch.object(sys, 'argv', ['helper']), patch.object(operation, 'connect',
                return_value={'operation': 'refused', 'reason': 'candidate_changed'}), contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(operation.main(), 1)

    def test_workflow_operational_mode_excludes_all_other_jobs_and_rejects_conflicts(self):
        source = (ROOT/'.github/workflows/ci.yml').read_text()
        jobs = dict(re.findall(r'^  ([\w-]+):\n(.*?)(?=^  [\w-]+:\n|\Z)', source.split('jobs:\n', 1)[1], re.M|re.S))
        self.assertEqual(len(jobs), 10)
        for name, job in jobs.items():
            if name != 'close-idle-psql':
                condition = job.split('if:', 1)[1].split('steps:', 1)[0]
                self.assertIn('!inputs.close_idle_psql', condition)
        op = jobs['close-idle-psql']
        self.assertIn("github.event_name == 'workflow_dispatch' && inputs.close_idle_psql && startsWith(github.ref, 'refs/heads/codex/')", op)
        self.assertIn('inputs.diagnostic_only || inputs.skip_unit_tests || inputs.skip_e2e', op)
        self.assertLess(op.index('Reject conflicting'), op.index('Setup existing operational SSH'))
        self.assertNotIn('environment: production', op)
        self.assertNotRegex(op, r'(?m)^.*(?:transport\.py|diagnose\.py|docker (?:pull|stop|start)|pg_terminate_backend).*')
        self.assertIn("&& !inputs.close_idle_psql }}", source.split('cancel-in-progress:', 1)[1].split('\n')[0])


@unittest.skipUnless(os.environ.get('WASHFLOW_CLOSE_PSQL_DOCKER_TEST') == '1', 'opt-in disposable PostgreSQL proof')
class SyntheticPostgresTests(unittest.TestCase):
    def test_actual_guarded_sql_closes_one_idle_session_and_refuses_open_transaction(self):
        name = 'washflow-p0-one-psql-' + uuid.uuid4().hex[:12]
        container = None
        clients = []
        real_capture = operation.capture
        try:
            container = real_capture(['docker', 'run', '-d', '--name', name, '--network', 'none',
                '--tmpfs', '/var/lib/postgresql/data:rw', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust',
                '-e', 'POSTGRES_USER=p0op', '-e', 'POSTGRES_DB=p0op', 'postgres:16-alpine'], timeout=20).decode().strip()
            self.assertRegex(container, r'^[0-9a-f]{64}$')
            ready = False
            for _ in range(40):
                check = subprocess.run(['docker', 'exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'p0op', '-d', 'p0op'],
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=3)
                if check.returncode == 0:
                    ready = True
                    break
                time.sleep(.25)
            self.assertTrue(ready, 'synthetic PostgreSQL did not become ready')

            def guarded_capture(args, **kwargs):
                if args[:2] == ['docker', 'ps']:
                    return container.encode()
                self.assertEqual(args[:4], ['docker', 'exec', '-i', container])
                return real_capture(args, **kwargs)

            def client(sql):
                process = subprocess.Popen(['docker', 'exec', '-i', container, 'psql', '-XqAt',
                    '-h', '127.0.0.1', '-U', 'p0op', '-d', 'p0op'], stdin=subprocess.PIPE,
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                clients.append(process)
                process.stdin.write(sql)
                process.stdin.flush()
                return process

            def wait_counts(expected):
                for _ in range(30):
                    value = operation.query(container, operation.CAPTURE_SQL)
                    if operation.counts(value) == expected:
                        return
                    time.sleep(.1)
                self.fail('synthetic session state did not settle')

            with patch.object(operation, 'capture', side_effect=guarded_capture):
                self.assertEqual(operation.operate()['reason'], 'approved_psql_absent')
                first = client(b'BEGIN; SELECT 1;\n')
                wait_counts((1, 0))
                with self.assertRaisesRegex(operation.Refusal, '^unsafe_candidate_count$'):
                    operation.operate()
                first.stdin.write(b'ROLLBACK;\n'); first.stdin.flush()
                wait_counts((1, 1))
                second = client(b'SELECT 1;\n')
                wait_counts((2, 2))
                with self.assertRaisesRegex(operation.Refusal, '^unsafe_candidate_count$'):
                    operation.operate()
                second.stdin.write(b'\\q\n'); second.stdin.flush()
                second.wait(timeout=5)
                wait_counts((1, 1))
                self.assertEqual(operation.operate(), {'operation': 'closed', 'terminated': True, 'absent': True})
                first.stdin.close()
                first.wait(timeout=5)
                self.assertEqual(operation.operate()['reason'], 'approved_psql_absent')
        finally:
            for process in clients:
                if process.stdin and not process.stdin.closed:
                    process.stdin.close()
            if container:
                subprocess.run(['docker', 'rm', '-f', container], stdout=subprocess.DEVNULL,
                               stderr=subprocess.DEVNULL, timeout=15, check=True)
            for process in clients:
                process.wait(timeout=5)


if __name__ == '__main__':
    unittest.main()

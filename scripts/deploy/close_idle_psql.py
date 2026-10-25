#!/usr/bin/env python3
"""Close at most one explicitly authorized idle network psql session; no data writes."""
import argparse
import json
import os
from pathlib import Path
import re
import shlex
import signal
import subprocess
import sys
import time

BASE = "datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend' AND application_name='psql' AND client_addr IS NOT NULL"
ELIGIBLE = BASE + " AND state='idle' AND xact_start IS NULL"
PG_COMMAND = ('exec psql -XqAt --no-password -v ON_ERROR_STOP=1 '
              '-U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-postgres}"')
CAPTURE_SQL = ("BEGIN READ ONLY; SET LOCAL statement_timeout='3s'; WITH candidates AS MATERIALIZED "
               "(SELECT pid,extract(epoch FROM backend_start)::text AS started FROM pg_stat_activity WHERE " + ELIGIBLE + ") "
               "SELECT json_build_object('all_count',(SELECT count(*) FROM pg_stat_activity WHERE " + BASE + "),"
               "'eligible_count',(SELECT count(*) FROM candidates),'identity',"
               "(SELECT json_build_object('pid',pid,'started',started) FROM candidates LIMIT 1)); COMMIT;").encode()
# Identity values are psql variables quoted as SQL literals, never interpolated into SQL.
TERMINATE_SQL = ("SET statement_timeout='3s'; WITH candidates AS MATERIALIZED "
    "(SELECT pid,backend_start FROM pg_stat_activity WHERE " + ELIGIBLE + "), "
    "counts AS MATERIALIZED (SELECT (SELECT count(*) FROM pg_stat_activity WHERE " + BASE + ") AS all_count,"
    "(SELECT count(*) FROM candidates) AS eligible_count), authorized AS MATERIALIZED "
    "(SELECT pid FROM candidates,counts WHERE all_count=1 AND eligible_count=1 "
    "AND pid=:'target_pid'::integer AND extract(epoch FROM backend_start)=:'target_started'::numeric) "
    "SELECT json_build_object('all_count',all_count,'eligible_count',eligible_count,"
    "'identity_match',EXISTS(SELECT 1 FROM authorized),'terminated',"
    "COALESCE((SELECT pg_terminate_backend(pid) FROM authorized),false)) FROM counts;").encode()
ABSENCE_SQL = ("BEGIN READ ONLY; SET LOCAL statement_timeout='3s'; SELECT json_build_object('absent',NOT EXISTS "
    "(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid=:'target_pid'::integer "
    "AND extract(epoch FROM backend_start)=:'target_started'::numeric)); COMMIT;").encode()
REASONS = ('approved_psql_absent', 'unsafe_candidate_count', 'candidate_changed', 'termination_not_confirmed',
           'absence_not_confirmed', 'command_or_protocol_failed', 'invalid_access_metadata')


class Refusal(ValueError):
    pass


def capture(args: list, data: bytes = None, timeout: int = 10) -> bytes:
    proc = subprocess.Popen(args, stdin=subprocess.PIPE if data is not None else subprocess.DEVNULL,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    try:
        stdout, _ = proc.communicate(data, timeout=timeout)
    except BaseException:
        os.killpg(proc.pid, signal.SIGTERM)
        try:
            proc.communicate(timeout=3)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
            proc.communicate()
        raise Refusal('command_or_protocol_failed') from None
    if proc.returncode or len(stdout) > 65536:
        raise Refusal('command_or_protocol_failed')
    return stdout


def counts(value: dict) -> tuple:
    if not isinstance(value, dict):
        raise Refusal('command_or_protocol_failed')
    pair = (value.get('all_count'), value.get('eligible_count'))
    if not all(type(n) is int and 0 <= n <= 1000000 for n in pair) or pair[1] > pair[0]:
        raise Refusal('command_or_protocol_failed')
    return pair


def query(container: str, sql: bytes, identity: dict = None) -> dict:
    arguments = [] if identity is None else ['-v', 'target_pid=' + str(identity['pid']),
                                             '-v', 'target_started=' + identity['started']]
    command = PG_COMMAND + (' ' + shlex.join(arguments) if arguments else '')
    return json.loads(capture(['docker', 'exec', '-i', container, 'sh', '-c', command], data=sql, timeout=8))


def operate() -> dict:
    ids = capture(['docker', 'ps', '-q', '--no-trunc', '--filter',
        'label=com.docker.compose.project.working_dir=/opt/washflow', '--filter',
        'label=com.docker.compose.service=postgres']).decode('ascii').split()
    if len(ids) != 1 or not re.fullmatch(r'[0-9a-f]{64}', ids[0]):
        raise Refusal('command_or_protocol_failed')
    initial = query(ids[0], CAPTURE_SQL)
    all_count, eligible = counts(initial)
    if all_count == 0:
        return {'operation': 'noop', 'reason': 'approved_psql_absent'}
    if (all_count, eligible) != (1, 1):
        raise Refusal('unsafe_candidate_count')
    identity = initial.get('identity')
    if (not isinstance(identity, dict) or type(identity.get('pid')) is not int
            or not 1 <= identity['pid'] <= 2147483647 or not isinstance(identity.get('started'), str)
            or not re.fullmatch(r'[0-9]{1,12}(\.[0-9]{1,6})?', identity['started'])):
        raise Refusal('command_or_protocol_failed')
    decision = query(ids[0], TERMINATE_SQL, identity)
    if counts(decision) != (1, 1) or decision.get('identity_match') is not True:
        raise Refusal('candidate_changed')
    if decision.get('terminated') is not True:
        raise Refusal('termination_not_confirmed')
    for attempt in range(3):
        if attempt:
            time.sleep(1)
        confirmation = query(ids[0], ABSENCE_SQL, identity)
        if not isinstance(confirmation, dict) or type(confirmation.get('absent')) is not bool:
            raise Refusal('command_or_protocol_failed')
        if confirmation['absent']:
            return {'operation': 'closed', 'terminated': True, 'absent': True}
    raise Refusal('absence_not_confirmed')


def project(value: dict) -> dict:
    if isinstance(value, dict):
        if value.get('operation') == 'closed' and value.get('terminated') is True and value.get('absent') is True:
            return {'operation': 'closed', 'terminated': True, 'absent': True}
        if value.get('operation') == 'noop' and value.get('reason') == 'approved_psql_absent':
            return {'operation': 'noop', 'reason': 'approved_psql_absent'}
        if value.get('operation') == 'refused' and value.get('reason') in REASONS:
            return {'operation': 'refused', 'reason': value['reason']}
    raise Refusal('command_or_protocol_failed')


def connect(args: argparse.Namespace) -> dict:
    if (not isinstance(args.host, str) or not isinstance(args.user, str)
            or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9.-]*', args.host)
            or not re.fullmatch(r'[a-z_][a-z0-9_-]*', args.user)):
        raise Refusal('invalid_access_metadata')
    command = ['ssh', '-i', str(args.key), '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes',
        '-o', 'StrictHostKeyChecking=yes', '-o', 'UpdateHostKeys=no', '-o', 'ControlMaster=no',
        '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=10', '-o', 'ServerAliveCountMax=3',
        args.user + '@' + args.host, shlex.join(['python3', '-B', '-', '--operate'])]
    return project(json.loads(capture(command, data=Path(__file__).read_bytes(), timeout=60)))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--operate', action='store_true')
    for name in ['host', 'user', 'key']:
        parser.add_argument('--' + name)
    args = parser.parse_args()
    try:
        result = project(operate() if args.operate else connect(args))
    except (OSError, ValueError, TypeError, KeyError, AttributeError):
        error = sys.exc_info()[1]
        reason = str(error) if isinstance(error, Refusal) and str(error) in REASONS else 'command_or_protocol_failed'
        result = {'operation': 'refused', 'reason': reason}
    print(json.dumps(result, sort_keys=True))
    # SSH transports the projected refusal JSON successfully; the local caller exits nonzero.
    return 1 if result['operation'] == 'refused' and not args.operate else 0


if __name__ == '__main__':
    sys.exit(main())

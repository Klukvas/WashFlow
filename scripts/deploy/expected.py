#!/usr/bin/env python3
"""Build expected metadata in a task-owned network-none PostgreSQL 16 reference."""
import argparse
import json
from pathlib import Path
import sys
import uuid

from common import Refusal, catalog_hash, digest, require, run, save_json, wait_until


def generate(root, output):
    require(not output.exists(), 'expected_output_exists')
    migrations = sorted((root / 'prisma/migrations').glob('*/migration.sql'))
    require(bool(migrations), 'no_migrations')
    name = 'washflow-deploy-reference-' + uuid.uuid4().hex
    created = False
    try:
        run(['docker', 'run', '-d', '--name', name, '--network=none',
             '--tmpfs', '/var/lib/postgresql/data', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust',
             'postgres:16-alpine'], timeout=120)
        created = True
        def ready():
            try:
                run(['docker', 'exec', name, 'pg_isready', '-U', 'postgres'], timeout=5)
                return True
            except Refusal:
                return False
        wait_until(ready, seconds=60, interval=1)
        psql = ['docker', 'exec', '-i', name, 'psql', '-XqAt', '-v', 'ON_ERROR_STOP=1',
                '-U', 'postgres', '-d', 'postgres']
        for migration in migrations:
            run(psql, data=migration.read_bytes(), timeout=120)
        schema = run(psql, data=(Path(__file__).parent / 'catalog.sql').read_bytes())
        save_json(output, {
            'format': 'washflow-deploy-expected-v1', 'postgres_major': 16,
            'migrations': {p.parent.name: digest(p) for p in migrations},
            'schema_hash': catalog_hash(schema),
        })
    finally:
        if created:
            run(['docker', 'rm', '-f', name], timeout=30)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path('.'))
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    try:
        generate(args.root, args.output)
        print(json.dumps({'expected_metadata': 'created'}))
        return 0
    except (Refusal, OSError, ValueError):
        print(json.dumps({'expected_metadata': 'failed', 'details': 'withheld'}))
        return 1


if __name__ == '__main__':
    sys.exit(main())

"""Opt-in real PG16 migration/catalog/archive evidence; task-owned network-none runtime."""
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
import uuid

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scripts/deploy'))
from common import Refusal,catalog_hash,digest,run,wait_until
import expected
import remote


@unittest.skipUnless(os.environ.get('WASHFLOW_DEPLOY_DOCKER_TEST')=='1',
                     'opt-in synthetic Docker PostgreSQL16 test')
class PostgreSQLTests(unittest.TestCase):
    def test_real_chain_gate_drift_semantic_order_and_dump_listing(self):
        name='washflow-deploy-test-'+uuid.uuid4().hex
        with tempfile.TemporaryDirectory(dir=ROOT/'test/deploy') as tmp:
            output=Path(tmp)/'expected.json'
            expected.generate(ROOT,output)
            metadata=json.loads(output.read_text())
            self.assertEqual(len(metadata['migrations']),15)
            created=False
            try:
                run(['docker','run','-d','--name',name,'--network=none','--tmpfs',
                     '/var/lib/postgresql/data','-e','POSTGRES_HOST_AUTH_METHOD=trust',
                     'postgres:16-alpine'],timeout=120)
                created=True
                def ready():
                    try:run(['docker','exec',name,'pg_isready','-U','postgres'],timeout=5);return True
                    except Refusal:return False
                wait_until(ready,seconds=60,interval=1)
                psql=['docker','exec','-i',name,'psql','-XqAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres']
                for migration in sorted((ROOT/'prisma/migrations').glob('*/migration.sql')):
                    run(psql,data=migration.read_bytes(),timeout=120)
                run(psql,data=b'''CREATE TABLE _prisma_migrations(migration_name text,checksum text,
                    finished_at timestamptz,rolled_back_at timestamptz);''')
                for migration,checksum in metadata['migrations'].items():
                    run(psql,data=f"INSERT INTO _prisma_migrations VALUES ('{migration}','{checksum}',now(),NULL);".encode())
                d=remote.Deployment(Path(tmp),'unused','unused','a'*40)
                d.old={'postgres':{'id':name}};d.expected=metadata
                (Path(tmp)/'catalog.sql').write_bytes((ROOT/'scripts/deploy/catalog.sql').read_bytes())
                d.schema_gate()
                run(psql,data=b"INSERT INTO _prisma_migrations SELECT migration_name,checksum,NULL,now() FROM _prisma_migrations LIMIT 1;")
                d.schema_gate()  # Explicitly resolved failed history is not pending.
                run(psql,data=b'ALTER TABLE orders ALTER COLUMN notes SET NOT NULL;')
                with self.assertRaisesRegex(Refusal,'schema_drift'):d.schema_gate()
                run(psql,data=b'ALTER TABLE orders ALTER COLUMN notes DROP NOT NULL;')
                d.schema_gate()
                # Real custom-format dump/list uses the existing container auth context.
                archive=run(['docker','exec',name,'pg_dump','-Fc','--no-owner','--no-acl','-U','postgres','-d','postgres'])
                self.assertTrue(archive.startswith(b'PGDMP'))
                listing=run(['docker','exec','-i',name,'pg_restore','--list'],data=archive)
                self.assertIn(b'orders',listing)
                # Physical column order alone is not semantic schema drift.
                run(psql,data=b'CREATE DATABASE order_a; CREATE DATABASE order_b;')
                def sql(db,statement):
                    return run(psql[:-1]+[db],data=statement)
                sql('order_a',b'CREATE TABLE probe(a integer,b text);')
                sql('order_b',b'CREATE TABLE probe(b text,a integer);')
                query=(ROOT/'scripts/deploy/catalog.sql').read_bytes()
                baseline=catalog_hash(sql('order_a',query))
                self.assertEqual(baseline,catalog_hash(sql('order_b',query)))
                for change,undo in [
                    (b'ALTER TABLE probe ALTER COLUMN a TYPE bigint;',b'ALTER TABLE probe ALTER COLUMN a TYPE integer;'),
                    (b'ALTER TABLE probe ALTER COLUMN a SET NOT NULL;',b'ALTER TABLE probe ALTER COLUMN a DROP NOT NULL;'),
                    (b'CREATE INDEX probe_a_idx ON probe(a);',b'DROP INDEX probe_a_idx;')]:
                    sql('order_b',change)
                    self.assertNotEqual(baseline,catalog_hash(sql('order_b',query)))
                    sql('order_b',undo)
                    self.assertEqual(baseline,catalog_hash(sql('order_b',query)))
            finally:
                if created:run(['docker','rm','-f',name],timeout=30)


if __name__=='__main__':unittest.main()

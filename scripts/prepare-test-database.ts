import 'dotenv/config';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';

const testDatabase = process.env.TEST_DB_NAME?.trim() || 'oficina_test';
if (testDatabase !== 'oficina_test') throw new Error('Preparação recusada: TEST_DB_NAME deve ser oficina_test.');
const connection = { host: process.env.DB_HOST ?? 'localhost', port: Number(process.env.DB_PORT ?? 5432), user: process.env.DB_USER ?? 'postgres', password: process.env.DB_PASSWORD ?? '' };
const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`;

(async () => {
  const admin = new Pool({ ...connection, database: process.env.DB_ADMIN_DATABASE?.trim() || 'postgres' });
  try {
    const exists = await admin.query<{ exists: boolean }>('SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname=$1) AS exists', [testDatabase]);
    if (!exists.rows[0]?.exists) await admin.query(`CREATE DATABASE ${quoteIdentifier(testDatabase)}`);
  } finally { await admin.end(); }
  const target = new Pool({ ...connection, database: testDatabase });
  try {
    await target.query('CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(120) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    const migrationDirectory = join(process.cwd(), 'database', 'migrations');
    for (const file of readdirSync(migrationDirectory).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
      const applied = await target.query('SELECT 1 FROM schema_migrations WHERE version=$1', [file]);
      if (applied.rowCount) continue;
      await target.query(readFileSync(join(migrationDirectory, file), 'utf8'));
      await target.query('INSERT INTO schema_migrations(version) VALUES($1)', [file]);
      console.log(`Aplicada migration ${file}`);
    }
    await target.query(`
      INSERT INTO obras (codigo,nome,status) VALUES
        ('TEST-OBRA-001','Obra de Teste 001','ATIVA'),
        ('TEST-OBRA-002','Obra de Teste 002','ATIVA')
      ON CONFLICT (codigo) DO NOTHING;
      INSERT INTO prefixos_frota (codigo,descricao,status)
        VALUES ('TST','Fixtures automatizadas','ATIVO')
        ON CONFLICT (codigo) DO NOTHING;
      INSERT INTO frotas (prefixo_frota_id,numero,codigo,placa,status)
        SELECT id,'01','TST01','TST0101','ATIVO' FROM prefixos_frota WHERE codigo='TST'
        ON CONFLICT (codigo) DO NOTHING;
      INSERT INTO frotas (prefixo_frota_id,numero,codigo,placa,status)
        SELECT id,'02','TST02','TST0202','ATIVO' FROM prefixos_frota WHERE codigo='TST'
        ON CONFLICT (codigo) DO NOTHING;
      INSERT INTO frotas (prefixo_frota_id,numero,codigo,placa,status)
        SELECT id,'03','TST03','TST0303','ATIVO' FROM prefixos_frota WHERE codigo='TST'
        ON CONFLICT (codigo) DO NOTHING;
      INSERT INTO abastecimento_terceiros (codigo,nome,status)
        VALUES ('TEST-TERCEIRO-001','Terceiro de Teste 001','ATIVO')
        ON CONFLICT (codigo) DO NOTHING;
      INSERT INTO abastecimento_terceiro_identificacoes
        (terceiro_id,identificacao,identificacao_normalizada,tipo,status)
        SELECT id,'TST-TERC-01','TST-TERC-01','GERAL','ATIVO'
        FROM abastecimento_terceiros WHERE codigo='TEST-TERCEIRO-001'
        AND NOT EXISTS (SELECT 1 FROM abastecimento_terceiro_identificacoes WHERE identificacao_normalizada='TST-TERC-01');
    `);
    console.log(`Banco de testes preparado: ${testDatabase}`);
  } finally { await target.end(); }
})();

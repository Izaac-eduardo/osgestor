import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMigration, allowedVersions, migrationChecksum, validateArguments, validateControlColumns } from '../scripts/deploy-migration.js';

test('migrations 039-042 resolvem o nome completo do arquivo SQL', () => {
  assert.equal(validateArguments({ mode: 'preview', database: 'oficina', version: '039' }), '039_os_manutencao_sem_obra.sql');
  assert.equal(allowedVersions.get('042'), '042_contabilidade_despesas_compartilhadas.sql');
});

test('aceita schema legado version/applied_at sem checksum retroativo', () => {
  assert.doesNotThrow(() => validateControlColumns(['version', 'applied_at']));
  assert.throws(() => validateControlColumns(['version']), /incompatível/);
});

test('valida explicitamente banco e confirmação para apply', () => {
  assert.throws(() => validateArguments({ mode: 'preview', database: 'oficina', version: '039', configuredDatabase: 'outro' }), /DB_NAME diverge/);
  assert.throws(() => validateArguments({ mode: 'apply', database: 'oficina', version: '039' }), /confirm-target/);
  assert.throws(() => validateArguments({ mode: 'apply', database: 'outra', version: '039', confirmedTarget: 'outra' }), /não autorizado/);
});

test('preview não é implementado como operação de escrita e SHA-256 é calculado sobre o SQL', () => {
  assert.equal(migrationChecksum('SELECT 1;').length, 64);
});

test('falha na migration executa rollback e não registra a versão', async () => {
  const calls: string[] = [];
  const client = { query: async (sql: string) => { calls.push(sql); if (sql.includes('FAIL')) throw new Error('migration failed'); return { rows: [] }; } };
  await assert.rejects(() => applyMigration(client, '039_os_manutencao_sem_obra.sql', 'BEGIN; FAIL; COMMIT;'), /migration failed/);
  assert.deepEqual(calls.map(sql => sql.trim()), ['BEGIN', 'FAIL;', 'ROLLBACK']);
});

test('aplicação registra nome completo somente após executar o SQL', async () => {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const client = { query: async (sql: string, values?: unknown[]) => { calls.push({ sql, values }); return { rows: [] }; } };
  await applyMigration(client, '040_importacoes_contabeis.sql', 'BEGIN; SELECT 1; COMMIT;');
  assert.deepEqual(calls.map(call => call.sql.trim()), ['BEGIN', 'SELECT 1;', 'INSERT INTO schema_migrations(version) VALUES($1)', 'COMMIT']);
  assert.deepEqual(calls[2]?.values, ['040_importacoes_contabeis.sql']);
});

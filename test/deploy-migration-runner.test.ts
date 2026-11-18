import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMigration, allowedVersions, migrationChecksum, validateArguments, validateAppliedChecksum, validateControlColumns } from '../scripts/deploy-migration.js';

test('migrations 039-044 resolvem o nome completo do arquivo SQL', () => {
  assert.equal(validateArguments({ mode: 'preview', database: 'oficina', version: '039' }), '039_os_manutencao_sem_obra.sql');
  assert.equal(allowedVersions.get('042'), '042_contabilidade_despesas_compartilhadas.sql');
  assert.equal(allowedVersions.get('043'), '043_contabilidade_periodos_e_sobreposicao.sql');
  assert.equal(allowedVersions.get('044'), '044_revisao_importacao_contabil.sql');
});

test('valida schema real com cinco colunas de controle', () => {
  assert.doesNotThrow(() => validateControlColumns(['version', 'file_name', 'checksum_sha256', 'applied_at', 'applied_by']));
  assert.throws(() => validateControlColumns(['version', 'applied_at']), /incompatível/);
});

test('valida explicitamente banco e confirmação para apply', () => {
  assert.throws(() => validateArguments({ mode: 'preview', database: 'oficina', version: '039', configuredDatabase: 'outro' }), /DB_NAME diverge/);
  assert.throws(() => validateArguments({ mode: 'apply', database: 'oficina', version: '039' }), /confirm-target/);
  assert.throws(() => validateArguments({ mode: 'apply', database: 'outra', version: '039', confirmedTarget: 'outra' }), /não autorizado/);
});

test('autoriza osgestor_prod somente quando informado explicitamente e exige confirmação para apply', () => {
  assert.equal(validateArguments({ mode: 'preview', database: 'osgestor_prod', version: '039', configuredDatabase: 'osgestor_prod' }), '039_os_manutencao_sem_obra.sql');
  assert.throws(() => validateArguments({ mode: 'preview', version: '039' }), /database/);
  assert.throws(() => validateArguments({ mode: 'preview', database: 'osgestor-prod', version: '039' }), /não autorizado/);
  assert.throws(() => validateArguments({ mode: 'apply', database: 'osgestor_prod', version: '039' }), /confirm-target/);
  assert.equal(validateArguments({ mode: 'apply', database: 'osgestor_prod', version: '039', confirmedTarget: 'osgestor_prod' }), '039_os_manutencao_sem_obra.sql');
});

test('SHA-256 é calculado sobre o SQL', () => {
  assert.equal(migrationChecksum('SELECT 1;').length, 64);
});

test('checksum correto permite reconhecer migration aplicada e divergência bloqueia', () => {
  const checksum = migrationChecksum('SELECT 1;');
  const applied = { version: '039_os_manutencao_sem_obra.sql', file_name: '039_os_manutencao_sem_obra.sql', checksum_sha256: checksum };
  assert.doesNotThrow(() => validateAppliedChecksum(applied, applied.version, checksum));
  assert.throws(() => validateAppliedChecksum(applied, applied.version, migrationChecksum('SELECT 2;')), /Checksum incompatível/);
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
  assert.deepEqual(calls.map(call => call.sql.trim()), ['BEGIN', 'SELECT 1;', 'INSERT INTO schema_migrations(version,file_name,checksum_sha256,applied_at,applied_by) VALUES($1,$2,$3,now(),current_user)', 'COMMIT']);
  assert.deepEqual(calls[2]?.values, ['040_importacoes_contabeis.sql', '040_importacoes_contabeis.sql', migrationChecksum('BEGIN; SELECT 1; COMMIT;')]);
});

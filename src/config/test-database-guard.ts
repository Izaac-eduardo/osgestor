const testProcess = process.argv.includes('--test') || process.argv.some(argument => /(^|[\\/])test([\\/]|.)/.test(argument)) || process.env.NODE_ENV === 'test' || Boolean(process.env.NODE_TEST_CONTEXT);
const databaseName = process.env.DB_NAME?.trim();
const testDatabaseName = 'oficina_teste_fase051';

const disposableTestDatabase = process.env.CONTABILIDADE_TEST_DATABASE?.trim().toLowerCase();

export function assertSafeIntegrationDatabase(): void {
  if (process.env.ALLOW_DISPOSABLE_TEST_DATABASE === 'true' && disposableTestDatabase && databaseName?.toLowerCase() === disposableTestDatabase && disposableTestDatabase !== 'oficina' && disposableTestDatabase !== testDatabaseName) return;
  if (!testProcess) return;
  if (!databaseName) throw new Error(`Testes de integração recusados: DB_NAME não foi configurado para o banco de teste ${testDatabaseName}.`);
  if (databaseName.toLowerCase() !== testDatabaseName) throw new Error(`Testes de integração recusados: banco não autorizado (${databaseName}). Use DB_NAME=${testDatabaseName}.`);
}

export function getTestDatabaseName(): string { return testDatabaseName; }

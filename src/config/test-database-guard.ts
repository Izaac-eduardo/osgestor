const testProcess = process.argv.includes('--test') || process.argv.some(argument => /(^|[\\/])test([\\/]|.)/.test(argument)) || process.env.NODE_ENV === 'test' || Boolean(process.env.NODE_TEST_CONTEXT);
const databaseName = process.env.DB_NAME?.trim();
const testDatabaseName = 'oficina_teste_fase051';

export function assertSafeIntegrationDatabase(): void {
  if (!testProcess) return;
  if (!databaseName) throw new Error(`Testes de integração recusados: DB_NAME não foi configurado para o banco de teste ${testDatabaseName}.`);
  if (databaseName.toLowerCase() !== testDatabaseName) throw new Error(`Testes de integração recusados: banco não autorizado (${databaseName}). Use DB_NAME=${testDatabaseName}.`);
}

export function getTestDatabaseName(): string { return testDatabaseName; }

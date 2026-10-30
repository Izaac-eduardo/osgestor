import 'dotenv/config';

const EXPECTED_DATABASE = 'osgestor_docker_test';
const EXPECTED_HOST = 'postgres';
const CONFIRMATION = 'CREATE_OSGESTOR_DOCKER_ADMIN';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} é obrigatório.`);
  return value;
}

function validateEnvironment(): { username: string; email: string; password: string } {
  if (process.env.DB_NAME?.trim() !== EXPECTED_DATABASE || process.env.POSTGRES_DB?.trim() !== EXPECTED_DATABASE) throw new Error('DB_NAME e POSTGRES_DB devem ser osgestor_docker_test.');
  if (process.env.DB_HOST?.trim() !== EXPECTED_HOST || Number(process.env.DB_PORT ?? 5432) !== 5432) throw new Error('A rotina exige o serviço PostgreSQL Docker em postgres:5432.');
  if (process.env.DOCKER_ADMIN_CONFIRM !== CONFIRMATION) throw new Error('Criação manual do administrador não confirmada.');
  const username = required('DOCKER_ADMIN_USERNAME');
  const email = required('DOCKER_ADMIN_EMAIL');
  const password = required('DOCKER_ADMIN_PASSWORD');
  if (!username.startsWith('docker_') || !email.toLowerCase().endsWith('.invalid')) throw new Error('O administrador Docker deve usar identidade fictícia (username docker_ e e-mail .invalid).');
  return { username, email, password };
}

async function main(): Promise<void> {
  const input = validateEnvironment();
  const { bootstrapFirstAdmin } = await import('../src/services/admin-users.service.js');
  const { pool } = await import('../src/config/database.js');
  try {
    await bootstrapFirstAdmin(input, EXPECTED_DATABASE);
    console.log('Administrador Docker criado; a troca de senha será exigida no primeiro acesso.');
  } finally {
    await pool.end();
  }
}

void main().catch(error => { console.error(error instanceof Error ? error.message : 'Falha na criação do administrador Docker.'); process.exitCode = 1; });

import assert from 'node:assert/strict';
import test from 'node:test';
import { isLocalRestoreEnvironment, resolveSecureCookies } from '../src/config/auth.js';

const base = {
  NODE_ENV: 'production',
  AUTH_COOKIE_SECURE: 'false',
  AUTH_COOKIE_NAME: 'osgestor_restore_session',
  DOCKER_RESTORE_LOCAL: 'true',
  DB_NAME: 'osgestor_restore_test',
  CORS_ORIGINS: 'http://127.0.0.1:8081',
};

test('produção mantém Secure por padrão', () => {
  assert.equal(resolveSecureCookies({ NODE_ENV: 'production', AUTH_COOKIE_SECURE: 'false' }), true);
});

test('desenvolvimento respeita AUTH_COOKIE_SECURE', () => {
  assert.equal(resolveSecureCookies({ NODE_ENV: 'development', AUTH_COOKIE_SECURE: 'false' }), false);
  assert.equal(resolveSecureCookies({ NODE_ENV: 'development', AUTH_COOKIE_SECURE: 'true' }), true);
});

test('restauração local permite HTTP somente com todos os marcadores restritos', () => {
  assert.equal(isLocalRestoreEnvironment(base), true);
  assert.equal(resolveSecureCookies(base), false);
});

test('origem pública não ativa a exceção de restauração', () => {
  const publicEnvironment = { ...base, CORS_ORIGINS: 'https://osgestor.example.com' };
  assert.equal(isLocalRestoreEnvironment(publicEnvironment), false);
  assert.equal(resolveSecureCookies(publicEnvironment), true);
});

test('nome de cookie ou banco divergente mantém Secure', () => {
  assert.equal(resolveSecureCookies({ ...base, AUTH_COOKIE_NAME: 'osgestor_session' }), true);
  assert.equal(resolveSecureCookies({ ...base, DB_NAME: 'osgestor_docker_test' }), true);
  assert.equal(resolveSecureCookies({ ...base, DOCKER_RESTORE_LOCAL: 'false' }), true);
});

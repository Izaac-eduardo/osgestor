import assert from 'node:assert/strict';
import test from 'node:test';
import { assertPasswordInput, hashPassword, minimumPasswordLength, verifyPassword } from '../src/services/password.service.js';

test('política de senha aceita 8 caracteres e rejeita 7', async () => {
  assert.equal(minimumPasswordLength, 8);
  assert.throws(() => assertPasswordInput('1234567'), /entre 8 e 1024/);
  assert.doesNotThrow(() => assertPasswordInput('12345678'));
  assert.doesNotThrow(() => assertPasswordInput('123456789012'));

  const hash = await hashPassword('12345678');
  assert.match(hash, /^\$argon2id\$/);
  assert.equal(await verifyPassword(hash, '12345678'), true);
});

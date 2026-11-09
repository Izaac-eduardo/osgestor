import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('proxy do Vite encaminha os módulos contábil e financeiro para a API', () => {
  const config = readFileSync(new URL('../frontend/vite.config.ts', import.meta.url), 'utf8');
  assert.match(config, /'\/contabilidade':\s*'http:\/\/localhost:3000'/);
  assert.match(config, /'\/manutencao-financeira':\s*'http:\/\/localhost:3000'/);
});

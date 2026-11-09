import 'dotenv/config';
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import * as XLSX from 'xlsx';
import { analisarContabilidade, confirmarContabilidade } from '../src/services/contabilidade-import.service.js';
import { pool } from '../src/config/database.js';

function workbook(): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Controle', 'Data Conta', 'Total', 'SubCentro', 'Tipo de Movimentação', 'Plano de Contas'],
    ['P1', '05/11/2026 00:00', '10,00', 'SEM-FROTA', 'Saída', 'CUSTO PECAS / OFICINA'],
  ]);
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'Relatorio');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

test('análise contábil produz prévia sem persistir e confirmação exige token válido', async () => {
  const preview = await analisarContabilidade(workbook(), 'preview-only.xlsx');
  assert.equal(preview.somente_leitura, true);
  assert.equal(preview.total, 1);
  assert.equal(preview.pendentes, 1);
  assert.equal(preview.total_elegivel, '0.00');
  await assert.rejects(() => confirmarContabilidade('token-inexistente'), /Prévia contábil expirada/);
});

test('arquivo contábil inválido é rejeitado sem confirmação', async () => {
  await assert.rejects(() => analisarContabilidade(Buffer.from('arquivo inválido'), 'invalido.xlsx'), /Arquivo incompatível/);
});

after(async () => { await pool.end(); });

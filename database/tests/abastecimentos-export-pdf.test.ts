import assert from 'node:assert/strict';
import test from 'node:test';
import { renderAbastecimentosPdfForTest } from '../../src/services/abastecimentos-export.service.js';

const pageCount = (pdf: Buffer): number => {
  const matches = pdf.toString('latin1').match(/\/Type \/Page\b/g);
  return matches?.length ?? 0;
};

test('PDF de abastecimentos não cria páginas extras ao aplicar cabeçalho e rodapé', async () => {
  const rows = Array.from({ length: 65 }, (_, index) => [`Frota ${index + 1}`, 'Produto', '10,000 L', 'R$ 100,00']);
  const pdf = await renderAbastecimentosPdfForTest(
    'Relatório de teste',
    [{ label: 'Período', value: 'Todos' }],
    ['Abastecimentos: 65'],
    [{ title: 'Distribuição por Produto', headers: ['Frota', 'Produto', 'Litros', 'Valor'], rows }],
  );

  assert.ok(pdf.length > 0);
  assert.equal(pageCount(pdf), 4);
  assert.match(pdf.toString('latin1'), /\/Count 4/);
});

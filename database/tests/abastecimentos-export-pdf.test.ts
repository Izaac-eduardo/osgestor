import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTerceirosPdfRows, renderAbastecimentosPdfForTest } from '../../src/services/abastecimentos-export.service.js';

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

test('seção de terceiros separa placas, subtotaliza por terceiro e preserva não informada', () => {
  const rows = buildTerceirosPdfRows([
    { terceiro_id: 't1', terceiro: 'TERCEIRO A', placa: 'ABC1D23', quantidade: 2, litros: 10.5, valor: 100 },
    { terceiro_id: 't1', terceiro: 'TERCEIRO A', placa: '', quantidade: 1, litros: 5, valor: 50 },
    { terceiro_id: 't2', terceiro: 'TERCEIRO B', placa: 'ABC1D23', quantidade: 3, litros: 20, valor: 200 },
  ]);

  assert.equal(rows[0]?.[0], 'TERCEIRO A');
  assert.equal(rows[0]?.[1], 'ABC1D23');
  assert.equal(rows[1]?.[1], 'Não informada');
  assert.equal(rows[2]?.[0], 'Subtotal: TERCEIRO A');
  assert.equal(rows[2]?.[2], '3');
  assert.equal(rows[3]?.[0], 'TERCEIRO B');
  assert.equal(rows[4]?.[0], 'Subtotal: TERCEIRO B');
  assert.equal(rows.at(-1)?.[0], 'TOTAL GERAL');
  assert.equal(rows.at(-1)?.[2], '6');
});

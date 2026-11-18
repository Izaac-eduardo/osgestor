import 'dotenv/config'
import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import * as XLSX from 'xlsx'
import { analisarContabilidade } from '../src/services/contabilidade-import.service.js'
import { pool } from '../src/config/database.js'

function workbook(subcentros: string[]): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Controle', 'Data Conta', 'Total', 'SubCentro', 'Tipo de Movimentacao', 'Plano de Contas'],
    ...subcentros.map((subcentro, index) => [`F${index}`, '10/11/2026', `${index + 1},00`, subcentro, 'Saida', 'CUSTO PECAS / OFICINA']),
  ])
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'Relatorio')
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

test('reconhece FROTA PA, PA e PA- como a mesma frota ativa', async () => {
  const fleet = (await pool.query<{ id: string }>("SELECT id FROM frotas WHERE codigo='TST01' AND status='ATIVO'")).rows[0]
  assert.ok(fleet)
  const preview = await analisarContabilidade(workbook(['FROTA TST01', 'TST01', 'TST-01']), 'fleet-equivalence.xlsx', { inicio: '2026-11-01', fim: '2026-11-30' })
  assert.equal(preview.itens.length, 3)
  assert.ok(preview.itens.every(item => item.frota_id === fleet.id && item.identificacao_frota === 'EXATA' && item.motivo_pendencia === null))
})

test('mantém pendência quando aliases equivalentes apontam para frotas diferentes', async () => {
  const fleets = (await pool.query<{ id: string }>("SELECT id FROM frotas WHERE codigo IN ('TST02','TST03') AND status='ATIVO' ORDER BY codigo")).rows
  assert.equal(fleets.length, 2)
  await pool.query("INSERT INTO frota_identificadores_externos(frota_id,origem,identificador,identificador_normalizado) VALUES($1,'CONTABILIDADE','AMB-07','AMB-07'),($2,'CONTABILIDADE','AMB 07','AMB 07')", [fleets[0]!.id, fleets[1]!.id])
  try {
    const preview = await analisarContabilidade(workbook(['AMB 07']), 'fleet-ambiguous.xlsx', { inicio: '2026-11-01', fim: '2026-11-30' })
    const item = preview.itens[0]!
    assert.equal(item.frota_id, null)
    assert.equal(item.identificacao_frota, 'PENDENTE')
    assert.match(item.motivo_pendencia || '', /FROTA_NAO_IDENTIFICADA/)
    assert.equal(preview.confirmacao_bloqueada, true)
  } finally {
    await pool.query("DELETE FROM frota_identificadores_externos WHERE origem='CONTABILIDADE' AND identificador IN ('AMB-07','AMB 07')")
  }
})

after(async () => { await pool.end() })

import 'dotenv/config'
import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import * as XLSX from 'xlsx'
import { analisarContabilidade, confirmarContabilidade, revisarDuplicidadeContabil, revisarItemContabil } from '../src/services/contabilidade-import.service.js'
import { getManutencaoTotais } from '../src/services/manutencao-financeira.service.js'
import { pool } from '../src/config/database.js'

const actor = { id: null, username: 'integration.admin', email: 'integration@example.invalid', role: 'ADMIN', status: 'ATIVO', must_change_password: false, sessionId: 'integration', tokenHash: 'integration' } as never

function workbook(rows: string[][]): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Controle', 'Data Lançamento', 'Data Conta', 'Nro. Nota', 'Cód Produto', 'Produto', 'Tipo de Movimentação', 'Quantidade', 'Valor Unitário', 'Total', 'Cód. SubCentro', 'SubCentro', 'Cód. Plano de Contas', 'Plano de Contas'],
    ...rows,
  ])
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'Relatorio')
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

test('fluxo completo de revisão contábil preserva decisões, exclusões e duplicidade ADMIN', async () => {
  const fleet = (await pool.query<{ id: string }>("SELECT id FROM frotas WHERE codigo='IT01' AND status='ATIVO'")).rows[0]
  assert.ok(fleet)
  const rows = [
    ['R1', '06/11/2026 00:00', '06/11/2026 00:00', 'N1', 'O1', 'OLEO 85W140', 'Saída', '1', '100,00', '100,00', '1', 'FROTA IT01', '259', 'CUSTO COMBUSTIVEIS / LUBRIFICANTES'],
    ['R2', '06/11/2026 00:00', '06/11/2026 00:00', 'N2', 'P2', 'PARAFUSO', 'Saída', '1', '10,00', '10,00', '2', 'ALMOXARIFADO', '274', 'CUSTO USO E CONSUMO'],
    ['R3', '06/11/2026 00:00', '06/11/2026 00:00', 'N3', 'A3', 'ARLA 32 - EXTERNO', 'Saída', '1', '33,56', '33,56', '1', 'FROTA IT01', '259', 'CUSTO COMBUSTIVEIS / LUBRIFICANTES'],
    ['R4', '06/11/2026 00:00', '06/11/2026 00:00', 'N4', 'F4', 'FILTRO ARLA 32', 'Saída', '1', '50,00', '50,00', '3', 'FROTAS DIVERSAS', '235', 'CUSTO PECAS / OFICINA'],
    ['R5', '06/11/2026 00:00', '06/11/2026 00:00', 'N4', 'F4', 'FILTRO ARLA 32', 'Saída', '1', '50,00', '50,00', '3', 'FROTAS DIVERSAS', '235', 'CUSTO PECAS / OFICINA'],
  ]
  const filename = 'integration-contabilidade-review-flow.xlsx'
  const preview = await analisarContabilidade(workbook(rows), filename, { inicio: '2026-11-06', fim: '2026-11-16' })
  assert.equal(preview.confirmacao_bloqueada, true)
  assert.equal(preview.itens.find(item => item.linha_original === 2)?.natureza_revisao, 'OLEOS_LUBRIFICANTES')
  assert.equal(preview.itens.find(item => item.linha_original === 3)?.destinacao_revisao, 'ESTOQUE_ALMOXARIFADO')
  assert.equal(preview.itens.find(item => item.linha_original === 4)?.destinacao_revisao, 'FORA_DO_ESCOPO')
  assert.deepEqual(preview.itens.find(item => item.linha_original === 6)?.linhas_duplicadas, [5, 6])

  let current = await revisarItemContabil(preview.token, 2, { natureza: 'OLEOS_LUBRIFICANTES', destinacao: 'APLICACAO_DIRETA_FROTA', classificacao: 'PECAS_EXTERNAS', frota_id: fleet.id, justificativa: 'Óleo aplicado diretamente na frota IT01.' }, actor)
  current = await revisarItemContabil(preview.token, 3, { natureza: 'ESTOQUE_ALMOXARIFADO', destinacao: 'ESTOQUE_ALMOXARIFADO', classificacao: 'PENDENTE', justificativa: 'Material recebido para estoque.' }, actor)
  current = await revisarItemContabil(preview.token, 4, { natureza: 'FORA_ESCOPO', destinacao: 'FORA_DO_ESCOPO', classificacao: 'PENDENTE', frota_id: null, justificativa: 'ARLA consumível fora do custo de manutenção.' }, actor)
  current = await revisarDuplicidadeContabil(preview.token, 5, 'DESCONSIDERAR', null, actor)
  current = await revisarDuplicidadeContabil(preview.token, 6, 'DESCONSIDERAR', null, actor)
  assert.equal(current.confirmacao_bloqueada, false)
  assert.equal(current.itens.filter(item => item.revisao_status !== 'RESOLVIDA').length, 0)

  const result = await confirmarContabilidade(preview.token, actor)
  assert.equal(result.total, 5)
  const stored = (await pool.query<{ classificacao: string; natureza_revisao: string; destinacao_revisao: string; status_revisao: string; justificativa_revisao: string | null }>('SELECT classificacao,natureza_revisao,destinacao_revisao,status_revisao,justificativa_revisao FROM lancamentos_contabeis WHERE importacao_id=$1 ORDER BY linha_original', [result.id])).rows
  assert.equal(stored[0]?.classificacao, 'PECAS_EXTERNAS')
  assert.equal(stored[0]?.destinacao_revisao, 'APLICACAO_DIRETA_FROTA')
  assert.equal(stored[1]?.classificacao, 'PENDENTE')
  assert.equal(stored[1]?.destinacao_revisao, 'ESTOQUE_ALMOXARIFADO')
  assert.equal(stored[2]?.destinacao_revisao, 'FORA_DO_ESCOPO')
  assert.equal(stored[2]?.classificacao, 'PENDENTE')
  assert.equal((await pool.query('SELECT count(*)::int AS total FROM lancamentos_contabeis_revisoes WHERE importacao_id=$1', [result.id])).rows[0].total, 3)
  assert.ok((await pool.query("SELECT count(*)::int AS total FROM auditoria WHERE modulo='IMPORTACOES_CONTABEIS' AND entidade_id LIKE $1", [preview.token + '%'])).rows[0].total >= 4)
  const totals = await getManutencaoTotais({ data_inicio: '2026-11-06', data_fim: '2026-11-16' })
  assert.equal(Number(totals.pecas_externas), 100)
  assert.equal(Number(totals.servicos_terceirizados), 0)
  assert.equal(Number(totals.materiais_almoxarifado), 0)

  const invalidName = 'integration-contabilidade-invalid.xlsx'
  const invalidPreview = await analisarContabilidade(workbook([['I1', '05/11/2026 00:00', '05/11/2026 00:00', 'I1', 'I1', 'PEÇA', 'Saída', '1', '10,00', '10,00', '1', 'FROTA IT01', '235', 'CUSTO PECAS / OFICINA']]), invalidName, { inicio: '2026-11-06', fim: '2026-11-16' })
  await assert.rejects(() => confirmarContabilidade(invalidPreview.token, actor), /Data Conta ausente ou fora do periodo informado/)
  assert.equal((await pool.query('SELECT count(*)::int AS total FROM importacoes_contabeis WHERE arquivo_nome=$1', [invalidName])).rows[0].total, 0)
  await pool.query('DELETE FROM lancamentos_contabeis_revisoes WHERE importacao_id=$1', [result.id]); await pool.query('DELETE FROM lancamentos_contabeis WHERE importacao_id=$1', [result.id]); await pool.query('DELETE FROM importacoes_contabeis WHERE id=$1', [result.id])
})

after(async () => { await pool.end() })

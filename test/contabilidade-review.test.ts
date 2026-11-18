import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import * as XLSX from 'xlsx'
import { duplicateOccurrenceLines } from '../src/imports/contabilidade-duplicates.js'
import { suggestContabilReview } from '../src/imports/contabilidade-review.js'
import { contabilPreviewBlocksConfirmation, summarizeContabilPreviewItems } from '../src/imports/contabilidade-preview.js'

test('sugestoes conservadoras preservam exclusoes e componentes de ARLA', () => {
  assert.deepEqual(suggestContabilReview('ARLA 32 - EXTERNO', 'CUSTO COMBUSTIVEIS / LUBRIFICANTES', 'FROTA FBV- 2B12'), { natureza: 'FORA_ESCOPO', destinacao: 'FORA_DO_ESCOPO', classificacao: 'PENDENTE', confianca: 'ALTA', motivo: 'Exclusão contábil: ARLA_32.' })
  assert.equal(suggestContabilReview('FILTRO ARLA 32', 'CUSTO PECAS / OFICINA', 'FROTA CT31').natureza, 'PECAS_MATERIAIS_MANUTENCAO')
  assert.equal(suggestContabilReview('OLEO 85W140', 'CUSTO COMBUSTIVEIS / LUBRIFICANTES', 'FROTA CT23').destinacao, 'APLICACAO_DIRETA_FROTA')
  assert.equal(suggestContabilReview('OLEO 85W140', 'CUSTO COMBUSTIVEIS / LUBRIFICANTES', 'FROTA CT23', false).destinacao, 'PENDENTE')
  assert.equal(suggestContabilReview('PARAFUSO', 'CUSTO USO E CONSUMO', 'ALMOXARIFADO').destinacao, 'ESTOQUE_ALMOXARIFADO')
})

test('arquivo cont0611a1611 preserva as cinco ocorrencias de possivel duplicidade', async () => {
  const sheet = XLSX.read(await readFile('C:/Users/User/Downloads/cont0611a1611.xlsx'), { type: 'buffer', raw: false }).Sheets.Relatorio!
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: false }); const header = raw[5] as string[]; const index = Object.fromEntries(header.map((value, position) => [value, position]))
  const rows = raw.slice(6).filter(row => row.some(value => String(value ?? '').trim())).map((row, position) => ({ dataConta: String(row[index['Data Conta']] ?? ''), notaOriginal: String(row[index['Nro. Nota']] ?? ''), codigoProdutoOriginal: String(row[index['CÃ³d Produto']] ?? ''), produtoOriginal: String(row[index.Produto] ?? ''), quantidade: Number(String(row[index.Quantidade] ?? '').replace(',', '.')), valorUnitario: Number(String(row[index['Valor UnitÃ¡rio']] ?? '').replace(',', '.')), valorTotal: Number(String(row[index.Total] ?? '').replace(',', '.')), subcentroOriginal: String(row[index.SubCentro] ?? ''), planoContasOriginal: String(row[index['Plano de Contas']] ?? ''), linhaOriginal: position + 7 }))
  assert.equal(rows.length, 491); const repeated = duplicateOccurrenceLines(rows); assert.deepEqual([...repeated.keys()], [224, 386, 387, 388, 389]); assert.equal(rows.find(row => row.linhaOriginal === 20)?.produtoOriginal, 'ARLA 32 - EXTERNO'); assert.equal(rows.find(row => row.linhaOriginal === 7)?.planoContasOriginal, 'CUSTO COMBUSTIVEIS / LUBRIFICANTES'); assert.equal(rows.find(row => row.linhaOriginal === 313)?.planoContasOriginal, 'CUSTO SERVICOS'); assert.equal(rows.find(row => row.linhaOriginal === 323)?.planoContasOriginal, 'CUSTO PECAS / OFICINA'); assert.equal(rows.find(row => row.linhaOriginal === 327)?.planoContasOriginal, 'CUSTO PECAS / OFICINA')
})

test('revisao resolvida nao libera bloqueios criticos nem duplicidades', () => {
  const base = { valor_total_invalido: false, combustivel_status: null, duplicado_em_importacao_anterior: false, duplicado_no_arquivo: false, duplicidade_revisada: false, revisao_status: 'RESOLVIDA' }
  assert.equal(contabilPreviewBlocksConfirmation([base], 0), false); assert.equal(contabilPreviewBlocksConfirmation([{ ...base, duplicado_no_arquivo: true }], 0), true); assert.equal(contabilPreviewBlocksConfirmation([{ ...base, revisao_status: 'PENDENTE' }], 0), true)
  assert.deepEqual(summarizeContabilPreviewItems([{ ...base, classificacao: 'PENDENTE', valor_total: 100, despesa_compartilhada_status: 'NAO_COMPARTILHADA', revisao_status: 'RESOLVIDA', destinacao_revisao: 'ESTOQUE_ALMOXARIFADO' }, { ...base, classificacao: 'PENDENTE', valor_total: 50, despesa_compartilhada_status: 'NAO_COMPARTILHADA', revisao_status: 'RESOLVIDA', destinacao_revisao: 'FORA_DO_ESCOPO' }]), { valorPendenteClassificacao: 0, valorCompartilhadoAguardando: 0, valorExcluidoEscopo: 50 })
})

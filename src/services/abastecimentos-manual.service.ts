import { randomUUID } from 'node:crypto';
import { pool } from '../config/database.js';
import { AbastecimentoServiceError, assertUuid } from './abastecimentos-base.service.js';

type RecordValue = Record<string, unknown>;
const isRecord = (value: unknown): value is RecordValue => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, field: string, required = false, max = 255): string | null => {
  if (value === undefined || value === null) { if (required) throw new AbastecimentoServiceError(400, `${field} é obrigatório.`); return null; }
  if (typeof value !== 'string') throw new AbastecimentoServiceError(400, `${field} deve ser texto.`);
  const result = value.trim();
  if (required && !result) throw new AbastecimentoServiceError(400, `${field} é obrigatório.`);
  if (result.length > max) throw new AbastecimentoServiceError(400, `${field} deve ter no máximo ${max} caracteres.`);
  return result || null;
};
const decimal = (value: unknown, field: string, scale: number, positive: boolean): string => {
  if ((typeof value !== 'string' && typeof value !== 'number') || (typeof value === 'number' && !Number.isFinite(value))) throw new AbastecimentoServiceError(400, `${field} deve ser numérico.`);
  const result = String(value).trim();
  if (!/^\d+(?:\.\d+)?$/.test(result) || (result.split('.')[1]?.length ?? 0) > scale) throw new AbastecimentoServiceError(400, `${field} deve possuir no máximo ${scale} casas decimais.`);
  const numeric = Number(result);
  if (!Number.isFinite(numeric) || (positive ? numeric <= 0 : numeric < 0)) throw new AbastecimentoServiceError(400, positive ? `${field} deve ser maior que zero.` : `${field} não pode ser negativo.`);
  return result;
};
const optionalDecimal = (value: unknown, field: string): string | null => value === undefined || value === null || value === '' ? null : decimal(value, field, 3, false);
const validDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day;
};
const dateTime = (date: unknown, time: unknown): string => {
  const day = text(date, 'data', true)!;
  const hour = text(time, 'hora', true)!;
  if (!validDate(day)) throw new AbastecimentoServiceError(400, 'data inválida.');
  if (!/^\d{2}:\d{2}(?::\d{2})?$/.test(hour)) throw new AbastecimentoServiceError(400, 'hora inválida.');
  const [hours, minutes, seconds = '00'] = hour.split(':').map(Number);
  if (Number(hours) > 23 || Number(minutes) > 59 || Number(seconds) > 59) throw new AbastecimentoServiceError(400, 'hora inválida.');
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`.replace(/^/, `${day} `);
};
const recipientTypes = ['FROTA', 'TERCEIRO', 'EXTERNA', 'ESPECIAL'] as const;
type RecipientType = typeof recipientTypes[number];
const databaseError = (error: unknown): never => {
  const code = isRecord(error) && error.code;
  if (code === '23503') throw new AbastecimentoServiceError(409, 'Uma referência informada não existe ou está em uso.');
  if (code === '23514') throw new AbastecimentoServiceError(400, 'Dados do abastecimento são inválidos.');
  throw error;
};

export async function createAbastecimentoManual(body: unknown) {
  if (!isRecord(body)) throw new AbastecimentoServiceError(400, 'O corpo da requisição deve ser um objeto.');
  const dataHora = dateTime(body.data, body.hora);
  const obraId = assertUuid(body.obra_id, 'obra_id');
  const produtoId = assertUuid(body.produto_id, 'produto_id');
  const tipo = body.tipo_destinatario;
  if (!recipientTypes.includes(tipo as RecipientType)) throw new AbastecimentoServiceError(400, 'tipo_destinatario inválido.');
  const frotaId = tipo === 'FROTA' ? assertUuid(body.frota_id, 'frota_id') : null;
  const terceiroId = tipo === 'TERCEIRO' ? assertUuid(body.terceiro_id, 'terceiro_id') : null;
  const especialId = tipo === 'ESPECIAL' ? assertUuid(body.destinacao_especial_id, 'destinacao_especial_id') : null;
  const identificacaoExterna = tipo === 'EXTERNA' ? text(body.identificacao, 'identificacao', true, 255)! : null;
  const litros = decimal(body.litros, 'litros', 3, true);
  const valor = decimal(body.valor_total, 'valor_total', 4, false);
  const bicoId = body.bico_id ? assertUuid(body.bico_id, 'bico_id') : null;
  const pontoId = body.ponto_id ? assertUuid(body.ponto_id, 'ponto_id') : null;
  const kmHr = optionalDecimal(body.km_hr, 'km_hr');
  const horimetro = optionalDecimal(body.horimetro, 'horimetro');
  const frentista = text(body.frentista, 'frentista');
  const placa = text(body.placa_original, 'placa_original');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const obra = await client.query("SELECT id FROM obras WHERE id=$1 AND status='ATIVA'", [obraId]);
    if (!obra.rowCount) throw new AbastecimentoServiceError(404, 'Obra ativa não encontrada.');
    const product = await client.query("SELECT id,codigo,nome,permite_abastecimento FROM abastecimento_produtos WHERE id=$1 AND status='ATIVO'", [produtoId]);
    if (!product.rows[0]) throw new AbastecimentoServiceError(404, 'Produto ativo não encontrado.');
    if (!product.rows[0].permite_abastecimento) throw new AbastecimentoServiceError(400, 'Produto não permite abastecimento.');
    let identificacaoOriginal: string;
    let frotaOriginal: string | null = null;
    if (tipo === 'FROTA') {
      const result = await client.query("SELECT id,codigo,placa FROM frotas WHERE id=$1 AND status='ATIVO'", [frotaId]);
      if (!result.rows[0]) throw new AbastecimentoServiceError(404, 'Frota ativa não encontrada.');
      identificacaoOriginal = result.rows[0].codigo;
      frotaOriginal = result.rows[0].codigo;
    } else if (tipo === 'TERCEIRO') {
      const result = await client.query("SELECT id,nome FROM abastecimento_terceiros WHERE id=$1 AND status='ATIVO'", [terceiroId]);
      if (!result.rows[0]) throw new AbastecimentoServiceError(404, 'Terceiro ativo não encontrado.');
      const selected = text(body.identificacao, 'identificacao', true, 100)!;
      const identity = await client.query("SELECT identificacao FROM abastecimento_terceiro_identificacoes WHERE terceiro_id=$1 AND identificacao=$2 AND status='ATIVO'", [terceiroId, selected]);
      if (!identity.rows[0]) throw new AbastecimentoServiceError(400, 'Identificação ativa não pertence ao terceiro selecionado.');
      identificacaoOriginal = identity.rows[0].identificacao;
    } else if (tipo === 'ESPECIAL') {
      const result = await client.query("SELECT codigo,nome FROM abastecimento_destinacoes_especiais WHERE id=$1 AND status='ATIVO'", [especialId]);
      if (!result.rows[0]) throw new AbastecimentoServiceError(404, 'Destinação especial ativa não encontrada.');
      identificacaoOriginal = result.rows[0].codigo || result.rows[0].nome;
    } else identificacaoOriginal = identificacaoExterna!;
    let bicoCodigo: string | null = null;
    let bicoDescricao: string | null = null;
    if (bicoId) {
      const conditions = ['b.id=$1', "b.status='ATIVO'"]; const values: string[] = [bicoId];
      if (pontoId) { values.push(pontoId); conditions.push(`b.ponto_id=$${values.length}`); }
      const bico = await client.query(`SELECT b.codigo,b.descricao,b.produto_id,b.ponto_id FROM abastecimento_bicos b WHERE ${conditions.join(' AND ')}`, values);
      if (!bico.rows[0]) throw new AbastecimentoServiceError(400, 'Bico ativo não encontrado no ponto selecionado.');
      if (bico.rows[0].produto_id !== produtoId) throw new AbastecimentoServiceError(400, 'O produto não é compatível com o bico selecionado.');
      bicoCodigo = bico.rows[0].codigo; bicoDescricao = bico.rows[0].descricao;
    } else if (pontoId) {
      const point = await client.query("SELECT id FROM abastecimento_pontos WHERE id=$1 AND status='ATIVO'", [pontoId]);
      if (!point.rows[0]) throw new AbastecimentoServiceError(404, 'Ponto ativo não encontrado.');
    }
    const identifier = `MANUAL-${randomUUID()}`;
    const payload = JSON.stringify({ origem: 'MANUAL', dados_informados: { data: body.data, hora: body.hora, obra_id: obraId, tipo_destinatario: tipo, produto_id: produtoId, frota_id: frotaId, terceiro_id: terceiroId, destinacao_especial_id: especialId, identificacao: identificacaoOriginal, ponto_id: pontoId, bico_id: bicoId, litros, valor_total: valor, km_hr: kmHr, horimetro, frentista } });
    const result = await client.query(`INSERT INTO abastecimentos(origem_sistema,identificador_externo,data_hora,produto_id,obra_id,tipo_destinatario,frota_id,terceiro_id,destinacao_especial_id,identificacao_original,placa_original,frota_original,litros,valor_total,km_hr,horimetro,bico_codigo_original,bico_descricao_original,frentista_original,arquivo_nome_original,planilha_original,linha_original,payload_original,importacao_id) VALUES('MANUAL',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'MANUAL',NULL,NULL,$19,NULL) RETURNING id`, [identifier, dataHora, produtoId, obraId, tipo, frotaId, terceiroId, especialId, identificacaoOriginal, placa, frotaOriginal, litros, valor, kmHr, horimetro, bicoCodigo, bicoDescricao, frentista, payload]);
    await client.query('COMMIT');
    return { id: result.rows[0].id, origem_sistema: 'MANUAL', identificador_externo: identifier };
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof AbastecimentoServiceError) throw error;
    return databaseError(error);
  } finally { client.release(); }
}

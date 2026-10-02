import { createHash } from 'node:crypto';
import { normalizeSearchText } from '../utils/text.js';

export type PoliImportOrigin = 'POLI' | 'VEGA';
export type PoliImportType = 'DIARIA' | 'CONSOLIDADA';

export interface PoliImport {
  origemSistema: PoliImportOrigin;
  arquivoNome: string;
  hashArquivo: string;
  tamanhoArquivo: number;
  tipoImportacao: PoliImportType;
}

export interface PoliItemProvenance {
  origemLinha: number;
  sequenciaImportacao: number;
  fingerprintContexto: string;
  hashConteudo: string;
}

export interface PoliProduct extends PoliItemProvenance {
  codigo_poli?: string;
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  desconto?: number;
  total: number;
  unidade: string;
  tecnicoOriginal?: string;
  tecnicoCodigoOriginal?: string;
  tipo: 'PRODUTO';
}

export interface PoliService extends PoliItemProvenance {
  codigo_poli?: string;
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  desconto?: number;
  total: number;
  unidade: string;
  tecnicoOriginal?: string;
  tecnicoCodigoOriginal?: string;
  tipo: 'SERVICO';
}

export interface PoliExecution extends PoliItemProvenance {
  funcionarioOriginal: string;
  inicio: string;
  fim: string;
  servicoSequenciaImportacao?: number;
  serviceItemIndex?: number;
  funcionarioId?: string;
}

export function sha256Bytes(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export function buildPoliImport(
  buffer: Buffer,
  arquivoNome: string,
  tipoImportacao: PoliImportType = 'DIARIA',
  origemSistema: PoliImportOrigin = 'POLI',
): PoliImport {
  return {
    origemSistema,
    arquivoNome,
    hashArquivo: sha256Bytes(buffer),
    tamanhoArquivo: buffer.length,
    tipoImportacao,
  };
}

const normalized = (value: unknown): string => normalizeSearchText(String(value ?? '').trim());
const numberValue = (value: number | undefined): string => (value ?? 0).toFixed(6);
const digestParts = (parts: unknown[]): string => createHash('sha256').update(JSON.stringify(parts)).digest('hex');

export function buildItemContentHash(item: {
  tipo: 'PRODUTO' | 'SERVICO';
  codigo_poli?: string;
  descricao: string;
  quantidade: number;
  unidade: string;
  valorUnitario: number;
  desconto?: number;
  total: number;
  tecnicoOriginal?: string;
  tecnicoCodigoOriginal?: string;
}): string {
  return digestParts([
    item.tipo,
    normalized(item.codigo_poli),
    normalized(item.descricao),
    numberValue(item.quantidade),
    normalized(item.unidade),
    numberValue(item.valorUnitario),
    numberValue(item.desconto),
    numberValue(item.total),
    normalized(item.tecnicoCodigoOriginal),
    normalized(item.tecnicoOriginal),
  ]);
}

export function buildItemContextFingerprint(importacao: PoliImport, numeroOs: number, tipo: PoliProduct['tipo'] | PoliService['tipo'], sequenciaImportacao: number): string {
  return digestParts(['ITEM', importacao.hashArquivo, numeroOs, tipo, sequenciaImportacao]);
}

export function buildExecutionContentHash(execution: Pick<PoliExecution, 'funcionarioOriginal' | 'inicio' | 'fim' | 'servicoSequenciaImportacao'>): string {
  return digestParts([
    normalized(execution.funcionarioOriginal),
    execution.inicio,
    execution.fim,
    execution.servicoSequenciaImportacao ?? null,
  ]);
}

export function buildExecutionContextFingerprint(importacao: PoliImport, numeroOs: number, sequenciaImportacao: number, servicoSequenciaImportacao?: number): string {
  return digestParts(['EXECUCAO', importacao.hashArquivo, numeroOs, sequenciaImportacao, servicoSequenciaImportacao ?? null]);
}

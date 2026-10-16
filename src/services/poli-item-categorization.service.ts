import type { ParsedItem } from '../imports/poli-os.js';

export type ItemCategoryApproval = 'APROVADO' | 'PENDENTE_APROVACAO';
export type ItemCategoryType = 'SERVICO' | 'PRODUTO';

export interface PoliItemCategoryResolution {
  categoria_gerencial: string | null;
  subcategoria_gerencial: string | null;
  origem_classificacao: string;
  aprovacao: ItemCategoryApproval | null;
}

interface Mapping {
  codigo: string;
  tipo: ItemCategoryType;
  categoria: string;
  subcategoria: string;
  aprovacao: ItemCategoryApproval;
}

const mappings: Mapping[] = [
  { codigo: '1892', tipo: 'SERVICO', categoria: 'ELETRICA', subcategoria: 'MÃO DE OBRA ELETRICISTA', aprovacao: 'APROVADO' },
  { codigo: '4782', tipo: 'SERVICO', categoria: 'MECANICA', subcategoria: 'MÃO DE OBRA MECÂNICO TERCEIRO', aprovacao: 'APROVADO' },
  { codigo: '4103', tipo: 'SERVICO', categoria: 'BORRACHARIA', subcategoria: 'SERVIÇO DE BORRACHARIA', aprovacao: 'APROVADO' },
  { codigo: '3419', tipo: 'SERVICO', categoria: 'TAG_PEDAGIO', subcategoria: 'MENSALIDADE', aprovacao: 'APROVADO' },
  { codigo: '2034', tipo: 'SERVICO', categoria: 'TAG_PEDAGIO', subcategoria: 'PASSAGEM', aprovacao: 'APROVADO' },
  { codigo: '1916', tipo: 'SERVICO', categoria: 'LAVAGEM', subcategoria: 'MÃO DE OBRA LAVADOR', aprovacao: 'APROVADO' },
  { codigo: '1919', tipo: 'SERVICO', categoria: 'MECANICA', subcategoria: 'MÃO DE OBRA MECÂNICO INTERNO', aprovacao: 'APROVADO' },
  { codigo: '2226', tipo: 'SERVICO', categoria: 'MANUTENCAO_PREVENTIVA', subcategoria: 'MANUTENCAO PREVENTIVA', aprovacao: 'APROVADO' },
  { codigo: '23205', tipo: 'SERVICO', categoria: 'ALINHAMENTO_BALANCEAMENTO', subcategoria: 'ALINHAMENTO/BALANCEAMENTO', aprovacao: 'APROVADO' },
  { codigo: '2604', tipo: 'SERVICO', categoria: 'TAPEÇARIA', subcategoria: 'TAPEÇARIA', aprovacao: 'APROVADO' },
  { codigo: '3336', tipo: 'SERVICO', categoria: 'FRETE', subcategoria: 'FRETE', aprovacao: 'APROVADO' },
  { codigo: '16352', tipo: 'SERVICO', categoria: 'MANUTENCAO_PREVENTIVA', subcategoria: 'MANUTENCAO PREVENTIVA 1000 HOR', aprovacao: 'APROVADO' },
  { codigo: '22568', tipo: 'SERVICO', categoria: 'MANUTENCAO_PREVENTIVA', subcategoria: 'MANUTENCAO PREVENTIVA 2000 HOR', aprovacao: 'APROVADO' },
  { codigo: '9379', tipo: 'SERVICO', categoria: 'MANUTENCAO_PREVENTIVA', subcategoria: 'MANUTENCAO PREVENTIVA 6000 HOR', aprovacao: 'APROVADO' },
  { codigo: '2929', tipo: 'SERVICO', categoria: 'MANUTENCAO_PREVENTIVA', subcategoria: 'MANUTENCAO PREVENTIVA 4000 HOR', aprovacao: 'APROVADO' },
  { codigo: '25779', tipo: 'SERVICO', categoria: 'MANUTENCAO_PREVENTIVA', subcategoria: 'MANUTENCAO PREVENTIVA 9000 HOR', aprovacao: 'APROVADO' },
  { codigo: '5953', tipo: 'SERVICO', categoria: 'ALINHAMENTO_BALANCEAMENTO', subcategoria: 'ALINHAMENTO DIANTEIRO', aprovacao: 'APROVADO' },
  { codigo: '2229', tipo: 'SERVICO', categoria: 'GUINCHO', subcategoria: 'SERVICO DE GUINCHO', aprovacao: 'APROVADO' },
  { codigo: '12898', tipo: 'SERVICO', categoria: 'TORNO_USINAGEM', subcategoria: 'SERVICO DE TORNO TERCEIROS', aprovacao: 'APROVADO' },
  { codigo: '21888', tipo: 'SERVICO', categoria: 'ELETRICA', subcategoria: 'SOCORRO ELETRICO', aprovacao: 'APROVADO' },
  { codigo: '22385', tipo: 'SERVICO', categoria: 'BORRACHARIA', subcategoria: 'RECAPAGEM DE PNEUS', aprovacao: 'APROVADO' },
  { codigo: '3750', tipo: 'SERVICO', categoria: 'MECANICA', subcategoria: 'SUSPENSAO', aprovacao: 'APROVADO' },
  { codigo: '8240', tipo: 'SERVICO', categoria: 'SOLDA', subcategoria: 'MAO DE OBRA SOLDADOR', aprovacao: 'APROVADO' },
  { codigo: '20580', tipo: 'SERVICO', categoria: 'TACOGRAFO', subcategoria: 'AFERICAO', aprovacao: 'APROVADO' },
  { codigo: '16612', tipo: 'SERVICO', categoria: 'MECANICA', subcategoria: 'REPAROS GERAIS', aprovacao: 'PENDENTE_APROVACAO' },
  { codigo: '8139', tipo: 'SERVICO', categoria: 'MECANICA', subcategoria: 'REPAROS GERAIS', aprovacao: 'APROVADO' },
  { codigo: '8335', tipo: 'SERVICO', categoria: 'MECANICA', subcategoria: 'REPAROS GERAIS', aprovacao: 'APROVADO' },
  { codigo: '2472', tipo: 'SERVICO', categoria: 'MECANICA', subcategoria: 'SUSPENSAO', aprovacao: 'APROVADO' },
  { codigo: '3659', tipo: 'SERVICO', categoria: 'MECANICA', subcategoria: 'REPAROS GERAIS', aprovacao: 'APROVADO' },
  { codigo: '23378', tipo: 'SERVICO', categoria: 'MECANICA', subcategoria: 'REPAROS GERAIS', aprovacao: 'APROVADO' },
  { codigo: '3800', tipo: 'SERVICO', categoria: 'ALINHAMENTO_BALANCEAMENTO', subcategoria: 'BALANCEAMENTO', aprovacao: 'APROVADO' },
  { codigo: '7331', tipo: 'SERVICO', categoria: 'CHAVEIRO', subcategoria: 'SERVICO DE CHAVEIRO', aprovacao: 'APROVADO' },
];

const normalizeCode = (value: unknown): string | null => {
  const code = String(value ?? '').trim();
  return /^\d+$/.test(code) ? code : null;
};

export function listPoliItemMappings(): readonly Mapping[] {
  return mappings;
}

export function resolvePoliItemCategory(item: Pick<ParsedItem, 'codigo_poli' | 'codigo' | 'tipo'>): PoliItemCategoryResolution {
  const code = normalizeCode(item.codigo_poli ?? item.codigo);
  if (!code) return { categoria_gerencial: null, subcategoria_gerencial: null, origem_classificacao: 'SEM_CODIGO', aprovacao: null };
  const mapping = mappings.find(value => value.codigo === code && value.tipo === item.tipo);
  if (!mapping) return { categoria_gerencial: null, subcategoria_gerencial: null, origem_classificacao: 'CODIGO_NAO_MAPEADO', aprovacao: null };
  if (mapping.aprovacao !== 'APROVADO') return { categoria_gerencial: null, subcategoria_gerencial: null, origem_classificacao: 'PENDENTE_APROVACAO', aprovacao: mapping.aprovacao };
  return { categoria_gerencial: mapping.categoria, subcategoria_gerencial: mapping.subcategoria, origem_classificacao: 'CODIGO_POLI_APROVADO', aprovacao: mapping.aprovacao };
}

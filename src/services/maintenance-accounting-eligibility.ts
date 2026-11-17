export type AccountingMaintenanceExclusionReason = 'PEDAGIO' | 'FRETE' | 'RASTREAMENTO' | 'ARLA_32';

export type SharedAccountingMaintenanceRow = {
  produto_original?: string | null;
  subcentro_original?: string | null;
  classificacao?: string | null;
  despesa_compartilhada_status?: string | null;
  frota_id?: string | null;
  data_conta?: string | Date | null;
};

export type MaintenanceAccountingFilters = {
  data_inicio: string;
  data_fim: string;
  frota_id?: string;
  frota_codigo?: string;
  natureza?: string;
  categoria?: string;
  origem?: string;
};

const normalize = (value: string): string => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

const tollPhrases = ['PASSAGEM PEDAGIO', 'MENSALIDADE PEDAGIO', 'MENSALIDADE DE PEDAGIO', 'PEDAGIO PASSAGEM'];
const freightPrefixes = ['FRETE', 'SERVICO DE FRETE', 'SERVICO FRETE', 'SERVICOS DE FRETE', 'SERVICOS FRETE', 'DESPESA COM FRETE', 'CUSTO DE FRETE', 'CUSTO FRETE'];
const trackingPrefixes = [
  'RASTREAMENTO DE FROTA', 'RASTREAMENTO VEICULAR', 'MONITORAMENTO VEICULAR', 'MONITORAMENTO DE FROTA',
  'MENSALIDADE RASTREAMENTO', 'MENSALIDADE DE RASTREAMENTO', 'MENSALIDADE MONITORAMENTO', 'MENSALIDADE DE MONITORAMENTO',
  'SERVICO RASTREAMENTO', 'SERVICO DE RASTREAMENTO', 'SERVICOS RASTREAMENTO', 'SERVICOS DE RASTREAMENTO',
  'SERVICO MONITORAMENTO', 'SERVICO DE MONITORAMENTO', 'SERVICOS MONITORAMENTO', 'SERVICOS DE MONITORAMENTO',
  'MENSALIDADE SERVICO DE RASTREAMENTO', 'MENSALIDADE SERVICO RASTREAMENTO', 'MENSALIDADE SERVICO DE MONITORAMENTO', 'MENSALIDADE SERVICO MONITORAMENTO',
  'MENSALIDADE RASTREADOR', 'MENSALIDADE DE RASTREADOR', 'SERVICO DE RASTREADOR', 'SERVICO RASTREADOR',
];
const arlaComponentPrefixes = ['FILTRO', 'BOMBA', 'SENSOR', 'REPARO', 'REPARACAO', 'MANUTENCAO', 'CONSERTO', 'KIT REPARO', 'PECA'];

export function getAccountingMaintenanceExclusionReason(product: string | null | undefined): AccountingMaintenanceExclusionReason | null {
  const normalized = normalize(product ?? '');
  if (tollPhrases.some(phrase => normalized.includes(phrase))) return 'PEDAGIO';
  if (freightPrefixes.some(prefix => normalized === prefix || normalized.startsWith(`${prefix} `))) return 'FRETE';
  if (trackingPrefixes.some(prefix => normalized === prefix || normalized.startsWith(`${prefix} `))) return 'RASTREAMENTO';
  const mentionsArla32 = /(?:^| )ARLA 32(?: |$)/.test(normalized);
  const isArlaComponentOrRepair = arlaComponentPrefixes.some(prefix => normalized === prefix || normalized.startsWith(`${prefix} `));
  if (mentionsArla32 && !isArlaComponentOrRepair) return 'ARLA_32';
  return null;
}

export function isMaintenanceTollExpense(product: string | null | undefined): boolean {
  return getAccountingMaintenanceExclusionReason(product) === 'PEDAGIO';
}

const SQL_TRANSLATE_FROM = 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç';
const SQL_TRANSLATE_TO = 'AAAAAEEEEIIIIOOOOOUUUUCAAAAAEEEEIIIIOOOOOUUUUC';

export function buildAccountingMaintenanceExclusionSql(alias = 'l'): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error('Alias SQL inválido.');
  const normalizedProduct = `upper(btrim(regexp_replace(translate(coalesce(${alias}.produto_original,''), '${SQL_TRANSLATE_FROM}', '${SQL_TRANSLATE_TO}'), '[^A-Z0-9]+', ' ', 'g'))) `;
  const startsWithPhrase = (phrase: string): string => `(${normalizedProduct}= '${phrase}' OR ${normalizedProduct}LIKE '${phrase} %')`;
  const hasArla32 = `( ' ' || ${normalizedProduct} || ' ' ) LIKE '% ARLA 32 %'`;
  const isArlaComponentOrRepair = arlaComponentPrefixes.map(startsWithPhrase).join(' OR ');
  const excluded = [
    ...tollPhrases.map(phrase => `${normalizedProduct}LIKE '%${phrase}%'`),
    ...freightPrefixes.map(startsWithPhrase),
    ...trackingPrefixes.map(startsWithPhrase),
    `(${hasArla32} AND NOT (${isArlaComponentOrRepair}))`,
  ];
  return `NOT (${excluded.join(' OR ')})`;
}

export function accountingMaintenanceExclusionLabel(reason: AccountingMaintenanceExclusionReason | null | undefined): string | null {
  if (reason === 'PEDAGIO') return 'Pedágio fora dos custos de manutenção';
  if (reason === 'FRETE') return 'Frete contábil fora dos custos de manutenção';
  if (reason === 'RASTREAMENTO') return 'Rastreamento fora dos custos de manutenção';
  if (reason === 'ARLA_32') return 'ARLA 32 contábil fora dos custos de manutenção';
  return null;
}

export function isApprovedDiverseMaintenanceExpense(row: SharedAccountingMaintenanceRow): boolean {
  return row.despesa_compartilhada_status === 'APROVADA'
    && row.frota_id == null
    && normalize(row.subcentro_original ?? '') === 'FROTAS DIVERSAS'
    && (row.classificacao === 'PECAS_EXTERNAS' || row.classificacao === 'SERVICOS_TERCEIRIZADOS')
    && getAccountingMaintenanceExclusionReason(row.produto_original) === null;
}

export function matchesDiverseMaintenanceFilters(row: SharedAccountingMaintenanceRow, filters: MaintenanceAccountingFilters): boolean {
  if (!isApprovedDiverseMaintenanceExpense(row) || filters.frota_id || filters.frota_codigo || filters.origem === 'OS') return false;
  const date = row.data_conta instanceof Date ? row.data_conta.toISOString().slice(0, 10) : String(row.data_conta ?? '').slice(0, 10);
  if (!date || date < filters.data_inicio || date > filters.data_fim) return false;
  const nature = filters.natureza ?? filters.categoria;
  return !nature || row.classificacao === nature;
}

export function sumCurrencyValues(values: unknown[]): string {
  const cents = values.reduce<bigint>((total, value) => {
    const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value ?? '0').trim());
    if (!match) return total;
    const amount = BigInt(match[2]!) * 100n + BigInt(((match[3] ?? '') + '00').slice(0, 2));
    return total + (match[1] === '-' ? -amount : amount);
  }, 0n);
  const sign = cents < 0n ? '-' : '';
  const absolute = cents < 0n ? -cents : cents;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

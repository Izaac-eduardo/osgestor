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

const normalize = (value: string): string => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

export function isMaintenanceTollExpense(product: string | null | undefined): boolean {
  const normalized = normalize(product ?? '');
  return normalized.includes('PASSAGEM PEDAGIO') || normalized.includes('MENSALIDADE PEDAGIO');
}

export function isApprovedDiverseMaintenanceExpense(row: SharedAccountingMaintenanceRow): boolean {
  return row.despesa_compartilhada_status === 'APROVADA'
    && row.frota_id == null
    && normalize(row.subcentro_original ?? '') === 'FROTAS DIVERSAS'
    && (row.classificacao === 'PECAS_EXTERNAS' || row.classificacao === 'SERVICOS_TERCEIRIZADOS')
    && !isMaintenanceTollExpense(row.produto_original);
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


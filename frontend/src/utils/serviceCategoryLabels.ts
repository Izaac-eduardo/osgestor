const labels: Record<string, string> = {
  ALINHAMENTO_BALANCEAMENTO: 'Alinhamento e balanceamento',
  BORRACHARIA: 'Borracharia',
  CHAVEIRO: 'Chaveiro',
  ELETRICA: 'Elétrica',
  FRETE: 'Frete',
  GUINCHO: 'Guincho',
  LAVAGEM: 'Lavagem',
  MANUTENCAO_PREVENTIVA: 'Manutenção preventiva',
  MECANICA: 'Mecânica',
  SOLDA: 'Solda',
  TACOGRAFO: 'Tacógrafo',
  TAG_PEDAGIO: 'TAG / pedágio',
  TAPEÇARIA: 'Tapeçaria',
  TORNO_USINAGEM: 'Torno e usinagem',
}

export function serviceCategoryLabel(value: string): string {
  return labels[value] ?? value.toLowerCase().replaceAll('_', ' ').replace(/(^|\s)\S/g, (letter) => letter.toUpperCase())
}

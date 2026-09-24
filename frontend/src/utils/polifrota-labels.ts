export const polifrotaIdentificacao = (placa: string | null | undefined, frota: string | null | undefined): string => {
  const placaValue = placa?.trim()
  if (placaValue) return placaValue
  const frotaValue = frota?.trim()
  if (frotaValue) return frotaValue
  return 'Sem frota/placa'
}

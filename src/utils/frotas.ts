/** Shared by the master register and the one-time spreadsheet importer. */
export const normalizeFleetCode = (value: string): string => value.toUpperCase().replace(/[\s-]+/g, '');
export const normalizePlate = (value: string): string => value.toUpperCase().replace(/[\s-]+/g, '');
export const normalizeModel = (value: string): string => value.trim().toUpperCase();

export function splitFleetCode(value: string): { codigo: string; prefixo: string; numero: string } {
  const codigo = normalizeFleetCode(value);
  const match = /^([A-Z]{1,10})([0-9]{1,20})$/.exec(codigo);
  if (!match) throw new Error('Informe o código com prefixo e número, como A09 ou CT-04.');
  return { codigo, prefixo: match[1]!, numero: match[2]! };
}
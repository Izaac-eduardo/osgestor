export class ApiResponseShapeError extends Error {
  constructor(resource: string, expected: string) { super(`Resposta inválida para ${resource}: esperado ${expected}.`); this.name = 'ApiResponseShapeError' }
}

export function responseArray<T>(value: unknown, resource: string): T[] {
  if (Array.isArray(value)) return value as T[]
  if (value && typeof value === 'object' && Array.isArray((value as { items?: unknown }).items)) return (value as { items: T[] }).items
  if (value && typeof value === 'object' && Array.isArray((value as { data?: unknown }).data)) return (value as { data: T[] }).data
  throw new ApiResponseShapeError(resource, 'uma lista')
}

export function responseObject<T extends object>(value: unknown, resource: string): T {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'data' in value && value.data && typeof value.data === 'object' && !Array.isArray(value.data)) return value.data as T
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as T
  throw new ApiResponseShapeError(resource, 'um objeto')
}

export function responseImport(value: unknown): { importacao: Record<string, unknown>; itens: unknown[] } {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'data' in value) return responseImport(value.data)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiResponseShapeError('detalhe da importação', 'um objeto')
  const result = value as { importacao?: unknown; itens?: unknown }
  if (!result.importacao || typeof result.importacao !== 'object' || Array.isArray(result.importacao) || !Array.isArray(result.itens)) throw new ApiResponseShapeError('detalhe da importação', '{ importacao, itens }')
  return { importacao: result.importacao as Record<string, unknown>, itens: result.itens }
}

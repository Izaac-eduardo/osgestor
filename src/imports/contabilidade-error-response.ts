import type { ManualDecisionBlock } from './contabilidade-decision.js'

type ContabilidadeErrorLike = {
  statusCode: number
  code: string
  message: string
  blocks?: ManualDecisionBlock[]
}

export function serializeContabilidadeError(error: ContabilidadeErrorLike): {
  status: number
  body: { code: string; message: string; bloqueios?: ManualDecisionBlock[] }
} {
  return {
    status: error.statusCode,
    body: {
      code: error.code,
      message: error.message,
      ...(error.blocks?.length ? { bloqueios: error.blocks } : {}),
    },
  }
}

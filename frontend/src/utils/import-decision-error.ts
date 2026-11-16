type DecisionError = {
  response?: {
    data?: {
      message?: unknown
      bloqueios?: { mensagem?: unknown }[]
    }
  }
}

export function getImportDecisionErrorMessage(error: unknown, fallback: string): string {
  const data = (error as DecisionError | null)?.response?.data
  if (typeof data?.message === 'string' && data.message.trim()) return data.message
  const reasons = data?.bloqueios?.map(block => block.mensagem).filter((message): message is string => typeof message === 'string')
  return reasons?.length ? reasons.join(' ') : fallback
}

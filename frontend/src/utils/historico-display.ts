import { formatQuantity } from './formatters'

export const formatOptionalQuantity = (value: number | null | undefined): string => value === null || value === undefined ? '-' : formatQuantity(value)

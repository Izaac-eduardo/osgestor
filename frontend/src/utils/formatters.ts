const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
})

export const formatCurrency = (value: number): string => currencyFormatter.format(value)

export const formatShortDate = (value: string): string => {
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

export const formatCompactDate = (value: string): string => {
  const [, month, day] = value.split('-')
  return `${day}/${month}`
}

const dateFormatter=new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC'})
export const formatDate=(value:string|null):string=>value?dateFormatter.format(new Date(value)):'—'
export const formatQuantity=(value:number):string=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3}).format(value)

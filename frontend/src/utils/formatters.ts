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
const dateOnlyPattern=/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/
export const formatDate=(value:string|null):string=>{if(!value)return '—';const match=dateOnlyPattern.exec(value);if(match)return `${match[3]}/${match[2]}/${match[1]}`;const parsed=new Date(value);return Number.isNaN(parsed.getTime())?'—':dateFormatter.format(parsed)}
export const formatQuantity=(value:number):string=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3}).format(value)
export const formatWorkDuration=(minutes:number):string=>{const hours=Math.floor(minutes/60),rest=minutes%60;if(!hours)return `${rest}min`;return rest?`${hours}h ${rest}min`:`${hours}h`}

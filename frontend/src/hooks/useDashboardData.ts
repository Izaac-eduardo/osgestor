import { useCallback, useEffect, useState } from 'react'
import { getDashboard } from '../services/reports'
import type { DashboardData, ReportFilters } from '../types/reports'

export interface AsyncSection<T>{data:T|null;loading:boolean;error:boolean}
type DashboardFilters=Omit<ReportFilters,'natureza_os'> & {natureza_os?:string}
const currentMonth=()=>{const now=new Date();const y=now.getFullYear();const m=String(now.getMonth()+1).padStart(2,'0');return {data_inicio:`${y}-${m}-01`,data_fim:`${y}-${m}-${String(new Date(y,now.getMonth()+1,0).getDate()).padStart(2,'0')}`}}
export function useDashboardData(){
  const [filters,setFilters]=useState<DashboardFilters>(currentMonth); const [data,setData]=useState<DashboardData|null>(null); const [loading,setLoading]=useState(true); const [error,setError]=useState(false)
  const load=useCallback(async(next:DashboardFilters,signal?:AbortSignal)=>{setLoading(true);setError(false);try{setData(await getDashboard(next,signal))}catch{if(!signal?.aborted)setError(true)}finally{if(!signal?.aborted)setLoading(false)}},[])
  useEffect(()=>{const c=new AbortController();void load(filters,c.signal);return()=>c.abort()},[load,filters])
  return {filters,setFilters,data,loading,error,load}
}

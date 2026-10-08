import { useCallback, useEffect, useState } from 'react'
import { getDashboard } from '../services/reports'
import type { DashboardData, ReportFilters } from '../types/reports'
import { dashboardPeriod } from '../utils/dashboard-periods'

export interface AsyncSection<T>{data:T|null;loading:boolean;error:boolean}
type DashboardFilters=ReportFilters
const currentPeriod=()=>dashboardPeriod('15days')
export function useDashboardData(){
  const [filters,setFilters]=useState<DashboardFilters>(currentPeriod); const [data,setData]=useState<DashboardData|null>(null); const [loading,setLoading]=useState(true); const [error,setError]=useState(false)
  const load=useCallback(async(next:DashboardFilters,signal?:AbortSignal)=>{setLoading(true);setError(false);try{setData(await getDashboard(next as Record<string,string|undefined>,signal))}catch{if(!signal?.aborted)setError(true)}finally{if(!signal?.aborted)setLoading(false)}},[])
  useEffect(()=>{const c=new AbortController();void load(filters,c.signal);return()=>c.abort()},[load,filters])
  return {filters,setFilters,data,loading,error,load}
}

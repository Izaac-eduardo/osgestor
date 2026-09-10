import {api} from './api'
import type {ImportAnalysis,ImportOrder,ImportResult} from '../types/imports'
export async function analyzeImport(file:File){const form=new FormData();form.append('arquivo',file);return (await api.post<ImportAnalysis>('/importacoes-os/analisar',form)).data}
export async function getImportPreview(token:string){return (await api.get<{token:string;items:ImportOrder[]}>(`/importacoes-os/${token}`)).data}
export async function resolveImportOrder(token:string,numeroOs:number,payload:Partial<ImportOrder>){return (await api.patch<ImportOrder>(`/importacoes-os/${token}/itens/${numeroOs}`,payload)).data}
export async function confirmImport(token:string){return (await api.post<ImportResult>(`/importacoes-os/${token}/confirmar`)).data}

import {api} from './api'
import axios from 'axios'
import type {ImportAnalysis,ImportOrder,ImportResult} from '../types/imports'
const friendlyPreviewError=(error:unknown):never=>{if(axios.isAxiosError(error)&&error.response?.status===404)throw new Error('A prévia desta importação expirou ou não está mais disponível. Analise o arquivo novamente.');throw error}
export async function analyzeImport(file:File){const form=new FormData();form.append('arquivo',file);return (await api.post<ImportAnalysis>('/importacoes-os/analisar',form)).data}
export async function getImportPreview(token:string){try{return (await api.get<{token:string;items:ImportOrder[]}>(`/importacoes-os/${token}`)).data}catch(error){return friendlyPreviewError(error)}}
export async function resolveImportOrder(token:string,numeroOs:number,payload:Partial<ImportOrder>){try{return (await api.patch<ImportOrder>(`/importacoes-os/${token}/itens/${numeroOs}`,payload)).data}catch(error){return friendlyPreviewError(error)}}
export async function confirmImport(token:string){try{return (await api.post<ImportResult>(`/importacoes-os/${token}/confirmar`)).data}catch(error){return friendlyPreviewError(error)}}

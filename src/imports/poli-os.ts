import * as XLSX from 'xlsx';
import { pool } from '../config/database.js';
import { normalizeFleetCode } from '../utils/frotas.js';
import { normalizeSearchText } from '../utils/text.js';
import { listExternalFleetIdentifiers, normalizeExternalFleetIdentifier, POLIFROTA_ORIGIN, type ExternalFleetIdentifier } from '../services/frota-identificadores.service.js';
import { buildOsUpdateDiff, loadExistingOs } from '../services/sincronizacao-os.service.js';
import type { OsUpdateDiff } from '../services/sincronizacao-os.service.js';
import type { ClassificacaoOrigem, ClassificacaoServico } from '../types/servicos-os.js';

export type PreviewStatus = 'PRONTA' | 'REQUER_REVISAO' | 'JA_CADASTRADA' | 'ATUALIZACAO_DISPONIVEL' | 'SEM_ALTERACOES' | 'NOVA' | 'ERRO';
export type Natureza = 'INTERNA' | 'MATERIAL' | 'TERCEIRO';
export type StatusOrigem = 'AUTOMATICO' | 'MANUAL';
export interface ParsedItem { codigo?: string; descricao: string; quantidade: number; valorUnitario: number; desconto?: number; total: number; unidade: string; tipo: 'SERVICO' | 'PRODUTO'; tecnicoOriginal?: string; tecnicoCodigoOriginal?: string; funcionarioId?: string; classificacao_servico?: ClassificacaoServico; classificacao_servico_original?: ClassificacaoServico; classificacao_origem?: ClassificacaoOrigem; }
export interface ParsedExecucao { funcionarioOriginal: string; inicio: string; fim: string; funcionarioId?: string; }
export interface ParsedOs { numeroOs:number; data:string; cliente:string|null; frotaOriginal:string|null; frotaId?:string; parecerOriginal:string|null; obraId?:string; funcionarioAbertura:string|null; funcionarioAberturaCodigo?:string|null; funcionarioAberturaNome?:string|null; problema:string|null; natureza?:Natureza; categoriaServico?:string; status?:string; statusOriginal:string|null; statusOrigem:StatusOrigem|null; prestadorTerceiro?:string; itens:ParsedItem[]; execucoes:ParsedExecucao[]; totalOrigem?:number; statusPreview:PreviewStatus; pendencias:string[]; origem:string; diff?:OsUpdateDiff; }
const norm=normalizeSearchText;
const num=(v:unknown)=>{if(typeof v==='number')return Number.isFinite(v)?v:0;const n=Number(String(v??'').trim().replace(/\./g,'').replace(',','.'));return Number.isFinite(n)?n:0};
const dateOnly=(v:unknown)=>{const m=/(\d{2})\/(\d{2})\/(\d{4})/.exec(String(v??''));return m?`${m[3]}-${m[2]}-${m[1]}`:String(v??'').trim()};
const localDateTime=(d:string,t:string)=>{const m=/(\d{2})\/(\d{2})\/(\d{4})/.exec(d);return m?`${m[3]}-${m[2]}-${m[1]}T${t}:00`:d+'T'+t+':00'};
export const normalizePlate=(v:unknown)=>norm(v).replace(/[\s-]/g,'');
export const normalizeModel=(v:unknown)=>norm(v).replace(/[\s-]/g,'');
export function matchObraId(obraText:string|null,obras:Array<{id:string;codigo:string;nome:string}>){const key=norm(obraText);if(!key)return undefined;const matches=obras.filter(x=>norm(x.codigo)===key||norm(x.nome)===key);return matches.length===1?matches[0]!.id:undefined;}
export function isMensalidadePedagio(description:string):boolean { return norm(description)==='MENSALIDADE PEDAGIO'; }
export function isPassagemPedagio(description:string):boolean { return norm(description)==='PASSAGEM PEDAGIO'; }
export function classifyNatureza(problem:string|null, _technician:string|null, text:string, hasService=false, hasProducts=false, status?:string, hasExecutions=false, serviceTechnicians:string[]=[]):Natureza|undefined { const p=norm(problem); const normalizedText=norm(text); if(hasProducts&&!hasService&&/^RETIRAR\b/.test(p)) return 'MATERIAL'; if(norm(status)==='FINALIZADA'&&hasProducts&&!hasService&&!hasExecutions) return 'MATERIAL'; if(hasService&&normalizedText.includes('MENSALIDADE PEDAGIO')) return 'TERCEIRO'; if(serviceTechnicians.some((value)=>norm(value)==='IZAAC EDUARDO')||/\bTERCEIRO(S)?\b/.test(normalizedText)) return 'TERCEIRO'; return problem||text?'INTERNA':undefined; }
export function mapStatus(v:unknown):string|undefined { const s=norm(v); if(s==='ABERTA')return 'ABERTA'; if(s==='FINALIZADA')return 'FINALIZADA'; if(s==='CANCELADA'||s==='CANCELADO'||s==='ENCERRADA POR CANCELAMENTO')return 'CANCELADA'; if(/^ENCERRADA|^FECHADA/.test(s))return 'FINALIZADA'; return undefined; }
export function resolveManualStatus(item: ParsedOs, status: string): boolean {
  const pending = item.pendencias.some(value => value.startsWith('STATUS_PENDENTE'));
  if (!pending || item.status === status) return false;
  item.status = status;
  item.statusOrigem = 'MANUAL';
  item.pendencias = item.pendencias.filter(value => !value.startsWith('STATUS_PENDENTE'));
  return true;
}
const ocorrencias = 'ocorr' + String.fromCharCode(234) + 'ncia';
export function addPending(pendencias:string[],code:string){if(code==='FORNECEDOR_PENDENTE')return;const index=pendencias.findIndex(x=>x===code||x.startsWith(`${code} (`));if(index<0){pendencias.push(code);return}const match=new RegExp(`\\((\\d+) ${ocorrencias}s?\\)$`).exec(pendencias[index]!);const count=(match?Number(match[1]):1)+1;pendencias[index]=`${code} (${count} ${ocorrencias}${count===1?'':'s'})`;}
export function findFleetId(original:string|null,fleets:Array<{id:string;codigo:string;placa:string|null}>){if(!original)return undefined;const key=normalizeFleetCode(original);const matches=fleets.filter(x=>normalizeFleetCode(x.codigo)===key||normalizeFleetCode(x.placa??'')===key);return matches.length===1?matches[0]!.id:undefined;}
export function findFleetIdWithAliases(original:string|null,fleets:Array<{id:string;codigo:string;placa:string|null}>,aliases:ExternalFleetIdentifier[],origem=POLIFROTA_ORIGIN){
 if(!original)return undefined;
 const directKey=normalizeFleetCode(original),externalKey=normalizeExternalFleetIdentifier(original);
 const candidates=new Set<string>();
 for(const fleet of fleets) if(normalizeFleetCode(fleet.codigo)===directKey||normalizeFleetCode(fleet.placa??'')===directKey)candidates.add(fleet.id);
 for(const alias of aliases) if(alias.origem===origem&&alias.identificador_normalizado===externalKey)candidates.add(alias.frota_id);
 return candidates.size===1?[...candidates][0]:undefined;
}
export function productUnit(description:string){ return /^OLEO(\s|$)/i.test(norm(description))?'L':'UN'; }
const serviceDescriptionRules = /^(?:FRETE|ALINHAR(?:\/BALANCEAR)?|ALINHAMENTO|BALANCEAMENTO|SOCORRO|MAO DE OBRA|MANUTENCAO|SERVICO|GUINCHO|SOLDA|BORRACHARIA|CHAVEIRO|AFERICAO|DESLOCAMENTO|INSTALACAO|REPARO)\b/;
export function classifyItemType(description:string, hasExecution=false):'SERVICO'|'PRODUTO' { return hasExecution || isMensalidadePedagio(description) || isPassagemPedagio(description) || serviceDescriptionRules.test(norm(description)) ? 'SERVICO' : 'PRODUTO'; }
export const CODIGOS_SERVICOS_INTERNOS = new Set(['1919', '1916', '2654', '1902', '2257', '1943']);
const normalizeServiceCode = (value: unknown): string | undefined => {
  const code = String(value ?? '').trim();
  return /^\d+$/.test(code) ? code : undefined;
};
export function classifyImportedService(code: unknown): Pick<ParsedItem, 'classificacao_servico' | 'classificacao_origem'> {
  const normalizedCode = normalizeServiceCode(code);
  if (!normalizedCode) return { classificacao_servico: 'INDETERMINADO', classificacao_origem: 'IMPORTACAO' };
  return {
    classificacao_servico: CODIGOS_SERVICOS_INTERNOS.has(normalizedCode) ? 'INTERNO' : 'TERCEIRO',
    classificacao_origem: 'IMPORTACAO',
  };
}
export function importedServiceOrigin(item: Pick<ParsedItem, 'classificacao_servico' | 'classificacao_servico_original'>): 'IMPORTACAO' | 'REVISAO' {
  return item.classificacao_servico === (item.classificacao_servico_original ?? item.classificacao_servico) ? 'IMPORTACAO' : 'REVISAO';
}
export function unresolvedServiceCount(items: ParsedItem[]): number {
  return items.filter(item => item.tipo === 'SERVICO' && item.classificacao_servico === 'INDETERMINADO').length;
}
export function validateServiceClassificationsForConfirmation(items: ParsedItem[]): void {
  const invalid = items.find(item => item.tipo === 'SERVICO' && (!['INTERNO', 'TERCEIRO'].includes(item.classificacao_servico ?? '') || !item.classificacao_servico));
  if (invalid) throw new Error(`Serviço sem classificação resolvida: ${invalid.descricao}.`);
}
export function refreshServiceClassificationPending(pendencias: string[], items: ParsedItem[]): void {
  for (let index = pendencias.length - 1; index >= 0; index--) {
    if (pendencias[index]!.startsWith('CLASSIFICACAO_SERVICO_PENDENTE')) pendencias.splice(index, 1);
  }
  const count = unresolvedServiceCount(items);
  if (count > 0) addPending(pendencias, `CLASSIFICACAO_SERVICO_PENDENTE (${count} servico${count === 1 ? '' : 's'})`);
}
const categoryRules:Array<[RegExp,string]>= [[/^MAO DE OBRA (?:LAVADOR|LAVAGEM)\b/,'LAVAGEM'],[/^MAO DE OBRA SOLDADOR\b/,'SOLDAGEM'],[/^MAO DE OBRA MECANICO\b/,'MECANICA'],[/^MAO DE OBRA FUNILEIRO\b/,'FUNILARIA'],[/^(?:SERVICO|SERVIÇO) BORRACHARIA\b/,'BORRACHARIA'],[/^MAO DE OBRA LUBRIFIC(?:ADOR|AR)\b/,'LUBRIFICACAO']]; export function classifyCategory(descriptions:string[]){const categories=descriptions.map(d=>{const s=norm(d);return categoryRules.find(([pattern])=>pattern.test(s))?.[1]}).filter((x):x is string=>Boolean(x));return categories.length&&new Set(categories).size===1?categories[0]:'OUTROS';}
export function classifyCategoryWithNatureza(descriptions:string[], natureza?:Natureza){
 const categories=descriptions.map(d=>{const s=norm(d);if(natureza==='TERCEIRO'&&/^MAO DE OBRA(?:\s*-\s*|\s+)ELETRICISTA\b/.test(s))return 'ELETRICA' as string;return undefined}).filter((x):x is string=>Boolean(x));
 return categories.length&&new Set(categories).size===1?categories[0]:'OUTROS';
}
export interface VegaLayout { clienteColumn:number; veiculoColumn:number; placaColumn:number; launcherCodeColumn:number; launcherNameColumn:number; technicianCodeColumn:number; technicianNameColumn:number; quantityColumn:number; unitValueColumn:number; discountColumn:number; totalColumn:number; }
const textAt=(row:unknown[],column:number)=>String(row[column]??'').trim();
const headerColumn=(rows:unknown[][],label:string)=>{const expected=norm(label);for(const row of rows){const column=row.findIndex(value=>norm(value)===expected);if(column>=0)return column;}return undefined;};
const headerColumnStarting=(rows:unknown[][],label:string)=>{const expected=norm(label);for(const row of rows){const column=row.findIndex(value=>norm(value).startsWith(expected));if(column>=0)return column;}return undefined;};
export const detectVegaLayout=(rows:unknown[][]):VegaLayout=>{const launcher=headerColumn(rows,'FUNCIONARIO ABRIU O.S.'),technician=headerColumn(rows,'TECNICO/OPERADOR'),client=headerColumn(rows,'CLIENTE'),vehicle=headerColumn(rows,'VEICULO'),plate=headerColumn(rows,'PLACA'),quantity=headerColumn(rows,'QTDE'),unitValue=headerColumnStarting(rows,'VLR. UNIT.'),discount=headerColumnStarting(rows,'DES'),total=headerColumnStarting(rows,'TOTAL ITEM');return {clienteColumn:client===undefined?16:client+4,veiculoColumn:vehicle??29,placaColumn:plate??30,launcherCodeColumn:launcher===undefined?34:launcher+2,launcherNameColumn:launcher===undefined?36:launcher+4,technicianCodeColumn:technician===undefined?24:technician+2,technicianNameColumn:technician===undefined?26:technician+4,quantityColumn:quantity??30,unitValueColumn:unitValue??32,discountColumn:discount??37,totalColumn:total??38};};
const executionTextFromRow=(row:unknown[])=>row.map(value=>String(value??'').replace(/\s+/g,' ').trim()).find(value=>/INICIO EM \d{2}\/\d{2}\/\d{4} \d{2}:\d{2} TERMINO EM \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/.test(norm(value)))??'';
const isOsRow=(row:unknown[])=>num(row[0])>0&&textAt(row,6)!=='';
export function parsePoliOs(buffer:Buffer,filename:string):ParsedOs[]{
  const wb=XLSX.read(buffer,{type:'buffer',cellDates:false,raw:true}),out:ParsedOs[]=[];
 for(const sn of wb.SheetNames){const sheet=wb.Sheets[sn]!,rows=XLSX.utils.sheet_to_json(sheet,{header:1,raw:true,defval:null}) as unknown[][],layout=detectVegaLayout(rows);let o:ParsedOs|null=null,last:ParsedItem|undefined;
  for(let rowIndex=0;rowIndex<rows.length;rowIndex++){const row=rows[rowIndex]!;if(isOsRow(row)){if(o)out.push(o);const launcherCode=textAt(row,layout.launcherCodeColumn)||null,launcherName=textAt(row,layout.launcherNameColumn)||null;o={numeroOs:num(row[0]),data:dateOnly(row[6]),cliente:textAt(row,layout.clienteColumn)||null,frotaOriginal:textAt(row,layout.placaColumn)||textAt(row,layout.veiculoColumn)||null,parecerOriginal:null,funcionarioAbertura:launcherCode,funcionarioAberturaCodigo:launcherCode,funcionarioAberturaNome:launcherName,problema:null,status:undefined,statusOriginal:null,statusOrigem:null,itens:[],execucoes:[],statusPreview:'REQUER_REVISAO',pendencias:[],origem:filename};last=undefined;continue}if(!o)continue;
   const statusOriginal=String(row[8]??'');if(statusOriginal.trim()){o.statusOriginal=statusOriginal.trim();const mappedStatus=mapStatus(statusOriginal);o.status=mappedStatus;o.statusOrigem=mappedStatus?'AUTOMATICO':null;}const description=textAt(row,5),code=textAt(row,3),executionText=executionTextFromRow(row),hasExecution=Boolean(executionText);if(description){const technicianName=textAt(row,layout.technicianNameColumn)||undefined,technicianCode=technicianName?textAt(row,layout.technicianCodeColumn)||undefined:undefined,tipo=classifyItemType(description,hasExecution),classification=tipo==='SERVICO'?classifyImportedService(code):undefined;last={codigo:code||undefined,descricao:description,quantidade:num(row[layout.quantityColumn])||1,valorUnitario:num(row[layout.unitValueColumn]),desconto:num(row[layout.discountColumn]),total:num(row[layout.totalColumn]),unidade:tipo==='SERVICO'?'UN':productUnit(description),tipo,tecnicoOriginal:technicianName,tecnicoCodigoOriginal:technicianCode,...classification,classificacao_servico_original:classification?.classificacao_servico};o.itens.push(last);}
   const match=/Inicio em (\d{2}\/\d{2}\/\d{4}) (\d{2}:\d{2}) Termino em (\d{2}\/\d{2}\/\d{4}) (\d{2}:\d{2})/i.exec(norm(executionText));if(match&&last?.tipo==='SERVICO'){const classification=classifyImportedService(last.codigo);last.classificacao_servico=classification.classificacao_servico;last.classificacao_servico_original=classification.classificacao_servico;last.classificacao_origem=classification.classificacao_origem;if(last.tecnicoOriginal&&norm(last.tecnicoOriginal)!=='IZAAC EDUARDO')o.execucoes.push({funcionarioOriginal:last.tecnicoOriginal,inicio:localDateTime(match[1]!,match[2]!),fim:localDateTime(match[3]!,match[4]!)});}
   const annotation=textAt(row,0);if(/^PROBLEMA\s*:/i.test(annotation)){const problem=annotation.replace(/^PROBLEMA\s*:/i,'').trim();if(!/^\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2})+(?:\s+\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2})+)?$/.test(problem))o.problema=o.problema?o.problema+'\n'+problem:problem;}else if(/^PARECER/i.test(annotation))o.parecerOriginal=annotation.replace(/^PARECER[^:]*:/i,'').trim();if(/^TOTAL ORDEM/i.test(norm(row.map(value=>String(value??'')).join(' '))))o.totalOrigem=num(row[layout.totalColumn]);
  }if(o)out.push(o);
 }
 for(const item of out){item.categoriaServico=classifyCategory(item.itens.filter(x=>x.tipo==='SERVICO').map(x=>x.descricao));item.natureza=classifyNatureza(item.problema,item.execucoes[0]?.funcionarioOriginal??null,item.itens.map(x=>x.descricao).join(' '),item.itens.some(x=>x.tipo==='SERVICO'),item.itens.some(x=>x.tipo==='PRODUTO'),item.status,item.execucoes.length>0,item.itens.filter(x=>x.tipo==='SERVICO').map(x=>x.tecnicoOriginal??''));const electricianCategory=classifyCategoryWithNatureza(item.itens.filter(x=>x.tipo==='SERVICO').map(x=>x.descricao),item.natureza);if(electricianCategory==='ELETRICA')item.categoriaServico=electricianCategory;}return out;
}
export async function matchPreview(items:ParsedOs[]){
 let fleets:{id:string;codigo:string;placa:string|null}[]=[];
 try{fleets=(await pool.query<{id:string;codigo:string;placa:string|null}>('SELECT id,codigo,placa FROM frotas')).rows;}catch{}
 let externalFleetIdentifiers:ExternalFleetIdentifier[]=[];
 try{externalFleetIdentifiers=await listExternalFleetIdentifiers(POLIFROTA_ORIGIN);}catch{}
 let employees:{id:string;nome:string}[]=[];
 try{employees=(await pool.query<{id:string;nome:string}>('SELECT id,nome FROM funcionarios')).rows;}catch{}
 for(const o of items){
  o.pendencias=[];
  refreshServiceClassificationPending(o.pendencias,o.itens);
  if(!o.status)addPending(o.pendencias,'STATUS_PENDENTE');
  const obra=norm(o.parecerOriginal);
  if(obra){try{const r=await pool.query<{id:string;codigo:string;nome:string}>('SELECT id,codigo,nome FROM obras');const matches=r.rows.filter(x=>norm(x.codigo)===obra||norm(x.nome)===obra);if(matches.length===1)o.obraId=o.obraId??matches[0]!.id;else addPending(o.pendencias,matches.length?'OBRA_AMBIGUA':'OBRA_PENDENTE');}catch{addPending(o.pendencias,'OBRA_PENDENTE');}}
  else addPending(o.pendencias,'OBRA_PENDENTE');
  if(!o.frotaId)o.frotaId=findFleetIdWithAliases(o.frotaOriginal,fleets,externalFleetIdentifiers,POLIFROTA_ORIGIN);
  if(!o.frotaId)addPending(o.pendencias,'FROTA_PENDENTE');
  for(const e of o.execucoes){const h=employees.filter(x=>norm(x.nome)===norm(e.funcionarioOriginal));if(h.length===1)e.funcionarioId=e.funcionarioId??h[0]!.id;else addPending(o.pendencias,h.length?'FUNCIONARIO_AMBIGUO':'FUNCIONARIO_PENDENTE');}
  o.natureza=o.natureza??classifyNatureza(o.problema,o.execucoes[0]?.funcionarioOriginal??null,o.itens.map(x=>x.descricao).join(' '),o.itens.some(x=>x.tipo==='SERVICO'),o.itens.some(x=>x.tipo==='PRODUTO'),o.status,o.execucoes.length>0,o.itens.filter(x=>x.tipo==='SERVICO').map(x=>x.tecnicoOriginal??''));
  if(!o.natureza)addPending(o.pendencias,'NATUREZA_PENDENTE');
  if(!o.problema&&!o.itens.length)addPending(o.pendencias,'DADOS_INCOMPLETOS');
  try{const existing=await loadExistingOs(o.numeroOs);if(existing){o.diff=buildOsUpdateDiff(o,existing);const blockingPendencias=o.pendencias.filter(value=>!((value.startsWith('FROTA_PENDENTE')&&existing.frotaId)||(value.startsWith('OBRA_PENDENTE')&&existing.obraId)));o.statusPreview=blockingPendencias.length?'REQUER_REVISAO':o.diff.estado;}else o.statusPreview=o.pendencias.length?'REQUER_REVISAO':'NOVA';}catch{o.statusPreview='REQUER_REVISAO';}
 }
 return items;
}

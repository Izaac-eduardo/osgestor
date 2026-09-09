import * as XLSX from 'xlsx';
import { pool } from '../config/database.js';

export type PreviewStatus = 'PRONTA' | 'REQUER_REVISAO' | 'JA_CADASTRADA' | 'ERRO';
export type Natureza = 'INTERNA' | 'MATERIAL' | 'TERCEIRO';
export interface ParsedItem { codigo?: string; descricao: string; quantidade: number; valorUnitario: number; desconto?: number; total: number; unidade: string; tipo: 'SERVICO' | 'PRODUTO'; tecnicoOriginal?: string; funcionarioId?: string; }
export interface ParsedExecucao { funcionarioOriginal: string; inicio: string; fim: string; funcionarioId?: string; }
export interface ParsedOs { numeroOs:number; data:string; cliente:string|null; frotaOriginal:string|null; frotaId?:string; parecerOriginal:string|null; obraId?:string; funcionarioAbertura:string|null; problema:string|null; natureza?:Natureza; categoriaServico?:string; status?:string; prestadorTerceiro?:string; itens:ParsedItem[]; execucoes:ParsedExecucao[]; totalOrigem?:number; statusPreview:PreviewStatus; pendencias:string[]; origem:string; }
const norm=(v:unknown)=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toUpperCase();
const num=(v:unknown)=>{if(typeof v==='number')return Number.isFinite(v)?v:0;const n=Number(String(v??'').trim().replace(/\./g,'').replace(',','.'));return Number.isFinite(n)?n:0};
const dateOnly=(v:unknown)=>{const m=/(\d{2})\/(\d{2})\/(\d{4})/.exec(String(v??''));return m?`${m[3]}-${m[2]}-${m[1]}`:String(v??'').trim()};
const localDateTime=(d:string,t:string)=>{const m=/(\d{2})\/(\d{2})\/(\d{4})/.exec(d);return m?`${m[3]}-${m[2]}-${m[1]}T${t}:00`:d+'T'+t+':00'};
export const normalizePlate=(v:unknown)=>norm(v).replace(/[\s-]/g,'');
export const normalizeModel=(v:unknown)=>norm(v).replace(/[\s-]/g,'');
export function classifyNatureza(problem:string|null, technician:string|null, text:string):Natureza|undefined { const p=norm(problem); if(/^RETIRAR MATERIA(L|IS)\b/.test(p)) return 'MATERIAL'; if(norm(technician)==='IZAAC EDUARDO'||/\bTERCEIRO(S)?\b/.test(norm(text))) return 'TERCEIRO'; return problem||text?'INTERNA':undefined; }
export function mapStatus(v:unknown):string|undefined { const s=norm(v); if(s==='ABERTA')return 'ABERTA'; if(/^ENCERRADA|^FECHADA/.test(s))return 'FINALIZADA'; if(s==='CANCELADA')return 'CANCELADA'; return undefined; }
export function productUnit(description:string){ return /^Ó?LEO(\s|$)/i.test(description.trim())?'L':'UN'; }
function category(d:string){const s=norm(d);if(s.includes('LUBRIFIC'))return 'LUBRIFICACAO';if(s.includes('MECANICO'))return 'MECANICA';if(s.includes('FUNILEIRO'))return 'FUNILARIA';if(s.includes('ELETRIC'))return 'AUTO_ELETRICA';return 'OUTROS';}
function value(s:XLSX.WorkSheet,a:string){return s[a]?.v;}
function startsOs(s:XLSX.WorkSheet,r:number){return num(value(s,'A'+r))>0&&String(value(s,'G'+r)??'').trim()!=='';}
export function parsePoliOs(buffer:Buffer,filename:string):ParsedOs[]{
 const wb=XLSX.read(buffer,{type:'buffer',cellDates:false,raw:false}),out:ParsedOs[]=[];
 for(const sn of wb.SheetNames){const s=wb.Sheets[sn]!,end=XLSX.utils.decode_range(s['!ref']??'A1:A1').e.r+1;let o:ParsedOs|null=null,last:ParsedItem|undefined;
  for(let r=1;r<=end;r++){if(startsOs(s,r)){if(o)out.push(o);o={numeroOs:num(value(s,'A'+r)),data:dateOnly(value(s,'G'+r)),cliente:value(s,'Q'+r)?String(value(s,'Q'+r)).trim():null,frotaOriginal:String(value(s,'AE'+r)??value(s,'AD'+r)??'').trim()||null,parecerOriginal:null,funcionarioAbertura:value(s,'AI'+r)?String(value(s,'AI'+r)).trim():null,problema:null,status:undefined,itens:[],execucoes:[],statusPreview:'REQUER_REVISAO',pendencias:[],origem:filename};last=undefined;continue}if(!o)continue;
   const st=value(s,'I'+r);if(st)o.status=mapStatus(st);
   const d=String(value(s,'F'+r)??'').trim(),code=value(s,'D'+r);if(d&&code!=null&&String(code).trim()!==''){const service=/^MAO DE OBRA\b/i.test(d)||/^SERVI[CÇ]O\b/i.test(d);last={codigo:String(code),descricao:d,quantidade:num(value(s,'AE'+r))||1,valorUnitario:num(value(s,'AG'+r)),desconto:num(value(s,'AL'+r)),total:num(value(s,'AM'+r)),unidade:service?'UN':productUnit(d),tipo:service?'SERVICO':'PRODUTO',tecnicoOriginal:value(s,'AA'+r)?String(value(s,'AA'+r)).trim():undefined};o.itens.push(last);if(service&&!o.categoriaServico)o.categoriaServico=category(d);}
   const ex=String(value(s,'T'+r)??''),m=/Inicio em (\d{2}\/\d{2}\/\d{4}) (\d{2}:\d{2}) Termino em (\d{2}\/\d{2}\/\d{4}) (\d{2}:\d{2})/i.exec(ex);if(m&&last?.tecnicoOriginal)o.execucoes.push({funcionarioOriginal:last.tecnicoOriginal,inicio:localDateTime(m[1]!,m[2]!),fim:localDateTime(m[3]!,m[4]!)});
   const a=String(value(s,'A'+r)??'').trim();if(/^PROBLEMA\s*:/i.test(a)){const x=a.replace(/^PROBLEMA\s*:/i,'').trim();o.problema=o.problema?o.problema+'\n'+x:x;}else if(/^PARECER/i.test(a))o.parecerOriginal=a.replace(/^PARECER[^:]*:/i,'').trim();const tl=String(value(s,'AC'+r)??'');if(/^Total Ordem de Serviço/i.test(tl))o.totalOrigem=num(value(s,'AM'+r))||num(value(s,'AG'+r));
  }if(o)out.push(o);
 }for(const item of out)item.natureza=classifyNatureza(item.problema,item.execucoes[0]?.funcionarioOriginal??null,item.itens.map(x=>x.descricao).join(' '));return out;
}
const obraAlias=(v:string)=>({COMAO:'COAMO',MANBORE:'MAMBORE'} as Record<string,string>)[norm(v)]??v;
export async function matchPreview(items:ParsedOs[]){let fleet=false;try{await pool.query('SELECT 1 FROM frotas LIMIT 1');fleet=true;}catch{}let employees:{id:string;nome:string}[]=[];try{employees=(await pool.query<{id:string;nome:string}>('SELECT id,nome FROM funcionarios')).rows;}catch{}
 for(const o of items){o.pendencias=[];if(!o.status)o.pendencias.push('STATUS_PENDENTE');const obra=obraAlias(o.parecerOriginal??'');if(obra){try{const r=await pool.query<{id:string}>('SELECT id FROM obras WHERE upper(codigo)=upper($1) OR upper(nome)=upper($1)',[obra]);if(r.rows.length===1)o.obraId=r.rows[0]!.id;else o.pendencias.push(r.rows.length?'OBRA_AMBIGUA':'OBRA_PENDENTE');}catch{o.pendencias.push('OBRA_PENDENTE');}}else o.pendencias.push('OBRA_PENDENTE');if(!fleet||!o.frotaOriginal)o.pendencias.push('FROTA_PENDENTE');for(const e of o.execucoes){const h=employees.filter(x=>norm(x.nome)===norm(e.funcionarioOriginal));if(h.length===1)e.funcionarioId=h[0]!.id;else o.pendencias.push(h.length?'FUNCIONARIO_AMBIGUO':'FUNCIONARIO_PENDENTE');}o.natureza=o.natureza??classifyNatureza(o.problema,o.execucoes[0]?.funcionarioOriginal??null,o.itens.map(x=>x.descricao).join(' '));if(!o.natureza)o.pendencias.push('NATUREZA_PENDENTE');if(o.natureza==='TERCEIRO')o.pendencias.push('FORNECEDOR_PENDENTE');try{if((await pool.query('SELECT 1 FROM ordens_servico WHERE numero_os=$1',[o.numeroOs])).rowCount)o.statusPreview='JA_CADASTRADA';else o.statusPreview=o.pendencias.length?'REQUER_REVISAO':'PRONTA';}catch{o.statusPreview='REQUER_REVISAO';}}
 return items;
}

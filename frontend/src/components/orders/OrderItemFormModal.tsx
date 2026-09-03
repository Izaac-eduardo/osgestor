import{useEffect,useRef,useState}from'react';
import{LoaderCircle,X}from'lucide-react';import{createPortal}from'react-dom';
import type{EmployeeOption,OrderEmployee,OrderProduct,OrderService,ProductItemPayload,ServiceItemPayload}from'../../types/orders';
import{formatCurrency}from'../../utils/formatters'
type P={kind:'employee'|'service'|'product';
nature:'INTERNA'|'TERCEIRO'|'MATERIAL';currentEmployee?:OrderEmployee;confirmLabel?:string;
employees?:EmployeeOption[];
linked?:OrderEmployee[];
service?:OrderService;
product?:OrderProduct;
saving:boolean;
error:string|null;
onClose:()=>void;
onEmployee?:(id:string)=>void;
onService?:(x:ServiceItemPayload)=>void;
onProduct?:(x:ProductItemPayload)=>void}
const units=[['UN','Unidade'],['L','Litro'],['ML','Mililitro'],['KG','Quilograma'],['G','Grama'],['M','Metro'],['CM','Centímetro'],['CX','Caixa'],['PCT','Pacote'],['JG','Jogo'],['PAR','Par']];
const parsePtBrDecimal=(raw:string)=>{const s=raw.trim().replace(/\s/g,'');if(!s)return NaN;const normalized=s.includes(',')?s.replace(/\./g,'').replace(',','.'):s;return/^-?\d+(?:\.\d+)?$/.test(normalized)?Number(normalized):NaN};
export function OrderItemFormModal(p:P){const{saving,onClose}=p;
const[employee,setEmployee]=useState(''),[description,setDescription]=useState(p.service?.descricao||p.product?.descricao||''),[value,setValue]=useState(p.service?String(p.service.valor).replace('.',','):''),[quantity,setQuantity]=useState(p.product?String(p.product.quantidade).replace('.',','):''),[unit,setUnit]=useState(p.product?.unidade||''),[unitValue,setUnitValue]=useState(p.product?String(p.product.valor_unitario).replace('.',','):''),[error,setError]=useState('');
const first=useRef<HTMLSelectElement|HTMLInputElement>(null);
useEffect(()=>{first.current?.focus();
const key=(e:KeyboardEvent)=>e.key==='Escape'&&!saving&&onClose();
document.addEventListener('keydown',key);
return()=>document.removeEventListener('keydown',key)},[saving,onClose]);
const submit=(e:React.FormEvent)=>{e.preventDefault();
setError('');
if(p.kind==='employee'){if(!employee)return setError('Selecione um funcionário.');
return p.onEmployee?.(employee)}if(!description.trim())return setError('Informe a descrição.');
if(p.kind==='service'){const n=parsePtBrDecimal(value);
if(!value.trim())return setError('Informe o valor do serviço.');
if(!Number.isFinite(n)||n<0)return setError('Informe um valor válido e não negativo.');
return p.onService?.({descricao:description.trim(),valor:n})}
const parsedQuantity=parsePtBrDecimal(quantity),parsedValue=parsePtBrDecimal(unitValue);
if(!quantity.trim())return setError('Informe a quantidade.');
if(!Number.isFinite(parsedQuantity)||parsedQuantity<=0)return setError('Informe uma quantidade maior que zero.');
if(!unit.trim())return setError('Informe a unidade.');
if(!unitValue.trim())return setError('Informe o valor unitário.');
if(!Number.isFinite(parsedValue)||parsedValue<0)return setError('Informe um valor unitário válido e não negativo.');
p.onProduct?.({descricao:description.trim(),quantidade:parsedQuantity,unidade:unit.trim().toUpperCase(),valor_unitario:parsedValue})};
const title=p.kind==='employee'?(p.currentEmployee?'Trocar funcionário':'Adicionar funcionário'):p.kind==='service'?(p.service?'Editar serviço':'Adicionar serviço'):(p.product?'Editar produto':'Adicionar produto');
const available=p.employees?.filter(x=>!p.linked?.some(y=>y.id===x.id)).sort((a,b)=>Number(b.status==='ATIVO')-Number(a.status==='ATIVO'))||[];
return createPortal(<div className="nested-backdrop"><form aria-labelledby="item-form-title" aria-modal="true" className="item-form" onSubmit={submit} role="dialog" noValidate><header><h3 id="item-form-title">{title}</h3><button aria-label="Fechar formulário" className="icon-button" disabled={p.saving} onClick={p.onClose} type="button"><X/></button></header><main>{p.kind==='employee'?<>{p.currentEmployee&&<div className="employee-replacement"><span>Funcionário atual</span><strong>{p.currentEmployee.nome}</strong></div>}<label>{p.currentEmployee?'Novo funcionário':'Funcionário'}<select ref={first as React.RefObject<HTMLSelectElement>} value={employee} onChange={e=>setEmployee(e.target.value)} aria-invalid={Boolean(error)}><option value="">Selecione</option>{available.map(x=><option key={x.id} value={x.id}>{x.nome} — {[x.matricula,x.cargo].filter(Boolean).join(' · ')}</option>)}</select></label></>:<><label>{p.kind==='service'?'Descrição do serviço':'Descrição do produto'}<input ref={first as React.RefObject<HTMLInputElement>} value={description} onChange={e=>setDescription(e.target.value)} aria-invalid={Boolean(error&&!description.trim())}/></label>{p.kind==='service'?<label>{p.nature==='INTERNA'?'Valor da mão de obra (R$)':'Valor do serviço terceirizado (R$)'}<input inputMode="decimal" placeholder="0,00" type="text" value={value} onChange={e=>setValue(e.target.value)} aria-invalid={Boolean(error)}/></label>:<><div className="item-form__measurements"><label>Quantidade<input inputMode="decimal" placeholder="Ex.: 20 ou 1,5" type="text" value={quantity} onChange={e=>setQuantity(e.target.value)} aria-invalid={Boolean(error)}/></label><label>Unidade<input list="order-units" placeholder="Ex.: L" value={unit} onChange={e=>setUnit(e.target.value)} aria-invalid={Boolean(error)}/><datalist id="order-units">{units.map(([code,name])=><option key={code} value={code}>{name}</option>)}</datalist></label></div><label>Valor unitário (R$)<input inputMode="decimal" placeholder="0,00" type="text" value={unitValue} onChange={e=>setUnitValue(e.target.value)} aria-invalid={Boolean(error)}/></label><div aria-live="polite" className="item-preview"><span>Valor total</span><strong>{Number.isFinite(parsePtBrDecimal(quantity)*parsePtBrDecimal(unitValue))?formatCurrency(parsePtBrDecimal(quantity)*parsePtBrDecimal(unitValue)):'—'}</strong><small>Prévia; o valor oficial será confirmado após salvar.</small></div></>}</>}{(error||p.error)&&<p className="form-api-error" id="item-form-error" role="alert">{error||p.error}</p>}</main><footer><button className="button button--secondary" disabled={p.saving} onClick={p.onClose} type="button">Cancelar</button><button className="button button--primary" disabled={p.saving}>{p.saving?<><LoaderCircle className="spin" size={16}/>Salvando...</>:p.confirmLabel||'Salvar'}</button></footer></form></div>,document.body)}


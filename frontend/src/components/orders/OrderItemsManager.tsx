import { useState } from 'react'
import axios from 'axios'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { ConfirmDialog } from '../ConfirmDialog'
import {
  addOrderEmployee, createOrderProduct, createOrderService, getEmployees,
  removeOrderEmployee, removeOrderProduct, removeOrderService,
  updateOrderProduct, updateOrderService,
} from '../../services/orders'
import type {
  EmployeeOption, OrderEmployee, OrderProduct, OrderService, ServiceOrderDetails,
} from '../../types/orders'
import { formatCurrency, formatQuantity, formatWorkDuration } from '../../utils/formatters'
import { OrderItemFormModal } from './OrderItemFormModal'
import { ServiceExecutions } from './ServiceExecutions'

type Kind='employee'|'service'|'product'
type Editing={kind:Kind;employee?:OrderEmployee;service?:OrderService;product?:OrderProduct}|null
type Removing={kind:Kind;id:string;label:string}|null
type Props={order:ServiceOrderDetails;onRefresh:(financial:boolean,message:string)=>Promise<void>}

export function OrderItemsManager({order,onRefresh}:Props){
  const[editing,setEditing]=useState<Editing>(null),[removing,setRemoving]=useState<Removing>(null)
  const[employees,setEmployees]=useState<EmployeeOption[]>([]),[busy,setBusy]=useState(false)
  const[error,setError]=useState<string|null>(null)
  const totalMinutes=order.servicos.flatMap((service)=>service.execucoes).reduce((sum,item)=>sum+item.duracao_minutos,0)
  const message=(caught:unknown,fallback:string)=>axios.isAxiosError<{message?:string}>(caught)&&[400,404,409].includes(caught.response?.status||0)?caught.response?.data?.message||fallback:fallback
  const begin=async(kind:Kind,item?:OrderService|OrderProduct)=>{
    setError(null)
    if(kind==='employee')try{setEmployees(await getEmployees())}catch{return setError('Não foi possível carregar os funcionários.')}
    setEditing({kind,...(kind==='service'?{service:item as OrderService}:kind==='product'?{product:item as OrderProduct}:{})})
  }
  const beginReplace=async(employee:OrderEmployee)=>{setError(null);try{setEmployees(await getEmployees());setEditing({kind:'employee',employee})}catch{setError('Não foi possível carregar os funcionários.')}}
  const run=async(task:()=>Promise<unknown>,financial:boolean,success:string,fallback:string)=>{
    if(busy)return;setBusy(true);setError(null)
    try{await task();setEditing(null);setRemoving(null);await onRefresh(financial,success)}
    catch(caught){setError(message(caught,fallback))}finally{setBusy(false)}
  }
  const replaceEmployee=async(newId:string)=>{
    if(!editing?.employee||busy)return;setBusy(true);setError(null);let added=false
    try{await addOrderEmployee(order.id,{funcionario_id:newId});added=true;await removeOrderEmployee(order.id,editing.employee.id);setEditing(null);await onRefresh(false,'Funcionário substituído com sucesso.')}
    catch(caught){if(added){setEditing(null);await onRefresh(false,'');setError('O novo funcionário foi adicionado, mas não foi possível remover o funcionário anterior.')}else setError(message(caught,'Não foi possível substituir o funcionário.'))}
    finally{setBusy(false)}
  }
  const remove=()=>{if(!removing)return;const item=removing;void run(()=>item.kind==='employee'?removeOrderEmployee(order.id,item.id):item.kind==='service'?removeOrderService(order.id,item.id):removeOrderProduct(order.id,item.id),item.kind!=='employee',`${item.label} removido com sucesso.`,`Não foi possível remover ${item.label.toLowerCase()}.`)}
  return <>
    <ManagedSection title="Funcionários" hidden={order.natureza_os==='MATERIAL'} onAdd={()=>void begin('employee')} add="Adicionar funcionário">
      {order.funcionarios.length?order.funcionarios.map(item=><Row key={item.id} title={item.nome} sub={[item.matricula,item.cargo].filter(Boolean).join(' · ')} onReplace={()=>void beginReplace(item)} onRemove={()=>setRemoving({kind:'employee',id:item.id,label:'Funcionário'})}/>):<Empty text="Nenhum funcionário vinculado."/>}
    </ManagedSection>
    <ManagedSection title={order.natureza_os==='INTERNA'?'Mão de obra':'Serviços terceirizados'} hidden={order.natureza_os==='MATERIAL'} onAdd={()=>void begin('service')} add={order.natureza_os==='INTERNA'?'Adicionar mão de obra':'Adicionar serviço'}>
      {order.servicos.length?order.servicos.map(item=><div className="service-work" key={item.id}><Row title={item.descricao} value={(order.natureza_os==='INTERNA'?'Mão de obra: ':'Serviço terceirizado: ')+formatCurrency(item.valor)} onEdit={()=>void begin('service',item)} onRemove={()=>setRemoving({kind:'service',id:item.id,label:'Serviço'})}/>{order.natureza_os==='INTERNA'&&<ServiceExecutions orderId={order.id} service={item} employees={order.funcionarios} onRefresh={onRefresh}/>}</div>):<Empty text="Nenhum serviço registrado."/>}
      {order.natureza_os==='INTERNA'&&totalMinutes>0&&<p className="order-work-total">Tempo total de serviços registrado: <strong>{formatWorkDuration(totalMinutes)}</strong></p>}
    </ManagedSection>
    <ManagedSection title="Produtos / Materiais" onAdd={()=>void begin('product')} add="Adicionar produto">
      {order.produtos.length?order.produtos.map(item=><Row key={item.id} title={item.descricao} sub={`${formatQuantity(item.quantidade)} ${item.unidade} × ${formatCurrency(item.valor_unitario)}`} value={'Total: '+formatCurrency(item.valor_total)} onEdit={()=>void begin('product',item)} onRemove={()=>setRemoving({kind:'product',id:item.id,label:'Produto'})}/>):<Empty text="Nenhum produto registrado."/>}
    </ManagedSection>
    {editing&&<OrderItemFormModal kind={editing.kind} nature={order.natureza_os} currentEmployee={editing.employee} confirmLabel={editing.employee?'Confirmar troca':undefined} employees={employees} linked={order.funcionarios} service={editing.service} product={editing.product} saving={busy} error={error} onClose={()=>!busy&&setEditing(null)} onEmployee={id=>editing.employee?void replaceEmployee(id):void run(()=>addOrderEmployee(order.id,{funcionario_id:id}),false,'Funcionário adicionado com sucesso.','Não foi possível adicionar o funcionário.')} onService={item=>void run(()=>editing.service?updateOrderService(order.id,editing.service.id,item):createOrderService(order.id,item),true,editing.service?'Serviço atualizado com sucesso.':'Serviço adicionado com sucesso.','Não foi possível salvar o serviço.')} onProduct={item=>void run(()=>editing.product?updateOrderProduct(order.id,editing.product.id,item):createOrderProduct(order.id,item),true,editing.product?'Produto atualizado com sucesso.':'Produto adicionado com sucesso.','Não foi possível salvar o produto.')}/>}
    {removing&&<ConfirmDialog title={`Remover ${removing.label.toLowerCase()}`} message={`Remover este ${removing.label.toLowerCase()} da Ordem de Serviço?`} busy={busy} error={error} onCancel={()=>!busy&&setRemoving(null)} onConfirm={remove}/>}
    {error&&!editing&&!removing&&<p className="form-api-error" role="alert">{error}</p>}
  </>
}
function ManagedSection({title,hidden,onAdd,add,children}:{title:string;hidden?:boolean;onAdd:()=>void;add:string;children:React.ReactNode}){if(hidden)return null;return <section className="details-section"><header><h3>{title}</h3><button className="button-link" onClick={onAdd} type="button"><Plus size={15}/>{add}</button></header>{children}</section>}
function Row({title,sub,value,onEdit,onReplace,onRemove}:{title:string;sub?:string;value?:string;onEdit?:()=>void;onReplace?:()=>void;onRemove:()=>void}){return <div className="detail-row"><span><strong>{title}</strong>{sub&&<small>{sub}</small>}</span>{value&&<strong>{value}</strong>}<span className="item-actions">{onReplace&&<button className="button-link item-action-text" type="button" onClick={onReplace}>Trocar</button>}{onEdit&&<button aria-label={`Editar ${title}`} className="icon-button" type="button" onClick={onEdit}><Pencil size={16}/></button>}<button aria-label={`Remover ${title}`} className="icon-button icon-button--danger" type="button" onClick={onRemove}><Trash2 size={16}/></button></span></div>}
function Empty({text}:{text:string}){return <p className="details-empty">{text}</p>}

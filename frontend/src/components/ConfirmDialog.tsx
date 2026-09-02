import{useEffect,useRef}from'react';import{LoaderCircle}from'lucide-react'
type P={title:string;message:string;busy:boolean;error?:string|null;onCancel:()=>void;onConfirm:()=>void}
export function ConfirmDialog(p:P){const{busy,onCancel}=p;const cancel=useRef<HTMLButtonElement>(null);useEffect(()=>{cancel.current?.focus();const key=(e:KeyboardEvent)=>e.key==='Escape'&&!busy&&onCancel();document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key)},[busy,onCancel]);return <div className="nested-backdrop"><section aria-labelledby="confirm-title" aria-modal="true" className="confirm-dialog" role="dialog"><h3 id="confirm-title">{p.title}</h3><p>{p.message}</p>{p.error&&<p className="form-api-error" role="alert">{p.error}</p>}<footer><button className="button button--secondary" disabled={p.busy} onClick={p.onCancel} ref={cancel}>Cancelar</button><button className="button button--danger" disabled={p.busy} onClick={p.onConfirm}>{p.busy?<><LoaderCircle className="spin" size={16}/>Removendo...</>:'Confirmar'}</button></footer></section></div>}




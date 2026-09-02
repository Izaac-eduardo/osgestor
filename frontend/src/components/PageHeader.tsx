import type { ReactNode } from 'react'
interface Props { title:string; subtitle:string; action?:ReactNode }
export function PageHeader({title,subtitle,action}:Props){return <div className="page-heading"><div><h1>{title}</h1><p>{subtitle}</p></div>{action&&<div className="page-heading__action">{action}</div>}</div>}
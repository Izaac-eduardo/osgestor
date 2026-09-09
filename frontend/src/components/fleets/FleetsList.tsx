import type { Fleet } from '../../types/fleets'
type Props = { items: Fleet[]; busyId: string | null; onEdit: (id: string) => void; onStatus: (item: Fleet) => void; onDelete: (item: Fleet) => void }
function Badge({ item }: { item: Fleet }) {
  return <span className={'project-status project-status--' + (item.status === 'ATIVO' ? 'ativa' : 'inativa')}>{item.status === 'ATIVO' ? 'Ativo' : 'Inativo'}</span>
}
function Actions({ item, ...props }: Props & { item: Fleet }) {
  return <span className="project-actions">
    <button className="button-link button-link--edit" disabled={props.busyId !== null} onClick={() => props.onEdit(item.id)}>Visualizar/Editar</button>
    <button className="button-link" disabled={props.busyId !== null} onClick={() => props.onStatus(item)}>{item.status === 'ATIVO' ? 'Desativar' : 'Ativar'}</button>
    <button className="button-link button-link--danger" disabled={props.busyId !== null} onClick={() => props.onDelete(item)}>Excluir</button>
  </span>
}
export function FleetsList(props: Props) {
  return <><div className="projects-table-wrap"><table className="projects-table fleets-table"><thead><tr>
    <th>Frota</th><th>Descrição</th><th>Placa</th><th>Modelo</th><th>Ano</th><th>Status</th><th>Ações</th>
  </tr></thead><tbody>{props.items.map(item => <tr key={item.id}>
    <td><strong className="fleet-code">{item.codigo}</strong></td><td>{item.descricao || '—'}</td><td>{item.placa || '—'}</td><td>{item.modelo || '—'}</td><td>{item.ano ?? '—'}</td><td><Badge item={item} /></td><td><Actions {...props} item={item} /></td>
  </tr>)}</tbody></table></div><div className="projects-mobile-list">{props.items.map(item => <article className="project-card fleet-card" key={item.id}>
    <header><strong className="fleet-code">{item.codigo}</strong><Badge item={item} /></header><p>{item.descricao || 'Sem descrição'}</p>
    <p>Placa: {item.placa || '—'} · Modelo: {item.modelo || '—'} · Ano: {item.ano ?? '—'}</p><Actions {...props} item={item} />
  </article>)}</div></>
}
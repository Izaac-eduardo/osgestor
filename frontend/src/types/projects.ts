export const projectStatuses=['ATIVA','INATIVA']as const
export type ProjectStatus=typeof projectStatuses[number]
export interface Project{id:string;codigo:string;nome:string;descricao:string|null;status:ProjectStatus;data_inicio:string|null;data_fim:string|null;observacoes:string|null;created_at:string;updated_at:string}
export interface ProjectPayload{codigo:string;nome:string;descricao:string|null;status:ProjectStatus;data_inicio:string|null;data_fim:string|null;observacoes:string|null}
export type CreateProjectPayload=ProjectPayload
export type UpdateProjectPayload=ProjectPayload
export interface UpdateProjectStatusPayload{status:ProjectStatus}

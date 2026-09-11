import{api}from'./api';import type{CreateProjectPayload,Project,ProjectStatus,UpdateProjectPayload}from'../types/projects'
export async function getNextProjectCode(){const{data}=await api.get<{codigo:string}>('/obras/proximo-codigo');return data.codigo}
export async function getProjects(){const{data}=await api.get<Project[]>('/obras');return data}
export async function getProjectById(id:string){const{data}=await api.get<Project>(`/obras/${id}`);return data}
export async function createProject(payload:CreateProjectPayload){const{data}=await api.post<Project>('/obras',payload);return data}
export async function updateProject(id:string,payload:UpdateProjectPayload){const{data}=await api.put<Project>(`/obras/${id}`,payload);return data}
export async function updateProjectStatus(id:string,status:ProjectStatus){const{data}=await api.patch<Project>(`/obras/${id}/status`,{status});return data}
export async function deleteProject(id:string){await api.delete(`/obras/${id}`)}

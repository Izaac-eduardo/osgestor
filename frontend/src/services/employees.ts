import{api}from'./api';import type{Employee,EmployeePayload,EmployeeStatus}from'../types/employees'
export async function getEmployees(){const{data}=await api.get<Employee[]>('/funcionarios');return data}
export async function getEmployeeById(id:string){const{data}=await api.get<Employee>(`/funcionarios/${id}`);return data}
export async function createEmployee(payload:EmployeePayload){const{data}=await api.post<Employee>('/funcionarios',payload);return data}
export async function updateEmployee(id:string,payload:EmployeePayload){const{data}=await api.put<Employee>(`/funcionarios/${id}`,payload);return data}
export async function updateEmployeeStatus(id:string,status:EmployeeStatus){const{data}=await api.patch<Employee>(`/funcionarios/${id}/status`,{status});return data}
export async function deleteEmployee(id:string){await api.delete(`/funcionarios/${id}`)}

export const employeeStatuses=['ATIVO','INATIVO']as const
export type EmployeeStatus=typeof employeeStatuses[number]
export interface Employee{id:string;nome:string;matricula:string|null;cargo:string|null;status:EmployeeStatus;created_at:string;updated_at:string}
export interface EmployeePayload{nome:string;matricula:string|null;cargo:string|null;status:EmployeeStatus}
export type CreateEmployeePayload=EmployeePayload
export type UpdateEmployeePayload=EmployeePayload
export interface UpdateEmployeeStatusPayload{status:EmployeeStatus}

import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import test, { after, before } from 'node:test';
import { app } from '../src/app.js';
import { pool } from '../src/config/database.js';
import { hashPassword } from '../src/services/password.service.js';

assert.equal(process.env.DB_NAME, 'oficina_test');
const prefix=`m5713http_${randomUUID().replaceAll('-','').slice(0,8)}`;
const password='Senha HTTP 2026!'; let server:Server; let base=''; const users:{username:string;id:string;role:string;must:boolean}[]=[]; const points:string[]=[];
async function createUser(role:string,must=false){const username=`${prefix}_${role}_${must?'change':'ok'}`;const hash=await hashPassword(password);const row=(await pool.query(`INSERT INTO usuarios(username,email,password_hash,role,status,must_change_password) VALUES($1,$2,$3,$4,'ATIVO',$5) RETURNING id`,[username,`${username}@example.invalid`,hash,role,must])).rows[0] as {id:string};const user={username,id:row.id,role,must};users.push(user);return user;}
async function login(user:{username:string}){const response=await fetch(`${base}/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:user.username,password})});assert.equal(response.status,200);return response.headers.get('set-cookie')!.split(';',1)[0]!;}
async function request(path:string,init:RequestInit={}){return fetch(`${base}${path}`,{...init,headers:{origin:'http://localhost:5173',...(init.headers??{})}});}
before(async()=>{const db=await pool.query<{current_database:string}>('SELECT current_database()');assert.equal(db.rows[0]?.current_database,'oficina_test');await pool.query('DELETE FROM sessoes WHERE usuario_id IN (SELECT id FROM usuarios WHERE username LIKE $1)',['m5713http_%']);await pool.query('DELETE FROM usuarios WHERE username LIKE $1',['m5713http_%']);server=app.listen(0);await new Promise<void>(resolve=>server.once('listening',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('server');base=`http://127.0.0.1:${address.port}`;await createUser('ADMIN');await createUser('OPERADOR');await createUser('GESTOR');await createUser('OPERADOR',true);});

test('abastecimento aplica permissões reais por perfil',async()=>{const visitor=await request('/abastecimento/produtos');assert.equal(visitor.status,401);const gestorCookie=await login(users[2]!);const gestor=await request('/abastecimento/pontos',{method:'POST',headers:{cookie:gestorCookie,'content-type':'application/json'},body:JSON.stringify({codigo:`${prefix}g`,nome:'gestor',tipo:'POSTO'})});assert.equal(gestor.status,403);const operatorCookie=await login(users[1]!);const operator=await request('/abastecimento/pontos',{method:'POST',headers:{cookie:operatorCookie,'content-type':'application/json'},body:JSON.stringify({codigo:`${prefix}o`,nome:'operador',tipo:'POSTO'})});assert.equal(operator.status,201);points.push((await operator.json()).id);});
test('sessão revogada e troca obrigatória bloqueiam mutações',async()=>{const cookie=await login(users[1]!);const logout=await request('/auth/logout',{method:'POST',headers:{cookie}});assert.equal(logout.status,204);const revoked=await request('/abastecimento/pontos',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({codigo:`${prefix}r`,nome:'revogado',tipo:'POSTO'})});assert.equal(revoked.status,401);const mustCookie=await login(users[3]!);const blocked=await request('/abastecimento/pontos',{method:'POST',headers:{cookie:mustCookie,'content-type':'application/json'},body:JSON.stringify({codigo:`${prefix}m`,nome:'troca',tipo:'POSTO'})});assert.equal(blocked.status,403);});

after(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));if(points.length)await pool.query('DELETE FROM abastecimento_pontos WHERE id=ANY($1::uuid[])',[points]);if(users.length){const ids=users.map(user=>user.id);await pool.query('DELETE FROM sessoes WHERE usuario_id=ANY($1::uuid[])',[ids]);await pool.query('DELETE FROM usuarios WHERE id=ANY($1::uuid[])',[ids]);}await pool.end();});

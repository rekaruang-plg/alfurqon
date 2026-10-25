import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../app/chatgpt-auth';
import {digest} from './password';
export const authDB=()=>env.DB!;
export async function record(key:string){const r:any=await authDB().prepare('SELECT * FROM records WHERE id=?').bind(key).first();return r?{...JSON.parse(r.data),id:r.id,version:r.version}:null;}
export async function records(kind:string){return (await authDB().prepare('SELECT * FROM records WHERE kind=?').bind(kind).all()).results.map((r:any)=>({...JSON.parse(r.data),id:r.id,version:r.version}));}
export async function writeRecord(key:string,kind:string,data:any){await authDB().prepare('INSERT INTO records(id,kind,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=records.version+1').bind(key,kind,JSON.stringify(data)).run();}
export function sessionToken(req:Request){return (req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('cbt_session='))?.slice(12);}
export async function staffActor(req:Request){const token=sessionToken(req);if(token){const session=await record('session-'+await digest(token));if(session&&session.expires>Date.now()){const credential=await record(session.credentialId),staff=await record(session.staffId);if(credential&&staff&&!staff.disabled&&credential.revision===session.revision)return {staff,user:{id:staff.id,email:staff.email,displayName:staff.name},authMethod:'password'};}}
const user=await getChatGPTUser();if(!user)throw Error('Silakan masuk dengan akun pengelola.');const staff=(await records('staff')).find((s:any)=>s.email.toLowerCase()===user.email.toLowerCase());if(staff?.disabled)throw Error('Akun dinonaktifkan.');return {user,staff,authMethod:'chatgpt'};}

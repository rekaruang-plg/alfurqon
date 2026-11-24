import {record,records,writeRecord,authDB} from './staff-auth';
import {passwordHash,randomSecret} from './password';
import {sealToken,openToken} from './token-vault';
import {env} from './production-db';
export function standardPassword(identifier:unknown=''){const draw=(alphabet:string)=>{const limit=256-256%alphabet.length;let n;do{n=crypto.getRandomValues(new Uint8Array(1))[0];}while(n>=limit);return alphabet[n%alphabet.length];};let digits=String(identifier||'').replace(/[^0-9]/g,'').slice(-5);while(digits.length<5)digits+=draw('0123456789');return digits+Array.from({length:3},()=>draw('abcdefghijklmnopqrstuvwxyz')).join('');}
export async function generatedAccount(person:any,student=false,demo=false,reset=false){
const principal=student?'student-login-'+(demo?'demo-':'')+person.id:person.id;
const existing=(await records('credential')).find((x:any)=>x.staffId===principal);
let base=(student?`${demo?'demo.':''}${person.nis}`:((demo?'demo.':'')+(person.niy||(person.role&&person.role!=='Guru'?String(person.email||'admin').split('@')[0]:`${person.unit}.${person.contractNo||'001'}K`)))).toLowerCase().normalize('NFKD').replace(/[^a-z0-9._-]/g,'').slice(0,48);if(!base)base='akun';
if(existing&&!reset){
 const vault=await record('account-vault-'+principal);
 const password=vault?await openToken(vault,principal,await env.TOKEN_VAULT_KEY):null;
 if(student)await writeRecord(principal,'student_identity',{name:person.name,email:existing.username+'@student.invalid',role:'Siswa',unit:person.unit,studentId:person.id,demo});
 return {username:existing.username,password};
}
const rename=existing&&student&&reset&&existing.username!==base;
let username=rename?base:existing?.username||base;
let n=1;
while(!existing&&await record('credential-'+username))username=base+'.'+n++;
const occupied=rename?await record('credential-'+username):null;
if(occupied&&occupied.staffId!==principal)throw Error('Nomor induk / username sudah digunakan akun lain.');
const password=standardPassword(student?person.nis:person.niy),salt=randomSecret();
const vault=await sealToken(password,principal,await env.TOKEN_VAULT_KEY);
const credential={staffId:principal,username,salt,hash:await passwordHash(password,salt),revision:randomSecret()};
const db=authDB();
const upsert=(key:string,kind:string,value:unknown)=>db.prepare(
 'INSERT INTO records(id,kind,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=records.version+1'
).bind(key,kind,JSON.stringify(value));
const writes=[
 (existing&&!rename||occupied)?upsert('credential-'+username,'credential',credential):
   db.prepare('INSERT INTO records(id,kind,data) VALUES(?,?,?)').bind('credential-'+username,'credential',JSON.stringify(credential)),
 upsert('account-vault-'+principal,'account_vault',vault),
];
if(student)writes.push(upsert(principal,'student_identity',{name:person.name,email:username+'@student.invalid',role:'Siswa',unit:person.unit,studentId:person.id,demo}));
if(rename)writes.push(db.prepare('DELETE FROM records WHERE id=?').bind('credential-'+existing.username));
await db.batch(writes);
return {username,password};
}

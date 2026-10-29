import {record,records,writeRecord,authDB} from './staff-auth';
import {passwordHash,randomSecret} from './password';
import {sealToken,openToken} from './token-vault';
import {env} from 'cloudflare:workers';
export async function generatedAccount(person:any,student=false,demo=false,reset=false){
const principal=student?'student-login-'+(demo?'demo-':'')+person.id:person.id;
const existing=(await records('credential')).find((x:any)=>x.staffId===principal);
let base=(student?`${demo?'demo.':''}${person.unit}.${person.nis}`:((demo?'demo.':'')+(person.niy||`${person.unit}.${person.contractNo||'001'}K`))).toLowerCase().normalize('NFKD').replace(/[^a-z0-9._-]/g,'').slice(0,48);if(base.length<3)base='akun';
if(existing&&!student&&existing.username!==base){const occupied=await record('credential-'+base);if(occupied&&occupied.staffId!==principal)throw Error('NIY / username guru sudah digunakan.');await writeRecord('credential-'+base,'credential',{...existing,username:base,revision:randomSecret()});await authDB().prepare('DELETE FROM records WHERE id=?').bind('credential-'+existing.username).run();existing.username=base;}
if(existing&&!reset){if(student)await writeRecord(principal,'student_identity',{name:person.name,email:existing.username+'@student.invalid',role:'Siswa',unit:person.unit,studentId:person.id,demo});const vault=await record('account-vault-'+principal);return {username:existing.username,password:vault?await openToken(vault,principal,env.TOKEN_VAULT_KEY):null};}
let username=existing?.username||base;let n=1;while(!existing&&await record('credential-'+username))username=base+'.'+n++;
const password=randomSecret().slice(0,12),salt=randomSecret();
if(student)await writeRecord(principal,'student_identity',{name:person.name,email:username+'@student.invalid',role:'Siswa',unit:person.unit,studentId:person.id,demo});
const credential={staffId:principal,username,salt,hash:await passwordHash(password,salt),revision:randomSecret()};
if(existing)await writeRecord('credential-'+username,'credential',credential);else await authDB().prepare('INSERT INTO records(id,kind,data) VALUES(?,?,?)').bind('credential-'+username,'credential',JSON.stringify(credential)).run();
await writeRecord('account-vault-'+principal,'account_vault',await sealToken(password,principal,env.TOKEN_VAULT_KEY));
return {username,password};
}

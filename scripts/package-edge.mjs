// Package the existing CBT handlers for Deno; no service keys in build output.
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
const seen=new Map();
const splitAttemptQuestions=process.argv.includes('--split-attempt-questions');
const sharedAttemptQuestions=process.argv.includes('--share-attempt-questions');
function visit(file){
 const name=file.replace(/\.ts$/,'.js');if(seen.has(name)) return name;
 let src=fs.readFileSync(file,'utf8');
 if(file==='app/chatgpt-auth.ts')src='export async function getChatGPTUser(){return null;}';
 if(file==='lib/production-db.ts'){
   src="import driver from 'npm:postgres@3.4.7';\n"+src.replace("require('postgres')","driver")
     .replaceAll('process.env.DATABASE_URL',"(Deno.env.get('CBT_POOLER_URL') || Deno.env.get('SUPABASE_DB_URL'))")
     .replace('max: 2, prepare: false, idle_timeout: 20','max: 1, prepare: false, idle_timeout: 10')
     .replace(/ssl: process\.env\.DATABASE_CA_CERT.*?'verify-full'/,"")
     .replace('let pool:',"let vault:Promise<string>|undefined;function loadVault(){return vault??=(async()=>{const [row]=await connection().unsafe(\"select value from cbt.runtime_secrets where name='token-vault'\");if(!/^[a-f0-9]{64}$/.test(row?.value??''))throw Error('Vault unavailable');return row.value;})().catch(error=>{vault=undefined;throw error;});}\nlet pool:")
     .replace('return process.env.TOKEN_VAULT_KEY','return loadVault()')
     .replace("process.env.CBT_TEACHER_EXAM_MODE==='1'","true")
     .replace("process.env.CBT_SPLIT_ATTEMPT_QUESTIONS==='1'","(Deno.env.get('CBT_SPLIT_ATTEMPT_QUESTIONS') ?? '"+(splitAttemptQuestions?'1':'0')+"')==='1'")
     .replace("process.env.CBT_SHARED_ATTEMPT_QUESTIONS==='1'","(Deno.env.get('CBT_SHARED_ATTEMPT_QUESTIONS') ?? '"+(sharedAttemptQuestions?'1':'0')+"')==='1'")
     .replace(/process\.env\.(WORD_CONVERTER_\w+)/g,"Deno.env.get('$1')");
 }
 src=src.replace(/process\.env\.VERCEL/g,"'1'");
 let output=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 seen.set(name,'');
 output=output.replace(/from (['"])(\.[^'"]+)\1/g,(_,q,rel)=>{
  const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(file),rel));
  const dep=visit(resolved.endsWith('.ts')?resolved:resolved+'.ts');let to=path.posix.relative(path.posix.dirname(name),dep);
  return 'from '+q+(to.startsWith('.')?to:'./'+to)+q;
 });
 seen.set(name,output);return name;
}
visit('supabase/functions/cbt-api/index.js');
fs.writeFileSync(process.argv[2],JSON.stringify([...seen].map(([name,content])=>({name,content}))));

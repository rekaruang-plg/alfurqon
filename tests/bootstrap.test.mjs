import {DatabaseSync} from 'node:sqlite';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pbkdf2Sync} from 'node:crypto';
import assert from 'node:assert/strict';
const temp=mkdtempSync(join(tmpdir(),'cbt-bootstrap-')),output=join(temp,'bootstrap.sql');
try{
 const env={...process.env,CBT_ADMIN_USERNAME:'qa.admin',CBT_ADMIN_PASSWORD:'Synthetic-only-test-2026',CBT_ADMIN_EMAIL:"admin'qa@example.test",CBT_BOOTSTRAP_OUTPUT:output};
 const r=spawnSync(process.execPath,['scripts/bootstrap-admin.mjs'],{env,encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 const sql=readFileSync(output,'utf8');assert(!sql.includes(env.CBT_ADMIN_PASSWORD));
 const db=new DatabaseSync(':memory:');const schema=readFileSync('database/schema.sql','utf8');db.exec(schema);db.exec(schema);db.exec(sql);
 const credential=JSON.parse(db.prepare("SELECT data FROM records WHERE kind='credential'").get().data);
 assert.equal(credential.hash,pbkdf2Sync(env.CBT_ADMIN_PASSWORD,credential.salt,100000,32,'sha256').toString('hex'));
 assert.equal(JSON.parse(db.prepare("SELECT data FROM records WHERE kind='staff'").get().data).role,'Super Admin');
 assert.throws(()=>db.exec(sql));assert.equal(db.prepare('SELECT COUNT(*) n FROM records').get().n,3);
 console.log('PASS schema, bootstrap login hash, SQL escaping, repeat protection and no plaintext password.');
}finally{rmSync(temp,{recursive:true,force:true})}

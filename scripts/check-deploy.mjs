import {readFileSync} from 'node:fs';
for(const file of ['wrangler.json','dist/server/wrangler.json']){
 const config=JSON.parse(readFileSync(file,'utf8'));
 const db=config.d1_databases?.find(d=>d.binding==='DB');
 if(!db?.database_id||db.database_id==='00000000-0000-4000-8000-000000000000')throw Error('Isi database_id D1 pada wrangler.json, lalu build ulang sebelum deploy.');
}
console.log('Konfigurasi D1 siap. Pastikan TOKEN_VAULT_KEY telah dipasang sebagai secret Worker.');

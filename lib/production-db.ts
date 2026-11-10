// Node runtime only. Never connect or require deployment secrets while building.
interface Client { unsafe(sql:string,values?:unknown[]):Promise<Record<string,unknown>[] & {count:number}> }
interface Pool { begin<T>(mode:string,work:(client:Client)=>Promise<T>):Promise<T> }
const postgres: (url:string, options:Record<string,unknown>)=>Pool = require('postgres');

let pool: ReturnType<typeof postgres> | undefined;
function connection() {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('Database production belum dikonfigurasi.');
    pool = postgres(url, { max: 2, prepare: false, idle_timeout: 20, connect_timeout: 10, ssl: process.env.DATABASE_CA_CERT?{ca:process.env.DATABASE_CA_CERT.replace(/\\n/g,'\n'),rejectUnauthorized:true}:'verify-full' });
  }
  return pool;
}

function postgresQuery(source: string) {
  let q=source;
  if (/^INSERT OR IGNORE INTO /.test(q)) q=q.replace('INSERT OR IGNORE','INSERT')+' ON CONFLICT DO NOTHING';
  q=q.replace("json_extract(data,?)","(data::jsonb ->> substring(?::text from 3))")
    .replace("json_array_length(data,'$.questions')","jsonb_array_length(data::jsonb -> 'questions')")
    .replace("(SELECT json_group_array(json_extract(value,'$.id')) FROM json_each(other.data,'$.questions'))=?","(SELECT jsonb_agg(item->'id' ORDER BY ord) FROM jsonb_array_elements(other.data::jsonb->'questions') WITH ORDINALITY AS items(item,ord))=?::jsonb")
    .replace(/json_extract\(((?:other\.)?data),'\$\.(questionOrder|questions)'\)/g,"($1::jsonb ->> '$2')")
    .replace("json_set(data,'$.published',json('true'),'$.publishedAt',?)","(data::jsonb || jsonb_build_object('published',true,'publishedAt',?::bigint))::text");
  let index=0;
  return q.replace(/\?/g,()=>'$'+(++index));
}

class Statement {
  constructor(readonly query:string, readonly params:unknown[]=[]) {}
  bind(...params:unknown[]){return new Statement(this.query,params);}
  async run(){return (await execute([this]))[0];}
  async all(){return this.run();}
  async first(){return (await this.run()).results[0]??null;}
}
async function execute(statements: Statement[]) {
  const writes=statements.some(s=>!/^SELECT\b/i.test(s.query));
  for(let attempt=0;;attempt++){
    try {
      return await connection().begin(writes?'isolation level serializable':'read only',async tx=>{
        await tx.unsafe('SET LOCAL search_path = pg_catalog, cbt');
        const result=[];
        for(const s of statements){
          const rows=await tx.unsafe(postgresQuery(s.query),s.params as any[]);
          result.push({results:Array.from(rows) as any[],meta:{changes:rows.count}});
        }
        return result;
      });
    }catch(e:any){
      if(writes&&['40001','40P01'].includes(e.code)&&attempt<4)continue;
      if(!process.env.DATABASE_URL)throw new Error('Database production belum dikonfigurasi.');
      console.error('CBT database operation failed',{code:String(e.code||'connection')});
      throw new Error('Operasi database gagal. Muat ulang dan coba kembali.');
    }
  }
}
export const env={
  DB:{prepare:(sql:string)=>new Statement(sql),batch:execute},
  get TOKEN_VAULT_KEY(){return process.env.TOKEN_VAULT_KEY},
  get WORD_CONVERTER_URL(){return process.env.WORD_CONVERTER_URL},
  get WORD_CONVERTER_TOKEN(){return process.env.WORD_CONVERTER_TOKEN}
};

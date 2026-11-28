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
  q=q.replace(/json_remove\(data,('\$\.[a-zA-Z]+'(?:,'\$\.[a-zA-Z]+')*)\)/g,(_match,paths:string)=>
    "(data::jsonb - ARRAY["+paths.replaceAll("$.","")+"])::text")
    .replace(/json_extract\(data,'\$\.(status|unit|year|semester|start|end|ownerId|createdBy|simulation|className|at|graded|published|correctedAt|deadline|pausedAt|securityLocked|pauseUntil|submittedAt|resumeFor|answeredCount|answeredCountVersion)'\)/g,"(data::jsonb ->> '$1')")
    .replace(" IN (1,'true')"," = 'true'")
    .replace(/json_extract\(records\.data,'\$\.(end|topic|title|subject|deletedAt)'\)/g,"(records.data::jsonb ->> '$1')")
    .replace("json_extract(data,'$.form.title')","(data::jsonb #>> '{form,title}')")
    .replace("json_each(records.data,'$.studentIds')","jsonb_array_elements_text(CASE WHEN jsonb_typeof(records.data::jsonb->'studentIds')='array' THEN records.data::jsonb->'studentIds' ELSE '[]'::jsonb END) AS enrollment(value)")
    .replace("(SELECT json_group_array(json_object('id',json_extract(value,'$.id'),'sourceId',json_extract(value,'$.sourceId'),'type',json_extract(value,'$.type'),'scope',json_extract(value,'$.scope'))) FROM json_each(records.data,'$.questions'))","(SELECT jsonb_agg(jsonb_build_object('id',q->'id','sourceId',q->'sourceId','type',q->'type','scope',q->'scope'))::text FROM jsonb_array_elements(NULLIF(records.data::jsonb->'questions','null'::jsonb)) AS items(q))")
    .replace("(SELECT json_group_array(json_extract(value,'$.id')) FROM json_each(question_snapshot.data,'$.questions'))","(SELECT jsonb_agg(q->'id' ORDER BY ord)::text FROM jsonb_array_elements(NULLIF(question_snapshot.data::jsonb->'questions','null'::jsonb)) WITH ORDINALITY AS items(q,ord))")
    .replace(/\(SELECT json_group_array\(json_object\((.*?)\)\) FROM json_each\((score_bank\.data,'\$\.questions'|COALESCE\(NULLIF\(score_attempt\.question_data,'null'\),json_extract\(score_attempt\.data,'\$\.questions'\)\))\)\)/g,(_match,fields:string,source:string)=>{
      const questions=source.startsWith('score_bank')
        ?"NULLIF(score_bank.data::jsonb->'questions','null'::jsonb)"
        :"COALESCE(NULLIF(score_attempt.question_data::jsonb,'null'::jsonb),NULLIF(score_attempt.data::jsonb->'questions','null'::jsonb))";
      const projection=fields.replace(/json_extract\(value,'\$\.([a-zA-Z]+)'\)/g,"q->'$1'");
      return "(SELECT jsonb_agg(jsonb_build_object("+projection+"))::text FROM jsonb_array_elements("+questions+") AS items(q))";
    })
    .replace(/json_extract\(data,'\$\.(answers|grades)'\)(?= AS scoring_)/g,"(data::jsonb ->> '$1')")
    .replace(/json_extract\(((?:student_base|roster_student)\.data),'\$\.([a-zA-Z][a-zA-Z0-9]*)'\)/g,"($1::jsonb ->> '$2')")
    .replace("(SELECT count(*) FROM json_each(attempts.data,'$.answers') WHERE value<>'')","(SELECT count(*) FROM jsonb_each_text(NULLIF(attempts.data::jsonb->'answers','null'::jsonb)) WHERE value<>'')")
    .replace("(SELECT json_group_array(key) FROM json_each(attempts.data,'$.answers') WHERE value<>'')","(SELECT jsonb_agg(key)::text FROM jsonb_each_text(NULLIF(attempts.data::jsonb->'answers','null'::jsonb)) WHERE value<>'')")
    .replace("json_extract(data,?)","(data::jsonb ->> substring(?::text from 3))")
    .replace("json_array_length(json_extract(data,'$.questionOrder'))","jsonb_array_length(NULLIF((data::jsonb ->> 'questionOrder')::jsonb,'null'::jsonb))")
    .replace("json_array_length(data,'$.questions')","jsonb_array_length(data::jsonb -> 'questions')")
    .replace("(SELECT json_group_array(json_extract(value,'$.id')) FROM json_each(other.data,'$.questions'))=?","(SELECT jsonb_agg(item->'id' ORDER BY ord) FROM jsonb_array_elements(other.data::jsonb->'questions') WITH ORDINALITY AS items(item,ord))=?::jsonb")
    .replace(/json_extract\(((?:other\.)?data),'\$\.(questionOrder|questions)'\)/g,"($1::jsonb ->> '$2')")
    .replace("(SELECT json_group_array(json_extract(value,'$.id')) FROM json_each(attempts.data,'$.questions'))","(SELECT jsonb_agg(q->'id')::text FROM jsonb_array_elements(NULLIF(attempts.data::jsonb->'questions','null'::jsonb)) AS items(q))")
    // Bind serialized JSON as text so Postgres.js does not JSON-encode it again.
    .replace("json_patch(json_set(data,'$.answers',json_patch(COALESCE(json_extract(data,'$.answers'),'{}'),json(?)),'$.lastSavedAt',?,'$.lastSeenAt',?),json(?))","(jsonb_set(data::jsonb,'{answers}',COALESCE(NULLIF(data::jsonb->'answers','null'::jsonb),'{}'::jsonb) || ?::text::jsonb) || jsonb_build_object('lastSavedAt',?::bigint,'lastSeenAt',?::bigint) || ?::text::jsonb)::text")
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
  get SPLIT_ATTEMPT_QUESTIONS(){return process.env.CBT_SPLIT_ATTEMPT_QUESTIONS==='1';},
  get SHARED_ATTEMPT_QUESTIONS(){return process.env.CBT_SHARED_ATTEMPT_QUESTIONS==='1';},
  get TEACHER_EXAM_MODE(){return process.env.CBT_TEACHER_EXAM_MODE==='1';},
  get WORD_CONVERTER_URL(){return process.env.WORD_CONVERTER_URL},
  get WORD_CONVERTER_TOKEN(){return process.env.WORD_CONVERTER_TOKEN}
};

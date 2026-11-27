import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {DatabaseSync} from 'node:sqlite';
const sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync('database/schema.sql','utf8'));
let queryReads=[];
function statement(query,values=[]){return {bind(...args){return statement(query,args)},async first(){return sql.prepare(query).get(...values)||null},async all(){queryReads.push({query,values});return {results:sql.prepare(query).all(...values)}},async run(){const r=sql.prepare(query).run(...values);return {meta:{changes:r.changes}}}}}
const DB={prepare:statement,async batch(items){sql.exec('BEGIN');try{const r=[];for(const item of items)r.push(await item.run());sql.exec('COMMIT');return r}catch(e){sql.exec('ROLLBACK');throw e}}};
let user={userId:'owner',email:'qa@example.test',displayName:'QA Admin',fullName:null};
function evaluate(source,vars){const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const box={exports:{},crypto,Response,Request,URL,TextEncoder,TextDecoder,Date,console,...vars};vm.runInNewContext(js,box);return box.exports}
const strip=s=>s.replace(/^import .*;\n/gm,'');
// Postgres.js chooses a serializer from the inferred parameter type. The answer
// and flag payloads are already JSON strings and must bind as text.
const {postgresQuery}=evaluate(fs.readFileSync('lib/production-db.ts','utf8')+'\nexport {postgresQuery};',{require:()=>null});
const compactSaveSQL="UPDATE attempts SET data=json_patch(json_set(data,'$.answers',json_patch(COALESCE(json_extract(data,'$.answers'),'{}'),json(?)),'$.lastSavedAt',?,'$.lastSeenAt',?),json(?)),version=version+1 WHERE id=? AND version=?";
assert.match(postgresQuery(compactSaveSQL),/\|\| \$1::text::jsonb.*\|\| \$4::text::jsonb/);
assert.match(postgresQuery("SELECT (SELECT json_group_array(json_extract(value,'$.id')) FROM json_each(question_snapshot.data,'$.questions')) AS question_ids FROM records AS question_snapshot WHERE id=?"),/jsonb_agg\(q->'id' ORDER BY ord\).*WITH ORDINALITY/);
const policy=evaluate(strip(fs.readFileSync('lib/review-policy.ts','utf8')),{});
const examMode=evaluate(fs.readFileSync('lib/teacher-exam-mode.ts','utf8'),{});
let teacherModeEnabled=false;
const splitAttemptQuestions=process.env.CBT_TEST_SPLIT_ATTEMPT_QUESTIONS!=='0';
const settings=evaluate(fs.readFileSync('lib/question-settings.ts','utf8'),{});
const sdProfiles=evaluate(strip(fs.readFileSync('lib/sd-subject-profiles.ts','utf8')),settings);
const model=evaluate(strip(fs.readFileSync('lib/model.ts','utf8')),policy);
const source=fs.readFileSync('app/api/cbt/route.ts','utf8').replace(/^import .*;\n/gm,'');
const simulation=evaluate(fs.readFileSync('lib/simulations.ts','utf8').replace(/^import .*;\n/gm,''),{});
const vault=evaluate(fs.readFileSync('lib/token-vault.ts','utf8'),{});
const pw=evaluate(fs.readFileSync('lib/password.ts','utf8'),{});
const record=async key=>{const r=sql.prepare('SELECT * FROM records WHERE id=?').get(key);return r?{...JSON.parse(r.data),id:r.id}:null};
const records=async kind=>sql.prepare('SELECT * FROM records WHERE kind=?').all(kind).map(r=>({...JSON.parse(r.data),id:r.id}));
const writeRecord=async(key,kind,data)=>sql.prepare('INSERT INTO records(id,kind,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=records.version+1').run(key,kind,JSON.stringify(data));
const generated=evaluate(strip(fs.readFileSync('lib/generated-account.ts','utf8')),{record,records,writeRecord,authDB:()=>DB,...pw,...vault,env:{get TOKEN_VAULT_KEY(){return Promise.resolve('ab'.repeat(32));}}});
const authlib=evaluate(strip(fs.readFileSync('lib/staff-auth.ts','utf8')),{env:{DB},getChatGPTUser:async()=>null,...pw});
const {sameOrigin}=evaluate(fs.readFileSync('lib/request-origin.ts','utf8'),{process});
const authRoutes=evaluate(strip(fs.readFileSync('app/api/auth/route.ts','utf8')),{sameOrigin,...authlib,...pw,...model,standardPassword:generated.standardPassword});
let cookie='';
const routes=evaluate(source,{sameOrigin,env:{DB,TOKEN_VAULT_KEY:'ab'.repeat(32),SPLIT_ATTEMPT_QUESTIONS:splitAttemptQuestions,get TEACHER_EXAM_MODE(){return teacherModeEnabled;}},...examMode,actor:async req=>{if(req?.headers.get('cookie'))return authlib.staffActor(req);if(!user)throw Error('Login diperlukan');const staff=sql.prepare("SELECT * FROM records WHERE kind IN ('staff','student_identity')").all().map(r=>({...JSON.parse(r.data),id:r.id,version:r.version})).find(s=>s.email===user.email);if(staff?.disabled)throw Error('Akun nonaktif');return {user,staff,authMethod:'chatgpt'}},authRecords:async kind=>sql.prepare('SELECT * FROM records WHERE kind=?').all(kind).map(r=>({...JSON.parse(r.data),id:r.id})),...sdProfiles,...settings,...model,...simulation,...vault,...policy,...generated});
async function call(action,body={},expected=200){const r=await routes.POST(new Request('https://cbt.test/api/cbt',{method:'POST',headers:{'Content-Type':'application/json','origin':'https://cbt.test',cookie},body:JSON.stringify({action,identityConfirmed:true,session:'11111111-1111-4111-a111-111111111111',...body})}));const d=await r.json();assert.equal(r.status,expected,JSON.stringify(d));return d}
async function seedYearSubjects(year){for(const unit of ['SD','SMP','SMA'])for(const name of simulation.subjectCatalog[unit]||[])await call('saveSubject',{period:{year,semester:1},data:{name,unit,grades:unit==='SD'?['5','6']:['1','2','3']}});}
async function state(period){const r=await routes.GET(new Request('https://cbt.test/api/cbt'+(period?'?year='+encodeURIComponent(period.year)+'&semester='+period.semester:''),{headers:{cookie}}));return r.json()}
assert.equal((await state()).needsSetup,true);await call('setup');await call('setup',{},400);
let data=await state();assert.equal(data.students.length,4);const exam=data.exams[0],bank=data.banks[0];
const imageFixture='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPgkAAAAASUVORK5CYII=';
if(splitAttemptQuestions){
 bank.questions[0].images=[imageFixture];
 await writeRecord(bank.id,'bank',bank);
}
const issued=(await call('generate',{examId:exam.id})).issued;assert.equal(issued.length,4);assert.equal((await call('generate',{examId:exam.id})).issued.length,0);
const token=issued[0].token;let a=await call('enter',{token});assert.equal(a.questions.length,4);assert(a.questions.every(q=>!('key' in q)));const order=a.questions.map(q=>q.id).join();const deadline=a.deadline;
const getAttemptStorage=id=>sql.prepare('SELECT data,question_data FROM attempts WHERE id=?').get(id);
const startedStorage=getAttemptStorage(a.id);
if(splitAttemptQuestions){
 assert(!('questions' in JSON.parse(startedStorage.data)));
 assert(JSON.parse(startedStorage.question_data).some(q=>q.images?.includes(imageFixture)));
}
for(const q of bank.questions)await call('answer',{token,questionId:q.id,value:q.type==='PG'?q.key:'48 cm²',flags:[]});
assert.equal(getAttemptStorage(a.id).question_data,startedStorage.question_data);
a=await call('enter',{token});assert.equal(a.questions.map(q=>q.id).join(),order);assert.equal(a.deadline,deadline);assert.equal(Object.keys(a.answers).length,4);assert.equal(a.score,null);
await call('submit',{token},400);sql.prepare("UPDATE attempts SET data=json_set(data,'$.submitAfter',0) WHERE id=?").run(a.id);const submitted=await call('submit',{token,compact:true});assert.equal(submitted.compact,true);assert.equal(submitted.id,a.id);assert.equal(submitted.status,'Dikumpulkan');assert(!('questions' in submitted)&&!('answers' in submitted));assert.equal((await call('submit',{token,compact:true})).status,'Dikumpulkan');data=await state();let result=data.attempts.find(r=>r.id===a.id);assert.equal(result.status,'Dikumpulkan');await call('publish',{id:a.id},400);
const grades=Object.fromEntries(result.questions.map(q=>[q.id,q.points]));await call('grade',{id:a.id,grades:{...grades,extra:9999},feedback:'Bagus'});await call('publish',{id:a.id});assert.equal((await call('enter',{token})).score,100);await call('grade',{id:a.id,grades},400);
await call('saveStaff',{data:{email:'teacher@example.test',name:'Guru',role:'Guru',unit:'SD',subject:'Matematika',permission:'Koreksi saja'}});
user={...user,email:'teacher@example.test'};await call('saveBank',{data:bank},400);await call('generate',{examId:exam.id},400);
user={...user,email:'qa@example.test'};await call('saveStaff',{data:{email:'admin@example.test',name:'Admin SMP',role:'Admin Unit',unit:'SMP',permission:'Full akses'}});
user={...user,email:'admin@example.test'};await call('saveStudent',{data:{name:'X',nis:'X',unit:'SD',className:'6A'}},400);
let own=(await state()).staff;await call('saveStudent',{data:{id:own.id,version:own.version,name:'X',nis:'X',unit:'SMP',className:'7A',role:'Super Admin'}},400);
user={...user,email:'qa@example.test'};
await call('saveExam',{data:{title:'Bentrok',unit:'SD',className:'6A',bankId:bank.id,duration:60,start:exam.start,end:exam.end}},400);
const csrf=await routes.POST(new Request('https://cbt.test/api/cbt',{method:'POST',headers:{origin:'https://other.test'},body:'{"action":"setup"}'}));assert.equal(csrf.status,400);
// New revision: master subjects, checkbox grading and repeatable token retrieval.
assert.equal(data.subjects.length,35);
assert.equal((await state()).banks.filter(b=>b.simulation).length,32);
await call('prepareUpdate');await call('prepareUpdate');assert.equal((await state()).banks.filter(b=>b.simulation).length,32);
await call('saveSubject',{data:{name:'Seni Budaya',unit:'SD',grades:['5','6']}});await call('saveSubject',{data:{name:'seni budaya',unit:'SD',grades:['5','6']}});
await call('saveBank',{data:{title:'Invalid',unit:'SD',subject:'Tidak terdaftar',questions:bank.questions}},400);
await call('saveStaff',{data:{email:'invalid@example.test',name:'X',role:'Guru',unit:'SD',subject:'Tidak terdaftar'}},400);
const tokens=(await call('listTokens',{examId:exam.id})).issued;assert.equal(tokens[0].token,token);assert.equal((await call('listTokens',{examId:exam.id})).issued[0].token,token);
assert(!JSON.stringify(await state()).includes(token));assert(!sql.prepare("SELECT data FROM records WHERE kind='token_vault'").all().some(r=>r.data.includes(token)));
const oldToken=issued[1].token;const resumed=await call('enter',{token:oldToken});await call('answer',{token:oldToken,questionId:resumed.questions[0].id,value:'0',flags:[]});
const replacement=(await call('reissue',{id:resumed.id})).issued[0].token;assert.equal((await call('heartbeat',{token:oldToken})).id,resumed.id);await call('heartbeat',{token:oldToken,session:'99999999-9999-4999-a999-999999999999'},400);const recovered=await call('enter',{token:replacement});assert.equal(recovered.deadline,resumed.deadline);assert.equal(recovered.answers[resumed.questions[0].id],'0');assert((await call('listTokens',{examId:exam.id})).issued.some(x=>x.token===replacement));
const legacyRow=sql.prepare('SELECT id FROM attempts WHERE student_id=?').get(data.students[2].id);sql.prepare('DELETE FROM records WHERE id=?').run('vault-'+legacyRow.id);assert((await call('listTokens',{examId:exam.id})).issued.some(x=>x.id===legacyRow.id&&x.legacy&&x.token===null));
user={userId:'t',email:'teacher@example.test',displayName:'Guru'};await call('listTokens',{examId:exam.id},400);await call('startSimulation',{bankId:(await state()).banks.find(b=>b.simulation).id});
user={userId:'a',email:'admin@example.test',displayName:'Admin SMP'};await call('listTokens',{examId:exam.id},400);await call('saveSubject',{data:{name:'Seni',unit:'SD'}},400);
user={userId:'owner',email:'qa@example.test',displayName:'QA Admin'};
const pgk={id:'cx',type:'PG_KOMPLEKS',text:'Pilih semua',options:['A','B','C'],key:'0,1,2',points:30,mode:'TEKS'};
assert.equal(model.mark([pgk],{cx:'2,0,1'}).cx,30);assert.equal(model.mark([pgk],{cx:'0,1'}).cx,0);assert.equal(model.mark([pgk],{cx:'0,1,2,3'}).cx,0);assert.equal(model.mark([pgk],{cx:''}).cx,0);
assert.equal(model.toggleChoice('0,1',2),'0,1,2');assert.equal(model.toggleChoice('0,1,2',1),'0,2');
await call('saveBank',{data:{title:'Checkbox',unit:'SD',subject:'Matematika',questions:[pgk]}});
await call('saveBank',{data:{title:'Invalid checkbox',unit:'SD',subject:'Matematika',questions:[{...pgk,key:''}]}},400);
for(const unit of ['SD','SMP','SMA']){const sim=(await state()).banks.find(b=>b.simulation&&b.unit===unit&&b.subject==='Matematika');const first=await call('startSimulation',{bankId:sim.id});const second=await call('startSimulation',{bankId:sim.id});assert.notEqual(first.examId,second.examId);const started=await call('enter',{token:first.token});const check=started.questions.find(q=>q.type==='PG_KOMPLEKS');assert(check);await call('answer',{token:first.token,questionId:check.id,value:'0,1,3',flags:[]});assert.equal((await call('enter',{token:first.token})).answers[check.id],'0,1,3');}
// Confirm-before-start and concurrency/session enforcement.
const t3=issued[3].token;const before=await call('preview',{token:t3});assert.equal(before.status,'Belum mulai');assert(!before.questions);assert(!before.deadline);
const fresh=await call('enter',{token:t3});await call('enter',{token:t3,session:'22222222-2222-4222-a222-222222222222'},400);
assert(!JSON.stringify(await state()).includes('sessionHash'));
await call('extraTime',{id:fresh.id,minutes:10,reason:'Gangguan listrik'});assert.equal((await call('heartbeat',{token:t3})).deadline,fresh.deadline+600000);
await call('releaseSession',{id:fresh.id,reason:'Pindah komputer'});await call('answer',{token:t3,questionId:fresh.questions[0].id,value:'0'},400);
await call('enter',{token:t3,session:'22222222-2222-4222-a222-222222222222'});await call('heartbeat',{token:t3},400);
// Snapshot cannot be changed by subsequent bank edits.
const changed=structuredClone((await state()).banks.find(b=>b.id===bank.id));changed.questions[0].text='Changed later';await call('saveBank',{data:changed});const snap=JSON.parse(sql.prepare('SELECT data FROM records WHERE id=?').get('snapshot-'+exam.id).data);assert.notEqual(snap.questions[0].text,'Changed later');
// Import validation and atomic save.
await call('saveClass',{data:{name:'6B',grade:'6',unit:'SD',year:'2026/2027'}});let rows=[{Nama:'Siswa Impor',NIS:'000123',Unit:'SD',Kelas:'6B',Tahun:'2026/2027',JK:'L'}];assert((await call('importStudents',{rows})).valid);await call('importStudents',{rows,commit:true});assert((await call('importStudents',{rows})).valid);
// Correction-only teacher may publish assigned results under revised policy.
sql.prepare("UPDATE attempts SET data=json_set(data,'$.deadline',0) WHERE id=?").run(fresh.id);await call('submit',{token:t3,session:'22222222-2222-4222-a222-222222222222'});user={email:'teacher@example.test',displayName:'Guru'};await call('grade',{id:fresh.id,grades:Object.fromEntries(fresh.questions.map(q=>[q.id,q.points]))});await call('publish',{id:fresh.id});user={email:'qa@example.test',displayName:'QA Admin'};
// Backup restore into an empty database preserves ids, answers, and counts.
const backup=await call('backup');
if(splitAttemptQuestions){
 const exported=backup.attempts.find(row=>row.id===a.id);
 assert(!('question_data' in exported));
 assert(JSON.parse(exported.data).questions.some(q=>q.images?.includes(imageFixture)));
}
const restored=new DatabaseSync(':memory:');restored.exec(fs.readFileSync('drizzle/0000_chemical_la_nuit.sql','utf8'));for(const r of backup.records)restored.prepare('INSERT INTO records(id,kind,data,version) VALUES(?,?,?,?)').run(r.id,r.kind,r.data,r.version);for(const r of backup.attempts)restored.prepare('INSERT INTO attempts(id,student_id,exam_id,token_hash,data,version) VALUES(?,?,?,?,?,?)').run(r.id,r.student_id,r.exam_id,r.token_hash,r.data,r.version);assert.equal(restored.prepare('SELECT COUNT(*) n FROM attempts').get().n,backup.attempts.length);const storage=getAttemptStorage(fresh.id);
const savedResult=JSON.parse(storage.data);
if(storage.question_data!=null)savedResult.questions=JSON.parse(storage.question_data);
assert.deepEqual(JSON.parse(restored.prepare('SELECT data FROM attempts WHERE id=?').get(fresh.id).data),savedResult);
// Demo accounts see separate tables and cannot read real tokens or students.
sql.prepare('INSERT INTO records(id,kind,data) VALUES(?,?,?)').run('demo-admin','staff',JSON.stringify({name:'Demo',email:'demo@test.invalid',role:'Super Admin',unit:'Semua',demo:true}));user={email:'demo@test.invalid',displayName:'Demo'};const demoState=await state();assert.equal(demoState.demo,true);assert.equal(demoState.students.length,0);assert.equal(demoState.exams.length,0);await call('listTokens',{examId:exam.id},400);await call('backup',{},400);const ds=await call('startSimulation',{bankId:demoState.banks[0].id});assert(ds.token.startsWith('DEMO-'));const da=await call('enter',{token:ds.token});assert.equal(da.status,'Mengerjakan');assert.equal((await state()).exams.length,1);user={email:'qa@example.test',displayName:'QA Admin'};assert(!(await state()).exams.some(x=>x.id===ds.examId));
console.log('PASS: confirmation, session isolation/release, extra time, frozen snapshot, Excel validation, publication permission, backup restoration, isolated demo tables.');
user=null;assert.equal((await routes.GET(new Request('https://cbt.test/api/cbt'))).status,401);await call('generate',{examId:exam.id},400);assert.equal((await call('enter',{token})).score,100);await call('enter',{token:'INVALIDTOKEN123456789'},400);
console.log('PASS: checkbox exact-set marking, master-subject validation, 32 idempotent simulations, encrypted token redisplay, token rotation and recovery, legacy token handling, admin-only token access;  setup, unique tokens, shuffled resume, saved answers, grading, publication lock, role/unit isolation, record integrity, schedule collision, CSRF, anonymous token access.');

// Review documents: classes, topics, multi-class scheduling, creation, students and teacher permissions.
user={email:'qa@example.test',displayName:'QA Admin'};
await call('importClasses',{rows:[{Unit:'SD',Kelas:'5A',Tingkat:'5',Tahun:'2026/2027'},{Unit:'SD',Kelas:'5B',Tingkat:'5',Tahun:'2026/2027'}],commit:true});
await call('saveTopic',{data:{name:'ASAS 2026',unit:'SD'}});
await call('saveExam',{data:{title:'ASAS baru',topic:'ASAS 2026',unit:'SD',grade:'5',classes:['5A','5B'],year:'2026/2027',subject:'Matematika',duration:60,start:new Date().toISOString(),end:new Date(Date.now()+3600000).toISOString()}});
let review=await state();const reviewExams=review.exams.filter(e=>e.title==='ASAS baru');assert.equal(reviewExams.length,2);assert(reviewExams.every(e=>!e.bankId));
await call('generate',{examId:reviewExams[0].id},400);
const teacherInfo=review.staffList.find(t=>t.email==='teacher@example.test');
await call('saveStaff',{data:{...teacherInfo,permission:'Upload dan koreksi',assignments:[{unit:'SD',subject:'Matematika',classes:['5A','5B']}],gender:'P'}});
user={email:'teacher@example.test',displayName:'Guru'};
const isian={id:'written1',type:'ISIAN',text:'Sebutkan dua bentuk',options:[],key:'Lingkaran dan persegi',keywords:'lingkaran;persegi',points:20,mode:'TEKS'};
await call('saveBank',{data:{title:'Soal ASAS',topic:'ASAS 2026',unit:'SD',grade:'5',subject:'Matematika',examIds:reviewExams.map(e=>e.id),questions:[pgk,isian]}});
assert.equal(policy.keywordScore(isian,'lingkaran'),10);assert.equal(policy.keywordScore(isian,'lingkarannya'),0);
user={email:'qa@example.test',displayName:'QA Admin'};
await call('saveStudent',{data:{name:'Siswa Uji',nis:'000999',unit:'SD',className:'5A',year:'2026/2027',gender:'L'}});
review=await state();const pupil=review.students.find(s=>s.nis==='000999');const card=(await call('accountCards',{kind:'student',id:pupil.id})).cards[0];assert(card.username.includes('000999'));assert.match(card.password,/^00999[a-z]{3}$/);assert.equal(card.username,'000999');assert.equal((await call('accountCards',{kind:'student',id:pupil.id})).cards[0].password,card.password);
const tk=(await call('generate',{examId:reviewExams[0].id})).issued[0].token;assert.equal(tk.length,5);await call('enter',{token:tk,identityConfirmed:false},400);const attempt=await call('enter',{token:tk});assert(!JSON.stringify(attempt.questions).includes('keywords'));await call('submit',{token:tk},400);
sql.prepare("UPDATE attempts SET data=json_set(data,'$.submitAfter',0) WHERE id=?").run(attempt.id);assert.match(policy.submissionIssue({...attempt,submitAfter:0,answers:{}}),/semua butir/);await call('submit',{token:tk},400);
await call('answer',{token:tk,questionId:'cx',value:'0',flags:[]});await call('answer',{token:tk,questionId:'written1',value:'lingkaran',flags:['written1']});
await call('submit',{token:tk});
user={email:'teacher@example.test',displayName:'Guru'};await call('grade',{id:attempt.id,grades:{cx:30,written1:15}});assert.equal((await state()).attempts.find(a=>a.id===attempt.id).grades.cx,30);await call('publish',{id:attempt.id});
// Actual password login routes and cookie identity: only own history, no staff access.
const login=await authRoutes.POST(new Request('https://cbt.test/api/auth',{method:'POST',headers:{origin:'https://cbt.test'},body:JSON.stringify({action:'login',username:card.username,password:card.password})}));assert.equal(login.status,200,JSON.stringify(await login.clone().json()));cookie=login.headers.get('set-cookie').split(';')[0];
const readEntry=(headers={cookie})=>routes.GET(new Request('https://cbt.test/api/cbt?entry=1',{headers}));
queryReads=[];
const studentEntry=await readEntry();
assert.equal(studentEntry.status,200);
assert.deepEqual(Object.keys((await studentEntry.json()).entry).sort(),['authMethod','name','role']);
assert.equal(queryReads.length,0,'Entry must not read rosters, exams, attempts or banks');
assert.equal((await readEntry({cookie:'cbt_session=invalid'})).status,401);
const portal=await state();assert.equal(portal.studentPortal,true);assert.equal(portal.student.id,pupil.id);assert.equal(portal.attempts.length,1);assert.equal(portal.attempts[0].score,90);assert(!portal.banks&&!portal.staffList&&!portal.loginAccounts);
// Hundreds of schedules must not reload the whole student roster or question bank per exam.
for(let i=0;i<404;i++)await writeRecord('scale-exam-'+i,'exam',{...reviewExams[0],id:'scale-exam-'+i,participantsSelected:true,studentIds:[pupil.id],excludedStudentIds:i%2?[pupil.id]:[]});
queryReads=[];
const scaledPortal=await state();
assert.equal(scaledPortal.exams.filter(e=>e.id.startsWith('scale-exam-')).length,202);
assert(!queryReads.some(r=>r.values[0]==='student'),'Student dashboard must not fetch a full roster');
assert(queryReads.filter(r=>['student_year','academic_profile'].includes(r.values[0])).every(r=>r.query.includes('substr(id,')&&r.values.at(-1)===':'+pupil.id),'Student dashboard must scope annual profiles to this student');
assert(!queryReads.some(r=>['bank','staff','audit','draft'].includes(r.values[0])),'Student dashboard must not fetch staff-only data');
sql.prepare("DELETE FROM records WHERE id LIKE 'scale-exam-%'").run();
console.log('PASS: student dashboard handles 404 schedules with bounded roster reads and correct exclusions.');
assert.equal((await call('studentLaunch',{examId:reviewExams[0].id})).token,tk);await call('studentLaunch',{examId:exam.id},400);await call('saveSubject',{data:{name:'Forbidden',unit:'SD'}},400);await call('enter',{token},400);
cookie='';user={email:'qa@example.test',displayName:'QA Admin'};
// Homeroom may download published results but must not grade another teacher's mapel.
await call('saveStaff',{data:{name:'Wali',email:'wali@test.invalid',role:'Guru',unit:'SD',subject:'Bahasa Arab',permission:'Koreksi saja',assignments:[{unit:'SD',subject:'Bahasa Arab',classes:['5A']}]}});
review=await state();const wali=review.staffList.find(t=>t.email==='wali@test.invalid'),c5=review.classes.find(c=>c.name==='5A');await call('saveClass',{data:{...c5,homeroomId:wali.id}});
user={email:'wali@test.invalid',displayName:'Wali'};const wd=await state();assert(wd.students.some(s=>s.id===pupil.id));const wr=wd.attempts.find(a=>a.id===attempt.id);assert(wr.readOnly);assert.equal(wr.score,90);assert(!wr.questions);await call('grade',{id:attempt.id,grades:{cx:30,written1:20}},400);
user={email:'admin@example.test',displayName:'Admin SMP'};await call('accountCards',{kind:'student',id:pupil.id}).then(r=>assert.equal(r.cards.length,0));await call('importClasses',{rows:[{Unit:'SD',Kelas:'Illegal',Tingkat:'6',Tahun:'2026/2027'}],commit:true},400);
assert.equal(policy.answeredQuestion({type:'MENJODOHKAN',left:['a','b'],right:['a','b']},'0,'),false);
console.log('PASS: review document flows, bulk classes, multi-class topic schedule, teacher creation/bank linkage, short tokens, identity checkbox, quarter duration, complete submission after the time gate, editable complex-choice scores, keyword suggestions, actual student password login, own historical results, homeroom read-only access and unit isolation.');
// Token-only return dashboard: requires the original device session and exposes only own records.
cookie='';user=null;
await call('tokenDashboard',{token:tk,session:'22222222-2222-4222-a222-222222222222'},400);
const tokenPortal=await call('tokenDashboard',{token:tk});assert.equal(tokenPortal.student.id,pupil.id);assert(tokenPortal.attempts.every(a=>a.id===attempt.id));assert(!tokenPortal.staffList&&!tokenPortal.banks&&!tokenPortal.loginAccounts);assert.equal(tokenPortal.attempts[0].score,90);assert(!JSON.stringify(tokenPortal).includes('keywords'));assert(!JSON.stringify(tokenPortal).includes('sessionHash'));
user={email:'qa@example.test',displayName:'QA Admin'};const unseen=(await call('generate',{examId:reviewExams[1].id})).issued;assert.equal(unseen.length,0);
console.log('PASS: token dashboard session validation, student-scoped history, published results, no keys or staff data.');
// Admin revision 2: periods, repeat imports, shared tokens and delegated supervision.
cookie='';user={email:'qa@example.test',displayName:'QA Admin'};
await call('saveYear',{data:{name:'2026/2027',semesters:[1,2]}});
const sem2=await routes.GET(new Request('https://cbt.test/api/cbt?year=2026%2F2027&semester=2'));const sem2data=await sem2.json();assert.equal(sem2data.exams.length,0);assert.equal(sem2data.topics.length,0);assert(sem2data.students.length>0);assert(sem2data.classes.length>0);
await call('saveTopic',{data:{name:'Topik semester 2',unit:'SD'},period:{year:'2026/2027',semester:2}});assert(!(await state()).topics.some(t=>t.name==='Topik semester 2'));
await call('saveClass',{data:{name:'6R',grade:'6',unit:'SD',year:'2026/2027'}});const classId=(await state()).classes.find(c=>c.name==='6R').id;await call('importClasses',{rows:[{Unit:'SD',Kelas:'6R',Tingkat:'6',Tahun:'2026/2027'}],commit:true});assert.equal((await state()).classes.filter(c=>c.name==='6R').length,1);assert.equal((await state()).classes.find(c=>c.name==='6R').id,classId);
const studentRows=['R1','R2','R3'].map((nis,i)=>({Nama:'Revisi '+i,NIS:nis,Unit:'SD',Kelas:'6R',Tahun:'2026/2027',JK:'L'}));await call('importStudents',{rows:studentRows,commit:true});const beforeIds=(await state()).students.filter(s=>s.className==='6R').map(s=>s.id);await call('importStudents',{rows:studentRows.map(r=>({...r,JK:''})),commit:true});assert.deepEqual((await state()).students.filter(s=>s.className==='6R').map(s=>s.id),beforeIds);assert((await state()).students.filter(s=>s.className==='6R').every(s=>s.gender==='L'));
const teacherRows=[{NIY:'2022.SIT.1.082',Nama:'Guru NIY',Email:'',Unit:'SD',JK:'P',Mapel:'Matematika',Kelas:'6R'}];assert((await call('importTeachers',{rows:teacherRows})).valid);await call('importTeachers',{rows:teacherRows,commit:true});await call('importTeachers',{rows:teacherRows,commit:true});let rev=(await state());assert.equal(rev.staffList.filter(t=>t.niy==='2022.SIT.1.082').length,1);const niyTeacher=rev.staffList.find(t=>t.niy==='2022.SIT.1.082');const teacherCard=(await call('accountCards',{kind:'teacher',id:niyTeacher.id})).cards[0];assert.equal(teacherCard.username,'2022.sit.1.082');
await call('saveStaff',{data:{name:'Guru Kontrak',unit:'SD',role:'Guru',subject:'Matematika'}});const contract=(await state()).staffList.find(t=>t.name==='Guru Kontrak');const contractCard=(await call('accountCards',{kind:'teacher',id:contract.id})).cards[0];assert.match(contractCard.username,/^sd\.\d{3}k$/);
await call('saveTopic',{data:{name:'Revisi 2',unit:'SD'}});const topic2=(await state()).topics.find(t=>t.name==='Revisi 2');await call('saveTopic',{data:{...topic2,name:'Revisi lengkap'}});
const revExamInput={title:'Ujian revisi',topic:'Revisi lengkap',unit:'SD',grade:'6',classes:['6R'],year:'2026/2027',subject:'Matematika',duration:60,start:new Date(Date.now()-1000).toISOString(),end:new Date(Date.now()+3600000).toISOString()};await call('saveExam',{data:revExamInput});await call('saveExam',{data:{...revExamInput,title:'Mapel lain',subject:'IPAS'}});await call('saveExam',{data:revExamInput},400);
rev=await state();const revExam=rev.exams.find(e=>e.title==='Ujian revisi');await call('saveDuties',{examId:revExam.id,duties:[{staffId:niyTeacher.id,role:'full'},{staffId:wali.id,role:'proctor'}]});
user={email:niyTeacher.email,displayName:niyTeacher.name};await call('saveBank',{data:{title:'Paket revisi',topic:'Revisi lengkap',unit:'SD',grade:'6',subject:'Matematika',examIds:[revExam.id],questions:[{...pgk,scope:'Bilangan',sourceId:'original-cx'}]}});await call('viewShared',{examId:revExam.id},400);
user={email:'qa@example.test',displayName:'QA Admin'};const shared1=await call('generateShared',{examId:revExam.id});const shared2=await call('generateShared',{examId:revExam.id});assert.equal(shared1.token,shared2.token);assert.equal((await call('viewShared',{examId:revExam.id})).token,shared2.token);assert.equal((await state()).attempts.filter(a=>a.examId===revExam.id).length,3);assert(!JSON.stringify(await state()).includes(shared2.token));
user={email:'admin@example.test',displayName:'Admin SMP'};await call('viewShared',{examId:revExam.id},400);await call('saveDuties',{examId:revExam.id,duties:[]},400);
user={email:wali.email,displayName:wali.name};assert.equal((await call('viewShared',{examId:revExam.id})).token,shared2.token);const proctorState=await state();const protectedAttempt=proctorState.attempts.find(a=>a.examId===revExam.id);assert(!protectedAttempt.questions&&!protectedAttempt.grades);assert(proctorState.students.some(s=>s.className==='6R'));await call('grade',{id:protectedAttempt.id,grades:{cx:30}},400);
user={email:'qa@example.test',displayName:'QA Admin'};const revCards=(await call('accountCards',{kind:'student',className:'6R'})).cards;
async function loginCard(c){const r=await authRoutes.POST(new Request('https://cbt.test/api/auth',{method:'POST',headers:{origin:'https://cbt.test'},body:JSON.stringify({action:'login',username:c.username,password:c.password})}));assert.equal(r.status,200);cookie=r.headers.get('set-cookie').split(';')[0];}
await loginCard(revCards[0]);assert((await call('studentLaunch',{examId:revExam.id,code:shared1.token})).token);await call('studentLaunch',{examId:revExam.id,code:'WRONG'},400);queryReads=[];
const private1=(await call('studentLaunch',{examId:revExam.id,code:shared2.token})).token;
assert(!queryReads.some(read=>['student','student_year','academic_profile'].includes(read.values[0])),'Student launch must not load the roster');
const launchPupil=(await state()).student;
const originalLaunchExam=await record(revExam.id);
await writeRecord(revExam.id,'exam',{...originalLaunchExam,participantsSelected:true,studentIds:[launchPupil.id]});
assert.equal((await call('studentLaunch',{examId:revExam.id,code:shared2.token})).token,private1);
await writeRecord(revExam.id,'exam',{...originalLaunchExam,participantsSelected:true,studentIds:[]});
assert.match((await call('studentLaunch',{examId:revExam.id,code:shared2.token},400)).error,/bukan peserta/);
await writeRecord(revExam.id,'exam',{...originalLaunchExam,participantsSelected:true,studentIds:[launchPupil.id],excludedStudentIds:[launchPupil.id]});
assert.match((await call('studentLaunch',{examId:revExam.id,code:shared2.token},400)).error,/bukan peserta/);
await writeRecord(revExam.id,'exam',originalLaunchExam);
const started1=await call('enter',{token:private1});
await call('saveAnswers',{token:private1,answers:{cx:'0,1'},flags:['cx','unknown']});
const compactSave=await call('saveAnswers',{token:private1,answers:{cx:'0,1,2'}});
assert.equal(compactSave.compact,true);assert.equal(compactSave.id,started1.id);
await call('saveAnswers',{token:private1,answers:{unknown:'invalid'}},400);
await call('saveAnswers',{token:private1,answers:{cx:'invalid-session'},session:'33333333-3333-4333-a333-333333333333'},400);
const savedBeforeResume=JSON.parse(sql.prepare('SELECT data FROM attempts WHERE id=?').get(started1.id).data);
assert.deepEqual(savedBeforeResume.flags,['cx']);assert.equal(savedBeforeResume.answers.cx,'0,1,2');
const savedQuestionData=getAttemptStorage(started1.id).question_data;
assert.equal((savedQuestionData==null?savedBeforeResume.questions:JSON.parse(savedQuestionData)).length,started1.questions.length);
const compactPulse=await call('heartbeat',{token:private1,compact:true});
assert.equal(compactPulse.compact,true);assert.equal(compactPulse.id,started1.id);
assert.equal(compactPulse.questions,undefined);
await loginCard(revCards[1]);const private2=(await call('studentLaunch',{examId:revExam.id,code:shared2.token})).token;assert.notEqual(private1,private2);const started2=await call('enter',{token:private2});assert.notEqual(started1.id,started2.id);await call('enter',{token:private1},400);
cookie='';user=null;await call('enter',{token:private1},400);
user={email:wali.email,displayName:wali.name};await call('releaseSession',{id:started1.id,reason:'Perpindahan komputer ruang kelas'});let paused=(await state()).attempts.find(a=>a.id===started1.id);assert(paused.pausedAt);assert(paused.actionNotes.some(n=>n.name===wali.name));await call('extraTime',{id:started1.id,minutes:5,reason:'Pemulihan gangguan perangkat'});
sql.prepare("UPDATE records SET data=json_set(data,'$.end',?) WHERE id=?").run(new Date(Date.now()-1000).toISOString(),revExam.id);await loginCard(revCards[0]);assert((await call('studentLaunch',{examId:revExam.id,code:shared2.token})).token);sql.prepare("UPDATE records SET data=json_set(data,'$.end',?) WHERE id=?").run(revExam.end,revExam.id);const resumedShared=await call('enter',{token:private1,session:'33333333-3333-4333-a333-333333333333'});assert(resumedShared.deadline>started1.deadline+299000);assert.equal(resumedShared.answers.cx,'0,1,2');
cookie='';user={email:'qa@example.test',displayName:'QA Admin'};const sameToken=await call('generateShared',{examId:revExam.id});assert.equal(sameToken.token,shared2.token);await loginCard(revCards[0]);assert.equal((await call('heartbeat',{token:private1,session:'33333333-3333-4333-a333-333333333333'})).id,started1.id);sql.prepare("UPDATE attempts SET data=json_set(data,'$.submitAfter',0) WHERE id=?").run(started1.id);await call('submit',{token:private1,session:'33333333-3333-4333-a333-333333333333'});
await loginCard(revCards[1]);await call('answer',{token:private2,questionId:'cx',value:'0,1,2'});sql.prepare("UPDATE attempts SET data=json_set(data,'$.submitAfter',0) WHERE id=?").run(started2.id);await call('submit',{token:private2});
cookie='';user={email:niyTeacher.email,displayName:niyTeacher.name};await call('publishMany',{ids:[started1.id,started2.id]},400);await call('grade',{id:started1.id,grades:{cx:0}});await call('grade',{id:started2.id,grades:{cx:0}});await call('publishMany',{ids:[started1.id]});const scored=await state();assert(scored.attempts.find(a=>a.id===started1.id).published);assert(!scored.attempts.find(a=>a.id===started2.id).published);assert.equal(scored.attempts.find(a=>a.id===started1.id).score,0);
const continuation=await call('retake',{id:started1.id,reason:'Gangguan komputer, lanjutkan jawaban',confirmDelete:false,start:new Date(Date.now()-1000).toISOString(),end:new Date(Date.now()+3600000).toISOString()});assert.equal(continuation.token,undefined);user={email:'qa@example.test',displayName:'QA Admin'};continuation.token=(await call('viewShared',{examId:continuation.examId})).token;await loginCard(revCards[0]);assert((await state()).exams.find(e=>e.id===continuation.examId).retakeReason.includes('komputer'));const continuedToken=(await call('studentLaunch',{examId:continuation.examId,code:continuation.token})).token;const continued=await call('enter',{token:continuedToken});assert.equal(continued.answers.cx,'0,1,2');assert.deepEqual(continued.questions.map(q=>q.id),started1.questions.map(q=>q.id));assert.equal(continued.published,false);assert.equal(continued.resetCount,0);await call('studentLaunch',{examId:revExam.id,code:shared2.token},400);cookie='';user={email:niyTeacher.email,displayName:niyTeacher.name};
const absent=scored.attempts.find(a=>a.examId===revExam.id&&a.status==='Belum mulai');const makeup=await call('makeup',{reason:'Siswa berhalangan mengikuti jadwal awal',id:absent.id,start:new Date(Date.now()-1000).toISOString(),end:new Date(Date.now()+3600000).toISOString()});await call('makeup',{reason:'Siswa berhalangan mengikuti jadwal awal',id:started1.id,start:new Date().toISOString(),end:new Date(Date.now()+3600000).toISOString()},400);
assert.equal(makeup.token,undefined);user={email:'qa@example.test',displayName:'QA Admin'};makeup.token=(await call('viewShared',{examId:makeup.examId})).token;await loginCard(revCards[0]);await call('studentLaunch',{examId:makeup.examId,code:makeup.token},400);await loginCard(revCards[2]);assert((await call('studentLaunch',{examId:makeup.examId,code:makeup.token})).token);
cookie='';user={email:niyTeacher.email,displayName:niyTeacher.name};const draft=await call('saveDraft',{data:{title:'Belum lengkap',questions:[]}});assert((await state()).drafts.some(d=>d.id===draft.id));user={email:wali.email,displayName:wali.name};assert(!(await state()).drafts.some(d=>d.id===draft.id));await call('deleteDraft',{id:draft.id},400);
user={email:'qa@example.test',displayName:'QA Admin'};await call('deleteTopic',{data:(await state()).topics.find(t=>t.name==='Revisi lengkap')},400);
// Actual teacher credential login and self-service password change.
await loginCard(teacherCard);assert.equal((await state()).staff.id,niyTeacher.id);const changedPassword=await authRoutes.POST(new Request('https://cbt.test/api/auth',{method:'POST',headers:{origin:'https://cbt.test',cookie},body:JSON.stringify({action:'changePassword',currentPassword:teacherCard.password,password:'qa-change-only-128765'})}));assert.equal(changedPassword.status,200);cookie='';
console.log('PASS: revision 2 semester isolation, non-destructive repeated imports, NIY/contract accounts, teacher self password change, subject-aware collisions, schedule duties, stable shared token and login requirement, per-student isolation, proctor key isolation, pause/resume, selected publication, exclusive makeup and private drafts.');
// Revision 3: simplified imports, lifecycle, credential reset and frozen-bank independence.
cookie='';user={email:'qa@example.test',displayName:'QA Admin'};
await call('saveYear',{data:{name:'2027/2028'}});assert.deepEqual((await state()).years.find(y=>y.name==='2027/2028').semesters,[1,2]);
await call('activateYear',{data:(await state()).years.find(y=>y.name==='2027/2028')});assert.equal((await state()).subjects.length,0);assert.equal((await state()).staffList.filter(t=>t.role==='Guru').length,0);await seedYearSubjects('2027/2028');
await call('importClasses',{rows:[{Unit:'SD',Kelas:'6N',Tingkat:'6'}],commit:true});assert.equal((await state()).classes.find(c=>c.name==='6N').year,'2027/2028');
assert.equal((await call('importStudents',{rows:[{Nama:'Missing gender',NIS:'MISSING',Unit:'SD',Kelas:'6N'}]})).valid,false);
await call('importStudents',{rows:[{Nama:'New pupil',NIS:'NEW28',Unit:'SD',Kelas:'6N',JK:'P'}],commit:true});let newPupil=(await state()).students.find(s=>s.nis==='NEW28');assert.equal(newPupil.year,'2027/2028');
const bareTeacherRows=[{NIY:'2027.001',Nama:'Teacher without subjects',Unit:'SD',JK:'P'}];await call('importTeachers',{rows:bareTeacherRows,commit:true});let bareTeacher=(await state()).staffList.find(t=>t.niy==='2027.001');assert.equal(bareTeacher.subject,'');assert.equal(bareTeacher.assignments.length,0);
await call('saveStaff',{data:{...bareTeacher,assignments:[{unit:'SD',subject:'MATEMATIKA',classes:['6N']},{unit:'SD',subject:'bahasa arab',classes:['6N']}]}});bareTeacher=(await state()).staffList.find(t=>t.id===bareTeacher.id);assert.equal(bareTeacher.assignments[0].subject,'Matematika');assert.equal(bareTeacher.assignments[0].classes.length,1);
await call('importTeachers',{rows:bareTeacherRows,commit:true});assert.equal((await state()).staffList.find(t=>t.id===bareTeacher.id).assignments.length,2);
let oldCard=(await call('accountCards',{kind:'teacher',id:bareTeacher.id})).cards[0];await loginCard(oldCard);const oldCookie=cookie;cookie='';
let resetCard=(await call('accountCards',{kind:'teacher',id:bareTeacher.id,reset:true})).cards[0];assert.notEqual(resetCard.password,oldCard.password);assert.equal(resetCard.username,oldCard.username);
assert.equal((await routes.GET(new Request('https://cbt.test/api/cbt',{headers:{cookie:oldCookie}}))).status,401);await loginCard(resetCard);cookie='';
oldCard=(await call('accountCards',{kind:'student',id:newPupil.id})).cards[0];await loginCard(oldCard);const pupilCookie=cookie;cookie='';resetCard=(await call('accountCards',{kind:'student',id:newPupil.id,reset:true})).cards[0];assert.notEqual(resetCard.password,oldCard.password);assert.equal((await routes.GET(new Request('https://cbt.test/api/cbt',{headers:{cookie:pupilCookie}}))).status,401);
const yearRow=(await state()).years.find(y=>y.name==='2027/2028');await call('saveYear',{data:{...yearRow,name:'2028/2029'}});assert.equal((await state()).activeYear,'2028/2029');assert.equal((await state()).students.find(s=>s.id===newPupil.id).year,'2028/2029');
await call('activateYear',{data:(await state()).years.find(y=>y.name==='2026/2027')});
const frozenBank=(await state()).banks.find(b=>b.examIds?.includes(revExam.id));const frozenBefore=sql.prepare('SELECT data FROM records WHERE id=?').get('snapshot-'+revExam.id).data;
await call('saveBank',{data:{...frozenBank,questions:frozenBank.questions.map(q=>({...q,text:q.text+' revisi isi'}))}});
assert.equal(sql.prepare('SELECT data FROM records WHERE id=?').get('snapshot-'+revExam.id).data,frozenBefore);const altered=(await state()).banks.find(b=>b.id===frozenBank.id);assert.notEqual(altered.questions[0].sourceId,frozenBank.questions[0].sourceId);assert(!(await state()).exams.find(e=>e.id===revExam.id).questionSources.includes(altered.questions[0].sourceId));
await call('saveExam',{data:{title:'Mapel diganti',unit:'SD',className:'6B',grade:'6',subject:'IPAS',bankId:bank.id,duration:30,start:new Date().toISOString(),end:new Date(Date.now()+1800000).toISOString()}});const corrected=(await state()).exams.find(e=>e.title==='Mapel diganti');assert.equal(corrected.subject,'IPAS');assert.equal(corrected.bankId,'');
await call('saveSubject',{data:{name:'Mapel revisi',unit:'SD',grades:['5','6']}});const custom=(await state()).subjects.find(s=>s.name==='Mapel revisi');await call('saveSubject',{data:{...custom,name:'Mapel baru',grades:['6']}});assert((await state()).subjects.some(s=>s.id===custom.id&&s.name==='Mapel baru'));
user={email:'admin@example.test',displayName:'Admin SMP'};await call('deleteMaster',{kind:'subject',id:custom.id},400);user={email:bareTeacher.email,displayName:'Teacher'};await call('deleteMaster',{kind:'student',id:newPupil.id},400);user={email:'qa@example.test',displayName:'QA Admin'};
await call('deleteMaster',{kind:'subject',id:custom.id});assert(!(await state()).subjects.some(s=>s.id===custom.id));
const populatedClass=(await state({year:'2028/2029',semester:1})).classes.find(c=>c.name==='6N');await call('deleteMaster',{kind:'class',id:populatedClass.id},400);
await loginCard(resetCard);const deleteCookie=cookie;cookie='';await call('deleteMaster',{kind:'student',id:newPupil.id,period:{year:'2028/2029',semester:1}});assert(!(await state()).students.some(s=>s.id===newPupil.id));assert(sql.prepare('SELECT data FROM records WHERE id=?').get(newPupil.id));assert.equal((await routes.GET(new Request('https://cbt.test/api/cbt',{headers:{cookie:deleteCookie}}))).status,401);
await call('deleteMaster',{kind:'class',id:populatedClass.id,period:{year:'2028/2029',semester:1}});assert(!(await state()).classes.some(s=>s.id===populatedClass.id));await call('deleteMaster',{kind:'staff',id:bareTeacher.id,period:{year:'2028/2029',semester:1}});assert(!(await state()).staffList.some(s=>s.id===bareTeacher.id));
console.log('PASS: revision 3 years/activation/rename, period-default imports, required gender, teacher import without assignments, case-insensitive mapel, multiple classes, reset revokes sessions, mapel editing, deletion scope/history, frozen-bank edits/provenance, stale bank cannot override selected mapel.');
// Presentation readiness: successful school logins never consume failed-login limits.
cookie='';user={email:'qa@example.test',displayName:'QA Admin'};
const readyCard=(await call('accountCards',{kind:'student',id:pupil.id})).cards[0];
const bucket=Math.floor(Date.now()/900000),ipKey='login-failure-'+bucket+'-'+await pw.digest('ip:unknown');await writeRecord(ipKey,'login_limit',{});sql.prepare('UPDATE records SET version=59 WHERE id=?').run(ipKey);
for(let i=0;i<70;i++)await loginCard(readyCard);
assert.equal(sql.prepare('SELECT version FROM records WHERE id=?').get(ipKey).version,59);cookie='';
const badUsername='presentation-wrong-account';for(let i=0;i<10;i++){const response=await authRoutes.POST(new Request('https://cbt.test/api/auth',{method:'POST',headers:{origin:'https://cbt.test'},body:JSON.stringify({action:'login',username:badUsername,password:'wrong-pass-for-test'})}));assert.equal(response.status,400);}
const limited=await authRoutes.POST(new Request('https://cbt.test/api/auth',{method:'POST',headers:{origin:'https://cbt.test'},body:JSON.stringify({action:'login',username:badUsername,password:'wrong-pass-for-test'})}));assert.equal(limited.status,429);await loginCard(readyCard);cookie='';
// Exact server-owned pause timing reaches the student UI without reacquiring the released session.
const pauseExam=(await state()).exams.find(e=>e.title==='Mapel diganti');await call('saveStudent',{data:{name:'NAMA PESERTA PRESENTASI',nis:'PRESENTASI',unit:'SD',className:'6B',year:'2026/2027',gender:'L'}});await call('saveBank',{data:{title:'Paket Presentasi',unit:'SD',subject:'IPAS',grade:'6',examIds:[pauseExam.id],questions:[{id:'demo-name-q',type:'PG',text:'Contoh soal?',options:['A','B'],key:'0',points:10}]}});
const pauseToken=(await call('generate',{examId:pauseExam.id})).issued.find(s=>s.nis==='PRESENTASI').token;
const pauseStart=await call('enter',{token:pauseToken});assert.equal(pauseStart.student.name,'NAMA PESERTA PRESENTASI');assert.equal(pauseStart.student.nis,'PRESENTASI');assert.equal(pauseStart.student.className,'6B');
await call('releaseSession',{id:pauseStart.id,reason:'Uji presentasi jeda perangkat'});const storedPause=JSON.parse(sql.prepare('SELECT data FROM attempts WHERE id=?').get(pauseStart.id).data);const pauseView=await call('heartbeat',{token:pauseToken});assert.equal(pauseView.remainingMs,storedPause.remainingMs);assert.equal(pauseView.pausedAt,storedPause.pausedAt);assert.equal(pauseView.student.name,'NAMA PESERTA PRESENTASI');assert(!JSON.parse(sql.prepare('SELECT data FROM attempts WHERE id=?').get(pauseStart.id).data).sessionHash);await call('answer',{token:pauseToken,questionId:'demo-name-q',value:'0'},400);const resumedForDemo=await call('enter',{token:pauseToken});assert(!resumedForDemo.pausedAt);assert.equal(resumedForDemo.student.name,'NAMA PESERTA PRESENTASI');
console.log('PASS: 70 successful logins on shared IP, failed-login throttling, name/NIS/class in exam payload, precise pause state, no session reclamation by heartbeat, resume retains identity.');
// Role login audit: use real password cookies, with no mocked role header.
cookie='';user={email:'qa@example.test',displayName:'QA Admin'};
async function authCall(action,body={},expected=200){const response=await authRoutes.POST(new Request('https://cbt.test/api/auth',{method:'POST',headers:{origin:'https://cbt.test',cookie},body:JSON.stringify({action,...body})}));const value=await response.clone().json();assert.equal(response.status,expected,JSON.stringify(value));return response;}
const owner=(await state()).staff;const ownerCard={username:'qa.owner.password',password:'qa-owner-private-test-2026'};
// Bootstrap a test credential directly, then use actual authenticated endpoints for every role.
await authlib.writeRecord('credential-'+ownerCard.username,'credential',{staffId:owner.id,username:ownerCard.username,salt:'qa-owner-salt',hash:await pw.passwordHash(ownerCard.password,'qa-owner-salt'),revision:'qa-owner-rev'});
await loginCard(ownerCard);queryReads=[];assert.equal((await (await readEntry()).json()).entry.role,'Super Admin');assert.equal(queryReads.length,0);assert.equal((await state()).staff.role,'Super Admin');assert.equal((await state()).authMethod,'password');
await call('saveStaff',{data:{name:'Admin Unit Login QA',email:'role-admin@test.invalid',role:'Admin Unit',unit:'SD',permission:'Full akses'}});const roleAdmin=(await state()).staffList.find(s=>s.email==='role-admin@test.invalid');const adminCard={username:'qa.admin.sd',password:'qa-admin-private-test-2026'};await authCall('setCredential',{staffId:roleAdmin.id,...adminCard});
await call('saveStaff',{data:{name:'Guru Login QA',email:'role-teacher@test.invalid',niy:'QA.GURU.2026',role:'Guru',unit:'SD',assignments:[{unit:'SD',subject:'Matematika',classes:['5A']}]}});const roleTeacher=(await state()).staffList.find(s=>s.email==='role-teacher@test.invalid');const roleTeacherCard=(await call('accountCards',{kind:'teacher',id:roleTeacher.id})).cards[0];
await call('saveClass',{data:{name:'1QA',grade:'1',unit:'SMP',year:'2026/2027'}});await call('saveStudent',{data:{name:'Outside-unit pupil',nis:'QA-SMP',unit:'SMP',className:'1QA',gender:'L'}});const outsidePupil=(await state()).students.find(s=>s.nis==='QA-SMP');
await loginCard(adminCard);let roleState=await state();assert.equal(roleState.staff.role,'Admin Unit');assert.equal(roleState.authMethod,'password');for(const k of ['students','classes','subjects','banks','staffList','exams'])assert(roleState[k].every(x=>x.unit==='SD'),k+' must stay within unit');assert.equal(roleState.loginAccounts.length,0);
await call('saveClass',{data:{name:'6ADMIN',grade:'6',unit:'SD',year:'2026/2027'}});await call('saveStudent',{data:{name:'Admin-created pupil',nis:'QA-SD',unit:'SD',className:'6ADMIN',gender:'P'}});let adminPupil=(await state()).students.find(s=>s.nis==='QA-SD');assert(adminPupil);assert.equal((await call('accountCards',{kind:'student',id:adminPupil.id})).cards.length,1);
await call('saveYear',{data:{name:'2030/2031'}},400);await call('backup',{},400);await call('saveStaff',{data:{name:'Escalation',email:'bad-role@test.invalid',role:'Super Admin',unit:'Semua',permission:'Full akses'}},400);await authCall('setCredential',{staffId:owner.id,username:'hijack.owner',password:'qa-forbidden-password'},400);await authCall('toggleStaff',{staffId:owner.id},400);await call('saveStudent',{data:{...outsidePupil,name:'Forbidden'}},400);await call('deleteMaster',{kind:'student',id:outsidePupil.id},400);assert.equal((await call('accountCards',{kind:'student',id:outsidePupil.id,reset:true})).cards.length,0);
await loginCard(roleTeacherCard);roleState=await state();assert.equal(roleState.staff.role,'Guru');assert.equal(roleState.authMethod,'password');assert(roleState.classes.every(c=>c.name==='5A'));assert(roleState.students.every(s=>s.className==='5A'));assert(roleState.exams.every(e=>e.className==='5A'&&e.subject==='Matematika'));assert.equal(roleState.audit.length,0);assert.equal(roleState.loginAccounts.length,0);assert(!JSON.stringify(roleState).includes('account_vault'));
await call('saveStudent',{data:{name:'Forbidden',nis:'BAD',unit:'SD',className:'5A'}},400);await call('saveClass',{data:{name:'Illegal',grade:'5',unit:'SD'}},400);await call('saveSubject',{data:{name:'Illegal',unit:'SD'}},400);await call('accountCards',{kind:'student',id:pupil.id},400);await call('saveDuties',{examId:reviewExams[0].id,duties:[]},400);await call('generateShared',{examId:reviewExams[0].id},400);await call('viewShared',{examId:reviewExams[0].id},400);await call('backup',{},400);await authCall('setCredential',{staffId:roleAdmin.id,...adminCard},400);await authCall('toggleStaff',{staffId:roleAdmin.id},400);
await call('saveBank',{data:{title:'Guru own mapel',unit:'SD',subject:'Matematika',grade:'5',questions:[{id:'role-q',type:'PG',text:'Role test?',options:['Ya','Tidak'],key:'0',points:10}]}});await call('saveBank',{data:{title:'Wrong mapel',unit:'SD',subject:'IPAS',grade:'5',questions:[{id:'wrong-q',type:'PG',text:'No?',options:['Ya','Tidak'],key:'0',points:10}]}},400);
// Session boundaries must never silently adopt a ChatGPT superadmin.
const fallbackAuth=evaluate(strip(fs.readFileSync('lib/staff-auth.ts','utf8')),{env:{DB},getChatGPTUser:async()=>({email:owner.email,displayName:owner.name}),...pw});
const teacherCookie=cookie;assert.equal((await fallbackAuth.staffActor(new Request('https://cbt.test/',{headers:{cookie}}))).staff.id,roleTeacher.id);
const logout=await authCall('logout');const signedOutCookie=logout.headers.get('set-cookie').split(';')[0];await assert.rejects(()=>fallbackAuth.staffActor(new Request('https://cbt.test/',{headers:{cookie:signedOutCookie}})),/masuk kembali/);await assert.rejects(()=>fallbackAuth.staffActor(new Request('https://cbt.test/',{headers:{cookie:teacherCookie}})),/masuk kembali/);
assert.equal((await fallbackAuth.staffActor(new Request('https://cbt.test/'))).staff.id,owner.id);
await loginCard(roleTeacherCard);const sessionKey='session-'+await pw.digest(cookie.split('=')[1]);sql.prepare("UPDATE records SET data=json_set(data,'$.expires',0) WHERE id=?").run(sessionKey);await assert.rejects(()=>fallbackAuth.staffActor(new Request('https://cbt.test/',{headers:{cookie}})),/masuk kembali/);
await loginCard(ownerCard);await authCall('toggleStaff',{staffId:roleTeacher.id});await authCall('login',roleTeacherCard,400);await authCall('toggleStaff',{staffId:roleTeacher.id});await loginCard(roleTeacherCard);const oldTeacherCookie=cookie;await loginCard(adminCard);await call('accountCards',{kind:'teacher',id:roleTeacher.id,reset:true});assert.equal((await routes.GET(new Request('https://cbt.test/api/cbt',{headers:{cookie:oldTeacherCookie}}))).status,401);
await loginCard(ownerCard);assert((await state()).students.some(s=>s.id===outsidePupil.id));assert((await state()).staffList.some(s=>s.role==='Admin Unit'));await call('backup');
const explicitChatGPT=await authRoutes.GET(new Request('https://cbt.test/api/auth?method=chatgpt'));assert.equal(explicitChatGPT.status,303);assert(explicitChatGPT.headers.get('set-cookie').includes('Max-Age=0'));
console.log('PASS: actual password login for Super Admin/Admin Unit/Guru, scoped reads and writes, role-escalation denial, credential administration, own-mapel authoring, logout/expiry cannot fall back to ChatGPT, disabled accounts, reset invalidates old teacher sessions.');
await assert.rejects(()=>fallbackAuth.staffActor(new Request('https://cbt.test/',{headers:{cookie:'cbt_auth_mode=password'}})),/masuk kembali/);
const modeLogin=await authCall('login',ownerCard);assert(modeLogin.headers.get('set-cookie').includes('cbt_auth_mode=password'));assert(explicitChatGPT.headers.get('set-cookie').includes('cbt_auth_mode='));
console.log('PASS: password-mode preference survives session-cookie expiry; ChatGPT fallback requires explicit opt-in.');
// Schedule duties are also verified with real teacher cookies.
await loginCard(ownerCard);
await call('saveTopic',{data:{name:'QA Hak Akses',unit:'SD'}});
await call('saveExam',{data:{title:'QA Peran Jadwal',topic:'QA Hak Akses',unit:'SD',className:'6ADMIN',grade:'6',subject:'IPAS',duration:10,start:new Date(Date.now()-1000).toISOString(),end:new Date(Date.now()+600000).toISOString()}});const dutyExam=(await state()).exams.find(e=>e.title==='QA Peran Jadwal');
await call('saveDuties',{examId:dutyExam.id,duties:[{staffId:roleTeacher.id,role:'grade'}]});const resetTeacherCard=(await call('accountCards',{kind:'teacher',id:roleTeacher.id})).cards[0];await loginCard(resetTeacherCard);let dutyState=(await state()).exams.find(e=>e.id===dutyExam.id);assert(dutyState.canGrade&&!dutyState.canMonitor&&!dutyState.canWrite&&!dutyState.canProctor);
const dutyBank={title:'Paket QA Peran',topic:'QA Hak Akses',unit:'SD',subject:'IPAS',grade:'6',examIds:[dutyExam.id],questions:[{id:'duty-q',type:'PG',text:'Soal pemeriksaan hak akses',options:['A','B'],key:'0',points:10}]};await call('saveBank',{data:dutyBank},400);await call('viewShared',{examId:dutyExam.id},400);
await loginCard(ownerCard);await call('saveDuties',{examId:dutyExam.id,duties:[{staffId:roleTeacher.id,role:'full'}]});await loginCard(resetTeacherCard);dutyState=(await state()).exams.find(e=>e.id===dutyExam.id);assert(dutyState.canGrade&&dutyState.canWrite&&!dutyState.canProctor);await call('saveBank',{data:dutyBank});
await loginCard(adminCard);const dutyShared=await call('generateShared',{examId:dutyExam.id});assert(dutyShared.token);await call('saveDuties',{examId:dutyExam.id,duties:[{staffId:roleTeacher.id,role:'proctor'}]});await loginCard(resetTeacherCard);dutyState=(await state()).exams.find(e=>e.id===dutyExam.id);assert(dutyState.canProctor&&!dutyState.canGrade&&!dutyState.canWrite);assert.equal((await call('viewShared',{examId:dutyExam.id})).token,dutyShared.token);const proctorAttempt=(await state()).attempts.find(a=>a.examId===dutyExam.id);assert(proctorAttempt.readOnly&&!proctorAttempt.questions&&!proctorAttempt.answers&&!proctorAttempt.grades);await call('grade',{id:proctorAttempt.id,grades:{}},400);await call('saveBank',{data:dutyBank},400);
await loginCard(ownerCard);const adminOldCookie=(await authCall('login',adminCard)).headers.get('set-cookie').split(';')[0];await authCall('setCredential',{staffId:roleAdmin.id,username:adminCard.username,password:'qa-admin-new-private-password'});assert.equal((await routes.GET(new Request('https://cbt.test/api/cbt',{headers:{cookie:adminOldCookie}}))).status,401);await authCall('login',adminCard,400);await loginCard({...adminCard,password:'qa-admin-new-private-password'});assert.equal((await state()).staff.id,roleAdmin.id);
console.log('PASS: schedule Full/Korektor/Pengawas duties via password sessions, proctor token/key separation, admin password reset revokes previous sessions and permits new login.');
// Revision 4: academic snapshots, duplicate upserts, demo teachers and safe deletion.
await loginCard(ownerCard);
const p1={year:'2032/2033',semester:1},p2={...p1,semester:2};
await call('saveYear',{data:{name:p1.year}});await seedYearSubjects(p1.year);
await call('saveClass',{period:p1,data:{unit:'SD',name:'5 Bilal',grade:'5',year:p1.year}});
const originalClass=(await state(p1)).classes.find(c=>c.name==='5 BILAL');
let preview4=await call('importClasses',{period:p1,rows:[{Unit:'SD','Nama Kelas':'5 bilal',Tingkat:'5'},{Unit:'SD',Kelas:'5 Muadz',Tingkat:'5'}]});assert.deepEqual(preview4.duplicates,['5 BILAL']);
await call('importClasses',{period:p1,rows:[{Unit:'SD',Kelas:'5 bilal',Tingkat:'5'},{Unit:'SD',Kelas:'5 Muadz',Tingkat:'5'}],commit:true});assert.equal((await state(p1)).classes.filter(c=>c.name.toLowerCase()==='5 bilal').length,1);assert.equal((await state(p1)).classes.find(c=>c.name==='5 BILAL').id,originalClass.id);
const import4=[{Nama:'Siswa Revisi Empat',NIS:'REV4-001',Unit:'SD',Kelas:'6 Ayyub',JK:'P'}];preview4=await call('importStudents',{period:p1,rows:import4});assert.deepEqual(preview4.newClasses,['6 AYYUB']);assert(!(await state(p1)).classes.some(c=>c.name==='6 AYYUB'));
await call('importStudents',{period:p1,rows:import4,commit:true});const student4=(await state(p1)).students.find(s=>s.nis==='REV4-001');assert.equal(student4.name,'SISWA REVISI EMPAT');assert((await state(p1)).classes.some(c=>c.name==='6 AYYUB'&&c.grade==='6'));
await call('importStudents',{period:p1,rows:[{...import4[0],Nama:'Nama Diperbarui',Kelas:'6 ayyub'}],commit:true});assert.equal((await state(p1)).students.find(s=>s.nis==='REV4-001').id,student4.id);assert.equal((await state(p1)).students.filter(s=>s.nis==='REV4-001').length,1);
await call('saveStaff',{period:p1,data:{niy:'REV4.TEACHER',name:'Guru Semester',unit:'SD',role:'Guru',assignments:[{unit:'SD',subject:'Matematika',classes:['5 BILAL']}]}});const teacher4=(await state(p1)).staffList.find(t=>t.niy==='REV4.TEACHER');
const s2initial=await state(p2);assert(s2initial.students.some(s=>s.id===student4.id));assert(s2initial.classes.some(c=>c.id===originalClass.id));assert(s2initial.staffList.some(t=>t.id===teacher4.id));
const sem2Student=s2initial.students.find(s=>s.id===student4.id);await call('saveStudent',{period:p2,data:{...sem2Student,name:'Nama Semester Dua',className:'5 BILAL'}});assert.equal((await state(p1)).students.find(s=>s.id===student4.id).name,'NAMA DIPERBARUI');assert.equal((await state(p1)).students.find(s=>s.id===student4.id).className,'6 AYYUB');assert.equal((await state(p2)).students.find(s=>s.id===student4.id).className,'5 BILAL');
await call('saveStaff',{period:p2,data:{...s2initial.staffList.find(t=>t.id===teacher4.id),name:'Guru Semester Dua',assignments:[{unit:'SD',subject:'Matematika',classes:['5 MUADZ']}]}});assert.equal((await state(p1)).staffList.find(t=>t.id===teacher4.id).name,'Guru Semester');assert.equal((await state(p2)).staffList.find(t=>t.id===teacher4.id).name,'Guru Semester Dua');
await call('saveClass',{period:p2,data:{...s2initial.classes.find(c=>c.id===originalClass.id),homeroomId:teacher4.id}});assert.equal((await state(p1)).classes.find(c=>c.id===originalClass.id).homeroomId,'');assert.equal((await state(p2)).classes.find(c=>c.id===originalClass.id).homeroomId,teacher4.id);
await call('saveClass',{period:p2,data:{name:'6 Only Two',grade:'6',unit:'SD',year:p1.year}});assert(!(await state(p1)).classes.some(c=>c.name==='6 ONLY TWO'));assert((await state(p2)).classes.some(c=>c.name==='6 ONLY TWO'));
const subject4=s2initial.subjects.find(m=>m.unit==='SD'&&m.name==='Matematika');await call('saveSubject',{period:p2,data:{...subject4,grades:['5']}});assert.notDeepEqual((await state(p1)).subjects.find(m=>m.id===subject4.id).grades,['5']);assert.deepEqual((await state(p2)).subjects.find(m=>m.id===subject4.id).grades,['5']);
await call('saveExam',{period:p2,data:{title:'Semester dua test',unit:'SD',className:'5 BILAL',grade:'5',subject:'Matematika',duration:20,start:new Date(Date.now()-1000).toISOString(),end:new Date(Date.now()+1200000).toISOString()}});const exam4=(await state(p2)).exams.find(e=>e.title==='Semester dua test');
await call('saveBank',{period:p2,data:{title:'Paket rev4',unit:'SD',grade:'5',subject:'Matematika',examIds:[exam4.id],questions:[{id:'rev4q',type:'PG',text:'Contoh?',options:['A','B'],key:'0',points:10}]}});const bank4=(await state(p2)).banks.find(b=>b.title==='Paket rev4');
const token4=await call('generateShared',{period:p2,examId:exam4.id});const card4=(await call('accountCards',{period:p2,kind:'student',id:student4.id})).cards[0];await loginCard(card4);assert((await state()).exams.some(e=>e.id===exam4.id));const private4=await call('studentLaunch',{examId:exam4.id,code:token4.token});const attempt4=await call('enter',{token:private4.token});assert.equal(attempt4.student.name,'NAMA SEMESTER DUA');assert.equal(attempt4.student.className,'5 BILAL');
await loginCard(ownerCard);await call('deleteExam',{period:p2,id:exam4.id},400);await call('deleteBank',{period:p2,id:bank4.id,keepQuestions:true});assert((await state(p2)).banks.some(b=>b.id===bank4.id&&b.archived));assert(sql.prepare('SELECT id FROM records WHERE id=?').get('snapshot-'+exam4.id));await call('saveBank',{period:p2,data:{...bank4,title:'Should fail'}},400);
// Delete an unused schedule and verify frozen/issued tokens no longer grant access.
await call('saveExam',{period:p1,data:{title:'Batal rev4',unit:'SD',className:'6 AYYUB',grade:'6',subject:'Matematika',duration:20,start:new Date(Date.now()-1000).toISOString(),end:new Date(Date.now()+1200000).toISOString()}});const cancel4=(await state(p1)).exams.find(e=>e.title==='Batal rev4');await call('deleteExam',{period:p1,id:cancel4.id});assert(!(await state(p1)).exams.some(e=>e.id===cancel4.id));assert(JSON.parse(sql.prepare('SELECT data FROM records WHERE id=?').get(cancel4.id).data).deletedAt);await call('generateShared',{period:p1,examId:cancel4.id},400);
const beforeTeacherCount=sql.prepare("SELECT COUNT(*) AS n FROM records WHERE kind='staff' AND json_extract(data,'$.demo') IS NOT 1").get().n;
const demos4=await (await authCall('createDemos')).json();const demoOwnerCard=demos4.created.find(c=>c.role==='Super Admin');assert(demoOwnerCard);{await loginCard(demoOwnerCard);await call('saveStaff',{data:{name:'Guru demo rev4',niy:'DEMO.REV4',role:'Guru',unit:'SD',assignments:[]}});const demoTeacher4=(await state()).staffList.find(t=>t.niy==='DEMO.REV4');assert(demoTeacher4&&demoTeacher4.demo);const teacherDemoCard=(await call('accountCards',{kind:'teacher',id:demoTeacher4.id})).cards[0];await loginCard(teacherDemoCard);assert.equal((await state()).demo,true);assert.equal((await state()).staff.role,'Guru');assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM records WHERE kind='staff' AND json_extract(data,'$.demo') IS NOT 1").get().n,beforeTeacherCount);}
console.log('PASS: revision 4 case-insensitive upserts, duplicate preview, auto-created classes, uppercase student names, semester master copies/independent edits/stable identity, semester-2 student login/token identity, frozen-bank retention, schedule cancellation, demo teacher creation/login isolation.');

await loginCard(ownerCard);
const legacyYear='2034/2035';await call('saveYear',{data:{name:legacyYear}});await seedYearSubjects(legacyYear);
await writeRecord('legacy-class-upper','class',{name:'5 BILAL',unit:'SD',year:legacyYear,grade:'5'});await writeRecord('legacy-class-mixed','class',{name:'5 Bilal',unit:'SD',year:legacyYear,grade:'5'});await writeRecord('legacy-pupil','student',{name:'LEGACY',nis:'LEGACY4',unit:'SD',year:legacyYear,className:'5 Bilal',gender:'L'});sql.prepare("DELETE FROM records WHERE id='class-normalization-v4'").run();
const migrated4=await state({year:legacyYear,semester:1});assert.equal(migrated4.classes.filter(c=>c.name==='5 BILAL').length,1);assert.equal(migrated4.students.find(s=>s.id==='legacy-pupil').className,'5 BILAL');assert(JSON.parse(sql.prepare('SELECT data FROM records WHERE id=?').get('legacy-class-mixed').data).mergedInto);
console.log('PASS: legacy mixed-case classroom normalization merges duplicates and preserves student identity/references.');

// Meeting 29 October: isolated fixtures and end-to-end policy checks.
await loginCard(ownerCard);
const meetingPeriod={year:'2035/2036',semester:1};await call('saveYear',{data:{name:meetingPeriod.year}});await seedYearSubjects(meetingPeriod.year);
await call('saveClass',{period:meetingPeriod,data:{name:'6 MEETING',grade:'6',unit:'SD',year:meetingPeriod.year}});
for(let i=0;i<3;i++)await call('saveStudent',{period:meetingPeriod,data:{name:'Meeting '+i,nis:'MEET'+i,unit:'SD',className:'6 MEETING',gender:'L',year:meetingPeriod.year}});
await call('saveSubject',{period:meetingPeriod,data:{name:'Meeting Science',unit:'SD',grades:['6'],questionTypes:['PG','PG_KOMPLEKS','ISIAN','URAIAN','BENAR_SALAH']}});
let ms=await state(meetingPeriod);const mp=ms.students.filter(s=>s.className==='6 MEETING');assert.equal(mp.length,3);
await call('saveExam',{period:meetingPeriod,data:{title:'Meeting exam',unit:'SD',className:'6 MEETING',grade:'6',subject:'Meeting Science',duration:60,start:new Date(Date.now()-1000).toISOString(),end:new Date(Date.now()+3600000).toISOString()}});
let me=(await state(meetingPeriod)).exams.find(e=>e.title==='Meeting exam');
const mq=[{id:'meet-pg',type:'PG',text:'Choose one',options:['A','B','C','D'],key:'1',points:10,mode:'TEKS'},{id:'meet-mc',type:'PG_KOMPLEKS',text:'Choose all',options:['A','B','C','D'],key:'0,1,2,3',points:10,mode:'TEKS'},{id:'meet-tf',type:'PG',format:'BENAR_SALAH',text:'A statement',options:['Benar','Salah'],key:'0',points:10,mode:'TEKS'},{id:'meet-written',type:'ISIAN',text:'Symbol?',options:[],key:'Co',keywords:'Co',caseSensitive:true,points:10,mode:'KIMIA'}];
const mb={title:'Meeting bank',unit:'SD',grade:'6',subject:'Meeting Science',examIds:[me.id],questions:mq,excludedByExam:{[me.id]:[mp[2].id]}};await call('saveBank',{period:meetingPeriod,data:mb});
await call('saveBank',{period:meetingPeriod,data:{...mb,title:'Invalid fifth option',questions:[{...mq[0],options:['A','B','C','D','E']}]}},400);
await call('saveBank',{period:meetingPeriod,data:{...mb,title:'Invalid matching type',questions:[{id:'no',type:'MENJODOHKAN',text:'Match',left:['one'],right:['one'],key:'0',points:10}]}},400);
assert.equal(policy.keywordScore(mq[3],'co'),0);assert.equal(policy.keywordScore(mq[3],'Co'),10);assert.equal(policy.keywordScore({...mq[3],caseSensitive:false},'co'),10);assert.equal(model.mark([mq[1]],{'meet-mc':'3,2,1,0'})['meet-mc'],10);assert.equal(model.mark([mq[1]],{'meet-mc':'0,1'})['meet-mc'],0);
const mt=await call('generateShared',{period:meetingPeriod,examId:me.id});const meetingCards=(await call('accountCards',{period:meetingPeriod,kind:'student',unit:'SD',className:'6 MEETING'})).cards;const cardsById=Object.fromEntries(mp.map(p=>[p.id,meetingCards.find(c=>c.username.includes(p.nis.toLowerCase()))]));
assert.equal((await state(meetingPeriod)).attempts.filter(a=>a.examId===me.id).length,2);await loginCard(cardsById[mp[2].id]);await call('studentLaunch',{examId:me.id,code:mt.token},400);
await loginCard(cardsById[mp[0].id]);const pt=(await call('studentLaunch',{examId:me.id,code:mt.token})).token;const ma=await call('enter',{token:pt});await call('answer',{token:pt,questionId:'meet-written',value:'Co'});
await loginCard(ownerCard);const mt2=await call('generateShared',{period:meetingPeriod,examId:me.id});await loginCard(cardsById[mp[0].id]);assert.equal((await call('heartbeat',{token:pt})).answers['meet-written'],'Co');await call('studentLaunch',{examId:me.id,code:mt.token},400);
const ended=await call('exitExam',{token:pt,answers:{'meet-pg':'1'}});assert.equal(ended.status,'Dikumpulkan');assert.equal(ended.answers['meet-pg'],'1');assert.equal((await call('enter',{token:pt})).status,'Dikumpulkan');await call('answer',{token:pt,questionId:'meet-pg',value:'0'});assert.equal((await call('heartbeat',{token:pt})).answers['meet-pg'],'1');
await loginCard(ownerCard);const oldOther=sql.prepare('SELECT id FROM attempts WHERE student_id=? AND exam_id=?').get(mp[1].id,me.id).id;const windowMeeting={start:new Date(Date.now()-1000).toISOString(),end:new Date(Date.now()+3600000).toISOString()};await call('retake',{reason:'',id:ma.id,...windowMeeting},400);assert(sql.prepare('SELECT id FROM attempts WHERE id=?').get(ma.id));const repeat=await call('retake',{reason:'Pengawas menyetujui ujian ulang',id:ma.id,confirmDelete:true,...windowMeeting});assert(!sql.prepare('SELECT id FROM attempts WHERE id=?').get(ma.id));assert(!sql.prepare('SELECT id FROM records WHERE id=?').get('vault-'+ma.id));assert(sql.prepare('SELECT id FROM attempts WHERE id=?').get(oldOther));assert(sql.prepare('SELECT id FROM records WHERE id=?').get(mp[0].id));
await loginCard(cardsById[mp[0].id]);await call('studentLaunch',{examId:me.id,code:mt2.token},400);const rt=(await call('studentLaunch',{examId:repeat.examId,code:repeat.token})).token;const ra=await call('enter',{token:rt});assert.equal(Object.keys(ra.answers).length,0);sql.prepare("UPDATE attempts SET data=json_set(data,'$.lastSeenAt',?) WHERE id=?").run(Date.now()-19*60_000,ra.id);assert.equal((await call('heartbeat',{token:rt})).status,'Mengerjakan');
const markIdle=()=>sql.prepare("UPDATE attempts SET data=json_set(data,'$.lastSeenAt',?) WHERE id=?").run(Date.now()-21*60_000,ra.id);
markIdle();
assert.equal((await state(meetingPeriod)).attempts.find(a=>a.id===ra.id).status,'Mengerjakan');
await loginCard(ownerCard);
const idleMonitor=await routes.GET(new Request('https://cbt.test/api/cbt?year='+encodeURIComponent(meetingPeriod.year)+'&monitorExam='+repeat.examId,{headers:{cookie}}));
assert.equal(idleMonitor.status,200);
assert.equal((await idleMonitor.json()).attempts.find(a=>a.id===ra.id).status,'Mengerjakan');
await loginCard(cardsById[mp[0].id]);
assert.equal((await call('heartbeat',{token:rt,compact:true})).status,'Mengerjakan');
markIdle();
assert.equal((await call('saveAnswers',{token:rt,answers:{'meet-written':'Setelah diam'}})).status,'Mengerjakan');
assert.equal((await call('enter',{token:rt})).answers['meet-written'],'Setelah diam');
sql.prepare("UPDATE attempts SET data=json_set(data,'$.deadline',?) WHERE id=?").run(Date.now()-1000,ra.id);
const deadlineResult=await call('heartbeat',{token:rt});
assert.equal(deadlineResult.status,'Dikumpulkan');
assert.equal(JSON.parse(sql.prepare('SELECT data FROM attempts WHERE id=?').get(ra.id).data).timedOut,true);
assert.equal(deadlineResult.answers['meet-written'],'Setelah diam');
console.log('PASS: more than 20 minutes without a heartbeat does not collect the exam; monitoring, autosave and actual deadline remain consistent.');
await loginCard(ownerCard);const follow=await call('makeup',{reason:'Siswa berhalangan mengikuti jadwal awal',id:oldOther,...windowMeeting});await loginCard(cardsById[mp[1].id]);const ft=(await call('studentLaunch',{examId:follow.examId,code:follow.token})).token;const fa=await call('enter',{token:ft});await authCall('logout');assert.equal(JSON.parse(sql.prepare('SELECT data FROM attempts WHERE id=?').get(fa.id).data).status,'Dikumpulkan');
await loginCard(cardsById[mp[0].id]);const recoveryStudentCookie=cookie;await authCall('createRecoveryCode',{currentPassword:'wrong'},400);const recovery=(await (await authCall('createRecoveryCode',{currentPassword:cardsById[mp[0].id].password})).json()).code;assert(recovery&&!JSON.stringify(await state()).includes(recovery));cookie='';await authCall('recoverPassword',{username:cardsById[mp[0].id].username,code:'wrong',password:'meeting-reset-private-123'},400);await authCall('recoverPassword',{username:cardsById[mp[0].id].username,code:recovery,password:'meeting-reset-private-123'});await authCall('recoverPassword',{username:cardsById[mp[0].id].username,code:recovery,password:'meeting-reset-private-456'},400);assert.equal((await routes.GET(new Request('https://cbt.test/api/cbt',{headers:{cookie:recoveryStudentCookie}}))).status,401);await loginCard({...cardsById[mp[0].id],password:'meeting-reset-private-123'});assert((await state()).studentPortal);
await loginCard(ownerCard);const teacherRecoveryCard=(await call('accountCards',{kind:'teacher',id:roleTeacher.id})).cards[0];await loginCard(teacherRecoveryCard);const tr=(await (await authCall('createRecoveryCode',{currentPassword:teacherRecoveryCard.password})).json()).code;cookie='';await authCall('recoverPassword',{username:teacherRecoveryCard.username,code:tr,password:'meeting-teacher-private-123'});await loginCard({...teacherRecoveryCard,password:'meeting-teacher-private-123'});assert.equal((await state()).staff.role,'Guru');
console.log('PASS: meeting 29 October student exclusions, unit options, per-subject question types, true/false, case sensitivity, exact MCMA, stable tokens without disconnect, exit/timeout/logout collection, isolated confirmed retake deletion, makeup, student/teacher single-use recovery and session revocation.');
{
// The shared code remains fixed, while the private attempt stays bound to one device.
await loginCard(ownerCard);
const securityWindow={start:new Date(Date.now()-1000).toISOString(),end:new Date(Date.now()+3600000).toISOString()};
const securityExam=await call('retake',{reason:'Pengawas menyetujui ujian ulang',id:fa.id,confirmDelete:true,...securityWindow});
const fixedToken=await call('viewShared',{examId:securityExam.examId});assert.equal(fixedToken.expiresAt,Date.parse(securityWindow.end));assert.equal(fixedToken.token,(await call('viewShared',{examId:securityExam.examId})).token);
await loginCard(cardsById[mp[1].id]);const securityToken=(await call('studentLaunch',{examId:securityExam.examId,code:fixedToken.token})).token;
const securityAttempt=await call('enter',{token:securityToken});assert.equal(securityAttempt.exam.browserGuard,true);
await call('studentLaunch',{examId:securityExam.examId,code:fixedToken.token},400);
assert.equal((await call('heartbeat',{token:securityToken})).status,'Mengerjakan');
await call('heartbeat',{token:securityToken,session:'99999999-9999-4999-a999-999999999999'},400);
const originalNow=Date.now;
try{
 Date.now=()=>fixedToken.serverNow+16*60_000;
 assert.equal((await call('enter',{token:securityToken})).status,'Mengerjakan');
 await loginCard(ownerCard);
 assert.equal((await call('viewShared',{examId:securityExam.examId})).token,fixedToken.token);
 assert.equal((await call('generateShared',{examId:securityExam.examId})).token,fixedToken.token);
 Date.now=()=>fixedToken.expiresAt+1;
 await call('viewShared',{examId:securityExam.examId},400);
 await call('generateShared',{examId:securityExam.examId},400);
}finally{Date.now=originalNow;}
await loginCard(cardsById[mp[1].id]);
const locked=await call('securityLock',{token:securityToken,reason:'hidden',answers:{'meet-written':'Co'}});assert.equal(locked.securityLocked,true);assert.equal(locked.answers['meet-written'],'Co');assert(locked.pausedAt);
assert.equal((await call('enter',{token:securityToken})).securityLocked,true);await call('answer',{token:securityToken,questionId:'meet-written',value:'changed'},400);
assert.equal((await call('heartbeat',{token:securityToken})).securityLocked,true);
await call('securityLock',{token:securityToken,session:'99999999-9999-4999-a999-999999999999'},400);
await loginCard(ownerCard);await call('releaseSession',{id:locked.id,reason:'Verified student device'},400);
const resetCode=(await call('generateShared',{examId:securityExam.examId})).token;
assert.equal(resetCode,fixedToken.token);
const tokenMenu=()=>routes.GET(new Request('https://cbt.test/api/cbt?menu=Token+ujian&menuVersion=2&year='+encodeURIComponent(meetingPeriod.year),{headers:{cookie}})).then(r=>r.json());
assert.equal((await tokenMenu()).exams.find(e=>e.id===securityExam.examId).sharedCode,fixedToken.token);
await loginCard(cardsById[mp[1].id]);
assert((await call('studentLaunch',{examId:securityExam.examId,code:resetCode})).token);
await call('requestUnlock',{token:securityToken,code:'WRONG'},400);
await call('requestUnlock',{token:securityToken,session:'99999999-9999-4999-a999-999999999999'},400);
for(let used=1;used<=3;used++){
 const requestUnlock=()=>routes.POST(new Request('https://cbt.test/api/cbt',{
   method:'POST',headers:{origin:'https://cbt.test',cookie},
   body:JSON.stringify({action:'requestUnlock',token:securityToken,session:'11111111-1111-4111-a111-111111111111'}),
 }));
 const responses=await Promise.all([requestUnlock(),requestUnlock()]);
 assert.deepEqual(responses.map(response=>response.status).sort(),[200,400]);
 const unlocked=await responses.find(response=>response.ok).json();
 assert.equal(unlocked.resetCount,used);
 assert.equal(unlocked.securityLocked,false);
 assert(!unlocked.pausedAt);
 assert.equal(unlocked.answers['meet-written'],'Co');
 await call('requestUnlock',{token:securityToken},400);
 if(used<3){
   const nextLock=await call('securityLock',{token:securityToken,reason:'hidden'});
   assert.equal(nextLock.securityLocked,true);
   assert.equal(nextLock.resetCount,used);
 }
}
const repeatedViolation=await call('securityLock',{token:securityToken,reason:'hidden',answers:{'meet-written':'Co final'}});
assert.equal(repeatedViolation.status,'Dikumpulkan');
assert.equal(repeatedViolation.answers['meet-written'],'Co final');
assert.equal(repeatedViolation.resetCount,3);
await call('requestUnlock',{token:securityToken},400);
await loginCard(ownerCard);
assert(!(await tokenMenu()).exams.some(e=>e.id===securityExam.examId));
const ended=await record(securityExam.examId);
await writeRecord('past-token-exam','exam',{...ended,id:'past-token-exam',start:new Date(Date.now()-3600000).toISOString(),end:new Date(Date.now()-1000).toISOString()});
await writeRecord('upcoming-token-exam','exam',{...ended,id:'upcoming-token-exam',start:new Date(Date.now()+3*86400000).toISOString(),end:new Date(Date.now()+3*86400000+3600000).toISOString(),bankId:'upcoming-token-bank'});
const available=await tokenMenu();
assert(!available.exams.some(e=>e.id==='past-token-exam'));
assert(available.exams.some(e=>e.id==='upcoming-token-exam'&&!e.sharedCode));
await writeRecord('upcoming-token-bank','bank',{...await record(ended.bankId),id:'upcoming-token-bank'});
const early=await call('generateShared',{examId:'upcoming-token-exam'});
assert.equal((await tokenMenu()).exams.find(e=>e.id==='upcoming-token-exam').sharedCode,early.token);
assert.equal(await record('snapshot-upcoming-token-exam'),null);
const updatedBank=await record('upcoming-token-bank');
updatedBank.questions[0].text='Soal diperbarui setelah token disiapkan';
await writeRecord('upcoming-token-bank','bank',updatedBank);
await loginCard(cardsById[mp[1].id]);
assert.match((await call('studentLaunch',{examId:'upcoming-token-exam',code:early.token},400)).error,/belum dimulai/);
const future=await record('upcoming-token-exam');
try{
 Date.now=()=>Date.parse(future.start)+1000;
 await loginCard(ownerCard);
 assert.equal((await call('viewShared',{examId:future.id})).token,early.token);
 await loginCard(cardsById[mp[1].id]);
 const launched=await call('studentLaunch',{examId:future.id,code:early.token});
 const entered=await call('enter',{token:launched.token});
 assert(entered.questions.some(q=>q.text==='Soal diperbarui setelah token disiapkan'));
}finally{Date.now=originalNow;}
await loginCard(ownerCard);
const expiredMonitor=(await state(meetingPeriod)).attempts.find(a=>a.id===locked.id);
assert.equal(expiredMonitor.status,'Dikumpulkan');
assert.equal(expiredMonitor.resetCount,3);
assert(expiredMonitor.actionNotes.some(n=>n.action==='Lanjutkan ujian 3 dari 3'));
assert(!expiredMonitor.pausedAt);
await call('extraTime',{id:locked.id,minutes:10,reason:'Past deadline'},400);
await loginCard(cardsById[mp[1].id]);assert.equal((await state()).attempts.find(a=>a.id===locked.id).status,'Dikumpulkan');
await call('studentLaunch',{examId:securityExam.examId,code:fixedToken.token},400);
// Rev6: mandatory retake note and automatic timed pause.
await loginCard(ownerCard);
await call('retake',{id:locked.id,confirmDelete:true,...securityWindow,reason:''},400);
const rev6Retake=await call('retake',{id:locked.id,confirmDelete:true,...securityWindow,reason:'Perangkat bermasalah dan disetujui pengawas'});
await loginCard(cardsById[mp[1].id]);
const rev6Token=(await call('studentLaunch',{examId:rev6Retake.examId,code:rev6Retake.token})).token;
const rev6Start=await call('enter',{token:rev6Token});assert.equal(rev6Start.resetCount,0);
await loginCard(ownerCard);
await call('pauseTime',{id:rev6Start.id,minutes:0,reason:'Jeda tidak valid'},400);
await call('pauseTime',{id:rev6Start.id,minutes:1,reason:'Gangguan jaringan ruang ujian'});
await call('proctorNote',{id:rev6Start.id,reason:'Siswa menunggu jaringan pulih'});
const pausedRev6=JSON.parse(sql.prepare('SELECT data FROM attempts WHERE id=?').get(rev6Start.id).data);assert.equal(pausedRev6.pauseUntil-pausedRev6.pausedAt,60000);assert.equal(pausedRev6.deadline,rev6Start.deadline);
await loginCard(cardsById[mp[1].id]);
assert.equal((await call('heartbeat',{token:rev6Token})).pauseUntil,pausedRev6.pauseUntil);
await call('answer',{token:rev6Token,questionId:'meet-written',value:'blocked'},400);
assert.equal((await call('enter',{token:rev6Token})).pauseUntil,pausedRev6.pauseUntil);
Date.now=()=>pausedRev6.pauseUntil+1;
const resumedRev6=await call('heartbeat',{token:rev6Token});assert(!resumedRev6.pausedAt);assert.equal(resumedRev6.deadline,rev6Start.deadline+60000);assert.equal(resumedRev6.submitAfter,rev6Start.submitAfter+60000);Date.now=originalNow;
assert.equal((await call('heartbeat',{token:rev6Token})).deadline,resumedRev6.deadline);
await loginCard(ownerCard);assert((await state(meetingPeriod)).attempts.find(a=>a.id===rev6Start.id).actionNotes.some(n=>n.reason==='Siswa menunggu jaringan pulih'));
console.log('PASS: Three unlocks, wrong code/device denied, unlock count persisted, fourth violation auto-submits latest answers, no proctor reset bypass, mandatory retake reason, fresh retake allowance, timed pause blocks answers/early resume, resumes exactly once and preserves notes.');

console.log('PASS: Fixed schedule token after 15 minutes, schedule expiry, bound sessions, inline token visibility and completed-exam filtering.');

}

{
assert.match(generated.standardPassword('202612345'),/^12345[a-z]{3}$/);
assert.match(generated.standardPassword('123'),/^123[0-9]{2}[a-z]{3}$/);
assert.match(generated.standardPassword(''),/^[0-9]{5}[a-z]{3}$/);
assert.match(generated.standardPassword('00001'),/^00001[a-z]{3}$/);
await loginCard(ownerCard);
const proposed=await (await authCall('suggestCredential',{staffId:roleAdmin.id})).json();assert.match(proposed.password,/^[0-9]{5}[a-z]{3}$/);
await authCall('setCredential',{staffId:roleAdmin.id,username:adminCard.username,password:'12345abc'});
await loginCard({...adminCard,password:'12345abc'});
await authCall('changePassword',{currentPassword:'12345abc',password:'1234567'},400);
await authCall('changePassword',{currentPassword:'12345abc',password:'54321xyz'});
await loginCard({...adminCard,password:'54321xyz'});
console.log('PASS: eight-character passwords, NIS tail, random numeric padding, no-ID fallback, administrator suggestion, eight-character login/change and seven-character rejection.');
}
// Evaluation: individual teacher classes, role-specific account data, required subject levels.
{
await loginCard(ownerCard);
const period={year:'2026/2027',semester:1};
await call('saveStaff',{period,data:{name:'Evaluasi Guru',niy:'EVAL.2026.123',role:'Guru',unit:'SD',assignments:[{unit:'SD',subject:'Matematika',classes:['5A']}]}});
let st=await state(period);const teacher=st.staffList.find(t=>t.niy==='EVAL.2026.123');assert.deepEqual(teacher.assignments[0].classes,['5A']);
await call('saveStaff',{period,data:{...teacher,assignments:[{unit:'SD',subject:'Matematika',classes:['__NONE__']}] }},400);
const teacherCard=(await call('accountCards',{period,kind:'teacher',id:teacher.id})).cards[0];assert.equal(teacherCard.kind,'teacher');assert.equal(teacherCard.niy,teacher.niy);assert.match(teacherCard.teaching,/Matematika — 5A/);
const studentCard=(await call('accountCards',{period,kind:'student',id:pupil.id})).cards[0];assert.equal(studentCard.kind,'student');assert.equal(studentCard.nis,pupil.nis);
await call('saveSubject',{period,data:{name:'Evaluasi kosong',unit:'SD',grades:[]}},400);
await call('saveSubject',{period,data:{name:'Evaluasi kosong',unit:'SD'}},400);
await call('saveSubject',{period,data:{name:'Evaluasi tingkat',unit:'SD',grades:['5','6']}});
assert.deepEqual((await state(period)).subjects.find(m=>m.name==='Evaluasi tingkat').grades,['5','6']);
await call('saveExam',{period,data:{title:'Evaluasi edit kelas',unit:'SD',classes:['5A'],subject:'Matematika',grade:'5',duration:60,start:'2031-05-01T01:00:00Z',end:'2031-05-01T02:00:00Z'}});
const editExam=(await state(period)).exams.find(e=>e.title==='Evaluasi edit kelas');
await call('saveExam',{period,data:{...editExam,classes:['5B']}},400);
await call('saveExam',{period,data:{...editExam,classes:['5A'],duration:90,end:'2031-05-01T02:30:00Z'}});
assert.equal((await state(period)).exams.find(e=>e.id===editExam.id).duration,90);
await loginCard(teacherCard);let scoped=await state(period);assert(scoped.classes.some(c=>c.name==='5A'));assert(!scoped.classes.some(c=>c.name==='5B'));
await loginCard(ownerCard);
console.log('PASS: evaluation teacher assignment persistence/access scope, teacher/student card identity, mandatory subject levels, same-class schedule edit.');
}
// Unique ordering with concurrent starts and legacy/resumed sessions.
{
await loginCard(ownerCard);const period={year:'2026/2027',semester:1};
await call('saveClass',{period,data:{name:'6 UNIQUE',unit:'SD',grade:'6'}});
await call('importStudents',{period,rows:Array.from({length:30},(_,i)=>({Nama:'Unique '+i,NIS:'UNIQ'+i,Unit:'SD',Kelas:'6 UNIQUE',JK:'L'})),commit:true});
const questions=Array.from({length:9},(_,i)=>({id:'unique-q'+i,type:'PG',text:'Question '+i,options:['A','B'],key:'0',points:10,mode:'TEKS',...(i<3?{stimulusId:'story',stimulus:'Shared story'}:{})}));
await call('saveBank',{period,data:{title:'Unique order QA',unit:'SD',subject:'Matematika',questions}});
const ub=(await state(period)).banks.find(b=>b.title==='Unique order QA');
await call('saveExam',{period,data:{title:'Unique order QA',unit:'SD',className:'6 UNIQUE',grade:'6',subject:'Matematika',bankId:ub.id,duration:60,start:new Date(Date.now()-1000).toISOString(),end:new Date(Date.now()+3600000).toISOString()}});
const ue=(await state(period)).exams.find(e=>e.title==='Unique order QA'),tokens=(await call('generate',{period,examId:ue.id})).issued;
const first=await call('enter',{token:tokens[0].token});
sql.prepare("UPDATE attempts SET data=json_remove(data,'$.questionOrder') WHERE id=?").run(first.id);
const attempts=[first,...await Promise.all(tokens.slice(1).map(t=>call('enter',{token:t.token})))];
assert.equal(new Set(attempts.map(a=>JSON.stringify(a.questions.map(q=>q.id)))).size,30);
for(const a of attempts){assert.equal(a.questions.length,9);const i=a.questions.findIndex(q=>q.id==='unique-q0');assert.equal(a.questions[i+1].id,'unique-q1');assert.equal(a.questions[i+2].id,'unique-q2');assert(!a.questions.some(q=>'key' in q));}
await call('answer',{token:tokens[1].token,questionId:'unique-q4',value:'0'});
const resumed=await call('enter',{token:tokens[1].token});assert.deepEqual(resumed.questions,attempts[1].questions);assert.equal(resumed.answers['unique-q4'],'0');
const legacy=await call('enter',{token:tokens[0].token});assert.deepEqual(legacy.questions,first.questions);
// Correction uses the frozen package order, even after the working bank is reordered.
const packageOrder=questions.map(q=>q.id);
const originalBank=await record(ub.id);
await writeRecord(ub.id,'bank',{...originalBank,questions:[...originalBank.questions].reverse()});
async function correction(attemptId){
 const params=new URLSearchParams({year:period.year,semester:String(period.semester),detail:'grade',id:attemptId});
 const response=await routes.GET(new Request('https://cbt.test/api/cbt?'+params,{headers:{cookie}}));
 assert.equal(response.status,200);
 return response.json();
}
for(const a of attempts.slice(0,2)){
 sql.prepare("UPDATE attempts SET data=json_set(data,'$.status','Dikumpulkan') WHERE id=?").run(a.id);
 const select=sql.prepare('SELECT data,question_data,version FROM attempts WHERE id=?');
 const stored=select.get(a.id);
 const review=await correction(a.id);
 assert.deepEqual(review.questions.map(q=>q.id),packageOrder);
 assert.equal(review.answers['unique-q4'],a===attempts[1]?'0':undefined);
 assert.deepEqual(select.get(a.id),stored);
}
const retakeId='unique-order-resumed-exam';
const retakeAttempt='unique-order-resumed-attempt';
const originalAttempt=await correction(attempts[1].id);
await writeRecord(retakeId,'exam',{...ue,id:retakeId,parentExamId:ue.id});
const originalById=new Map(originalAttempt.questions.map(q=>[q.id,q]));
const shuffled=attempts[1].questions.map(q=>originalById.get(q.id));
await writeRecord('snapshot-'+retakeId,'snapshot',{questions:shuffled,resumeFor:originalAttempt.studentId});
sql.prepare('INSERT INTO attempts(id,student_id,exam_id,token_hash,data) VALUES(?,?,?,?,?)').run(
 retakeAttempt,originalAttempt.studentId,retakeId,'unique-order-resumed-token',
 JSON.stringify({...originalAttempt,id:retakeAttempt,examId:retakeId,questions:shuffled}));
assert.deepEqual((await correction(retakeAttempt)).questions.map(q=>q.id),packageOrder);
await writeRecord(ub.id,'bank',originalBank);
console.log('PASS: 30 simultaneous participants receive distinct persisted permutations, shared passage groups stay together, legacy order excluded, resume and answer identity preserved.');
}

// Evaluation 3: stable teacher login, same-unit assignments, explicit duplicate subject types.
{
await loginCard(ownerCard);const period={year:'2026/2027',semester:1};
const teacher=(await state(period)).staffList.find(t=>t.niy==='EVAL.2026.123');
const before=(await call('accountCards',{period,kind:'teacher',id:teacher.id})).cards[0];
await call('saveStaff',{period,data:{...teacher,niy:'EVAL.2026.999'}});
const after=(await call('accountCards',{period,kind:'teacher',id:teacher.id})).cards[0];
assert.equal(after.username,before.username);assert.equal(after.password,before.password);assert.equal(after.niy,'EVAL.2026.999');
await loginCard(before);assert.equal((await state(period)).staff.id,teacher.id);await loginCard(ownerCard);
await call('saveStaff',{period,data:{...teacher,niy:'EVAL.2026.999',assignments:[{unit:'SMP',subject:'Matematika',classes:[]}]}},400);
await call('saveSubject',{period,data:{name:'Evaluasi duplicate',unit:'SD',grades:['5'],questionTypes:['PG']}});
await call('saveSubject',{period,data:{name:'Evaluasi duplicate',unit:'SD',grades:['5'],questionTypes:['PG','PG_KOMPLEKS','BENAR_SALAH','ISIAN','URAIAN','MENJODOHKAN']}});
let subject=(await state(period)).subjects.find(s=>s.name==='Evaluasi duplicate');assert.equal(subject.questionTypes.length,6);
await call('saveSubject',{period,data:{...subject,questionTypes:['PG']}});
await call('saveSubject',{period,data:{name:'Evaluasi duplicate',unit:'SD',grades:['5']}});
subject=(await state(period)).subjects.find(s=>s.name==='Evaluasi duplicate');assert(subject.questionTypes.includes('URAIAN'));
console.log('PASS: evaluation 3 teacher NIY edit preserves login/password, cross-unit assignment rejected, repeated subject saves update types.');
}

// SD subject profiles, non-destructive master migration and package-scoped extensions.
{
await loginCard(ownerCard);const period={year:'2026/2027',semester:1};let st=await state(period);
for(const name of ['TIK','SBDP']){const sub=st.subjects.find(s=>s.unit==='SD'&&s.name===name);assert(sub);assert(sub.grades.includes('5')&&sub.grades.includes('6'));}
const arab=st.subjects.find(s=>s.unit==='SD'&&s.name==='Bahasa Arab');assert.deepEqual(arab.questionTypes,['PG','PG_KOMPLEKS','ISIAN','URAIAN']);
const ind=st.subjects.find(s=>s.unit==='SD'&&s.name==='Bahasa Indonesia');assert(ind.questionTypes.includes('BENAR_SALAH'));assert(!ind.questionTypes.includes('MENJODOHKAN'));
const unchanged=st.subjects.find(s=>s.unit==='SMP'&&s.name==='Matematika');const sdCount=st.subjects.filter(s=>s.unit==='SD').length;await state(period);assert.equal((await state(period)).subjects.filter(s=>s.unit==='SD').length,sdCount);
const q={id:'sd-match',type:'MENJODOHKAN',text:'Pasangkan angka.',left:['Satu','Dua'],right:['1','2'],key:'0,1',options:[],points:4,mode:'TEKS'};
await call('saveBank',{period,data:{title:'SD extra without opt-in',unit:'SD',subject:'Bahasa Arab',grade:'5',questions:[q]}},400);
await call('saveBank',{period,data:{title:'SD extra type',unit:'SD',subject:'Bahasa Arab',grade:'5',questions:[q],additionalQuestionTypes:['MENJODOHKAN']}});
let saved=(await state(period)).banks.find(b=>b.title==='SD extra type');assert.deepEqual(saved.additionalQuestionTypes,['MENJODOHKAN']);assert.equal(saved.questions[0].type,'MENJODOHKAN');
assert.deepEqual((await state(period)).subjects.find(s=>s.id===arab.id).questionTypes,arab.questionTypes);
await call('saveBank',{period,data:{...saved,additionalQuestionTypes:['INVALID']}},400);
await call('saveBank',{period,data:{...saved,grade:'6',additionalQuestionTypes:['MENJODOHKAN']}});
await call('saveSubject',{period,data:{...arab,questionTypes:['PG','URAIAN']}});await state(period);assert.deepEqual((await state(period)).subjects.find(s=>s.id===arab.id).questionTypes,['PG','URAIAN']);
assert.deepEqual((await state(period)).subjects.find(s=>s.id===unchanged.id),unchanged);
const teacher=(await state(period)).staffList.find(t=>t.niy==='EVAL.2026.999');const card=(await call('accountCards',{period,kind:'teacher',id:teacher.id})).cards[0];await loginCard(card);
await call('saveBank',{period,data:{title:'Teacher SD extra',unit:'SD',subject:'Matematika',grade:'5',questions:[q],additionalQuestionTypes:['MENJODOHKAN']}});
await call('saveBank',{period,data:{title:'Teacher forbidden unit',unit:'SMP',subject:'Matematika',grade:'1',questions:[q],additionalQuestionTypes:['MENJODOHKAN']}},400);
await loginCard(ownerCard);
console.log('PASS: SD masters cover grades 5/6, B/S defaults, repeated migration and later customization preserved, package-only type extensions, teacher permission and cross-unit denial.');
}
// SMP profiles apply to every grade, without repeatedly replacing administrator settings.
{
await loginCard(ownerCard);const period={year:'2026/2027',semester:1};const st=await state(period);
const names=['Pendidikan Agama Islam','Pendidikan Pancasila','IPS','Seni Budaya','Bahasa Inggris','Informatika','Matematika','Bahasa Indonesia','PJOK','Bahasa Arab'];
for(const name of names){const sub=st.subjects.find(s=>s.unit==='SMP'&&s.name===name);assert(sub,name);assert.deepEqual(sub.grades,['1','2','3']);assert.deepEqual(sub.questionTypes,name==='Bahasa Arab'?['PG','PG_KOMPLEKS','URAIAN']:['PG','PG_KOMPLEKS','BENAR_SALAH','URAIAN']);}
const arab=st.subjects.find(s=>s.unit==='SMP'&&s.name==='Bahasa Arab');const count=st.subjects.length;
await state(period);assert.equal((await state(period)).subjects.length,count);
const q={id:'smp-extra',type:'ISIAN',text:'Lengkapi kalimat.',key:'Jawaban',options:[],points:4,mode:'ARAB'};
await call('saveBank',{period,data:{title:'SMP unselected extra',unit:'SMP',subject:'Bahasa Arab',grade:'1',questions:[q]}},400);
for(const grade of ['1','2','3'])await call('saveBank',{period,data:{title:'SMP extra '+grade,unit:'SMP',subject:'Bahasa Arab',grade,questions:[q],additionalQuestionTypes:['ISIAN']}});
assert.deepEqual((await state(period)).subjects.find(s=>s.id===arab.id).questionTypes,arab.questionTypes);
await call('saveSubject',{period,data:{...arab,questionTypes:['PG','URAIAN']}});assert.deepEqual((await state(period)).subjects.find(s=>s.id===arab.id).questionTypes,['PG','URAIAN']);
assert.deepEqual((await state(period)).subjects.filter(s=>s.unit!=='SMP'),st.subjects.filter(s=>s.unit!=='SMP'));
console.log('PASS: ten SMP masters, grades 1/2/3, Arabic defaults, package extensions, migration idempotence, administrator edits and other units preserved.');
}
// SMA uniform profiles, visual payloads, new subjects and package extensions.
{
await loginCard(ownerCard);const period={year:'2026/2027',semester:1};let st=await state(period);const others=st.subjects.filter(s=>s.unit!=='SMA');
for(const s of st.subjects.filter(s=>s.unit==='SMA')){assert.deepEqual(s.grades,['1','2','3']);assert.deepEqual(s.questionTypes,['PG','PG_KOMPLEKS','MENJODOHKAN']);}
await call('saveSubject',{period,data:{name:'Mapel SMA baru',unit:'SMA',grades:['1','2','3']}});st=await state(period);assert.deepEqual(st.subjects.find(s=>s.name==='Mapel SMA baru').questionTypes,['PG','PG_KOMPLEKS','MENJODOHKAN']);
const img='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=';
const questions=[{id:'sma-pg',type:'PG',text:'Pilih gambar',options:['[[image:0]]','B','C','D','E'],key:'0',points:5,mode:'TEKS',images:[img],presentation:'sma_picture'},{id:'sma-match',type:'MENJODOHKAN',text:'Pasangkan',options:[],left:['[[image:0]]','Butir 2'],right:['Keterangan','[[image:0]]'],key:'0,1',points:5,mode:'TEKS',images:[img],presentation:'sma_match'}];
for(const grade of ['1','2','3'])await call('saveBank',{period,data:{title:'Visual SMA '+grade,unit:'SMA',subject:'Mapel SMA baru',grade,questions}});
const bank=(await state(period)).banks.find(b=>b.title==='Visual SMA 3');assert.equal(bank.questions[0].presentation,'sma_picture');assert.equal(bank.questions[0].images[0],img);assert.equal(bank.questions[1].right[1],'[[image:0]]');
assert.deepEqual((await state(period)).subjects.filter(s=>s.unit!=='SMA'),others);
console.log('PASS: SMA all grades, new subject defaults, visual options/matching payload roundtrip, SD/SMP preserved.');
}

// Revision 5: annual identity reuse, semester isolation, bulk operations, rename.
{
await loginCard(ownerCard);const period={year:'2040/2041',semester:1};await call('saveYear',{data:{name:period.year}});
const empty=await state(period);assert.equal(empty.students.length,0);assert.equal(empty.staffList.filter(x=>x.role==='Guru').length,0);assert.equal(empty.subjects.length,0);assert(empty.banks.length>0);
await call('importClasses',{period,rows:[{Unit:'SD',Kelas:'5 A',Tingkat:'5'},{Unit:'SD',Kelas:'5 B',Tingkat:'5'}],commit:true});
const before=(await state({year:'2026/2027',semester:1})).students.find(x=>x.id===pupil.id);
await call('saveStudent',{period,data:{...before,year:period.year,className:'5 A'}});
let st=await state(period);assert.equal(st.students.find(x=>x.id===pupil.id).className,'5 A');assert.equal((await state({year:'2026/2027',semester:1})).students.find(x=>x.id===pupil.id).className,before.className);
const semester2={...period,semester:2};assert.equal((await state(semester2)).students.find(x=>x.id===pupil.id).className,'5 A');
const target=st.classes.find(x=>x.name==='5 B');await call('bulkStudents',{period,ids:[pupil.id],operation:'move',classId:target.id});
assert.equal((await state(period)).students.find(x=>x.id===pupil.id).className,'5 B');assert.equal((await state(semester2)).students.find(x=>x.id===pupil.id).className,'5 A');
await call('saveClass',{period,data:{...target,name:'5 C'}});assert.equal((await state(period)).students.find(x=>x.id===pupil.id).className,'5 C');await call('deleteMaster',{period,kind:'class',id:target.id},400);
await call('bulkStudents',{period,ids:[pupil.id],operation:'delete'});assert(!(await state(period)).students.some(x=>x.id===pupil.id));assert((await state(semester2)).students.some(x=>x.id===pupil.id));assert.equal((await call('accountCards',{period,kind:'student'})).cards.length,0);
console.log('PASS: revision 5 annual identity/history retained, empty new-year masters, isolated semester, bulk move/delete, rename, scoped cards.');
}

// Student/teacher evaluation: SD homeroom authoring, scope and draft deletion.
{
cookie='';user={email:'qa@example.test',displayName:'QA Admin'};
const period={year:'2042/2043',semester:1};await call('saveYear',{data:{name:period.year}});await seedYearSubjects(period.year);
await writeRecord('sg-teacher','staff',{id:'sg-teacher',name:'Guru SD QA',email:'sg@test.invalid',role:'Guru',unit:'SD',year:period.year,subject:'Bahasa Indonesia',assignments:[{unit:'SD',subject:'Bahasa Indonesia',classes:['5 A']}]});
await call('importClasses',{period,rows:[{Unit:'SD',Kelas:'5 A',Tingkat:'5',homeroomId:'sg-teacher'},{Unit:'SD',Kelas:'6 B',Tingkat:'6'}],commit:true});
const q=[{id:'sg-q',type:'PG',text:'Satu tambah satu?',options:['2','3'],key:'0',points:10}];
user={email:'sg@test.invalid',displayName:'Guru SD QA'};
assert.equal((await state(period)).staff.homeroomClasses.length,1);
await call('saveBank',{period,data:{title:'Wali kelas matematika',unit:'SD',grade:'5',subject:'Matematika',questions:q}});
assert((await state(period)).banks.some(b=>b.title==='Wali kelas matematika'));
await call('saveBank',{period,data:{title:'Bukan kelasnya',unit:'SD',grade:'6',subject:'Matematika',questions:q}},400);
await call('saveBank',{period,data:{title:'Bukan unitnya',unit:'SMP',grade:'1',subject:'Matematika',questions:q}},400);
const d=await call('saveDraft',{period,data:{title:'Draft yang dibuang',questions:q}});assert((await state(period)).drafts.some(x=>x.id===d.id));
await call('deleteDraft',{period,id:d.id});assert(!(await state(period)).drafts.some(x=>x.id===d.id));
console.log('PASS: SD homeroom can author other subjects for own grade, sees own bank, other grade/unit denied, server draft removed.');
}

// Rev6 role matrix uses isolated schedules in all three school units.
{
cookie='';user={email:'qa@example.test',displayName:'QA Admin'};
const period={year:'2044/2045',semester:1};await call('saveYear',{data:{name:period.year}});await seedYearSubjects(period.year);
for(const unit of ['SD','SMP','SMA']){
 const suffix=unit.toLowerCase(),className=unit==='SD'?'6 QA':'1 QA';
 await writeRecord('r6-admin-'+suffix,'staff',{name:'Admin '+unit,email:'r6-admin-'+suffix+'@test.invalid',role:'Admin Unit',unit});
 await writeRecord('r6-class-'+suffix,'class',{name:className,unit,grade:unit==='SD'?'6':'1',year:period.year});
 await writeRecord('r6-pupil-'+suffix,'student',{name:'Peserta '+unit,nis:'R6-'+unit,unit,className,year:period.year});
 await writeRecord('r6-bank-'+suffix,'bank',{title:'Paket '+unit,unit,subject:'Matematika',questions:[{id:'r6-q',type:'PG',text:'2+2?',options:['4','5'],key:'0',points:10}]});
 await writeRecord('r6-exam-'+suffix,'exam',{title:'Ujian '+unit,topic:'QA',unit,className,subject:'Matematika',year:period.year,semester:1,bankId:'r6-bank-'+suffix,status:'Aktif',start:new Date(Date.now()-10000).toISOString(),end:new Date(Date.now()+3600000).toISOString(),duration:30,duties:unit==='SD'?[{staffId:'r6-proctor',role:'proctor'}]:[]});
}
await writeRecord('r6-proctor','staff',{name:'Pengawas SD',email:'r6-proctor@test.invalid',role:'Guru',unit:'SD',year:period.year,assignments:[],subject:''});
const ownerState=await state(period);
assert.equal(ownerState.exams.length,3);
const ownerOperations=await routes.GET(new Request('https://cbt.test/api/cbt?view=operations&year=2044%2F2045'));
assert.equal(ownerOperations.status,200);
const ownerLight=await ownerOperations.json();
assert.equal(ownerLight.operations,true);
assert(ownerLight.staffList.some(staff=>staff.id==='r6-proctor'));
for(const key of ['staffList','classes','subjects'])assert.deepEqual(ownerLight[key],ownerState[key]);
assert(ownerLight.banks.every(bank=>!('questions' in bank)));

for(const unit of ['SD','SMP','SMA']){
 user={email:'r6-admin-'+unit.toLowerCase()+'@test.invalid',displayName:'Admin '+unit};
 const scoped=await state(period);assert.equal(scoped.exams.length,1);assert(scoped.exams[0].canMonitor&&scoped.exams[0].canManageAttempt&&scoped.exams[0].canProctor);
 const other=unit==='SD'?'smp':'sd';await call('makeup',{period,examId:'r6-exam-'+other,studentId:'r6-pupil-'+other,reason:'Permintaan lintas unit ditolak',start:new Date().toISOString(),end:new Date(Date.now()+3600000).toISOString()},400);
 await call('generateShared',{period,examId:'r6-exam-'+other},400);
}
user={email:'r6-proctor@test.invalid',displayName:'Pengawas SD'};
const ps=await state(period);assert.equal(ps.exams.length,1);assert(ps.exams[0].canMonitor&&ps.exams[0].canProctor&&!ps.exams[0].canGrade);
queryReads=[];
const lightResponse=await routes.GET(new Request('https://cbt.test/api/cbt?view=operations&year=2044%2F2045'));
assert.equal(lightResponse.status,200);
const light=await lightResponse.json();
assert.equal(light.operations,true);
assert.deepEqual(light.exams.map(e=>e.id),ps.exams.map(e=>e.id));
assert.deepEqual(light.exams.map(e=>e.canProctor),ps.exams.map(e=>e.canProctor));
assert(light.banks.length>0&&light.banks.every(bank=>bank.unit==='SD'&&!('questions' in bank)));
assert(queryReads.some(read=>read.values[0]==='bank'&&read.query.includes("json_remove(data,'$.questions')")));
assert(queryReads.every(read=>!['snapshot','draft','audit'].includes(read.values[0])));
assert(queryReads.some(read=>read.query.includes("json_extract(data,'$.status') AS status")&&read.query.includes('FROM attempts')));

const makeup6=await call('makeup',{period,examId:'r6-exam-sd',studentId:'r6-pupil-sd',reason:'Siswa datang setelah ujian pertama selesai',start:new Date(Date.now()-1000).toISOString(),end:new Date(Date.now()+3600000).toISOString()});assert(makeup6.examId);assert(makeup6.token);
console.log('PASS: Rev6 super admin sees three units, each unit admin only its unit, cross-unit retake/token denied, proctor only assigned class and can create reasoned follow-up without grading access.');
}
// Admin menu contracts keep question and answer bodies behind individual detail requests.
{
 const period={year:'2044/2045',semester:1};
 const read=async(params,status=200)=>{
   const query=new URLSearchParams({year:period.year,semester:String(period.semester),...params});
   const response=await routes.GET(new Request('https://cbt.test/api/cbt?'+query,{headers:cookie?{cookie}:{}}));
   const body=await response.json();
   assert.equal(response.status,status,JSON.stringify(body));
   return body;
 };
 const bankId='r6-bank-sd',examId='scoped-exam-sd',studentId='r6-pupil-sd';
 await writeRecord(examId,'exam',{...await record('r6-exam-sd'),id:examId,bankId,participantsSelected:true,studentIds:[studentId],excludedStudentIds:[],duties:[{staffId:'scoped-grader',role:'grade'},{staffId:'r6-proctor',role:'proctor'}]});
 await writeRecord('scoped-grader','staff',{name:'Guru Koreksi QA',email:'scoped-grader@test.invalid',role:'Guru',unit:'SD',year:period.year,assignments:[{unit:'SD',subject:'Matematika',classes:['6 QA']}]});
 await writeRecord('scoped-unrelated-student','student',{name:'Other class',unit:'SD',className:'UNSCHEDULED',year:period.year,nis:'QA-OTHER'});
 const question={id:'scoped-question',sourceId:'original-source',type:'PG',scope:'Lingkup QA',text:'PRIVATE_QUESTION_TEXT',key:'0',options:['a','b'],points:10,images:['data:image/png;base64,AAAA']};
 await writeRecord(bankId,'bank',{title:'Scoped image package',unit:'SD',subject:'Matematika',year:period.year,semester:1,questions:[question]});
 await writeRecord('snapshot-'+examId,'snapshot',{questions:[question]});
 const attemptId='scoped-grade-test';
 sql.prepare('INSERT INTO attempts(id,student_id,exam_id,token_hash,data) VALUES(?,?,?,?,?)').run(attemptId,studentId,examId,'scoped-grade-hash',JSON.stringify({id:attemptId,studentId,examId,questions:[question],answers:{'scoped-question':'0'},grades:{'scoped-question':10},graded:true,status:'Dikumpulkan',sessionHash:'private-session'}));
 cookie='';user={email:'qa@example.test',displayName:'QA Admin'};
 await writeRecord('scoped-draft','draft',{ownerId:(await state(period)).staff.id,year:period.year,semester:1,form:{title:'Draf tersimpan',questions:[question]}});
 for(const menu of ['Dashboard','Tahun Pelajaran','Kelas','Siswa','Guru','Mata pelajaran','Jadwal ujian','Token ujian','Monitoring','Koreksi & nilai','Bank soal','Buat soal','Simulasi ujian','Pengelola','Riwayat aktivitas']){
   queryReads=[];
   const result=await read({menu});
   assert.equal(result.menu,menu);
   assert(!JSON.stringify(result).includes('PRIVATE_QUESTION_TEXT'),menu);
   assert(!JSON.stringify(result).includes('private-session'),menu);
   if(!['Bank soal','Buat soal','Simulasi ujian'].includes(menu))assert(queryReads.every(row=>!['bank','snapshot','draft'].includes(row.values[0])),menu);
   if(menu!=='Token ujian')assert(queryReads.every(row=>!row.query.includes('FROM attempts')),menu);
 }
 const activity=await read({menu:'Riwayat aktivitas'});
 queryReads=[];
 const tokenMenu=await read({menu:'Token ujian'});
 assert(tokenMenu.exams.some(exam=>exam.id===examId&&exam.canProctor));
 assert(tokenMenu.students.some(student=>student.id===studentId));
 assert.equal(tokenMenu.attempts.length,0);
 const tokenAttemptReads=queryReads.filter(read=>read.query.includes('FROM attempts'));
 assert(tokenAttemptReads.length<=1);
 assert(tokenAttemptReads.every(read=>read.query.startsWith('SELECT exam_id,student_id FROM attempts')&&read.query.includes('exam_id IN')&&!read.values.includes(examId)));
 assert(activity.audit.length>0&&activity.audit.length<=50);
 assert(activity.audit.every((row,i)=>i===0||activity.audit[i-1].at>=row.at));
 const bank=await read({menu:'Bank soal'});
 assert.equal(bank.banks.find(b=>b.id===bankId).questions[0].scope,question.scope);
 assert(bank.exams.find(e=>e.id===examId).questionSources.includes(question.sourceId));
 assert.equal((await read({detail:'bank',id:bankId})).questions[0].text,question.text);
 const draftIndex=await read({menu:'Buat soal'});
 assert(draftIndex.students.some(student=>student.id===studentId&&student.name&&student.nis));
 assert(!draftIndex.students.some(student=>student.id==='scoped-unrelated-student'));
 assert.equal(draftIndex.drafts.find(d=>d.id==='scoped-draft').form.title,'Draf tersimpan');
 assert.equal((await read({detail:'draft',id:'scoped-draft'})).questions[0].text,question.text);
 const activeSchedule=await record(examId);
 queryReads=[];
 assert(!(await read({menu:'Koreksi & nilai'})).exams.some(e=>e.id===examId));
 assert(!queryReads.some(row=>row.query.includes('FROM attempts')));
 await read({detail:'gradeExam',id:examId},409);
 await writeRecord(examId,'exam',{...activeSchedule,end:new Date(Date.now()-1000).toISOString()});
 queryReads=[];
 const gradeIndex=await read({menu:'Koreksi & nilai'});
 assert.equal(gradeIndex.attempts.length,0);
 assert(!queryReads.some(row=>row.query.includes('FROM attempts')));
 assert(gradeIndex.exams.some(e=>e.id===examId));
 assert(!gradeIndex.exams.some(e=>e.id==='r6-exam-smp'));
 queryReads=[];
 const examDetails=await read({detail:'gradeExam',id:examId});
 const summary=examDetails.attempts.find(a=>a.id===attemptId);
 assert.equal(summary.answeredCount,1);
 assert.equal(summary.questionCount,1);
 assert(!('answers' in summary)&&!('questions' in summary));
 assert.deepEqual(summary.points,{earned:10,maximum:10,provisional:false});
 const gradingAttemptReads=queryReads.filter(row=>row.query.includes('FROM attempts'));
 assert.equal(gradingAttemptReads.length,1);
 assert.deepEqual(gradingAttemptReads[0].values,[examId]);
 const scoringSQL=postgresQuery(queryReads.find(r=>r.query.includes('AS scoring_answers')).query);
 assert.match(scoringSQL,/jsonb_array_elements\(COALESCE\(NULLIF\(score_attempt.question_data::jsonb/);
 assert.match(scoringSQL,/data::jsonb ->> 'answers'/);
 assert(!scoringSQL.includes('json_extract')&&!scoringSQL.includes('json_group_array'));
 const grade=await read({detail:'grade',id:attemptId});
 assert.equal(grade.answers['scoped-question'],'0');
 assert.equal(grade.questions[0].text,question.text);
 assert(!('sessionHash' in grade));
 const weighted=[{...question,points:1},{...question,id:'complex',type:'PG_KOMPLEKS',key:'0,1',points:2},
   {...question,id:'essay',type:'URAIAN',keywords:'rumus;hasil',points:7}];
 const setAttempt=sql.prepare('UPDATE attempts SET data=?, question_data=? WHERE id=?');
 const weightedAttempt={...grade,questions:undefined,graded:false,answers:{[question.id]:'0',complex:'1,0',essay:'rumus'},grades:{}};
 setAttempt.run(JSON.stringify(weightedAttempt),JSON.stringify(weighted),attemptId);
 user={email:'scoped-grader@test.invalid',displayName:'Guru Koreksi QA'};
 const teacherSummary=(await read({detail:'gradeExam',id:examId})).attempts[0];
 assert.deepEqual(teacherSummary.points,{earned:6.5,maximum:10,provisional:true});
 assert.equal(teacherSummary.answeredCount,3);
 await call('grade',{period,id:attemptId,grades:{complex:2,essay:6.25}});
 const corrected=(await read({detail:'gradeExam',id:examId})).attempts[0];
 assert.deepEqual(corrected.points,{earned:9.25,maximum:10,provisional:false});
 assert.equal(corrected.score,92.5);
 const schedule=await record(examId);
 const now=Date.now();
 await writeRecord(examId,'exam',{...schedule,end:new Date(now-1000).toISOString()});
 setAttempt.run(JSON.stringify({...weightedAttempt,status:'Mengerjakan',deadline:now+60000}),JSON.stringify(weighted),attemptId);
 assert((await read({menu:'Koreksi & nilai'})).exams.some(e=>e.id===examId));
 const stillRunning=await read({detail:'gradeExam',id:examId},409);
 assert.match(stillRunning.error,/Masih ada siswa/);
 setAttempt.run(JSON.stringify({...weightedAttempt,status:'Mengerjakan',deadline:now-1000}),JSON.stringify(weighted),attemptId);
 assert((await read({menu:'Koreksi & nilai'})).exams.some(e=>e.id===examId));
 const expired=(await read({detail:'gradeExam',id:examId})).attempts[0];
 assert.equal(expired.timedOut,true);
 assert.deepEqual(expired.points,{earned:6.5,maximum:10,provisional:true});
 await writeRecord(examId,'exam',schedule);
 setAttempt.run(JSON.stringify(grade),null,attemptId);
 user={email:'r6-admin-smp@test.invalid',displayName:'Admin SMP'};
 const smpParticipants=(await read({menu:'Buat soal'})).students;
 assert(smpParticipants.some(student=>student.id==='r6-pupil-smp'));
 assert(smpParticipants.every(student=>student.unit==='SMP'));
 const limited=await read({menu:'Bank soal'});
 assert(limited.banks.length>0&&limited.banks.every(b=>b.unit==='SMP'));
 await read({detail:'bank',id:bankId},404);
 await read({detail:'gradeExam',id:examId},404);
 await read({detail:'grade',id:attemptId},404);
 await read({detail:'draft',id:'scoped-draft'},404);
 await read({menu:'Pengelola'},403);
 user={email:'r6-admin-sd@test.invalid',displayName:'Admin SD'};
 assert.equal((await read({detail:'grade',id:attemptId})).id,attemptId);
 assert.equal((await read({detail:'bank',id:bankId})).id,bankId);
 user={email:'r6-proctor@test.invalid',displayName:'Pengawas SD'};
 const teacherList=await read({menu:'Guru'});
 assert.equal(teacherList.menu,'Guru');
 assert(teacherList.navigation.token&&teacherList.navigation.monitor);
 assert(!teacherList.banks.length&&!teacherList.exams.length&&!teacherList.attempts.length);
 const teacherToken=await read({menu:'Token ujian'});
 assert(teacherToken.exams.length>0&&teacherToken.exams.every(e=>e.unit==='SD'));
 const teacherGrades=await read({menu:'Koreksi & nilai'});
 assert(!teacherGrades.attempts.some(a=>a.id===attemptId));
 await read({detail:'gradeExam',id:examId},404);
 await read({detail:'bank',id:'r6-bank-smp'},404);
 await read({menu:'Pengelola'},403);
 user={email:'qa@example.test',displayName:'QA Admin'};
 const pupilCard=(await call('accountCards',{period,kind:'student',id:studentId})).cards[0];
 await loginCard(pupilCard);
 queryReads=[];
 const pupilResults=await read({studentMenu:'Hasil ujian'});
 assert.equal(pupilResults.student.id,studentId);
 assert.deepEqual(pupilResults.exams.map(e=>e.id),[examId]);
 assert.equal(pupilResults.attempts[0].id,attemptId);
 assert(!JSON.stringify(pupilResults).includes('PRIVATE_QUESTION_TEXT'));
 assert(queryReads.some(row=>row.values[0]==='exam'&&row.query.includes('id IN')));
 await writeRecord('scoped-future-exam','exam',{...activeSchedule,id:'scoped-future-exam',studentIds:[],participantsSelected:false,excludedStudentIds:[]});
 const pupilSchedules=await read({studentMenu:'Jadwal ujian'});
 assert(pupilSchedules.exams.some(e=>e.id==='scoped-future-exam'));
 assert(!(await read({studentMenu:'Hasil ujian'})).exams.some(e=>e.id==='scoped-future-exam'));
 assert(pupilSchedules.attempts.every(a=>a.score===null));
 cookie='';
 assert.equal(policy.submissionDelay(10000,5000,false,0.5),1100);
 assert.equal(policy.submissionDelay(10000,7400,false,0.99),100);
 assert.equal(policy.submissionDelay(10000,9600,false,0.99),0);
 assert.equal(policy.submissionDelay(10000,10000,true,0.5),1750);
 console.log('PASS: scoped admin, teacher, and student menus, deferred details, unit access, and deadline-aware submission delay.');
}
// Import approval permits warnings and missing keys, with explicit manual grading.
{
cookie='';user={email:'qa@example.test',displayName:'QA Admin'};
const period={year:'2044/2045',semester:1};
const questions=[{id:'approve-pg',type:'PG',text:'Pertanyaan hasil impor',options:['Satu','Dua'],key:'',points:10,sourceLabel:'1',importIssues:['Kunci belum ditemukan']},{id:'approve-match',type:'MENJODOHKAN',text:'Pasangkan',options:[],left:['A'],right:['B'],key:'',points:10,sourceLabel:'2'},{id:'approve-multi',type:'PG_KOMPLEKS',text:'Pilih beberapa',options:['A','B'],key:'',points:10,sourceLabel:'3'},{id:'approve-essay',type:'URAIAN',text:'Jelaskan [PERIKSA RUMUS]',options:[],key:'',points:10,sourceLabel:'4'}];
const pkg={title:'Paket persetujuan impor',unit:'SD',subject:'Matematika',grade:'6',additionalQuestionTypes:['PG','PG_KOMPLEKS','MENJODOHKAN','URAIAN'],questions};
await call('saveBank',{period,data:pkg},400);
await call('saveBank',{period,data:{...pkg,questions:questions.map(q=>({...q,importReviewed:true}))}});
const saved=(await state(period)).banks.find(b=>b.title===pkg.title);assert(saved.questions.every(q=>q.manualGrading&&q.importReviewed));assert.equal(model.mark(saved.questions,{})['approve-pg'],null);
await call('saveBank',{period,data:{...pkg,title:'Invalid structure',questions:[{...questions[0],options:[],importReviewed:true}]}},400);
await call('saveBank',{period,data:{...pkg,title:'Invalid key',questions:[{...questions[0],key:'99',importReviewed:true}]}},400);
const a={id:'approve-attempt',studentId:'r6-pupil-sd',examId:'r6-exam-sd',status:'Dikumpulkan',questions:saved.questions,answers:{'approve-pg':'1'},grades:model.mark(saved.questions,{}),published:false};
sql.prepare('INSERT INTO attempts(id,student_id,exam_id,token_hash,data) VALUES(?,?,?,?,?)').run(a.id,a.studentId,a.examId,'approve-test-token',JSON.stringify(a));
await call('grade',{period,id:a.id,grades:{}},400);
await call('grade',{period,id:a.id,grades:Object.fromEntries(saved.questions.map(q=>[q.id,7]))});
assert.equal(JSON.parse(sql.prepare('SELECT data FROM attempts WHERE id=?').get(a.id).data).score,70);
console.log('PASS: approved import saves all supported missing-key types and review warnings, retains review metadata, requires manual scores, rejects malformed options and out-of-range keys.');
}
{
cookie='';user={email:'qa@example.test',displayName:'QA Admin'};
const period={year:'2044/2045',semester:1};
const q={id:'six-options-import',type:'PG_KOMPLEKS',text:'Pilih jawaban sesuai naskah.',options:['A','B','C','D','E','F'],key:'0,5',points:10,importReviewed:true};
await call('saveBank',{period,data:{title:'SMA enam opsi dari Word',unit:'SMA',subject:'Matematika',grade:'2',additionalQuestionTypes:['PG_KOMPLEKS'],questions:[q]}});
const saved=(await state(period)).banks.find(b=>b.title==='SMA enam opsi dari Word');assert.equal(saved.questions[0].options.length,6);assert.equal(saved.questions[0].key,'0,5');
await call('saveBank',{period,data:{title:'Terlalu banyak opsi',unit:'SMA',subject:'Matematika',grade:'2',additionalQuestionTypes:['PG_KOMPLEKS'],questions:[{...q,options:[...q.options,'G']}]}},400);
console.log('PASS: six source options are preserved for SMA; seven options still rejected.');
}

// REV.7: destructive academic operations and archived question lifecycle.
{
 cookie='';user={email:'qa@example.test',displayName:'QA Admin'};
 const period={year:'2050/2051',semester:1},next={year:'2051/2052',semester:1};
 await call('saveYear',{data:{name:period.year}});await call('saveYear',{data:{name:next.year}});
 await writeRecord('rev7-student','student',{name:'Siswa dua tahun',nis:'70001',unit:'SD',className:'5 A',year:period.year});
 await writeRecord('student-year:'+next.year+':rev7-student','student_year',{name:'Siswa dua tahun',nis:'70001',unit:'SD',className:'6 A',year:next.year});
 await writeRecord('rev7-class','class',{name:'5 A',unit:'SD',grade:'5',year:period.year});
 await writeRecord('rev7-subject','subject',{name:'Matematika',unit:'SD',year:period.year,grades:['5']});
 const q={id:'rev7-q',type:'PG',text:'Satu tambah satu?',options:['1','2'],key:'1',points:10};
 await writeRecord('rev7-bank','bank',{title:'Bank tetap',unit:'SD',subject:'Matematika',grade:'5',year:period.year,questions:[q]});
 const semester2={...period,semester:2};assert.equal((await state(semester2)).students.find(s=>s.id==='rev7-student').className,'5 A');
 await call('saveClass',{period:semester2,data:{name:'5 B',unit:'SD',grade:'5',year:period.year}});
 await call('saveStudent',{period:semester2,data:{...(await state(semester2)).students.find(s=>s.id==='rev7-student'),className:'5 B'}});
 assert.equal((await state(period)).students.find(s=>s.id==='rev7-student').className,'5 A');
 await writeRecord('rev7-exam','exam',{year:period.year,semester:1,unit:'SD',className:'5 A',subject:'Matematika',bankId:'rev7-bank'});
 await writeRecord('snapshot-rev7-exam','snapshot',{questions:[q]});
 await writeRecord('shared-rev7-exam','shared_token',{issuedSlot:1});
 const year=(await state(period)).years.find(y=>y.name===period.year);
 user={email:'admin@example.test'};await call('deleteYear',{id:year.id,confirm:true},400);
 user={email:'qa@example.test'};await call('deleteYear',{id:year.id},400);
 await call('activateYear',{data:year});await call('deleteYear',{id:year.id,confirm:true});
 assert(!(await record(year.id)));assert(!(await record('rev7-exam')));assert(!(await record('snapshot-rev7-exam')));assert(!(await record('shared-rev7-exam')));
 assert(await record('rev7-bank'));assert.equal((await state(next)).students.find(s=>s.id==='rev7-student').className,'6 A');
 assert.equal((await state(period)).students.length,0);assert.equal((await state(semester2)).students.length,0);
 assert.equal((await state(period)).classes.length,0);assert.equal((await state(period)).subjects.length,0);
 await writeRecord('rev7-bank','bank',{...(await record('rev7-bank')),deletedAt:Date.now(),retainQuestions:true});
 await writeRecord('rev7-destination','bank',{title:'Tujuan',unit:'SD',subject:'Matematika',grade:'5',year:next.year,questions:[]});
 const archived=()=>(sql.prepare('SELECT * FROM records WHERE id=?').get('rev7-bank'));
 const version=()=>archived().version;
 user={email:'admin@example.test'};await call('archiveQuestion',{bankId:'rev7-bank',version:version(),questionId:q.id,operation:'delete',confirm:true},400);
 user={email:'qa@example.test'};
 await call('archiveQuestion',{bankId:'rev7-bank',version:version()-1,questionId:q.id,operation:'edit',question:q},400);
 await call('archiveQuestion',{bankId:'rev7-bank',version:version(),questionId:q.id,operation:'edit',question:{...q,text:'Dua tambah dua?'}});
 const revised=(await record('rev7-bank')).questions[0];assert.notEqual(revised.id,q.id);assert.equal(revised.text,'Dua tambah dua?');
 await call('archiveQuestion',{bankId:'rev7-bank',version:version(),questionId:revised.id,operation:'move',targetId:'rev7-destination',targetVersion:99,confirm:true},400);
 assert.equal((await record('rev7-bank')).questions.length,1);
 await call('archiveQuestion',{bankId:'rev7-bank',version:version(),questionId:revised.id,operation:'move',targetId:'rev7-destination',targetVersion:0,confirm:true});
 assert.equal((await record('rev7-bank')).questions.length,0);assert.equal((await record('rev7-destination')).questions.length,1);
 await writeRecord('rev7-bank','bank',{...(await record('rev7-bank')),questions:[q]});
 await call('archiveQuestion',{bankId:'rev7-bank',version:version(),questionId:q.id,operation:'delete',confirm:true});assert.equal((await record('rev7-bank')).questions.length,0);
 console.log('PASS: REV.7 year deletion is super-admin-only, removes both semesters and schedule artifacts, preserves question bank and later-year identity; archived edit/move/delete validates scope and versions.');
}

{
 cookie='';user={email:'qa@example.test',displayName:'QA Admin'};
 const period={year:'2044/2045',semester:1};
 const q={id:'rev8-bs',type:'MENJODOHKAN',format:'BENAR_SALAH',presentation:'KATEGORI',text:'Periksa pernyataan',options:[],left:['Satu','Dua'],right:['Benar','Salah'],key:'0,1',points:4};
 await call('saveBank',{period,data:{title:'REV8 Kategori',unit:'SD',subject:'Matematika',questions:[q],additionalQuestionTypes:['BENAR_SALAH']}});
 const bank=(await state(period)).banks.find(b=>b.title==='REV8 Kategori');
 await writeRecord('rev8-exam','exam',{...period,unit:'SD',className:'6 A',subject:'Matematika',bankId:bank.id});
 const a={id:'rev8-result',examId:'rev8-exam',studentId:'rev8-pupil',questions:[q],status:'Dikumpulkan',answers:{[q.id]:'0,1'},grades:{[q.id]:4},graded:true,published:true,score:100};
 sql.prepare('INSERT INTO attempts(id,student_id,exam_id,token_hash,data) VALUES(?,?,?,?,?)').run(a.id,a.studentId,a.examId,'test-rev8-result',JSON.stringify(a));
 await call('saveBank',{period,data:{...bank,questions:[{...q,key:'1,1'}]}});
 assert.equal((await state(period)).attempts.find(x=>x.id===a.id).questions[0].key,'0,1');
 await call('reopenGrade',{period,id:a.id});
 const opened=(await state(period)).attempts.find(x=>x.id===a.id);
 assert.equal(opened.published,false);assert.equal(opened.questions[0].key,'1,1');assert.equal(opened.grades[q.id],2);
 await call('publishMany',{period,ids:[a.id]},400);
 await call('grade',{period,id:a.id,grades:{[q.id]:2.5}});await call('publish',{period,id:a.id});
 assert.equal((await state(period)).attempts.find(x=>x.id===a.id).score,62.5);
 await call('saveClass',{activeYearAtOpen:'1900/1901',data:{name:'STALE',unit:'SD',grade:'6'}},400);
 console.log('PASS: REV.8 multi-statement True/False, changed key, frozen publication, reopening, decimal marking and active-year guard.');
}

// Exercise concurrent answer saves and idempotent submission against isolated fixtures.
{
 const session='11111111-1111-4111-a111-111111111111';
 async function digest(value){
   return Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))).toString('hex');
 }
 const sessionHash=await digest(session);
 const examId='scale-check-exam';
 const now=Date.now();
 const questions=[{...pgk,id:'batch-a'},{...pgk,id:'batch-b'}];
 await writeRecord(examId,'exam',{id:examId,title:'Scale check',unit:'SMP',status:'Aktif',start:new Date(now-60000).toISOString(),end:new Date(now+600000).toISOString(),duration:10});
 const insert=sql.prepare('INSERT INTO attempts(id,student_id,exam_id,token_hash,data) VALUES(?,?,?,?,?)');
 const students=Array.from({length:1000},(_,i)=>({id:'scale-check-'+i,token:'SCALE-CHECK-'+i}));
 await Promise.all(students.map(async ({id,token})=>{
   const studentId=id+'-student';
   await writeRecord(studentId,'student',{id:studentId,name:id});
   insert.run(id,studentId,examId,await digest(token),JSON.stringify({id,studentId,examId,sessionHash,questions,status:'Mengerjakan',answers:{},deadline:now+600000,submitAfter:now-1000,lastSeenAt:now}));
 }));
 cookie='';
 const answers={'batch-a':'0','batch-b':'1'};
 await call('saveAnswers',{token:students[0].token,answers:{...answers,unknown:'x'}},400);
 assert.deepEqual(JSON.parse(sql.prepare('SELECT data FROM attempts WHERE id=?').get(students[0].id).data).answers,{});
 await Promise.all(students.map(async ({token})=>{
   const ack=await call('saveAnswers',{token,answers});
   assert(ack.compact&&ack.lastSavedAt&&!ack.questions);
 }));
 const submitAll=()=>Promise.all(students.map(({token})=>call('submit',{token})));
 const initial=await submitAll(), retried=await submitAll();
 assert.deepEqual(retried.map(a=>a.id),initial.map(a=>a.id));
 const stored=sql.prepare('SELECT data,version FROM attempts WHERE exam_id=?').all(examId);
 assert.equal(stored.length,1000);
 for(const row of stored){
   const data=JSON.parse(row.data);
   assert.equal(data.status,'Dikumpulkan');
   assert.deepEqual(data.answers,answers);
   assert.equal(row.version,2);
 }
 console.log('PASS: 1,000 synthetic attempts retained every answer; retrying submit produced no additional writes.');
 await loginCard(ownerCard);
 const monitoringMenuUrl='https://cbt.test/api/cbt?year=2026%2F2027&semester=1&menu=Monitoring&menuVersion=2';
 queryReads=[];
 const menuResponse=await routes.GET(new Request(monitoringMenuUrl,{headers:{cookie}}));
 assert.equal(menuResponse.status,200);
 const menu=await menuResponse.json();
 assert.equal(menu.operations,true);
 assert(menu.exams.some(exam=>exam.id===examId&&exam.canMonitor));
 assert.equal(menu.attempts.length,0);
 assert(queryReads.every(read=>!read.query.includes('FROM attempts')),'Opening Monitoring must not read attempts');
 const monitoringUrl='https://cbt.test/api/cbt?year=2026%2F2027&semester=1&monitorExam='+examId;
 const monitor=()=>routes.GET(new Request(monitoringUrl,{headers:{cookie}}));
 queryReads=[];
 const response=await monitor();
 assert.equal(response.status,200);
 const progress=await response.json();
 assert.equal(progress.attempts.length,1000);
 assert(progress.attempts.every(a=>a.answeredCount===2&&a.questionCount===2&&a.status==='Dikumpulkan'&&!('answers' in a)&&!('questions' in a)));
 assert(queryReads.every(read=>!['bank','snapshot','draft','audit'].includes(read.values[0])));
const attemptReads=queryReads.filter(read=>read.query.includes('FROM attempts'));
 assert.equal(attemptReads.length,1);
 const [monitorRead]=attemptReads;
 assert.equal(monitorRead.values[0],examId);
assert(monitorRead&&monitorRead.query.includes("'$.answers'"),'Monitoring counts answers while projecting them out');
 const outsideMonitor={username:'monitor-outside-qa',password:'monitor-outside-test-only'};
 const outsideMonitorId='monitor-outside-staff';
 await writeRecord(outsideMonitorId,'staff',{role:'Admin Unit',unit:'SD',name:'QA Monitoring'});
 await authlib.writeRecord('credential-'+outsideMonitor.username,'credential',{staffId:outsideMonitorId,username:outsideMonitor.username,salt:'monitor-qa',hash:await pw.passwordHash(outsideMonitor.password,'monitor-qa')});
 await loginCard(outsideMonitor);
 assert.equal((await monitor()).status,403);
 console.log('PASS: 1,000 monitoring summaries without question payloads or bank reads; out-of-unit access denied.');

}

{
 const date=time=>Date.parse('2026-11-24T'+time+':00+07:00');
 const morning={start:new Date(date('08:00')).toISOString(),end:new Date(date('09:00')).toISOString(),proctor:false};
 const afternoon={start:new Date(date('11:30')).toISOString(),end:new Date(date('12:30')).toISOString(),proctor:true};
 assert.equal(examMode.teacherExamWindow([morning,afternoon],date('07:29')),null);
 assert.equal(examMode.teacherExamWindow([morning,afternoon],date('07:30')).until,date('12:45'));
 assert.equal(examMode.teacherExamWindow([morning,afternoon],date('10:00')).home,'Jadwal ujian');
 assert.equal(examMode.teacherExamWindow([morning,afternoon],date('11:00')).home,'Token ujian');
 assert.equal(examMode.teacherExamWindow([morning,afternoon],date('12:45')),null);
 assert.equal(examMode.teacherExamWindow([morning,{...afternoon,effectiveEnd:date('13:00')}],date('12:46')).until,date('13:15'));
 const now=Date.now(),unit='MODE-QA',teacher='mode-qa-teacher',id='mode-qa-exam';
 await writeRecord(teacher,'staff',{name:'Pengawas Mode QA',role:'Guru',email:'mode-qa-teacher@test.invalid',unit,assignments:[]});
 await writeRecord('mode-qa-other','staff',{name:'Guru Mode QA',role:'Guru',email:'mode-qa-other@test.invalid',unit,assignments:[]});
 await writeRecord('mode-qa-admin','staff',{name:'Admin Mode QA',role:'Admin Unit',email:'mode-qa-admin@test.invalid',unit});
 const schedule={unit,start:new Date(now+10*60000).toISOString(),end:new Date(now+60*60000).toISOString(),status:'Aktif',duties:[{staffId:teacher,role:'proctor'}]};
 await writeRecord(id,'exam',schedule);
 const earlierId='mode-qa-extended-exam';
 const earlier={...schedule,start:new Date(now-60000).toISOString(),end:new Date(now+60000).toISOString()};
 await writeRecord(earlierId,'exam',earlier);
 const extendedUntil=now+100*60000;
 sql.prepare('INSERT INTO attempts(id,student_id,exam_id,token_hash,data) VALUES(?,?,?,?,?)').run(earlierId+'-attempt','mode-pupil',earlierId,'mode-extended-hash',JSON.stringify({deadline:extendedUntil,status:'Mengerjakan'}));
 const modeRead=async (query,status=200)=>{
   const response=await routes.GET(new Request('https://cbt.test/api/cbt?'+query));
   const result=await response.json();
   assert.equal(response.status,status,JSON.stringify(result));
   return result;
 };
 teacherModeEnabled=true;
 cookie='';
 user={email:'mode-qa-teacher@test.invalid',displayName:'Pengawas Mode QA'};
 queryReads=[];
 assert.equal((await modeRead('entry=1')).entry.teacherExamMode.home,'Token ujian');
 assert.equal((await modeRead('activePeriod=1')).teacherExamMode.home,'Token ujian');
 assert(!queryReads.some(read=>read.query.includes('AS pause_until')),'Scheduled exam mode must skip reading session deadlines');
 const originalDateNow=Date.now;
 try {
   Date.now=()=>now+80*60000;
   assert.equal((await modeRead('activePeriod=1')).teacherExamMode.until,extendedUntil+examMode.teacherExamGrace);
 } finally { Date.now=originalDateNow; }
 await writeRecord(earlierId,'exam',{...earlier,simulation:true});
 for(const menu of ['Buat soal','Bank soal','Koreksi & nilai'])await modeRead('menu='+encodeURIComponent(menu),423);
 await modeRead('menu=Token+ujian');await modeRead('menu=Monitoring');await modeRead('menu=Jadwal+ujian');
 await modeRead('detail=bank&id=any-package',423);
 await modeRead('detail=gradeExam&id=any-exam',423);
 await call('saveBank',{data:{}},423);
 const draft=await call('saveDraft',{data:{title:'Draf saat ujian',questions:[]}});
 assert.equal((await modeRead('detail=draft&id='+draft.id)).title,'Draf saat ujian');
 user={email:'mode-qa-other@test.invalid',displayName:'Guru Mode QA'};
 assert.equal((await modeRead('entry=1')).entry.teacherExamMode.home,'Jadwal ujian');
 user={email:'mode-qa-admin@test.invalid',displayName:'Admin Mode QA'};
 assert.equal((await modeRead('entry=1')).entry.teacherExamMode,undefined);
 await modeRead('menu=Bank+soal');
 user={email:'qa@example.test',displayName:'QA Admin'};
 assert.equal((await modeRead('entry=1')).entry.teacherExamMode,undefined);
 await modeRead('menu=Koreksi+%26+nilai');
 user={email:'mode-qa-teacher@test.invalid',displayName:'Pengawas Mode QA'};
 await writeRecord(id,'exam',{...schedule,simulation:true});
 assert.equal((await modeRead('entry=1')).entry.teacherExamMode,undefined);
 await modeRead('menu=Bank+soal');
 teacherModeEnabled=false;
 console.log('PASS: teacher-only exam mode follows WIB windows, assigned proctor landing, API locks, drafts, and admin exceptions.');
}

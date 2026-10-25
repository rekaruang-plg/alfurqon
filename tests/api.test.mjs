import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {DatabaseSync} from 'node:sqlite';
const sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync('drizzle/0000_chemical_la_nuit.sql','utf8'));
function statement(query,values=[]){return {bind(...args){return statement(query,args)},async first(){return sql.prepare(query).get(...values)||null},async all(){return {results:sql.prepare(query).all(...values)}},async run(){const r=sql.prepare(query).run(...values);return {meta:{changes:r.changes}}}}}
const DB={prepare:statement,async batch(items){sql.exec('BEGIN');try{const r=[];for(const item of items)r.push(await item.run());sql.exec('COMMIT');return r}catch(e){sql.exec('ROLLBACK');throw e}}};
let user={userId:'owner',email:'qa@example.test',displayName:'QA Admin',fullName:null};
function evaluate(source,vars){const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const box={exports:{},crypto,Response,Request,URL,TextEncoder,TextDecoder,Date,console,...vars};vm.runInNewContext(js,box);return box.exports}
const strip=s=>s.replace(/^import .*;\n/gm,'');
const policy=evaluate(strip(fs.readFileSync('lib/review-policy.ts','utf8')),{});
const model=evaluate(strip(fs.readFileSync('lib/model.ts','utf8')),policy);
const source=fs.readFileSync('app/api/cbt/route.ts','utf8').replace(/^import .*;\n/gm,'');
const simulation=evaluate(fs.readFileSync('lib/simulations.ts','utf8').replace(/^import .*;\n/gm,''),{});
const vault=evaluate(fs.readFileSync('lib/token-vault.ts','utf8'),{});
const pw=evaluate(fs.readFileSync('lib/password.ts','utf8'),{});
const record=async key=>{const r=sql.prepare('SELECT * FROM records WHERE id=?').get(key);return r?{...JSON.parse(r.data),id:r.id}:null};
const records=async kind=>sql.prepare('SELECT * FROM records WHERE kind=?').all(kind).map(r=>({...JSON.parse(r.data),id:r.id}));
const writeRecord=async(key,kind,data)=>sql.prepare('INSERT INTO records(id,kind,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=records.version+1').run(key,kind,JSON.stringify(data));
const generated=evaluate(strip(fs.readFileSync('lib/generated-account.ts','utf8')),{record,records,writeRecord,authDB:()=>DB,...pw,...vault,env:{TOKEN_VAULT_KEY:'ab'.repeat(32)}});
const authlib=evaluate(strip(fs.readFileSync('lib/staff-auth.ts','utf8')),{env:{DB},getChatGPTUser:async()=>null,...pw});
const authRoutes=evaluate(strip(fs.readFileSync('app/api/auth/route.ts','utf8')),{...authlib,...pw});
let cookie='';
const routes=evaluate(source,{env:{DB,TOKEN_VAULT_KEY:'ab'.repeat(32)},actor:async req=>{if(req?.headers.get('cookie'))return authlib.staffActor(req);if(!user)throw Error('Login diperlukan');const staff=sql.prepare("SELECT * FROM records WHERE kind IN ('staff','student_identity')").all().map(r=>({...JSON.parse(r.data),id:r.id,version:r.version})).find(s=>s.email===user.email);if(staff?.disabled)throw Error('Akun nonaktif');return {user,staff,authMethod:'chatgpt'}},authRecords:async kind=>sql.prepare('SELECT * FROM records WHERE kind=?').all(kind).map(r=>({...JSON.parse(r.data),id:r.id})),...model,...simulation,...vault,...policy,...generated});
async function call(action,body={},expected=200){const r=await routes.POST(new Request('https://cbt.test/api/cbt',{method:'POST',headers:{'Content-Type':'application/json','origin':'https://cbt.test',cookie},body:JSON.stringify({action,identityConfirmed:true,session:'11111111-1111-4111-a111-111111111111',...body})}));const d=await r.json();assert.equal(r.status,expected,JSON.stringify(d));return d}
async function state(){const r=await routes.GET(new Request('https://cbt.test/api/cbt',{headers:{cookie}}));return r.json()}
assert.equal((await state()).needsSetup,true);await call('setup');await call('setup',{},400);
let data=await state();assert.equal(data.students.length,4);const exam=data.exams[0],bank=data.banks[0];
const issued=(await call('generate',{examId:exam.id})).issued;assert.equal(issued.length,4);assert.equal((await call('generate',{examId:exam.id})).issued.length,0);
const token=issued[0].token;let a=await call('enter',{token});assert.equal(a.questions.length,4);assert(a.questions.every(q=>!('key' in q)));const order=a.questions.map(q=>q.id).join();const deadline=a.deadline;
for(const q of bank.questions)await call('answer',{token,questionId:q.id,value:q.type==='PG'?q.key:'48 cm²',flags:[]});
a=await call('enter',{token});assert.equal(a.questions.map(q=>q.id).join(),order);assert.equal(a.deadline,deadline);assert.equal(Object.keys(a.answers).length,4);assert.equal(a.score,null);
await call('submit',{token},400);sql.prepare("UPDATE attempts SET data=json_set(data,'$.submitAfter',0) WHERE id=?").run(a.id);await call('submit',{token});data=await state();let result=data.attempts.find(r=>r.id===a.id);assert.equal(result.status,'Dikumpulkan');await call('publish',{id:a.id},400);
const grades=Object.fromEntries(result.questions.map(q=>[q.id,q.points]));await call('grade',{id:a.id,grades:{...grades,extra:9999},feedback:'Bagus'});await call('publish',{id:a.id});assert.equal((await call('enter',{token})).score,100);await call('grade',{id:a.id,grades},400);
await call('saveStaff',{data:{email:'teacher@example.test',name:'Guru',role:'Guru',unit:'SD',subject:'Matematika',permission:'Koreksi saja'}});
user={...user,email:'teacher@example.test'};await call('saveBank',{data:bank});await call('generate',{examId:exam.id},400);
user={...user,email:'qa@example.test'};await call('saveStaff',{data:{email:'admin@example.test',name:'Admin SMP',role:'Admin Unit',unit:'SMP',permission:'Full akses'}});
user={...user,email:'admin@example.test'};await call('saveStudent',{data:{name:'X',nis:'X',unit:'SD',className:'6A'}},400);
let own=(await state()).staff;await call('saveStudent',{data:{id:own.id,version:own.version,name:'X',nis:'X',unit:'SMP',className:'7A',role:'Super Admin'}},400);
user={...user,email:'qa@example.test'};
await call('saveExam',{data:{title:'Bentrok',unit:'SD',className:'6A',bankId:bank.id,duration:60,start:exam.start,end:exam.end}},400);
const csrf=await routes.POST(new Request('https://cbt.test/api/cbt',{method:'POST',headers:{origin:'https://other.test'},body:'{"action":"setup"}'}));assert.equal(csrf.status,400);
// New revision: master subjects, checkbox grading and repeatable token retrieval.
assert.equal(data.subjects.length,32);
assert.equal((await state()).banks.filter(b=>b.simulation).length,32);
await call('prepareUpdate');await call('prepareUpdate');assert.equal((await state()).banks.filter(b=>b.simulation).length,32);
await call('saveSubject',{data:{name:'Seni Budaya',unit:'SD'}});await call('saveSubject',{data:{name:'seni budaya',unit:'SD'}});
await call('saveBank',{data:{title:'Invalid',unit:'SD',subject:'Tidak terdaftar',questions:bank.questions}},400);
await call('saveStaff',{data:{email:'invalid@example.test',name:'X',role:'Guru',unit:'SD',subject:'Tidak terdaftar'}},400);
const tokens=(await call('listTokens',{examId:exam.id})).issued;assert.equal(tokens[0].token,token);assert.equal((await call('listTokens',{examId:exam.id})).issued[0].token,token);
assert(!JSON.stringify(await state()).includes(token));assert(!sql.prepare("SELECT data FROM records WHERE kind='token_vault'").all().some(r=>r.data.includes(token)));
const oldToken=issued[1].token;const resumed=await call('enter',{token:oldToken});await call('answer',{token:oldToken,questionId:resumed.questions[0].id,value:'0',flags:[]});
const replacement=(await call('reissue',{id:resumed.id})).issued[0].token;await call('enter',{token:oldToken},400);const recovered=await call('enter',{token:replacement});assert.equal(recovered.deadline,resumed.deadline);assert.equal(recovered.answers[resumed.questions[0].id],'0');assert((await call('listTokens',{examId:exam.id})).issued.some(x=>x.token===replacement));
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
await call('saveClass',{data:{name:'6B',grade:'6',unit:'SD',year:'2026/2027'}});let rows=[{Nama:'Siswa Impor',NIS:'000123',Unit:'SD',Kelas:'6B',Tahun:'2026/2027'}];assert((await call('importStudents',{rows})).valid);await call('importStudents',{rows,commit:true});assert((await call('importStudents',{rows})).valid);
// Correction-only teacher may publish assigned results under revised policy.
sql.prepare("UPDATE attempts SET data=json_set(data,'$.deadline',0) WHERE id=?").run(fresh.id);await call('submit',{token:t3,session:'22222222-2222-4222-a222-222222222222'});user={email:'teacher@example.test',displayName:'Guru'};await call('grade',{id:fresh.id,grades:Object.fromEntries(fresh.questions.map(q=>[q.id,q.points]))});await call('publish',{id:fresh.id});user={email:'qa@example.test',displayName:'QA Admin'};
// Backup restore into an empty database preserves ids, answers, and counts.
const backup=await call('backup');const restored=new DatabaseSync(':memory:');restored.exec(fs.readFileSync('drizzle/0000_chemical_la_nuit.sql','utf8'));for(const r of backup.records)restored.prepare('INSERT INTO records(id,kind,data,version) VALUES(?,?,?,?)').run(r.id,r.kind,r.data,r.version);for(const r of backup.attempts)restored.prepare('INSERT INTO attempts(id,student_id,exam_id,token_hash,data,version) VALUES(?,?,?,?,?,?)').run(r.id,r.student_id,r.exam_id,r.token_hash,r.data,r.version);assert.equal(restored.prepare('SELECT COUNT(*) n FROM attempts').get().n,backup.attempts.length);assert.equal(restored.prepare('SELECT data FROM attempts WHERE id=?').get(fresh.id).data,sql.prepare('SELECT data FROM attempts WHERE id=?').get(fresh.id).data);
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
review=await state();const pupil=review.students.find(s=>s.nis==='000999');const card=(await call('accountCards',{kind:'student',id:pupil.id})).cards[0];assert(card.username.includes('000999'));assert(card.password.length>=12);assert.equal((await call('accountCards',{kind:'student',id:pupil.id})).cards[0].password,card.password);
const tk=(await call('generate',{examId:reviewExams[0].id})).issued[0].token;assert.equal(tk.length,10);await call('enter',{token:tk,identityConfirmed:false},400);const attempt=await call('enter',{token:tk});assert(!JSON.stringify(attempt.questions).includes('keywords'));await call('submit',{token:tk},400);
sql.prepare("UPDATE attempts SET data=json_set(data,'$.submitAfter',0) WHERE id=?").run(attempt.id);await call('submit',{token:tk},400);
await call('answer',{token:tk,questionId:'cx',value:'0',flags:[]});await call('answer',{token:tk,questionId:'written1',value:'lingkaran',flags:['written1']});await call('submit',{token:tk},400);
await call('answer',{token:tk,questionId:'written1',value:'lingkaran',flags:[]});await call('submit',{token:tk});
user={email:'teacher@example.test',displayName:'Guru'};await call('grade',{id:attempt.id,grades:{cx:30,written1:15}});assert.equal((await state()).attempts.find(a=>a.id===attempt.id).grades.cx,0);await call('publish',{id:attempt.id});
// Actual password login routes and cookie identity: only own history, no staff access.
const login=await authRoutes.POST(new Request('https://cbt.test/api/auth',{method:'POST',headers:{origin:'https://cbt.test'},body:JSON.stringify({action:'login',username:card.username,password:card.password})}));assert.equal(login.status,200,JSON.stringify(await login.clone().json()));cookie=login.headers.get('set-cookie').split(';')[0];
const portal=await state();assert.equal(portal.studentPortal,true);assert.equal(portal.student.id,pupil.id);assert.equal(portal.attempts.length,1);assert.equal(portal.attempts[0].score,30);assert(!portal.banks&&!portal.staffList&&!portal.loginAccounts);
assert.equal((await call('studentLaunch',{examId:reviewExams[0].id})).token,tk);await call('studentLaunch',{examId:exam.id},400);await call('saveSubject',{data:{name:'Forbidden',unit:'SD'}},400);await call('enter',{token},400);
cookie='';user={email:'qa@example.test',displayName:'QA Admin'};
// Homeroom may download published results but must not grade another teacher's mapel.
await call('saveStaff',{data:{name:'Wali',email:'wali@test.invalid',role:'Guru',unit:'SD',subject:'Bahasa Arab',permission:'Koreksi saja',assignments:[{unit:'SD',subject:'Bahasa Arab',classes:['5A']}]}});
review=await state();const wali=review.staffList.find(t=>t.email==='wali@test.invalid'),c5=review.classes.find(c=>c.name==='5A');await call('saveClass',{data:{...c5,homeroomId:wali.id}});
user={email:'wali@test.invalid',displayName:'Wali'};const wd=await state();assert(wd.students.some(s=>s.id===pupil.id));const wr=wd.attempts.find(a=>a.id===attempt.id);assert(wr.readOnly);assert.equal(wr.score,30);assert(!wr.questions);await call('grade',{id:attempt.id,grades:{cx:30,written1:20}},400);
user={email:'admin@example.test',displayName:'Admin SMP'};await call('accountCards',{kind:'student',id:pupil.id}).then(r=>assert.equal(r.cards.length,0));await call('importClasses',{rows:[{Unit:'SD',Kelas:'Illegal',Tingkat:'6',Tahun:'2026/2027'}],commit:true},400);
assert.equal(policy.answeredQuestion({type:'MENJODOHKAN',left:['a','b'],right:['a','b']},'0,'),false);
console.log('PASS: review document flows, bulk classes, multi-class topic schedule, teacher creation/bank linkage, short tokens, identity checkbox, quarter duration, unanswered and doubtful blocking, immutable objective scores, keyword suggestions, actual student password login, own historical results, homeroom read-only access and unit isolation.');
// Token-only return dashboard: requires the original device session and exposes only own records.
cookie='';user=null;
await call('tokenDashboard',{token:tk,session:'22222222-2222-4222-a222-222222222222'},400);
const tokenPortal=await call('tokenDashboard',{token:tk});assert.equal(tokenPortal.student.id,pupil.id);assert(tokenPortal.attempts.every(a=>a.id===attempt.id));assert(!tokenPortal.staffList&&!tokenPortal.banks&&!tokenPortal.loginAccounts);assert.equal(tokenPortal.attempts[0].score,30);assert(!JSON.stringify(tokenPortal).includes('keywords'));assert(!JSON.stringify(tokenPortal).includes('sessionHash'));
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
user={email:'qa@example.test',displayName:'QA Admin'};const shared1=await call('generateShared',{examId:revExam.id});const shared2=await call('generateShared',{examId:revExam.id});assert.notEqual(shared1.token,shared2.token);assert.equal((await call('viewShared',{examId:revExam.id})).token,shared2.token);assert.equal((await state()).attempts.filter(a=>a.examId===revExam.id).length,3);assert(!JSON.stringify(await state()).includes(shared2.token));
user={email:'admin@example.test',displayName:'Admin SMP'};await call('viewShared',{examId:revExam.id},400);await call('saveDuties',{examId:revExam.id,duties:[]},400);
user={email:wali.email,displayName:wali.name};assert.equal((await call('viewShared',{examId:revExam.id})).token,shared2.token);const proctorState=await state();const protectedAttempt=proctorState.attempts.find(a=>a.examId===revExam.id);assert(!protectedAttempt.questions&&!protectedAttempt.grades);assert(proctorState.students.some(s=>s.className==='6R'));await call('grade',{id:protectedAttempt.id,grades:{cx:30}},400);
user={email:'qa@example.test',displayName:'QA Admin'};const revCards=(await call('accountCards',{kind:'student',className:'6R'})).cards;
async function loginCard(c){const r=await authRoutes.POST(new Request('https://cbt.test/api/auth',{method:'POST',headers:{origin:'https://cbt.test'},body:JSON.stringify({action:'login',username:c.username,password:c.password})}));assert.equal(r.status,200);cookie=r.headers.get('set-cookie').split(';')[0];}
await loginCard(revCards[0]);await call('studentLaunch',{examId:revExam.id,code:shared1.token},400);await call('studentLaunch',{examId:revExam.id,code:'WRONG'},400);const private1=(await call('studentLaunch',{examId:revExam.id,code:shared2.token})).token;const started1=await call('enter',{token:private1});await call('answer',{token:private1,questionId:'cx',value:'0,1,2'});
await loginCard(revCards[1]);const private2=(await call('studentLaunch',{examId:revExam.id,code:shared2.token})).token;assert.notEqual(private1,private2);const started2=await call('enter',{token:private2});assert.notEqual(started1.id,started2.id);await call('enter',{token:private1},400);
cookie='';user=null;await call('enter',{token:private1},400);
user={email:wali.email,displayName:wali.name};await call('releaseSession',{id:started1.id,reason:'Perpindahan komputer ruang kelas'});let paused=(await state()).attempts.find(a=>a.id===started1.id);assert(paused.pausedAt);assert(paused.actionNotes.some(n=>n.name===wali.name));await call('extraTime',{id:started1.id,minutes:5,reason:'Pemulihan gangguan perangkat'});
sql.prepare("UPDATE records SET data=json_set(data,'$.end',?) WHERE id=?").run(new Date(Date.now()-1000).toISOString(),revExam.id);await loginCard(revCards[0]);assert((await call('studentLaunch',{examId:revExam.id,code:shared2.token})).token);sql.prepare("UPDATE records SET data=json_set(data,'$.end',?) WHERE id=?").run(revExam.end,revExam.id);const resumedShared=await call('enter',{token:private1,session:'33333333-3333-4333-a333-333333333333'});assert(resumedShared.deadline>started1.deadline+299000);assert.equal(resumedShared.answers.cx,'0,1,2');
cookie='';user={email:'qa@example.test',displayName:'QA Admin'};const rotated=await call('generateShared',{examId:revExam.id});await loginCard(revCards[0]);await call('studentLaunch',{examId:revExam.id,code:shared2.token},400);assert.equal((await call('heartbeat',{token:private1,session:'33333333-3333-4333-a333-333333333333'})).id,started1.id);sql.prepare("UPDATE attempts SET data=json_set(data,'$.submitAfter',0) WHERE id=?").run(started1.id);await call('submit',{token:private1,session:'33333333-3333-4333-a333-333333333333'});
await loginCard(revCards[1]);await call('answer',{token:private2,questionId:'cx',value:'0,1,2'});sql.prepare("UPDATE attempts SET data=json_set(data,'$.submitAfter',0) WHERE id=?").run(started2.id);await call('submit',{token:private2});
cookie='';user={email:niyTeacher.email,displayName:niyTeacher.name};await call('publishMany',{ids:[started1.id,started2.id]},400);await call('grade',{id:started1.id,grades:{cx:0}});await call('grade',{id:started2.id,grades:{cx:0}});await call('publishMany',{ids:[started1.id]});const scored=await state();assert(scored.attempts.find(a=>a.id===started1.id).published);assert(!scored.attempts.find(a=>a.id===started2.id).published);assert.equal(scored.attempts.find(a=>a.id===started1.id).score,100);
const absent=scored.attempts.find(a=>a.examId===revExam.id&&a.status==='Belum mulai');const makeup=await call('makeup',{id:absent.id,start:new Date(Date.now()-1000).toISOString(),end:new Date(Date.now()+3600000).toISOString()});await call('makeup',{id:started1.id,start:new Date().toISOString(),end:new Date(Date.now()+3600000).toISOString()},400);
assert(!makeup.token);user={email:'qa@example.test',displayName:'QA Admin'};makeup.token=(await call('viewShared',{examId:makeup.examId})).token;await loginCard(revCards[0]);await call('studentLaunch',{examId:makeup.examId,code:makeup.token},400);await loginCard(revCards[2]);assert((await call('studentLaunch',{examId:makeup.examId,code:makeup.token})).token);
cookie='';user={email:niyTeacher.email,displayName:niyTeacher.name};const draft=await call('saveDraft',{data:{title:'Belum lengkap',questions:[]}});assert((await state()).drafts.some(d=>d.id===draft.id));user={email:wali.email,displayName:wali.name};assert(!(await state()).drafts.some(d=>d.id===draft.id));await call('deleteDraft',{id:draft.id},400);
user={email:'qa@example.test',displayName:'QA Admin'};await call('deleteTopic',{data:(await state()).topics.find(t=>t.name==='Revisi lengkap')},400);
// Actual teacher credential login and self-service password change.
await loginCard(teacherCard);assert.equal((await state()).staff.id,niyTeacher.id);const changedPassword=await authRoutes.POST(new Request('https://cbt.test/api/auth',{method:'POST',headers:{origin:'https://cbt.test',cookie},body:JSON.stringify({action:'changePassword',currentPassword:teacherCard.password,password:'qa-change-only-128765'})}));assert.equal(changedPassword.status,200);cookie='';
console.log('PASS: revision 2 semester isolation, non-destructive repeated imports, NIY/contract accounts, teacher self password change, subject-aware collisions, schedule duties, shared-token rotation/login requirement, per-student isolation, proctor key isolation, pause/resume, selected publication, exclusive makeup and private drafts.');

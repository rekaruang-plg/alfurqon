import {sameOrigin} from '../../../lib/request-origin';
import {teacherExamActions,teacherExamMenus,teacherExamModeMessage,teacherExamGrace,teacherExamLead,teacherExamWindow,wibDayStart} from '../../../lib/teacher-exam-mode';
import {sdSubjectProfiles,smpSubjectProfiles,smaQuestionTypes} from '../../../lib/sd-subject-profiles';
import {questionTypeLabels} from '../../../lib/question-settings';
import {generatedAccount} from '../../../lib/generated-account';
import {submissionIssue,editableGrade,written} from '../../../lib/review-policy';
import { env } from '../../../lib/production-db';
import { staffActor as actor, records as authRecords } from '../../../lib/staff-auth';
import { starterQuestions,uniqueQuestionOrder,mark,choiceSet,gradingPoints, type Question } from '../../../lib/model';
import { subjectCatalog,sampleQuestions } from '../../../lib/simulations';
import { sealToken,openToken } from '../../../lib/token-vault';
export const dynamic='force-dynamic';
const MAX_EXAM_UNLOCKS=3;
const staffMenuRecords:Record<string,readonly string[]>={
 'Dashboard':['student','exam','class','staff'],
 'Tahun Pelajaran':[],
 'Kelas':['student','class','staff'],
 'Siswa':['student','class','staff','subject'],
 'Guru':['staff','class','subject'],
 'Mata pelajaran':['subject','class','staff'],
 'Jadwal ujian':['exam','class','staff','subject','topic'],
 'Token ujian':['exam','student','subject','topic'],
 'Monitoring':['exam','student','subject','topic'],
 'Koreksi & nilai':['exam','student'],
 'Bank soal':['exam','class','subject','topic'],
 'Buat soal':['exam','class','subject','topic'],
 'Simulasi ujian':['subject'],
 'Pengelola':['staff','class','subject'],
 'Riwayat aktivitas':[],
};

const questionIndexSQL="(SELECT json_group_array(json_object('id',json_extract(value,'$.id'),'sourceId',json_extract(value,'$.sourceId'),'type',json_extract(value,'$.type'),'scope',json_extract(value,'$.scope'))) FROM json_each(records.data,'$.questions'))";
const scoreQuestionFields=['id','type','points','key','keywords','caseSensitive','manualGrading'];
function scoreQuestionsSQL(source:string){
 const fields=scoreQuestionFields.map(field=>`'${field}',json_extract(value,'$.${field}')`).join(',');
 return `(SELECT json_group_array(json_object(${fields})) FROM json_each(${source}))`;
}
const jsonFlag=(value:unknown)=>value===true||value===1||value==='true';

function teacherDuty(staff:any,exam:any,action:string){
 return exam.unit===staff.unit&&(exam.duties||[]).some((d:any)=>d.staffId===staff.id&&(
   d.role==='full'&&['bank','grade','monitor'].includes(action)||
   d.role==='grade'&&action==='grade'||
   d.role==='proctor'&&['token','monitor'].includes(action)));
}
function teacherNavigation(staff:any,exams:any[]){
 return {
   token:exams.some(e=>teacherDuty(staff,e,'token')),
   monitor:exams.some(e=>teacherDuty(staff,e,'monitor')),
   grade:exams.some(e=>teacherDuty(staff,e,'grade')),
 };
}

// Follow the attempt cutoff without writing during staff list reads.
function gradingCutoff(a:any,now:number){
 if(a.status!=='Mengerjakan'||a.deadline==null)return;
 const pauseEnded=a.pauseUntil&&now>=Number(a.pauseUntil);
 if(a.pausedAt&&!pauseEnded&&!jsonFlag(a.securityLocked))return;
 const cutoff=Number(a.deadline)+(pauseEnded?Number(a.pauseUntil)-Number(a.pausedAt):0);
 return now>=cutoff?cutoff:undefined;
}

async function currentTeacherExamMode(staff:any){
 if(staff?.role!=='Guru'||staff.demo||!env.TEACHER_EXAM_MODE)return null;
 const now=Date.now();
 const today=wibDayStart(now);
 const day=24*60*60_000;
 const latestStart=now+day+teacherExamLead;
 const earliestEnd=today-day;
 // Canonical UTC timestamps sort chronologically. Keep older formats in the
 // candidate set so the existing Date.parse checks still decide eligibility.
 const isoPattern='____-__-__T__:__:__.___Z';
 const {results}=await env.DB.prepare(
   "SELECT id,json_remove(data,'$.instructions','$.studentIds','$.excludedStudentIds') AS data FROM records "+
   "WHERE kind=? AND json_extract(data,'$.unit')=? AND json_extract(data,'$.status')='Aktif' "+
   "AND (json_extract(data,'$.start') NOT LIKE ? OR json_extract(data,'$.start')<=?) "+
   "AND (json_extract(data,'$.end') NOT LIKE ? OR json_extract(data,'$.end')>=?)"
 ).bind('exam',staff.unit,isoPattern,new Date(latestStart).toISOString(),isoPattern,new Date(earliestEnd).toISOString()).all();
 const exams=results.map((row:any)=>({...JSON.parse(row.data),id:row.id}))
   .filter((exam:any)=>exam.status==='Aktif'&&!exam.deletedAt&&!exam.simulation&&typeof exam.start==='string'&&typeof exam.end==='string')
   .filter((exam:any)=>Date.parse(exam.start)<=latestStart&&Date.parse(exam.end)>=earliestEnd)
   .map((exam:any)=>({...exam,proctor:(exam.duties||[]).some((d:any)=>d.staffId===staff.id&&d.role==='proctor')}));
 // An active scheduled window already requires exam mode. Consult attempt
 // deadlines after it ends, when an extension can keep the mode active.
 const scheduledMode=teacherExamWindow(exams,now);
 if(scheduledMode)return scheduledMode;
 const official=new Map<string,number>();
 const needsExtensionCheck=exams.filter((exam:any)=>Date.parse(exam.start)<=now&&Date.parse(exam.end)<=now+teacherExamGrace);
 for(let offset=0;offset<needsExtensionCheck.length;offset+=100){
   const batch=needsExtensionCheck.slice(offset,offset+100);
   const {results:attempts}=await env.DB.prepare(
     "SELECT exam_id,json_extract(data,'$.deadline') AS deadline,json_extract(data,'$.pausedAt') AS paused_at,json_extract(data,'$.pauseUntil') AS pause_until,json_extract(data,'$.submittedAt') AS submitted_at FROM attempts WHERE exam_id IN ("+batch.map(()=>'?').join(',')+") AND CAST(json_extract(data,'$.deadline') AS BIGINT)+COALESCE(CAST(json_extract(data,'$.pauseUntil') AS BIGINT)-CAST(json_extract(data,'$.pausedAt') AS BIGINT),0)>=?"
   ).bind(...batch.map((e:any)=>e.id),now-teacherExamGrace).all();
   for(const row of attempts){
     const deadline=Number(row.deadline);
     if(!Number.isFinite(deadline)||deadline<=0)continue;
     const pause=Number(row.pause_until)&&Number(row.paused_at)?Math.max(0,Number(row.pause_until)-Number(row.paused_at)):0;
     const end=Number(row.submitted_at)?Math.min(deadline+pause,Number(row.submitted_at)):deadline+pause;
     official.set(row.exam_id,Math.max(official.get(row.exam_id)||0,end));
   }
 }
 return teacherExamWindow(exams.map((exam:any)=>({...exam,effectiveEnd:official.get(exam.id)})),now);
}

function lockedTeacherMenu(teacherExamMode:NonNullable<Awaited<ReturnType<typeof currentTeacherExamMode>>>){
 return Response.json({error:teacherExamModeMessage,teacherExamMode},{status:423,headers:{'Cache-Control':'no-store'}});
}

async function handlers(req:Request){
let requestBody:any=null;
if(req.method==='POST'){
 const origin=req.headers.get('origin');
 if(origin&&!sameOrigin(req))return {GET,POST:async()=>Response.json({error:'Asal permintaan tidak valid.'},{status:400})};
 const body=await req.text();
 if(body.length>1_500_000)return {GET,POST:async()=>Response.json({error:'Data terlalu besar.'},{status:400})};
 requestBody=JSON.parse(body);
}
const authentication=actor(req);
const identity=await authentication.catch(()=>null);
const studentAction=['preview','enter','answer','saveAnswers','submit','exitExam','securityLock','requestUnlock','heartbeat','tokenDashboard'].includes(requestBody?.action);
const demo=identity?.staff ? !!identity.staff.demo : studentAction?String(requestBody.token||'').startsWith('DEMO-'):false;
const db=()=>{if(!env.DB)throw new Error('Database belum tersedia');return demo?{prepare:(q:string)=>env.DB!.prepare(q.replace(/\brecords\b/g,'demo_records').replace(/\battempts\b/g,'demo_attempts')),batch:(q:any[])=>env.DB!.batch(q)}:env.DB};
const id=()=>crypto.randomUUID();
const fail=(m:string)=>{throw new Error(m)};
const hash=async(t:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t)))).map(x=>x.toString(16).padStart(2,'0')).join('');
async function rawAll(kind:string){return (await db().prepare('SELECT * FROM records WHERE kind=?').bind(kind).all()).results.map((x:any)=>({...JSON.parse(x.data),id:x.id,version:x.version})).filter((x:any)=>!x.deletedAt);}
async function rawGet(key:string){const r:any=await db().prepare('SELECT * FROM records WHERE id=?').bind(key).first();return r?{...JSON.parse(r.data),id:r.id,version:r.version,_kind:r.kind}:null}
async function rawPut(kind:string,data:any){const key=data.id||id();const {version,...clean}=data;if(version!==undefined){const r=await db().prepare('UPDATE records SET data=?,version=version+1 WHERE id=? AND version=?').bind(JSON.stringify({...clean,id:key}),key,version).run();if(!r.meta.changes)fail('Data telah berubah. Muat ulang dan coba lagi.')}else await db().prepare('INSERT INTO records (id,kind,data) VALUES (?,?,?)').bind(key,kind,JSON.stringify({...clean,id:key})).run();return key}

const query=new URL(req.url).searchParams;
const activeYear=(await rawGet('active-year'))?.name||'2026/2027';

const activePeriodOnly=req.method==='GET'&&query.get('activePeriod')==='1';
if(activePeriodOnly&&identity?.staff)return {GET:async()=>Response.json({
 activeYear,teacherExamMode:await currentTeacherExamMode(identity.staff),
},{headers:{'Cache-Control':'no-store'}}),POST};
const period={year:String(requestBody?.period?.year||query.get('year')||activeYear),semester:Number(requestBody?.period?.semester||query.get('semester')||1)};
if(!/^\d{4}\/\d{4}$/.test(period.year)||![1,2].includes(period.semester))fail('Periode tidak valid.');
// Normalize legacy duplicate class labels without deleting exam history.
if(identity?.staff&&identity.staff.role!=='Siswa'&&!await rawGet('class-normalization-v4')){
 const classes=await rawAll('class');if(classes.length){const groups=new Map<string,any[]>();for(const c of classes){const k=[c.unit,c.year||'2026/2027',!!c.semester2Only,c.name.trim().toUpperCase()].join(':');groups.set(k,[...(groups.get(k)||[]),c]);}
 const rows=(await db().prepare('SELECT * FROM records').all()).results as any[],writes=[];
 for(const row of rows){const value=JSON.parse(row.data);let changed=false;
 for(const group of groups.values()){const chosen=group[0],canonical=chosen.name.trim().toUpperCase(),names=group.map(c=>c.name);if(row.kind==='class'&&group.some(c=>c.id===row.id)){value.name=canonical;value.homeroomId=value.homeroomId||group.find(c=>c.homeroomId)?.homeroomId||'';if(row.id!==chosen.id){value.deletedAt=Date.now();value.mergedInto=chosen.id;}changed=true;}
 if(value.unit===chosen.unit&&(value.year||'2026/2027')===(chosen.year||'2026/2027')&&names.includes(value.className)){value.className=canonical;changed=true;}
 for(const task of value.assignments||[])if(task.unit===chosen.unit&&task.classes?.some((n:string)=>names.includes(n))){task.classes=[...new Set(task.classes.map((n:string)=>names.includes(n)?canonical:n))];changed=true;}}
 if(changed)writes.push(db().prepare('UPDATE records SET data=?,version=version+1 WHERE id=?').bind(JSON.stringify(value),row.id));}
 writes.push(db().prepare('INSERT OR IGNORE INTO records(id,kind,data) VALUES(?,?,?)').bind('class-normalization-v4','config',JSON.stringify({ready:true})));await db().batch(writes);}
}
// Semester two is a one-time snapshot of academic masters; identities stay stable.
const academicKinds=['class','student','staff','subject'];
const belongsYear=(x:any)=>(x.year||'2026/2027')===period.year;
const profileKey=(key:string)=>'semester2:'+period.year+':'+key;
const academic=(kind:string,x:any)=>academicKinds.includes(kind)&&(kind!=='staff'||x.role==='Guru')&&(kind!=='class'&&kind!=='student'||(x.year||'2026/2027')===period.year);
if(period.semester===2&&identity?.staff&&identity.staff.role!=='Siswa'&&!await rawGet('semester2-ready:'+period.year)){
 const snapshots=[];for(const kind of academicKinds)for(const original of await rawAll(kind)){const x=['staff','student'].includes(kind)?await annual(original,kind,period.year):original;if(academic(kind,x)&&!x.semester2Only&&belongsYear(x)){const {version,...value}=x;snapshots.push(db().prepare('INSERT OR IGNORE INTO records(id,kind,data) VALUES(?,?,?)').bind(profileKey(x.id),'academic_profile',JSON.stringify({...value,profileKind:kind,profileYear:period.year})));}}
 snapshots.push(db().prepare('INSERT OR IGNORE INTO records(id,kind,data) VALUES(?,?,?)').bind('semester2-ready:'+period.year,'config',JSON.stringify({ready:true})));
 await db().batch(snapshots);
}
async function annual(x:any,kind:string,year:string){if(!['staff','student'].includes(kind)||kind==='staff'&&x.role!=='Guru')return x;const y=await rawGet((kind==='staff'?'teacher':'student')+'-year:'+year+':'+x.id);return y?{...y,id:x.id,_kind:kind}:x;}
async function annualList(base:any[],kind:string,year:string){if(!['staff','student'].includes(kind))return base;const prefix=(kind==='staff'?'teacher':'student')+'-year:'+year+':';const records=(await db().prepare('SELECT * FROM records WHERE kind=?').bind(kind==='staff'?'teacher_year':'student_year').all()).results as any[];const profiles=new Map(records.filter(r=>r.id.startsWith(prefix)).map(r=>[r.id.slice(prefix.length),{...JSON.parse(r.data),version:r.version}]));return base.map(x=>profiles.has(x.id)?{...profiles.get(x.id),id:x.id,_kind:kind}:x);}
async function all(kind:string){let base=await annualList(await rawAll(kind),kind,period.year);base=base.filter((x:any)=>!x.deletedAt);if(kind==='subject')base=base.filter(belongsYear);if(!academicKinds.includes(kind))return base;if(period.semester!==2)return base.filter((x:any)=>!x.semester2Only);const profiles=(await rawAll('academic_profile')).filter((x:any)=>x.profileKind===kind&&x.profileYear===period.year).map((x:any)=>({...x,id:x.id.slice(('semester2:'+period.year+':').length)}));return [...base.filter((x:any)=>!academic(kind,x)),...profiles];}
async function get(key:string){let raw=await rawGet(key);if(raw)raw=await annual(raw,raw._kind,period.year);if(raw&&period.semester===2&&academic(raw._kind,raw)){const snapshot=await rawGet(profileKey(key));if(snapshot)return {...snapshot,id:key,_kind:raw._kind};}return raw;}
async function put(kind:string,data:any){if((kind==='student'||kind==='staff'&&data.role==='Guru')&&period.semester===1&&data.id){const base=await rawGet(data.id);if(base&&(base.year||'2026/2027')!==(data.year||period.year)){const key=(kind==='staff'?'teacher':'student')+'-year:'+(data.year||period.year)+':'+data.id,old=await rawGet(key);if(old&&data.version!==undefined&&data.version!==old.version)fail('Data telah berubah. Muat ulang dan coba lagi.');await rawPut(kind==='staff'?'teacher_year':'student_year',{...data,id:key,year:data.year||period.year,version:old?.version});return data.id;}}if(period.semester!==2||!academic(kind,data))return rawPut(kind,data);const key=data.id||id();let base=await rawGet(key);if(!base){await rawPut(kind,{...data,id:key,version:undefined,semester2Only:true});base=await rawGet(key);}const old=await rawGet(profileKey(key));if(old&&data.version!==undefined&&data.version!==old.version)fail('Data telah berubah. Muat ulang dan coba lagi.');await rawPut('academic_profile',{...data,id:profileKey(key),version:old?.version,profileKind:kind,profileYear:period.year});return key;}
const inPeriod=(x:any)=>(x.year||'2026/2027')===period.year&&Number(x.semester||1)===period.semester;
function examPermission(who:any,e:any,action:string){
 if(!e||e.deletedAt)return false;
 if(who.role==='Super Admin')return true;
 if(who.role==='Admin Unit')return who.unit===e.unit;
 if(who.role!=='Guru'||who.unit!==e.unit||!inPeriod(e))return false;
 if(teacherDuty(who,e,action))return true;
 if(action!=='bank'||(e.duties||[]).some((d:any)=>d.staffId===who.id||d.role==='full'))return false;
 return teaches(who,e)||homeroomCanWrite(who,e);
}
function requireExam(who:any,e:any,action:string){if(!examPermission(who,e,action))fail('Jadwal di luar kewenangan Anda.');}
async function studentsFor(e:any){const year=e.year||'2026/2027';if(Number(e.semester||1)!==2)return (await annualList((await rawAll('student')).filter((s:any)=>!s.semester2Only),'student',year)).filter((x:any)=>!x.deletedAt);return (await rawAll('academic_profile')).filter((s:any)=>s.profileKind==='student'&&s.profileYear===year).map((s:any)=>({...s,id:s.id.slice(('semester2:'+year+':').length)}));}
async function studentFor(id:string,e:any){if(Number(e.semester||1)===2){const profile=await rawGet('semester2:'+(e.year||'2026/2027')+':'+id);if(profile)return {...profile,id};}const raw=await rawGet(id);return raw?await annual(raw,'student',e.year||'2026/2027'):null;}
function matchesEnrollment(student:any,exam:any){
 if((exam.excludedStudentIds||[]).includes(student.id))return false;
 if(exam.participantsSelected||exam.studentIds?.length)return !!exam.studentIds?.includes(student.id);
 return student.unit===exam.unit&&student.className===exam.className&&(student.year||'2026/2027')===(exam.year||'2026/2027');
}
async function participants(e:any){return (await studentsFor(e)).filter((student:any)=>matchesEnrollment(student,e));}
async function examRosterRows(exams:any[],staff:any,details=false,additionalIds:string[]=[]){
 if(!exams.length)return [];
 const units=[...new Set(exams.map(e=>e.unit))];
 const classNames=[...new Set(exams.map(e=>e.className))];
 const selectedIds=[...new Set([...additionalIds,...exams.flatMap(e=>e.studentIds||[])])];
 const placeholders=(values:unknown[])=>values.map(()=>'?').join(',');
 const present=(alias:string)=>"COALESCE(CAST(json_extract("+alias+".data,'$.deletedAt') AS TEXT),'') IN ('','0','false')";
 const semester2=period.semester===2;
 const profilePrefix='semester2:'+period.year+':';
 const source=semester2
   ?"SELECT substr(student_base.id,?) AS id,student_base.data FROM records AS student_base WHERE student_base.kind='academic_profile' AND json_extract(student_base.data,'$.profileKind')='student' AND json_extract(student_base.data,'$.profileYear')=?"
   :"SELECT student_base.id,COALESCE(profile.data,student_base.data) AS data FROM records AS student_base LEFT JOIN records AS profile ON profile.id=?||student_base.id AND profile.kind='student_year' WHERE student_base.kind='student' AND "+present('student_base');
 const field=(name:string)=>"json_extract(roster_student.data,'$."+name+"')";
 const projected=details?[field('name')+' AS name',field('nis')+" AS nis"]:[];
 const eligible=field('className')+' IN ('+placeholders(classNames)+')'+(selectedIds.length?' OR roster_student.id IN ('+placeholders(selectedIds)+')':'');
 const filters=[
   present('roster_student'),
   "COALESCE("+field('year')+",'2026/2027')=?",
   field('unit')+' IN ('+placeholders(units)+')',
   '('+eligible+')',
 ];
 if(!semester2)filters.push("COALESCE(CAST("+field('semester2Only')+" AS TEXT),'') IN ('','0','false')");
 const query="SELECT roster_student.id,"+[field('unit')+' AS unit',field('className')+' AS class_name',...projected].join(',')
   +" FROM ("+source+") AS roster_student WHERE "+filters.join(' AND ');
 const {results}=await db().prepare(query).bind(...(semester2?[profilePrefix.length+1,period.year]:['student-year:'+period.year+':']),period.year,...units,...classNames,...selectedIds).all();
 return results.map((row:any)=>({id:row.id,unit:row.unit,className:row.class_name,year:period.year,
   ...(details?{name:row.name,nis:row.nis}:{})})).filter((student:any)=>staffDataScope(staff,student));
}
function enrollmentByExam(exams:any[],students:any[]){
 const byId=new Map(students.map(s=>[s.id,s]));
 const byClass=new Map<string,any[]>();
 const classKey=(record:any)=>JSON.stringify([record.unit,record.className]);
 for(const student of students){
   const key=classKey(student);
   const group=byClass.get(key);
   if(group)group.push(student);
   else byClass.set(key,[student]);
 }
 return new Map(exams.map(exam=>{
   const pool=exam.participantsSelected||exam.studentIds?.length
     ?[...new Set<string>(exam.studentIds||[])].map(id=>byId.get(id)).filter(Boolean)
     :byClass.get(classKey(exam))||[];
   return [exam.id,pool.filter(s=>matchesEnrollment(s,exam))];
 }));
}
async function isExamParticipant(studentId:string,exam:any){
 const year=exam.year||'2026/2027';
 if(Number(exam.semester||1)===2){
   const profile=await rawGet('semester2:'+year+':'+studentId);
   return !!profile&&!profile.deletedAt&&profile._kind==='academic_profile'&&profile.profileKind==='student'&&profile.profileYear===year&&matchesEnrollment({...profile,id:studentId},exam);
 }
 const base=await rawGet(studentId);
 if(!base||base._kind!=='student'||base.deletedAt||base.semester2Only)return false;
 const student=await annual(base,'student',year);
 return !student.deletedAt&&matchesEnrollment(student,exam);
}
const sharedTokenAlphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
async function readSharedToken(examId:string,record:any){
 const code=await openToken(record.vault,examId,await env.TOKEN_VAULT_KEY);
 if(record.rotationVersion!==1)return code;
 // Keep the last code issued under the previous rotation scheme.
 const digest=await hash(code+':'+examId+':'+record.issuedSlot);
 return (demo?'DEMO-':'')+Array.from({length:5},(_,i)=>sharedTokenAlphabet[parseInt(digest.slice(i*2,i*2+2),16)%32]).join('');
}
async function prepareSharedToken(e:any){
 const key='shared-'+e.id;
 const existing=await get(key);
 if(existing)return {token:await readSharedToken(e.id,existing),created:false};
 const token=(demo?'DEMO-':'')+Array.from(crypto.getRandomValues(new Uint8Array(5)),n=>sharedTokenAlphabet[n%32]).join('');
 const vault=await sealToken(token,e.id,await env.TOKEN_VAULT_KEY);
 const write=await db().prepare('INSERT OR IGNORE INTO records(id,kind,data) VALUES(?,?,?)')
   .bind(key,'shared_token',JSON.stringify({id:key,rotationVersion:2,vault,hash:await hash(token)})).run();
 if(write.meta.changes)return {token,created:true};
 const winner=await get(key);
 if(!winner)fail('Token belum tersedia. Coba kembali.');
 return {token:await readSharedToken(e.id,winner),created:false};
}
function tokenScheduleOpen(e:any,now:number){
 const start=Date.parse(e.start);
 const end=Date.parse(e.end);
 return e.status==='Aktif'&&end>start&&end>now;
}
async function roster(e:any,freezeQuestions=true){
 const pupils=await participants(e);
 if(!pupils.length)fail('Tidak ada peserta yang dipilih untuk ujian ini.');
 if(freezeQuestions)await freezeExam(e);
 const {results}=await db().prepare("SELECT id,student_id,json_extract(data,'$.status') AS status,json_extract(data,?) AS requires_login FROM attempts WHERE exam_id=?").bind('$.requiresLogin',e.id).all();
 const existing=new Map(results.map(row=>[row.student_id,row]));
 for(const st of pupils){
   const current=existing.get(st.id);
   if(!current){
     await issueToken({id:id(),studentId:st.id,examId:e.id,status:'Belum mulai',answers:{},published:false,requiresLogin:true});
     continue;
   }
   if(current.status!=='Belum mulai'||current.requires_login===true||current.requires_login===1||current.requires_login==='true')continue;
   const row:any=await db().prepare('SELECT data,version FROM attempts WHERE id=?').bind(current.id).first();
   if(!row)fail('Data peserta berubah. Coba generate kembali.');
   const a={...JSON.parse(row.data),version:row.version};
   if(a.status==='Belum mulai'&&!a.requiresLogin){a.requiresLogin=true;await saveAttempt(a);}
 }
}
async function validateClass(unit:string,name:string,year:string){if(!(await all('class')).some((c:any)=>c.unit===unit&&c.name.trim().toLowerCase()===name.trim().toLowerCase()&&c.year===year))fail('Pilih kelas dan tahun ajaran dari data master.');}
async function ensureMasters(){if(await get('master-v1'))return;await db().prepare('INSERT OR IGNORE INTO records(id,kind,data) VALUES(?,?,?)').bind('year-2026/2027','year',JSON.stringify({name:'2026/2027'})).run();const entries=[...await all('student'),...await all('exam')];for(const x of entries){if(!x.className)continue;const year=x.year||'2026/2027';const key='class-'+await hash(x.unit+':'+year+':'+x.className);await db().prepare('INSERT OR IGNORE INTO records(id,kind,data) VALUES(?,?,?)').bind(key,'class',JSON.stringify({name:x.className,unit:x.unit,year})).run();}await put('config',{id:'master-v1',ready:true});}
async function subjectFor(unit:string,name:string){const sub=(await all('subject')).find((x:any)=>x.unit===unit&&x.name.trim().toLowerCase()===name.trim().toLowerCase());if(!sub)fail('Pilih mata pelajaran dari data master pada unit ini.');return sub;}
// Idempotent, transactional SD defaults, scoped to semester master snapshots.
async function ensureSdSubjects(){if(period.year!=='2026/2027'||!(await rawAll('year')).some((y:any)=>y.name===period.year))return;
 const marker='sd-subject-profiles-20261102:'+(period.semester===2?period.year+':2':'base');if(await rawGet(marker))return;
 const subjects=await all('subject'),writes=[];
 for(const profile of sdSubjectProfiles){
 const aliases=[profile.name,...profile.aliases].map(n=>n.toLowerCase());const existing=subjects.filter((x:any)=>x.unit==='SD'&&aliases.includes(x.name.trim().toLowerCase()));
 for(const prior of existing.length?existing:[null]){
 const key=prior?.id||'subject-'+await hash('SD:'+profile.name.toLowerCase());
 const value={...prior,id:key,name:prior?.name||profile.name,unit:'SD',grades:[...new Set([...(prior?.grades||[]),'5','6'])],questionTypes:profile.types,sdProfile:profile.name};delete value.version;
 const target=period.semester===2?profileKey(key):key,kind=period.semester===2?'academic_profile':'subject';
 if(period.semester===2){value.profileKind='subject';value.profileYear=period.year;writes.push(db().prepare('INSERT OR IGNORE INTO records(id,kind,data) VALUES(?,?,?)').bind(key,'subject',JSON.stringify({...value,semester2Only:true})));}
 writes.push(db().prepare('INSERT INTO records(id,kind,data) SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 FROM records WHERE id=?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=records.version+1').bind(target,kind,JSON.stringify({...value,id:target}),marker));
 }}
 writes.push(db().prepare('INSERT OR IGNORE INTO records(id,kind,data) VALUES(?,?,?)').bind(marker,'config',JSON.stringify({ready:true})));await db().batch(writes);
}
async function ensureSmpSubjects(){if(period.year!=='2026/2027'||!(await rawAll('year')).some((y:any)=>y.name===period.year))return;
 const marker='smp-subject-profiles-20261102:'+(period.semester===2?period.year+':2':'base');if(await rawGet(marker))return;
 const subjects=await all('subject'),writes=[];
 for(const profile of smpSubjectProfiles){
 const aliases=[profile.name,...profile.aliases].map(n=>n.toLowerCase());const existing=subjects.filter((x:any)=>x.unit==='SMP'&&aliases.includes(x.name.trim().toLowerCase()));
 for(const prior of existing.length?existing:[null]){
 const key=prior?.id||'subject-'+await hash('SMP:'+profile.name.toLowerCase());
 const value={...prior,id:key,name:prior?.name||profile.name,unit:'SMP',grades:[...new Set([...(prior?.grades||[]),'1','2','3'])],questionTypes:profile.types,smpProfile:profile.name};delete value.version;
 const target=period.semester===2?profileKey(key):key,kind=period.semester===2?'academic_profile':'subject';
 if(period.semester===2){value.profileKind='subject';value.profileYear=period.year;writes.push(db().prepare('INSERT OR IGNORE INTO records(id,kind,data) VALUES(?,?,?)').bind(key,'subject',JSON.stringify({...value,semester2Only:true})));}
 writes.push(db().prepare('INSERT INTO records(id,kind,data) SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 FROM records WHERE id=?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=records.version+1').bind(target,kind,JSON.stringify({...value,id:target}),marker));
 }}
 writes.push(db().prepare('INSERT OR IGNORE INTO records(id,kind,data) VALUES(?,?,?)').bind(marker,'config',JSON.stringify({ready:true})));await db().batch(writes);
}
async function ensureSmaSubjects(){if(period.year!=='2026/2027'||!(await rawAll('year')).some((y:any)=>y.name===period.year))return;
 const marker='sma-subject-profiles-20261102:'+(period.semester===2?period.year+':2':'base');if(await rawGet(marker))return;
 const subjects=await all('subject'),writes=[];
 for(const profile of [...new Set([...subjectCatalog.SMA,...subjects.filter((x:any)=>x.unit==='SMA').map((x:any)=>x.name)])].map(name=>({name,aliases:[] as string[],types:smaQuestionTypes}))){
 const aliases=[profile.name,...profile.aliases].map(n=>n.toLowerCase());const existing=subjects.filter((x:any)=>x.unit==='SMA'&&aliases.includes(x.name.trim().toLowerCase()));
 for(const prior of existing.length?existing:[null]){
 const key=prior?.id||'subject-'+await hash('SMA:'+profile.name.toLowerCase());
 const value={...prior,id:key,name:prior?.name||profile.name,unit:'SMA',grades:[...new Set([...(prior?.grades||[]),'1','2','3'])],questionTypes:profile.types,smaProfile:profile.name};delete value.version;
 const target=period.semester===2?profileKey(key):key,kind=period.semester===2?'academic_profile':'subject';
 if(period.semester===2){value.profileKind='subject';value.profileYear=period.year;writes.push(db().prepare('INSERT OR IGNORE INTO records(id,kind,data) VALUES(?,?,?)').bind(key,'subject',JSON.stringify({...value,semester2Only:true})));}
 writes.push(db().prepare('INSERT INTO records(id,kind,data) SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 FROM records WHERE id=?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=records.version+1').bind(target,kind,JSON.stringify({...value,id:target}),marker));
 }}
 writes.push(db().prepare('INSERT OR IGNORE INTO records(id,kind,data) VALUES(?,?,?)').bind(marker,'config',JSON.stringify({ready:true})));await db().batch(writes);
}
async function ensureCatalog(){
const names:Record<string,Set<string>>=Object.fromEntries(Object.entries(subjectCatalog).map(([u,ns])=>[u,new Set(ns)]));
for(const old of [...await all('bank'),...await all('staff')])if(names[old.unit]&&old.subject)names[old.unit].add(old.subject);
for(const [unit,list] of Object.entries(names))for(const name of list){const key='subject-'+await hash(unit+':'+name.toLowerCase());await db().prepare('INSERT OR IGNORE INTO records(id,kind,data) VALUES (?,?,?)').bind(key,'subject',JSON.stringify({id:key,name,unit})).run();}
for(const [unit,names] of Object.entries(subjectCatalog))for(const name of names){const sub=await subjectFor(unit,name);const key='sample-bank-'+sub.id;await db().prepare('INSERT OR IGNORE INTO records(id,kind,data) VALUES (?,?,?)').bind(key,'bank',JSON.stringify({id:key,title:'Simulasi '+name+' · '+unit,unit,subject:name,subjectId:sub.id,simulation:true,questions:sampleQuestions(unit,name)})).run();}
await db().prepare('INSERT OR IGNORE INTO records(id,kind,data) VALUES (?,?,?)').bind('catalog-v2','config',JSON.stringify({ready:true})).run();
}
async function issueToken(a:any,replace=false){let token='';for(let tries=0;tries<20;tries++){token=(demo?'DEMO-':'')+Array.from(crypto.getRandomValues(new Uint8Array(5))).map(v=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[v%32]).join('');if(!await db().prepare('SELECT id FROM attempts WHERE token_hash=?').bind(await hash(token)).first())break;if(tries===19)fail('Token belum tersedia. Coba generate kembali.');}const vault=await sealToken(token,a.id,await env.TOKEN_VAULT_KEY);const tokenHash=await hash(token);const {version,...clean}=a;const write=replace?db().prepare('UPDATE attempts SET token_hash=?,data=?,version=version+1 WHERE id=? AND version=?').bind(tokenHash,JSON.stringify(clean),a.id,version):db().prepare('INSERT INTO attempts(id,student_id,exam_id,token_hash,data) VALUES (?,?,?,?,?)').bind(a.id,a.studentId,a.examId,tokenHash,JSON.stringify(clean));const result=await db().batch([write,db().prepare('INSERT INTO records(id,kind,data) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM attempts WHERE id=? AND token_hash=?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=records.version+1').bind('vault-'+a.id,'token_vault',JSON.stringify(vault),a.id,tokenHash)]);if(!result[0].meta.changes)fail('Data peserta berubah. Muat ulang sebelum mengganti token.');return token;}
async function tokenList(exam:any){const rows=(await db().prepare('SELECT * FROM attempts WHERE exam_id=?').bind(exam.id).all()).results;const result=[];for(const row of rows as any[]){const a=JSON.parse(row.data),student=await get(a.studentId),v=await get('vault-'+a.id);result.push({id:a.id,name:student?.name||'Siswa',nis:student?.nis||'',className:student?.className||'',exam:exam.title,status:a.status,token:v?await openToken(v,a.id,await env.TOKEN_VAULT_KEY):null,legacy:!v});}return result;}

function can(a:any,unit:string,action:string,subject?:string){if(!a||a.disabled)fail('Akun belum diberi akses.');if(a.role==='Super Admin')return;if(a.unit!==unit&&!(a.role==='Guru'&&(a.assignments||[]).some((t:any)=>t.unit===unit&&t.subject===subject)))fail('Unit di luar kewenangan.');if(a.role==='Admin Unit'&&action!=='staff')return;if(a.role==='Guru'&&(a.assignments?.length?a.assignments.some((t:any)=>t.unit===unit&&t.subject===subject):a.subject===subject)&&((action==='bank'&&a.permission!=='Koreksi saja')||(action==='grade')||(action==='publish')))return;fail('Anda tidak memiliki izin tindakan ini.')}
async function audit(a:any,action:string,target:string){await put('audit',{actor:a.email,action,target,at:new Date().toISOString(),unit:a.unit})}
function sanitizeQ(q:any):Question{const approved=q.importReviewed===true;const manualGrading=approved&&!String(q.key||'').trim();if(q.format==='BENAR_SALAH'&&(!(q.type==='PG'&&JSON.stringify(q.options)===JSON.stringify(['Benar','Salah'])||q.type==='MENJODOHKAN'&&JSON.stringify(q.right)===JSON.stringify(['Benar','Salah']))))fail('Soal Benar/Salah harus memiliki dua pilihan Benar dan Salah.');if(!approved&&(q.sourceLabel&&!String(q.key||'').trim()||Array.isArray(q.importIssues)&&q.importIssues.length))fail('Lengkapi kunci dan periksa soal hasil impor Word.');if((q.images?.length||0)>8||(q.images||[]).some((v:any)=>typeof v!=='string'||!/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(v)||v.length>300000))fail('Gambar soal tidak valid atau terlalu besar.');if(!approved&&JSON.stringify([q.stimulus,q.text,q.options,q.left,q.right,q.key]).match(/\[PERIKSA (RUMUS|GAMBAR)\]/))fail('Perbaiki rumus yang ditandai sebelum menyimpan.');if(q.text?.includes('[ISI')||!['PG','PG_KOMPLEKS','URAIAN','ISIAN','MENJODOHKAN'].includes(q.type)||!q.text?.trim()||!Number.isFinite(Number(q.points))||Number(q.points)<=0)fail('Jenis, pertanyaan, atau poin soal tidak valid.');if(q.type==='PG'&&(!Array.isArray(q.options)||q.options.length<2||q.options.some((o:any)=>typeof o!=='string'||!o.trim())||!manualGrading&&(!/^\d+$/.test(String(q.key))||Number(q.key)>=q.options.length)))fail('Kunci pilihan ganda tidak valid.');if(q.type==='PG_KOMPLEKS'){if(!Array.isArray(q.options)||q.options.length<2||q.options.some((o:any)=>typeof o!=='string'||!o.trim())||!manualGrading&&(typeof q.key!=='string'||!q.key||q.key.split(',').some((k:string)=>!/^\d+$/.test(k)||Number(k)>=q.options.length)))fail('Pilih minimal satu kunci checkbox yang valid.');q.key=choiceSet(q.key)}if(q.type==='MENJODOHKAN'&&(!q.left?.length||!q.right?.length||!manualGrading&&(q.key.split(',').length!==q.left.length||q.key.split(',').some((v:string)=>!/^\d+$/.test(v.trim())||Number(v)>=q.right.length))))fail('Pasangan atau kunci menjodohkan tidak valid.');if(q.stimulusId&&(!String(q.stimulus||'').trim()||String(q.stimulus).length>40000||String(q.stimulusId).length>100))fail('Bacaan kelompok kosong atau terlalu panjang.');return {manualGrading,importReviewed:approved,importIssues:Array.isArray(q.importIssues)?q.importIssues.map(String):[],sourceLabel:q.sourceLabel?String(q.sourceLabel):undefined,presentation:typeof q.presentation==='string'?q.presentation.slice(0,80):undefined,stimulusId:q.stimulusId?String(q.stimulusId):undefined,stimulus:q.stimulusId?String(q.stimulus):undefined,caseSensitive:!!q.caseSensitive,format:q.format==='BENAR_SALAH'?'BENAR_SALAH':undefined,id:q.id||id(),sourceId:String(q.sourceId||q.id||''),scope:String(q.scope||''),type:q.type,text:q.text,keywords:String(q.keywords||''),options:q.options||[],key:String(q.key||''),points:Number(q.points),mode:q.mode||'TEKS',left:q.left||[],right:q.right||[],images:Array.isArray(q.images)?q.images.filter((v:any)=>typeof v==='string'&&/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(v)&&v.length<=300000).slice(0,8):[]}}
async function freezeExam(e:any){const key='snapshot-'+e.id;let snapshot=await get(key);if(snapshot)return snapshot;const existing:any=await db().prepare('SELECT data,version,question_data FROM attempts WHERE exam_id=? AND json_extract(data,?) IS NOT NULL LIMIT 1').bind(e.id,'$.startedAt').first();const prior=existing?await readAttempt(existing):null;const bank=await get(e.bankId);const questions=prior?.questions||bank?.questions;if(!questions?.length)fail('Paket soal kosong.');await db().prepare('INSERT OR IGNORE INTO records(id,kind,data) VALUES(?,?,?)').bind(key,'snapshot',JSON.stringify({questions,bankId:e.bankId,at:Date.now()})).run();return await get(key);}
async function attemptByToken(token:string){if(typeof token!=='string'||token.length<5||token.length>80)fail('Token tidak valid.');const tokenHash=await hash(token.trim().toUpperCase());let r:any=await db().prepare('SELECT * FROM attempts WHERE token_hash=?').bind(tokenHash).first();if(!r){const alias=await get('token-session-'+tokenHash);if(alias&&typeof requestBody?.session==='string'&&alias.sessionHash===await hash(requestBody.session)){const prior:any=await db().prepare('SELECT * FROM attempts WHERE id=?').bind(alias.attemptId).first();if(prior&&JSON.parse(prior.data).sessionHash===alias.sessionHash)r=prior;}}if(!r)fail('Token tidak ditemukan. Periksa kartu ujian Anda.');return readAttempt(r)}
// Keep the original serialized snapshot so status/answer writes leave its TOAST value alone.
const storedQuestions=new WeakMap<object,string>();
const examSnapshots=new Map<string,Promise<any>>();
function readExamSnapshot(examId:string){
 let snapshot=examSnapshots.get(examId);
 if(!snapshot){
   snapshot=get('snapshot-'+examId);
   examSnapshots.set(examId,snapshot);
 }
 return snapshot;
}
function applyQuestionKeyOverrides(questions:Question[],overrides:any):Question[]{
 if(!overrides)return questions;
 return questions.map(q=>Object.hasOwn(overrides,q.id)?{...q,...overrides[q.id]}:q);
}
async function readAttempt(row:any){
 const attempt={id:row.id,...JSON.parse(row.data),version:row.version};
 if(attempt.sharedQuestions){
   const snapshot=await readExamSnapshot(attempt.examId);
   const order=JSON.parse(attempt.questionOrder||'[]') as string[];
   const questions:Question[]=snapshot?.questions||[];
   const byId=new Map(questions.map(q=>[q.id,q]));
   if(!order.length||order.length!==byId.size||new Set(order).size!==order.length||order.some(id=>!byId.has(id))){
     fail('Salinan paket soal ujian tidak tersedia atau tidak sesuai.');
   }
   attempt.questions=applyQuestionKeyOverrides(order.map(id=>byId.get(id)!),attempt.questionKeyOverrides);
 }else if(row.question_data!=null){
   attempt.questions=JSON.parse(row.question_data);
   storedQuestions.set(attempt,row.question_data);
 }
 return attempt;
}
async function saveAttempt(a:any,starting=false){
 const {version,questions,...progress}=a;
 const counted={...progress,answeredCount:Object.values(a.answers||{}).filter(Boolean).length,answeredCountVersion:version+1};
 const previous=storedQuestions.get(a);
 const split=!a.sharedQuestions&&(previous!==undefined||starting&&env.SPLIT_ATTEMPT_QUESTIONS);
 const snapshot=split?JSON.stringify(questions):undefined;
 const data=JSON.stringify(split||a.sharedQuestions?counted:{...counted,questions});
 const writeSnapshot=snapshot!==undefined&&snapshot!==previous;
 const statement=writeSnapshot
   ?db().prepare('UPDATE attempts SET data=?,question_data=?,version=version+1 WHERE id=? AND version=?').bind(data,snapshot,a.id,version)
   :db().prepare('UPDATE attempts SET data=?,version=version+1 WHERE id=? AND version=?').bind(data,a.id,version);
 const r=await statement.run();
 if(!r.meta.changes)fail('Jawaban sedang diperbarui. Coba kembali.');
 if(writeSnapshot)storedQuestions.set(a,snapshot);
 a.version++;
}
async function startWithUniqueOrder(a:any,questions:Question[]){
 for(let retry=0;retry<40;retry++){
  let choice=uniqueQuestionOrder(questions,[]);
  // Try a random order first. Read the full order history only after collisions,
  // so short packages still reuse orders only when every permutation is taken.
  if(choice.groupCount<7||retry>=2){
   const rows=(await db().prepare("SELECT id, json_extract(data,'$.questionOrder') AS ordering, CASE WHEN json_extract(data,'$.questionOrder') IS NULL THEN json_extract(data,'$.questions') END AS questions FROM attempts WHERE exam_id=? AND id<>? AND (json_extract(data,'$.questionOrder') IS NOT NULL OR json_array_length(data,'$.questions')>0)").bind(a.examId,a.id).all()).results as any[];
   const used=rows.map(row=>row.ordering||JSON.stringify(JSON.parse(row.questions).map((q:any)=>q.id)));
   choice=uniqueQuestionOrder(questions,used);
  }
  a.questions=choice.questions;
  a.questionOrder=choice.signature;
  a.orderSpaceExhausted=!choice.unique;
  const {version,questions:orderedQuestions,...progress}=a;
  const snapshot=!a.sharedQuestions&&env.SPLIT_ATTEMPT_QUESTIONS?JSON.stringify(orderedQuestions):undefined;
  const rest=snapshot===undefined&&!a.sharedQuestions?{...progress,questions:orderedQuestions}:progress;
  // A single database statement arbitrates simultaneous starts, including legacy attempts.
  const guard=choice.unique?" AND NOT EXISTS (SELECT 1 FROM attempts AS other WHERE other.exam_id=? AND other.id<>? AND (json_extract(other.data,'$.questionOrder')=? OR (json_extract(other.data,'$.questionOrder') IS NULL AND (SELECT json_group_array(json_extract(value,'$.id')) FROM json_each(other.data,'$.questions'))=?)))":"";
  const args:any[]=[JSON.stringify(rest),...(snapshot===undefined?[]:[snapshot]),a.id,version];
  if(choice.unique)args.push(a.examId,a.id,choice.signature,choice.signature);
  const columns=snapshot===undefined?'data=?':'data=?,question_data=?';
  const result=await db().prepare('UPDATE attempts SET '+columns+',version=version+1 WHERE id=? AND version=?'+guard).bind(...args).run();
  if(result.meta.changes){
    if(snapshot!==undefined)storedQuestions.set(a,snapshot);
    a.version++;
    return;
  }
  const current:any=await db().prepare('SELECT version FROM attempts WHERE id=?').bind(a.id).first();
  if(!current||current.version!==version)fail('Sesi ujian sedang diperbarui. Coba masuk kembali.');
 }
 fail('Banyak siswa sedang mulai bersamaan. Silakan tekan mulai kembali; jawaban tetap aman.');
}
function teaches(staff:any,x:any){if(staff.role!=='Guru')return true;const tasks=staff.assignments?.length?staff.assignments:[{unit:staff.unit,subject:staff.subject,classes:[]}];return tasks.some((t:any)=>t.unit===x.unit&&t.subject===x.subject&&(!t.grade||!x.grade||t.grade===x.grade)&&(!t.classes?.length||(x.className?t.classes.includes(x.className):!x.grade||staff.assignedClassLevels?.some((c:any)=>c.unit===x.unit&&t.classes.includes(c.name)&&String(c.grade||c.name.match(/^\d+/)?.[0])===x.grade))));}
function homeroomCanWrite(staff:any,x:any){return x.unit==='SD'&&!!(x.grade||x.className)&&(staff.homeroomClasses||[]).some((c:any)=>(!x.grade||c.grade===x.grade)&&(!x.className||c.name===x.className));}
function publicAttempt(a:any,exam:any,student:any){return {id:a.id,student:{name:student.name,nis:student.nis,unit:student.unit,className:student.className},exam:{title:exam.title,subject:exam.subject,duration:exam.duration,start:exam.start,end:exam.end,strictExit:!!a.strictExit,browserGuard:!!a.browserGuard,instructions:exam.instructions||'Periksa jawaban sebelum mengumpulkan. Hubungi pengawas bila mengalami kendala.'},status:a.status,resetCount:a.resetCount||0,pauseUntil:a.pauseUntil,securityLocked:!!a.securityLocked,securityReason:a.securityReason,pausedAt:a.pausedAt,remainingMs:a.remainingMs,startedAt:a.startedAt,submitAfter:a.submitAfter,deadline:a.deadline,lastSavedAt:a.lastSavedAt,answers:a.answers||{},flags:a.flags||[],questions:(a.questions||[]).map(({key,keywords,...q}:Question)=>q),published:!!a.published,score:a.published?a.score:null,serverNow:Date.now()}}
function relatedClass(staff:any,c:any){return staff.role!=='Guru'||c.homeroomId===staff.id||(staff.assignments||[]).some((t:any)=>t.unit===c.unit&&(!t.classes?.length||t.classes.includes(c.name)));}
// Apply the same cutoff to student, monitoring, and direct proctor requests.
async function settleAttempt(a:any){
 if(a.status!=='Mengerjakan')return;
 if(a.pauseUntil&&Date.now()>=a.pauseUntil){const duration=a.pauseUntil-a.pausedAt;a.deadline+=duration;a.submitAfter=(a.submitAfter||0)+duration;a.lastSeenAt=a.pauseUntil;delete a.pausedAt;delete a.pauseUntil;delete a.remainingMs;delete a.remainingSubmitMs;await saveAttempt(a);}
 if(a.pausedAt&&!a.securityLocked)return;
 const now=Date.now(), cutoff=Number(a.deadline);
 if(!(now>=cutoff))return;
 a.status='Dikumpulkan';a.timedOut=true;a.submittedAt=cutoff;
 a.exitReason='Waktu ujian berakhir';
 delete a.securityLocked;delete a.securityReason;delete a.pausedAt;delete a.remainingMs;delete a.remainingSubmitMs;
 a.grades=mark(a.questions,a.answers);await saveAttempt(a);
}
// Only apply keys to the same question in the same package; published results are frozen.
function alignGradingKeys(attempt:any,bank:any){
 if(attempt.published||attempt.status!=='Dikumpulkan'||!bank?.questions)return false;
 let changed=false;
 const keyed=new Map<string,Question>(bank.questions.map((q:Question)=>[q.id,q]));
 attempt.questions=attempt.questions.map((q:Question)=>{
   const next=keyed.get(q.id);
   if(!next||q.key===next.key&&(q.keywords??'')===(next.keywords??'')&&!!q.caseSensitive===!!next.caseSensitive&&!!q.manualGrading===!!next.manualGrading)return q;
   changed=true;
   const revised={...q,key:next.key,keywords:next.keywords,caseSensitive:next.caseSensitive,manualGrading:next.manualGrading};
   if(attempt.sharedQuestions){
     attempt.questionKeyOverrides={...attempt.questionKeyOverrides,[q.id]:{
       key:next.key,keywords:next.keywords??'',caseSensitive:!!next.caseSensitive,manualGrading:!!next.manualGrading,
     }};
   }
   attempt.grades={...attempt.grades,...mark([revised],attempt.answers)};
   return revised;
 });
 if(changed){attempt.graded=false;delete attempt.score;}
 return changed;
}
async function gradingQuestionOrder(exam:any):Promise<string[]>{
 const seen=new Set<string>();
 let current=exam;
 while(current&&!seen.has(current.id)){
   seen.add(current.id);
   const snapshot=await db().prepare("SELECT json_extract(data,'$.resumeFor') AS resumed_for,(SELECT json_group_array(json_extract(value,'$.id')) FROM json_each(question_snapshot.data,'$.questions')) AS question_ids FROM records AS question_snapshot WHERE id=? AND kind=?").bind('snapshot-'+current.id,'snapshot').first();
   if(snapshot&&!snapshot.resumed_for){
     const ids=JSON.parse(String(snapshot.question_ids||'[]'));
     if(ids.length)return ids;
   }
   current=current.parentExamId?await get(current.parentExamId):null;
 }
 return [];
}
async function studentOverview(studentId:string,studentMenu?:string|null){
 const student=await get(studentId);if(!student)fail('Data siswa tidak ditemukan.');
 if(studentMenu&&!['Dashboard','Jadwal ujian','Hasil ujian'].includes(studentMenu))fail('Menu siswa tidak tersedia.');
 const resultsOnly=studentMenu==='Hasil ujian';
 const mine=(await db().prepare(
   "SELECT id,json_remove(data,'$.questions','$.grades','$.questionOrder','$.answers','$.flags','$.sessionHash') AS data FROM attempts WHERE student_id=?"
 ).bind(student.id).all()).results.map((r:any)=>({...JSON.parse(r.data),id:r.id}));
 const now=Date.now();
 for(const summary of mine){
   if(summary.status!=='Mengerjakan')continue;
   const resumeDue=summary.pauseUntil&&now>=summary.pauseUntil;
   const expired=(!summary.pausedAt||summary.securityLocked)&&now>=summary.deadline;
   if(!resumeDue&&!expired)continue;
   const row:any=await db().prepare('SELECT data,version,question_data FROM attempts WHERE id=? AND student_id=?').bind(summary.id,student.id).first();
   if(!row)continue;
   const attempt=await readAttempt(row);
   await settleAttempt(attempt);
   for(const field of ['status','published','score','submittedAt','publishedAt','graded','resetCount','pauseUntil','securityLocked','pausedAt','deadline']){
     summary[field]=attempt[field];
   }
 }
 const selectedAttempts=resultsOnly?mine.filter((a:any)=>a.status==='Dikumpulkan'):mine;
 const resultExams:any[]=[];
 const base=resultsOnly?null:await rawGet(studentId);
 const examSummarySQL="SELECT id,json_remove(data,'$.instructions','$.duties') AS data FROM records WHERE kind=?";
 if(resultsOnly){
   const ids=[...new Set<string>(selectedAttempts.map((a:any)=>a.examId))];
   for(let offset=0;offset<ids.length;offset+=100){
     const batch=ids.slice(offset,offset+100);
     const rows=await db().prepare(examSummarySQL+' AND id IN ('+batch.map(()=>'?').join(',')+')').bind('exam',...batch).all();
     for(const row of rows.results){
       const exam=JSON.parse(row.data);
       if(!exam.deletedAt)resultExams.push({...exam,id:row.id});
     }
   }
 }else{
   const suffix=':'+studentId;
   const {results:profiles}=await db().prepare("SELECT json_extract(data,'$.className') AS class_name FROM records WHERE kind IN (?,?) AND substr(id,length(id)-length(?)+1)=?").bind('student_year','academic_profile',suffix,suffix).all();
   const classNames=[...new Set([student.className,base?.className,...profiles.map((row:any)=>row.class_name)].filter(Boolean))];
   const classMatch=classNames.length?" OR json_extract(data,'$.className') IN ("+classNames.map(()=>'?').join(',')+")":"";
   const rows=await db().prepare(examSummarySQL+" AND (id IN (SELECT exam_id FROM attempts WHERE student_id=?) OR EXISTS (SELECT 1 FROM json_each(records.data,'$.studentIds') WHERE value=?)"+classMatch+")").bind('exam',studentId,studentId,...classNames).all();
   for(const row of rows.results){
     const exam=JSON.parse(row.data);
     if(!exam.deletedAt)resultExams.push({...exam,id:row.id});
   }
 }
 const profiles=new Map<string,any>();
 const attemptedExams=new Set(selectedAttempts.map((attempt:any)=>attempt.examId));
 const schedules=[];for(const e of resultExams){
 const year=e.year||'2026/2027', semester=Number(e.semester||1);
 const periodKey=year+':'+semester;
 if(!resultsOnly&&!profiles.has(periodKey)){
   const pupil=semester===2
     ? await rawGet('semester2:'+year+':'+studentId)
     : base&&!base.deletedAt&&!base.semester2Only?await annual(base,'student',year):null;
   profiles.set(periodKey,pupil&&!pupil.deletedAt&&(semester!==2||pupil.profileKind==='student'&&pupil.profileYear===year)?pupil:null);
 }
 const pupil=profiles.get(periodKey);
 const enrolled=!!pupil&&!(e.excludedStudentIds||[]).includes(student.id)&&((e.participantsSelected||e.studentIds?.length)?!!e.studentIds?.includes(student.id):pupil.unit===e.unit&&pupil.className===e.className&&(pupil.year||'2026/2027')===(e.year||'2026/2027'));if(enrolled||attemptedExams.has(e.id))schedules.push({id:e.id,title:e.title,topic:e.topic||e.title,subject:e.subject,unit:e.unit,grade:e.grade,start:e.start,end:e.end,duration:e.duration,status:e.status,retakeReason:e.retakeReason||''});}

 return Response.json({student,studentPortal:true,studentMenu,demo,exams:schedules,attempts:selectedAttempts.map((a:any)=>({id:a.id,examId:a.examId,status:a.status==='Mengerjakan'&&!a.pausedAt&&Date.now()>=a.deadline?'Dikumpulkan':a.status,published:!!a.published,score:a.published&&(!studentMenu||resultsOnly)?a.score:null,submittedAt:a.submittedAt,publishedAt:a.publishedAt,graded:!!a.graded,resetCount:a.resetCount||0,pauseUntil:a.pauseUntil,securityLocked:!!a.securityLocked,pausedAt:a.pausedAt,deadline:a.deadline}))},{headers:{'Cache-Control':'no-store'}});
}
async function monitoringProgress(staff:any,examId:string,withParticipants:boolean){
 const exam=await get(examId);
 if(!exam||exam._kind!=='exam'||exam.deletedAt||!inPeriod(exam)||!examPermission(staff,exam,'monitor')){
   return Response.json({error:'Jadwal tidak tersedia untuk monitoring.'},{status:403});
 }
 // Older records and writes from older handlers fall back to counting answers.
 const progressQuery=db().prepare(
   "SELECT id,student_id,exam_id,json_remove(data,'$.questions','$.grades','$.questionOrder','$.answers','$.flags','$.sessionHash') AS summary,COALESCE(json_array_length(json_extract(data,'$.questionOrder')),json_array_length(data,'$.questions')) AS question_count,COALESCE(CASE WHEN CAST(json_extract(data,'$.answeredCountVersion') AS TEXT)=CAST(version AS TEXT) THEN CAST(json_extract(data,'$.answeredCount') AS INTEGER) END,(SELECT count(*) FROM json_each(attempts.data,'$.answers') WHERE value<>'')) AS answered_count FROM attempts WHERE exam_id=?"
 ).bind(exam.id).all();
 const [{results},roster,token]=await Promise.all([
   progressQuery,
   withParticipants?examRosterRows([exam],staff,true):[],
   withParticipants&&examPermission(staff,exam,'token')
     ?db().prepare("SELECT id FROM records WHERE id=? AND kind='shared_token'").bind('shared-'+exam.id).first()
     :null,
 ]);
 const now=Date.now();
 const attempts=results.map((row:any)=>{
   const attempt=JSON.parse(row.summary);
   let {status,pausedAt,timedOut,submittedAt,securityLocked,exitReason}=attempt;
   let deadline=Number(attempt.deadline);
   // Mirror the displayed expiry without grading or writing from a polling request.
   if(status==='Mengerjakan'&&attempt.pauseUntil&&now>=attempt.pauseUntil){
     deadline+=attempt.pauseUntil-pausedAt;
     pausedAt=undefined;
   }
   if(status==='Mengerjakan'&&(!pausedAt||securityLocked)&&now>=deadline){
     status='Dikumpulkan';
     timedOut=true;
     submittedAt=deadline;
     pausedAt=undefined;
     securityLocked=false;
     exitReason='Waktu ujian berakhir';
   }
   return {id:row.id,examId:row.exam_id,studentId:row.student_id,status,timedOut,submittedAt,
     pausedAt,securityLocked,exitReason,resetCount:attempt.resetCount||0,actionNotes:attempt.actionNotes,
     answeredCount:Number(row.answered_count)||0,questionCount:Number(row.question_count)||0};
 });
 return Response.json({examId,attempts,...(withParticipants?{
   students:roster.filter(s=>matchesEnrollment(s,exam)),tokenExpiresAt:token?Date.parse(exam.end):0,
 }:{})},{headers:{'Cache-Control':'no-store'}});
}
function staffDataScope(staff:any,record:any){
 return staff.role==='Super Admin'||staff.unit===record.unit||staff.role==='Guru'&&(staff.assignments||[]).some((task:any)=>task.unit===record.unit);
}
function classesVisibleTo(staff:any,classes:any[],exams:any[]){
 return classes.filter(c=>staffDataScope(staff,c)).filter(c=>relatedClass(staff,c)||exams.some(e=>e.unit===c.unit&&e.className===c.name&&(
   examPermission(staff,e,'token')||examPermission(staff,e,'bank')||examPermission(staff,e,'grade')||!staff.assignments?.length&&teaches(staff,e)
 )));
}
function examsVisibleTo(staff:any,exams:any[],classes:any[]){
 return exams.filter(inPeriod).filter(e=>staffDataScope(staff,e)||examPermission(staff,e,'token'))
   .filter(e=>['token','bank','grade','monitor'].some(action=>examPermission(staff,e,action))||
     classes.some(c=>c.homeroomId===staff.id&&c.unit===e.unit&&c.name===e.className));
}
function canPreviewBank(staff:any,bank:any,exams:any[]){
 return staff.role!=='Guru'||bank.unit===staff.unit&&(bank.simulation||bank.createdBy===staff.id||
   exams.some(e=>e.bankId===bank.id&&inPeriod(e)&&!e.deletedAt&&
     (teacherDuty(staff,e,'bank')||teacherDuty(staff,e,'grade'))));
}

async function readStaffMenu(staff:any,menu:string,user:any,authMethod:string){
 const headers={'Cache-Control':'no-store'};
 const teacher=staff.role==='Guru';
 if(!Object.hasOwn(staffMenuRecords,menu)||menu==='Pengelola'&&(staff.role!=='Super Admin'||demo)||teacher&&menu==='Riwayat aktivitas'){
   return Response.json({error:'Menu tidak tersedia untuk akun ini.'},{status:403,headers});
 }
 const kinds=staffMenuRecords[menu];
 const scope=(x:any)=>staffDataScope(staff,x);
 const menuPermission:Record<string,string>={'Monitoring':'monitor','Token ujian':'token','Koreksi & nilai':'grade'};
 const examAction=menuPermission[menu];
 const compactRoster=!!examAction&&query.get('menuVersion')==='3';
 const list=async(kind:string)=>kinds.includes(kind)&&(!compactRoster||kind==='exam')?(await all(kind)).filter(scope):[];
 const bankMenu=['Bank soal','Buat soal','Simulasi ujian'].includes(menu);
 const needsSources=menu==='Bank soal'||menu==='Buat soal';
 const needsShared=!compactRoster&&(menu==='Token ujian'||menu==='Monitoring');
 const bankUnits=staff.role==='Super Admin'?[]:[...new Set([staff.unit,...teacher?(staff.assignments||[]).map((task:any)=>task.unit):[]])];
 const bankUnitFilter=bankUnits.length?" AND json_extract(data,'$.unit') IN ("+bankUnits.map(()=>'?').join(',')+")":'';
 const menuExams=async()=>{
   if(!teacher)return list('exam');
   if(menu!=='Monitoring')return all('exam');
   // Monitoring duties and navigation count only exams in the teacher's own unit.
   // Leave legacy semester values to inPeriod so they retain JS number coercion.
   const {results}=await db().prepare(
     "SELECT id,version,data FROM records WHERE kind=? AND json_extract(data,'$.unit')=? "+
     "AND COALESCE(NULLIF(CAST(json_extract(data,'$.year') AS TEXT),''),'2026/2027')=? "+
     "AND COALESCE(NULLIF(CAST(json_extract(data,'$.semester') AS TEXT),''),'1')<>?"
   ).bind('exam',staff.unit,period.year,period.semester===1?'2':'1').all();
   return results.map(row=>({...JSON.parse(row.data),id:row.id,version:row.version})).filter(e=>!e.deletedAt);
 };
 const [years,students,exams,classes,people,subjects,topics,logs,sharedRows,draftRows,loginAccounts]=await Promise.all([
   all('year'),list('student'),menuExams(),list('class'),list('staff'),list('subject'),list('topic'),
   menu==='Riwayat aktivitas'?db().prepare("SELECT data FROM records WHERE kind=?"+(staff.role==='Admin Unit'?" AND json_extract(data,'$.unit')=?":"")+" ORDER BY json_extract(data,'$.at') DESC,id DESC LIMIT 50").bind(...(staff.role==='Admin Unit'?['audit',staff.unit]:['audit'])).all().then(r=>r.results.map((row:any)=>JSON.parse(row.data))):[],
   needsShared?all('shared_token'):[],
   menu==='Buat soal'?db().prepare("SELECT id,json_remove(data,'$.form') AS summary,json_extract(data,'$.form.title') AS title FROM records WHERE kind=? AND json_extract(data,'$.ownerId')=?").bind('draft',staff.id).all().then(r=>r.results):[],
   menu==='Pengelola'?authRecords('credential').then(rows=>rows.map((c:any)=>({staffId:c.staffId,username:c.username}))):[],
 ]);
 const visibleClasses=classesVisibleTo(staff,classes,exams);
 const teacherClasses=teacher?compactRoster?(staff.homeroomClasses||[]):classesVisibleTo(staff,kinds.includes('class')?classes:await all('class'),exams):visibleClasses;
 const permittedExams=examsVisibleTo(staff,exams,teacherClasses);
 const navigation=teacher?teacherNavigation(staff,permittedExams):undefined;
 let visibleExams=kinds.includes('exam')?permittedExams:[];
 if(examAction)visibleExams=visibleExams.filter(e=>examPermission(staff,e,examAction));
 if(menu==='Koreksi & nilai'){
   const now=Date.now();
   visibleExams=visibleExams.filter(e=>Date.parse(e.end)<=now);
 }
 if(menu==='Token ujian')visibleExams=visibleExams.filter(e=>tokenScheduleOpen(e,Date.now()));
 const enrolled=compactRoster?enrollmentByExam(visibleExams,await examRosterRows(visibleExams,staff)):null;
 const participantClasses=menu==='Buat soal'
   ?new Set(visibleExams.filter(e=>examPermission(staff,e,'bank')).map(e=>JSON.stringify([e.unit,e.className])))
   :new Set<string>();
 const participantStudents=participantClasses.size
   ?(await all('student')).filter(s=>belongsYear(s)&&scope(s)&&participantClasses.has(JSON.stringify([s.unit,s.className])))
     .map(({id,name,nis,unit,className,year})=>({id,name,nis,unit,className,year}))
   :[];
 const simulations="json_extract(data,'$.simulation') IN (1,'true')";
 const linkedBankIds=[...new Set(teacher?permittedExams.filter(e=>e.bankId&&(teacherDuty(staff,e,'bank')||teacherDuty(staff,e,'grade'))).map(e=>e.bankId):[])];
 const linkedBankFilter=linkedBankIds.length?" OR id IN ("+linkedBankIds.map(()=>'?').join(',')+")":"";
 const bankAccessFilter=menu==='Simulasi ujian'?" AND "+simulations:teacher?" AND (json_extract(data,'$.createdBy')=? OR "+simulations+linkedBankFilter+")":"";
 const bankAccessParams=teacher&&menu!=='Simulasi ujian'?[staff.id,...linkedBankIds]:[];
 const bankRows=bankMenu?(await db().prepare("SELECT id,version,json_remove(data,'$.questions') AS summary,"+questionIndexSQL+" AS question_index FROM records WHERE kind=?"+bankUnitFilter+bankAccessFilter).bind('bank',...bankUnits,...bankAccessParams).all()).results:[];
 const banks=bankRows.map((row:any)=>({...JSON.parse(row.summary),id:row.id,version:row.version,questions:JSON.parse(row.question_index||'[]'),summaryOnly:true}))
   .filter((b:any)=>scope(b)&&(!b.deletedAt||b.retainQuestions)&&canPreviewBank(staff,b,permittedExams))
   .map((b:any)=>({...b,canPreviewPackage:true}))
   .map((b:any)=>b.deletedAt?{...b,archived:true}:b);
 const sources=new Map<string,any[]>();
 if(needsSources){
   const examsWithVisibleBank=teacher?visibleExams.filter(e=>banks.some(b=>b.id===e.bankId)):visibleExams;
   for(let offset=0;offset<examsWithVisibleBank.length;offset+=100){
     const ids=examsWithVisibleBank.slice(offset,offset+100).map((e:any)=>e.id);
     const rows=await db().prepare("SELECT id,"+questionIndexSQL+" AS question_index FROM records WHERE kind=? AND id IN ("+ids.map(()=>'?').join(',')+")").bind('snapshot',...ids.map((id:string)=>'snapshot-'+id)).all();
     for(const row of rows.results)sources.set(row.id.slice('snapshot-'.length),JSON.parse(row.question_index||'[]'));
   }
 }
 const tokenById=new Map(sharedRows.map((r:any)=>[r.id,r]));
 const tokens=new Map<string,string>();
 if(menu==='Token ujian'){
   const now=Date.now();
   if(compactRoster){
     const ids=visibleExams.map(e=>'shared-'+e.id);
     for(let offset=0;offset<ids.length;offset+=100){
       const batch=ids.slice(offset,offset+100);
       const {results}=await db().prepare("SELECT id,data FROM records WHERE kind=? AND id IN ("+batch.map(()=>'?').join(',')+")").bind('shared_token',...batch).all();
       for(const row of results)tokenById.set(row.id,{...JSON.parse(row.data),id:row.id});
     }
   }
   const prepared=visibleExams.filter(e=>tokenById.has('shared-'+e.id));
   const started=prepared.filter(e=>Date.parse(e.start)<=now);
   const completed=new Set<string>();
   if(started.length){
     const rows=await db().prepare("SELECT exam_id,student_id FROM attempts WHERE exam_id IN ("+started.map(()=>'?').join(',')+") AND json_extract(data,'$.status')='Dikumpulkan'").bind(...started.map(e=>e.id)).all();
     const submitted=new Map<string,Set<string>>();
     for(const row of rows.results){
       let ids=submitted.get(row.exam_id);
       if(!ids)submitted.set(row.exam_id,ids=new Set());
       ids.add(row.student_id);
     }
     for(const e of started){
       const ids=submitted.get(e.id);
       if(!ids?.size)continue;
       const candidates=enrolled?.get(e.id)??students.filter(s=>matchesEnrollment(s,e));
       if(candidates.length&&candidates.every(s=>ids.has(s.id)))completed.add(e.id);
     }
   }
   visibleExams=visibleExams.filter(e=>!completed.has(e.id));
   for(const e of prepared){
     if(completed.has(e.id))continue;
     try{tokens.set(e.id,await readSharedToken(e.id,tokenById.get('shared-'+e.id)));}
     catch(error:any){console.warn('CBT shared token could not be read',{examId:e.id});}
   }
 }
 const bankById=new Map(banks.map((b:any)=>[b.id,b]));
 return Response.json({
   menu,operations:menu==='Monitoring',demo,period,years,activeYear,user,authMethod,staff,loginAccounts,
   catalogReady:!demo||!!(await get('catalog-v2')),
   navigation,
   classes:visibleClasses.filter(belongsYear),
   students:menu==='Buat soal'?participantStudents:students.filter(belongsYear).filter((x:any)=>!teacher||
     (examAction?visibleExams.some(e=>matchesEnrollment(x,e)):teacherClasses.some((c:any)=>c.unit===x.unit&&c.name===x.className&&c.year===(x.year||'2026/2027')))),
   staffList:people.filter((p:any)=>p.role==='Guru'?belongsYear(p)&&(!teacher||p.id===staff.id):menu==='Pengelola')
     .map((p:any)=>teacher?{id:p.id,name:p.name,unit:p.unit,role:p.role,gender:p.gender,assignments:p.assignments,subject:p.subject}:p),
   subjects,topics:topics.filter(inPeriod),audit:logs,banks,attempts:[],
   drafts:draftRows.map((r:any)=>({...JSON.parse(r.summary),id:r.id,form:{title:r.title},summaryOnly:true})).filter(inPeriod),
   exams:visibleExams.map((e:any)=>{
     const token=tokenById.get('shared-'+e.id);
     const questionSources=(sources.get(e.id)||bankById.get(e.bankId)?.questions||[]).map((q:any)=>q.sourceId||q.id);
     const {studentIds,excludedStudentIds,instructions,duties,...schedule}=e;
     return {...(compactRoster?schedule:e),questionSources,tokenExpiresAt:token?Date.parse(e.end):0,...(enrolled?{participantCount:enrolled.get(e.id)?.length??0}:{}),...(menu==='Token ujian'?{sharedCode:tokens.get(e.id)}:{}),
       canMonitor:examPermission(staff,e,'monitor'),canManageAttempt:examPermission(staff,e,'monitor'),canProctor:examPermission(staff,e,'token'),
       canGrade:examPermission(staff,e,'grade'),canWrite:examPermission(staff,e,'bank')};
   }),
 },{headers});
}

async function readStaffMenuDetail(staff:any,kind:string,key:string){
 const headers={'Cache-Control':'no-store'};
 const missing=()=>Response.json({error:'Detail tidak tersedia pada unit atau periode ini.'},{status:404,headers});
 if(kind==='bank'||kind==='simulation'){
   const bank=await get(key);
   if(!bank||bank._kind!=='bank'||bank.deletedAt&&!bank.retainQuestions||!staffDataScope(staff,bank)||kind==='simulation'&&!bank.simulation)return missing();
   if(!canPreviewBank(staff,bank,[])&&!canPreviewBank(staff,bank,await all('exam')))return missing();
   return Response.json({...bank,archived:!!bank.deletedAt},{headers});
 }
 if(kind==='draft'){
   const draft=await get(key);
   if(!draft||draft._kind!=='draft'||draft.deletedAt||draft.ownerId!==staff.id||!inPeriod(draft))return missing();
   return Response.json(draft.form,{headers});
 }
 if(kind==='gradeExam'){
   const exam=await get(key);
   if(!exam||exam._kind!=='exam'||exam.deletedAt||!inPeriod(exam)||!examPermission(staff,exam,'grade'))return missing();
   const now=Date.now();
   if(!(Date.parse(exam.end)<=now))return Response.json({error:'Jadwal ujian masih berlangsung.'},{status:409,headers});
   const questionSource="COALESCE(NULLIF(score_attempt.question_data,'null'),json_extract(score_attempt.data,'$.questions'))";
   const [bank,{results}]=await Promise.all([
     exam.bankId?db().prepare("SELECT "+scoreQuestionsSQL("score_bank.data,'$.questions'")+" AS scoring_questions FROM records AS score_bank WHERE id=? AND kind='bank'").bind(exam.bankId).first():null,
     db().prepare("SELECT id,student_id,json_remove(data,'$.questions','$.grades','$.questionOrder','$.answers','$.flags','$.sessionHash') AS summary,"
       +scoreQuestionsSQL(questionSource)+" AS scoring_questions,json_extract(data,'$.answers') AS scoring_answers,json_extract(data,'$.grades') AS scoring_grades FROM attempts AS score_attempt WHERE exam_id=?").bind(exam.id).all(),
   ]);
   const bankQuestions=bank?{questions:JSON.parse(bank.scoring_questions||'[]')}:undefined;
   const summaries=results.map((row:any)=>({row,attempt:JSON.parse(row.summary)}));
   if(summaries.some(({attempt})=>attempt.status==='Mengerjakan'&&gradingCutoff(attempt,now)===undefined)){
     return Response.json({error:'Masih ada siswa yang mengerjakan. Buka detail lagi setelah ujian mereka selesai.'},{status:409,headers});
   }
   const shared=summaries.some(({attempt})=>attempt.sharedQuestions)
     ?await db().prepare("SELECT "+scoreQuestionsSQL("score_bank.data,'$.questions'")+" AS scoring_questions FROM records AS score_bank WHERE id=? AND kind='snapshot'").bind('snapshot-'+exam.id).first()
     :null;
   const sharedQuestions:Question[]=JSON.parse(String(shared?.scoring_questions||'[]'));
   if(summaries.some(({attempt})=>attempt.sharedQuestions)&&!sharedQuestions.length)fail('Salinan paket soal ujian tidak tersedia.');
   const attempts=summaries.map(({row,attempt:a})=>{
     const questions=a.sharedQuestions
       ?applyQuestionKeyOverrides(sharedQuestions,a.questionKeyOverrides)
       :JSON.parse(row.scoring_questions||'[]');
     const answers=JSON.parse(row.scoring_answers||'{}')||{};
     const cutoff=gradingCutoff(a,now);
     if(cutoff!==undefined){
       a.status='Dikumpulkan';a.timedOut=true;a.submittedAt=cutoff;
     }
     let points;
     if(a.status==='Dikumpulkan'&&questions.length){
       const scoring={...a,questions,answers,grades:cutoff!==undefined?mark(questions,answers):JSON.parse(row.scoring_grades||'{}')||{}};
       alignGradingKeys(scoring,bankQuestions);
       a.graded=scoring.graded;
       a.score=scoring.score;
       points=gradingPoints(scoring.questions,answers,scoring.grades,scoring.graded||scoring.published);
     }
     const {questionKeyOverrides,...summary}=a;
     return {...summary,id:row.id,examId:exam.id,studentId:row.student_id,answeredCount:Object.values(answers).filter(Boolean).length,questionCount:questions.length,points};
   });
   const attemptedIds=new Set<string>(attempts.map(a=>a.studentId));
   const roster=query.get('menuVersion')==='3'
     ?(await examRosterRows([exam],staff,true,[...attemptedIds])).filter(s=>matchesEnrollment(s,exam)||attemptedIds.has(s.id))
     :undefined;
   return Response.json({examId:exam.id,attempts,students:roster},{headers});
 }
 if(kind==='grade'){
   const row:any=await db().prepare('SELECT id,exam_id FROM attempts WHERE id=?').bind(key).first();
   if(!row)return missing();
   const exam=await get(row.exam_id);
   if(!exam||exam._kind!=='exam'||exam.deletedAt||!inPeriod(exam)||!examPermission(staff,exam,'grade'))return missing();
   const full:any=await db().prepare('SELECT data,version,question_data FROM attempts WHERE id=? AND exam_id=?').bind(key,exam.id).first();
   if(!full)return missing();
   const attempt=await readAttempt(full);
   await settleAttempt(attempt);
   if(attempt.status!=='Dikumpulkan')return missing();
   const [snapshotOrder,bank]=await Promise.all([
     gradingQuestionOrder(exam),
     exam.bankId?get(exam.bankId):null,
   ]);
   if(attempt.questions?.length)alignGradingKeys(attempt,bank);
   const order:string[]=snapshotOrder.length?snapshotOrder:(bank?.questions||[]).map((q:Question)=>q.id);
   const positions=new Map(order.map((id,index)=>[id,index]));
   const questions=[...(attempt.questions||[])].sort((a:Question,b:Question)=>
     (positions.get(a.id)??order.length)-(positions.get(b.id)??order.length)||a.id.localeCompare(b.id));
   const {sessionHash,...result}=attempt;
   return Response.json({...result,questions},{headers});
 }
 return missing();
}


async function GET(req:Request){try{
 const authenticated=await authentication;const {user,authMethod}=authenticated;let staff=authenticated.staff;if(staff?.role==='Guru')staff=await get(staff.id)||staff;if(staff?.role==='Guru'&&!belongsYear(staff))staff={...staff,assignments:[],subject:''};if(staff?.role==='Guru'){const own=(await all('class')).filter((c:any)=>belongsYear(c)&&c.unit===staff.unit);staff={...staff,assignedClassLevels:own.filter((c:any)=>(staff.assignments||[]).some((t:any)=>t.classes?.includes(c.name))).map(({name,grade,unit}:any)=>({name,grade,unit})),homeroomClasses:own.filter((c:any)=>c.unit==='SD'&&c.homeroomId===staff.id)};}if(!staff)return Response.json({needsSetup:!(await get('installation')),user});if(staff.disabled||staff.deletedAt)fail('Akun tidak aktif pada periode ini.');if(query.has('monitorExam'))return await monitoringProgress(staff,query.get('monitorExam')||'',query.get('withParticipants')==='1');
 if(staff.role==='Siswa')return await studentOverview(staff.studentId,query.get('studentMenu'));
 const staffScope=(!demo||['2','3'].includes(query.get('menuVersion')||''))&&['Super Admin','Admin Unit','Guru'].includes(staff.role);
 const menu=query.get('menu');
 const detail=query.get('detail');
 if(staff.role==='Guru'&&(menu&&teacherExamMenus.includes(menu)||detail&&['bank','grade','gradeExam'].includes(detail)||!menu&&!detail&&query.get('view')!=='operations')){
   const mode=await currentTeacherExamMode(staff);
   if(mode)return lockedTeacherMenu(mode);
 }
 if(staffScope&&detail)return await readStaffMenuDetail(staff,detail,query.get('id')||'');
 if(staffScope&&menu&&Object.hasOwn(staffMenuRecords,menu)&&!staffMenuRecords[menu].includes('subject')){
   await ensureMasters();
   return await readStaffMenu(staff,menu,user,authMethod);
 }
 await ensureMasters();if(staff.role==='Super Admin'||staff.role==='Admin Unit'&&staff.unit==='SD')await ensureSdSubjects();if(staff.role==='Super Admin'||staff.role==='Admin Unit'&&staff.unit==='SMP')await ensureSmpSubjects();if(staff.role==='Super Admin'||staff.role==='Admin Unit'&&staff.unit==='SMA')await ensureSmaSubjects();
 if(staffScope&&query.has('menu'))return await readStaffMenu(staff,query.get('menu')||'',user,authMethod);
 const operations=query.get('view')==='operations'&&!demo;
 const [students,exams,people,logs,classes,subjects,topics,bankRows]=await Promise.all([
   all('student'),all('exam'),all('staff'),operations?[]:all('audit'),all('class'),all('subject'),all('topic'),
   db().prepare(operations?"SELECT id,version,json_remove(data,'$.questions') AS data FROM records WHERE kind=?":'SELECT * FROM records WHERE kind=?').bind('bank').all().then(result=>
     result.results.map((row:any)=>({...JSON.parse(row.data),id:row.id,version:row.version}))),
 ]);
 const banks=bankRows.filter((bank:any)=>!bank.deletedAt);
 const scope=(x:any)=>staffDataScope(staff,x);
 const visibleClasses=classesVisibleTo(staff,classes,exams);
 const examsVisible=examsVisibleTo(staff,exams,visibleClasses);
 const examsById=new Map<string,any>(examsVisible.map((exam:any)=>[exam.id,exam]));
 const banksById=new Map<string,any>(banks.map((bank:any)=>[bank.id,bank]));
 const examIds=examsVisible.filter(e=>staff.role!=='Guru'||examPermission(staff,e,'grade')||examPermission(staff,e,'monitor')).map(e=>e.id);
 const rs:any[]=[];
 for(let offset=0;offset<examIds.length;offset+=100){
   const ids=examIds.slice(offset,offset+100);
   const columns=operations
     ?"id,exam_id,student_id,json_extract(data,'$.status') AS status"
     :"data,version,question_data";
   const rows=await db().prepare('SELECT '+columns+' FROM attempts WHERE exam_id IN ('+ids.map(()=>'?').join(',')+')').bind(...ids).all();
   for(const row of rows.results)rs.push(operations
     ?{id:row.id,examId:row.exam_id,studentId:row.student_id,status:row.status}
     :await readAttempt(row));

 }
 for(const attempt of operations?[]:rs){
   await settleAttempt(attempt);
   alignGradingKeys(attempt,banksById.get(examsById.get(attempt.examId)?.bankId));
 }
 const [sharedRows,snapshotRows]=await Promise.all([all('shared_token'),operations?[]:all('snapshot')]);
 banks.push(...bankRows.filter((bank:any)=>bank.deletedAt&&bank.retainQuestions).map((bank:any)=>({...bank,archived:true})));
 const safeAttempts=operations?rs:rs.map(({sessionHash,...a}:any)=>{const e=examsById.get(a.examId);if(staff.role==='Guru'&&!examPermission(staff,e,'grade'))return {id:a.id,studentId:a.studentId,examId:a.examId,status:a.status,published:a.published,score:null,graded:a.graded,readOnly:true,submittedAt:a.submittedAt,timedOut:a.timedOut,resetCount:a.resetCount||0,pauseUntil:a.pauseUntil,securityLocked:!!a.securityLocked,securityReason:a.securityReason,pausedAt:a.pausedAt,actionNotes:a.actionNotes,answeredCount:Object.values(a.answers||{}).filter(Boolean).length,questionCount:a.questions?.length||0};return a;});
 return Response.json({demo,operations,period,navigation:staff.role==='Guru'?teacherNavigation(staff,examsVisible):undefined,classes:visibleClasses.filter((c:any)=>c.year===period.year),topics:topics.filter(scope).filter(inPeriod),years:await all('year'),activeYear,authMethod,loginAccounts:staff.role==='Super Admin'&&!demo&&!operations?(await authRecords('credential')).map((c:any)=>({staffId:c.staffId,username:c.username})):[],catalogReady:!!(await get('catalog-v2')),subjects:subjects.filter(scope),user,staff,students:students.filter((s:any)=>(s.year||'2026/2027')===period.year).filter(scope).filter((x:any)=>staff.role!=='Guru'||visibleClasses.some((c:any)=>c.unit===x.unit&&c.name===x.className&&c.year===(x.year||'2026/2027'))),exams:examsVisible.map((e:any)=>({...e,tokenExpiresAt:(()=>{const t=sharedRows.find((v:any)=>v.id==='shared-'+e.id);return t?(t.issuedSlot===undefined?Math.floor(Date.now()/900000)+1:t.issuedSlot+1)*900000:0})(),questionSources:(staff.role!=='Guru'||banks.some((b:any)=>b.id===e.bankId&&canPreviewBank(staff,b,examsVisible))?snapshotRows.find((x:any)=>x.id==='snapshot-'+e.id)?.questions||banks.find((b:any)=>b.id===e.bankId)?.questions||[]:[]).map((q:any)=>q.sourceId||q.id),canMonitor:examPermission(staff,e,'monitor'),canManageAttempt:examPermission(staff,e,'monitor'),canProctor:examPermission(staff,e,'token'),canGrade:examPermission(staff,e,'grade'),canWrite:examPermission(staff,e,'bank')})),banks:banks.filter((b:any)=>scope(b)&&canPreviewBank(staff,b,examsVisible)).map((b:any)=>({...b,canPreviewPackage:true})),drafts:(operations?[]:await all('draft')).filter((d:any)=>d.ownerId===staff.id&&inPeriod(d)),staffList:people.filter((x:any)=>x.role!=='Guru'||belongsYear(x)).filter(scope).filter((p:any)=>staff.role==='Super Admin'||p.role==='Guru'&&(staff.role!=='Guru'||p.id===staff.id)).map((p:any)=>staff.role==='Guru'?{id:p.id,name:p.name,unit:p.unit,role:p.role,gender:p.gender,assignments:p.assignments,subject:p.subject}:p),attempts:safeAttempts,audit:staff.role==='Guru'?[]:logs.filter(scope).slice(-50).reverse()},{headers:{'Cache-Control':'no-store'}});
 }catch(e:any){return Response.json({error:e.message},{status:401})}}
async function saveCompactStudentUpdate(b:any){
 const saving=b.action==='saveAnswers';
 if(!saving&&(b.action!=='heartbeat'||!b.compact))return null;
 const staff=identity?.staff;
 if(staff?.role!=='Siswa'||!staff.studentId||typeof b.token!=='string'||b.token.length<5||b.token.length>80||
   typeof b.session!=='string'||!/^[a-f0-9-]{36,80}$/.test(b.session))return null;
 const [tokenHash,sessionHash]=await Promise.all([hash(b.token.trim().toUpperCase()),hash(b.session)]);
 const idProjection=saving?",COALESCE(json_extract(data,'$.questionOrder'),(SELECT json_group_array(json_extract(value,'$.id')) FROM json_each(attempts.data,'$.questions'))) AS question_ids":"";
 const answeredProjection=saving?",(SELECT json_group_array(key) FROM json_each(attempts.data,'$.answers') WHERE value<>'') AS answered_ids":"";
 const row:any=await db().prepare("SELECT id,student_id,exam_id,version,json_remove(data,'$.questions','$.answers','$.grades','$.questionOrder','$.flags','$.actionNotes') AS summary"+idProjection+answeredProjection+" FROM attempts WHERE token_hash=? AND student_id=?").bind(tokenHash,staff.studentId).first();
 if(!row)return null;
 const a=JSON.parse(row.summary);
 const now=Date.now();
 if(a.status!=='Mengerjakan'||a.sessionHash!==sessionHash||a.pausedAt||a.pauseUntil||a.securityLocked||
   !Number.isFinite(a.deadline)||now>=a.deadline)return null;
 const exam=await get(row.exam_id);
 const student=await studentFor(row.student_id,exam||{});
 if(!exam||exam.deletedAt||!student||student.deletedAt)return null;
 const savedAt=Date.now();
 if(savedAt>=a.deadline)return null;
 const guards=[row.id,row.version];
 if(saving){
   const entries=Object.entries(b.answers||{});
   const questionIds=new Set<string>(JSON.parse(row.question_ids||'[]'));
   if(!entries.length||entries.length>questionIds.size||entries.some(([key,value])=>!questionIds.has(key)||typeof value!=='string'||value.length>20000))fail('Jawaban tidak valid.');
   const delta=JSON.stringify(Object.fromEntries(entries));
   const answeredIds=new Set<string>(JSON.parse(row.answered_ids||'[]'));
   for(const [key,value] of entries){
     if(value)answeredIds.add(key);
     else answeredIds.delete(key);
   }
   const progressPatch=JSON.stringify({
     answeredCount:answeredIds.size,answeredCountVersion:row.version+1,
     ...(Array.isArray(b.flags)?{flags:b.flags.filter((key:string)=>questionIds.has(key))}:{}),
   });
   const saved=await db().prepare("UPDATE attempts SET data=json_patch(json_set(data,'$.answers',json_patch(COALESCE(json_extract(data,'$.answers'),'{}'),json(?)),'$.lastSavedAt',?,'$.lastSeenAt',?),json(?)),version=version+1 WHERE id=? AND version=?").bind(delta,savedAt,savedAt,progressPatch,...guards).run();
   if(!saved.meta.changes)fail('Jawaban sedang diperbarui. Coba kembali.');
 }
 return Response.json({compact:true,id:row.id,status:a.status,...(saving?{lastSavedAt:savedAt}:{}),serverNow:Date.now()},{headers:{'Cache-Control':'no-store'}});
}

async function handleChildPost(req:Request){return (await handlers(req)).POST(req);}
async function POST(req:Request){try{const b=requestBody;if(identity?.staff&&b.activeYearAtOpen&&b.activeYearAtOpen!==activeYear)fail('Tahun pelajaran aktif telah berubah. Tutup editor lalu perbarui dashboard.');
if(['preview','enter','answer','saveAnswers','submit','exitExam','securityLock','requestUnlock','heartbeat','tokenDashboard'].includes(b.action)){
 const compact=await saveCompactStudentUpdate(b);
 if(compact)return compact;
 const a=await attemptByToken(b.token);const exam=await get(a.examId),student=await studentFor(a.studentId,exam||{});if(identity?.staff?.role==='Siswa'&&(identity.staff.studentId!==a.studentId||!!identity.staff.demo!==demo))fail('Token bukan milik akun siswa ini.');if(!exam||exam.deletedAt||!student||student.deletedAt)fail('Jadwal atau siswa tidak ditemukan.');if(a.requiresLogin&&(!identity?.staff||identity.staff.role!=='Siswa'||identity.staff.studentId!==a.studentId))fail('Masuk dengan akun siswa terlebih dahulu.');
 await settleAttempt(a);
 if(b.action==='preview'){if(a.status==='Belum mulai'&&(exam.status!=='Aktif'||Date.now()<Date.parse(exam.start)||Date.now()>=Date.parse(exam.end)))fail('Ujian belum dibuka atau jadwal sudah berakhir.');return Response.json({id:a.id,student:{name:student.name,nis:student.nis,unit:student.unit,className:student.className},exam:{title:exam.title,subject:exam.subject,duration:exam.duration,start:exam.start,end:exam.end,browserGuard:!exam.simulation,instructions:exam.instructions||'Kerjakan secara mandiri. Hubungi pengawas bila ada kendala.'},status:a.status},{headers:{'Cache-Control':'no-store'}});}
 if(b.action==='enter'&&b.identityConfirmed!==true)fail('Konfirmasi identitas diperlukan.');
 if(typeof b.session!=='string'||!/^[a-f0-9-]{36,80}$/.test(b.session))fail('Sesi perangkat tidak valid. Muat ulang halaman.');
 if(b.action==='enter'&&a.status==='Belum mulai'&&(exam.status!=='Aktif'||Date.now()<Date.parse(exam.start)||Date.now()>=Date.parse(exam.end)))fail('Ujian belum dibuka atau jadwal sudah berakhir.');
 const sessionHash=await hash(b.session);if(a.sessionHash&&a.sessionHash!==sessionHash)fail('Token sedang digunakan pada sesi lain. Minta pengawas melepas sesi untuk pindah perangkat.');
 if(b.action==='requestUnlock'){
 if(!a.securityLocked||a.status!=='Mengerjakan')fail('Ujian tidak sedang terkunci.');
 if((a.resetCount||0)>=MAX_EXAM_UNLOCKS)fail('Kesempatan melanjutkan ujian sudah habis.');
 if(!a.sessionHash||a.sessionHash!==sessionHash)fail('Gunakan perangkat ujian yang sama.');
 if(exam.status!=='Aktif'||Date.now()<Date.parse(exam.start)||Date.now()>=Date.parse(exam.end))fail('Jadwal ujian sudah berakhir.');
 if(identity?.staff?.role!=='Siswa'||identity.staff.studentId!==a.studentId)fail('Masuk dengan akun siswa untuk melanjutkan ujian.');
 const shared=await get('shared-'+exam.id);
 if(!shared)fail('Token ujian belum tersedia.');
 if(b.code!=null&&String(b.code).trim().toUpperCase()!==await readSharedToken(exam.id,shared))fail('Token ujian tidak sesuai.');
 a.resetCount=(a.resetCount||0)+1;a.lastSeenAt=Date.now();delete a.securityLocked;delete a.securityReason;delete a.pausedAt;delete a.remainingMs;delete a.remainingSubmitMs;
 a.actionNotes=[...(a.actionNotes||[]),{name:student.name,action:'Lanjutkan ujian '+a.resetCount+' dari '+MAX_EXAM_UNLOCKS,reason:'Melanjutkan dengan token utama pada perangkat yang sama',at:Date.now()}];await saveAttempt(a);return Response.json(publicAttempt(a,exam,student),{headers:{'Cache-Control':'no-store'}});
 }
 if(a.securityLocked){if(b.action==='enter'||b.action==='heartbeat'||b.action==='securityLock'||b.action==='exitExam')return Response.json(publicAttempt(a,exam,student),{headers:{'Cache-Control':'no-store'}});fail('Ujian terkunci. Pilih Lanjutkan ujian untuk membuka sesi.');}
 if(!a.sessionHash&&a.pausedAt&&b.action==='heartbeat')return Response.json(publicAttempt(a,exam,student),{headers:{'Cache-Control':'no-store'}});
 if(!a.sessionHash){if(b.action!=='enter')fail(a.pausedAt?'Waktu ujian dijeda oleh pengawas. Masuk ulang untuk melanjutkan.':'Masuk ulang terlebih dahulu.');a.sessionHash=sessionHash;await saveAttempt(a);}
 if(b.action==='tokenDashboard')return studentOverview(a.studentId,b.studentMenu);
 if(a.pauseUntil){if(['heartbeat','enter','exitExam'].includes(b.action))return Response.json(publicAttempt(a,exam,student),{headers:{'Cache-Control':'no-store'}});fail('Waktu ujian sedang dijeda pengawas. Tunggu jeda selesai.');}
 if(b.action==='enter'&&a.pausedAt){a.deadline=Date.now()+a.remainingMs;a.submitAfter=Date.now()+(a.remainingSubmitMs||0);delete a.pausedAt;delete a.remainingMs;delete a.remainingSubmitMs;await saveAttempt(a);}
 if(a.pausedAt&&b.action==='exitExam')return Response.json(publicAttempt(a,exam,student),{headers:{'Cache-Control':'no-store'}});
 if(a.pausedAt&&b.action!=='enter')fail('Sesi dijeda oleh pengawas. Masuk ulang untuk melanjutkan.');
 if(b.action==='enter'&&a.status==='Belum mulai'){
 if(exam.status!=='Aktif'||Date.now()<Date.parse(exam.start)||Date.now()>=Date.parse(exam.end))fail('Ujian belum dibuka atau jadwal sudah berakhir.');const snapshot=await freezeExam(exam);if(!snapshot?.questions.length)fail('Paket soal belum siap.');if(env.SHARED_ATTEMPT_QUESTIONS)a.sharedQuestions=true;const resume=snapshot.resumeFor===a.studentId;a.answers=resume?snapshot.resumeAnswers:{};a.flags=resume?snapshot.resumeFlags||[]:[];a.status='Mengerjakan';a.startedAt=Date.now();a.strictExit=!exam.simulation;a.browserGuard=!exam.simulation;a.lastSeenAt=Date.now();a.deadline=Math.min(Date.now()+exam.duration*60000,Date.parse(exam.end));a.submitAfter=Math.min(a.startedAt+exam.duration*60000/4,a.deadline);if(resume){a.questions=snapshot.questions;a.questionOrder=JSON.stringify(a.questions.map((q:Question)=>q.id));await saveAttempt(a,true);}else await startWithUniqueOrder(a,snapshot.questions);
 }
 if(b.action!=='enter'&&a.status==='Belum mulai')fail('Mulai ujian terlebih dahulu.');
 if(a.status==='Mengerjakan'){
 const expired=Date.now()>=a.deadline;
 if(b.action==='securityLock'&&!expired&&a.browserGuard){for(const [key,value] of Object.entries(b.answers||{})){if(a.questions.some((q:any)=>q.id===key)&&typeof value==='string'&&value.length<=20000)a.answers[key]=value;}if((a.resetCount||0)>=MAX_EXAM_UNLOCKS){a.status='Dikumpulkan';a.submittedAt=Date.now();a.exitReason='Pelanggaran keempat. Kesempatan melanjutkan ujian habis';a.grades=mark(a.questions,a.answers);a.actionNotes=[...(a.actionNotes||[]),{name:'Sistem',action:'Jawaban otomatis dikumpulkan',reason:a.exitReason,at:Date.now()}];await saveAttempt(a);return Response.json(publicAttempt(a,exam,student),{headers:{'Cache-Control':'no-store'}});}a.securityLocked=true;a.securityReason=b.reason==='fullscreen'?'Keluar dari layar penuh':'Berpindah tab / halaman tidak terlihat';a.pausedAt=Date.now();a.remainingMs=Math.max(0,a.deadline-Date.now());a.remainingSubmitMs=Math.max(0,(a.submitAfter||0)-Date.now());a.actionNotes=[...(a.actionNotes||[]),{name:'Sistem',action:'Kunci halaman ujian',reason:a.securityReason,at:Date.now()}];await saveAttempt(a);return Response.json(publicAttempt(a,exam,student),{headers:{'Cache-Control':'no-store'}});}
 if((b.action==='answer'||b.action==='saveAnswers')&&!expired){
   const entries=b.action==='answer'?[[b.questionId,b.value]]:Object.entries(b.answers||{});
   const questionIds=new Set(a.questions.map((q:Question)=>q.id));
   if(!entries.length||entries.length>questionIds.size||entries.some(([key,value])=>!questionIds.has(key)||typeof value!=='string'||value.length>20000))fail('Jawaban tidak valid.');
   for(const [key,value] of entries)a.answers[key]=value;
   if(Array.isArray(b.flags))a.flags=b.flags.filter((key:string)=>questionIds.has(key));
   a.lastSavedAt=a.lastSeenAt=Date.now();
   await saveAttempt(a);
   if(b.action==='saveAnswers')return Response.json({compact:true,id:a.id,status:a.status,lastSavedAt:a.lastSavedAt,serverNow:Date.now()},{headers:{'Cache-Control':'no-store'}});
 }
 if(b.action==='heartbeat'&&!expired){
   if(b.compact)return Response.json({compact:true,id:a.id,status:a.status,serverNow:Date.now()},{headers:{'Cache-Control':'no-store'}});
 }
 if(b.action==='submit'&&!expired){const issue=submissionIssue(a);if(issue)fail(issue);}
 if(b.action==='exitExam'&&!expired){for(const [key,value] of Object.entries(b.answers||{})){if(a.questions.some((q:any)=>q.id===key)&&typeof value==='string'&&value.length<=20000)a.answers[key]=value;}a.exitReason='Keluar dari halaman ujian';}
 if(b.action==='submit'||b.action==='exitExam'||expired){a.status='Dikumpulkan';a.timedOut=expired;a.submittedAt=Date.now();a.grades=mark(a.questions,a.answers);await saveAttempt(a)}
 }
 if(b.action==='submit'&&b.compact===true&&a.status==='Dikumpulkan'){
   return Response.json({
     compact:true,id:a.id,status:a.status,published:!!a.published,
     score:a.published?a.score:null,serverNow:Date.now()
   },{headers:{'Cache-Control':'no-store'}});
 }
 return Response.json(publicAttempt(a,exam,student),{headers:{'Cache-Control':'no-store'}});
}

 const authenticated=await authentication;const {user}=authenticated;let staff=authenticated.staff;if(staff?.role==='Guru')staff=await get(staff.id)||staff;if(staff?.role==='Guru'&&!belongsYear(staff))staff={...staff,assignments:[],subject:''};if(staff?.role==='Guru'){const own=(await all('class')).filter((c:any)=>belongsYear(c)&&c.unit===staff.unit);staff={...staff,assignedClassLevels:own.filter((c:any)=>(staff.assignments||[]).some((t:any)=>t.classes?.includes(c.name))).map(({name,grade,unit}:any)=>({name,grade,unit})),homeroomClasses:own.filter((c:any)=>c.unit==='SD'&&c.homeroomId===staff.id)};}
if(b.action==='setup'){
 if(await get('installation'))fail('Sistem sudah diinisialisasi.');
 await db().batch([db().prepare('INSERT INTO records(id,kind,data) VALUES (?,?,?)').bind('installation','config',JSON.stringify({createdAt:Date.now()})),db().prepare('INSERT INTO records(id,kind,data) VALUES (?,?,?)').bind(id(),'staff',JSON.stringify({email:user.email,name:user.displayName,role:'Super Admin',unit:'Semua',permission:'Full akses'}))]);
 const bankId=await put('bank',{title:'Paket Simulasi Matematika',subject:'Matematika',unit:'SD',questions:starterQuestions});await put('exam',{title:'Simulasi Ujian Akhir',subject:'Matematika',unit:'SD',className:'6A',bankId,duration:60,start:new Date().toISOString(),end:new Date(Date.now()+7*86400000).toISOString(),status:'Aktif'});for(const name of ['Ahmad Fauzan','Aisyah Zahra','Muhammad Rayyan','Fatimah Az-Zahra'])await put('student',{name,unit:'SD',className:'6A',nis:'SIM-'+id().slice(0,6),accountId:null});await ensureCatalog();return Response.json({ok:true});
}
if(!staff||staff.disabled)fail('Akun belum diberi akses.');
if(staff.role==='Guru'&&teacherExamActions.includes(b.action)){
 const mode=await currentTeacherExamMode(staff);
 if(mode)return lockedTeacherMenu(mode);
}
if(staff.role==='Siswa'){
 if(b.action!=='studentLaunch')fail('Akses siswa hanya untuk ujian sendiri.');const e=await get(b.examId);if(!e||e._kind!=='exam'||e.deletedAt)fail('Ujian tidak ditemukan.');if(!await isExamParticipant(staff.studentId,e))fail('Anda bukan peserta ujian ini.');
 const resumeRow:any=await db().prepare('SELECT * FROM attempts WHERE student_id=? AND exam_id=?').bind(staff.studentId,e.id).first();const resumed=resumeRow?await readAttempt(resumeRow):null;const canResume=resumed?.status==='Mengerjakan'&&(resumed.pausedAt||resumed.deadline>Date.now());const shared=await get('shared-'+e.id);if(shared){if(await hash(String(b.code||'').trim().toUpperCase())!==await hash(await readSharedToken(e.id,shared)))fail('Token ujian tidak sesuai. Periksa kode yang diberikan pengawas.');if(!canResume&&(e.status!=='Aktif'||Date.now()<Date.parse(e.start)||Date.now()>=Date.parse(e.end)))fail('Jadwal ujian belum dimulai atau sudah berakhir.');}
 else if(e.tokenMode==='shared')fail('Pengawas belum menyiapkan token ujian.');
 if(resumed){await settleAttempt(resumed);if(resumed.status==='Dikumpulkan'&&!resumed.published)fail('Ujian sudah selesai dan jawaban telah dikumpulkan.');}
 let attempt=resumed;
 if(!attempt&&shared){
   // Enrollment can change after the proctor prepares the code.
   const findAttempt=()=>db().prepare('SELECT data,version FROM attempts WHERE student_id=? AND exam_id=?').bind(staff.studentId,e.id).first();
   let row:any;
   try{await issueToken({id:id(),studentId:staff.studentId,examId:e.id,status:'Belum mulai',answers:{},published:false,requiresLogin:true});}
   catch(error){
     row=await findAttempt();
     if(!row)throw error;
   }
   row??=await findAttempt();
   if(row)attempt=await readAttempt(row);
 }
 if(!attempt)fail('Peserta belum disiapkan pengawas.');
 const a=attempt,v=await get('vault-'+a.id);if(!v)fail('Minta pengawas memperbarui token.');if(a.status==='Mengerjakan'&&a.strictExit&&!a.pausedAt)fail('Ujian sedang berjalan pada perangkat yang telah terikat. Hubungi pengawas untuk pindah perangkat.');return Response.json({token:await openToken(v,a.id,await env.TOKEN_VAULT_KEY)},{headers:{'Cache-Control':'no-store'}});
}
if(demo&&(b.action==='setup'||b.action==='saveStaff'&&b.data?.role!=='Guru'))fail('Pengelolaan akun tidak tersedia di ruang demo.');
if(b.action==='deleteYear'){
 if(staff.role!=='Super Admin')fail('Hanya Super Admin mengelola tahun pelajaran.');
 const year=await rawGet(b.id);if(!year||year._kind!=='year'||year.deletedAt)fail('Tahun tidak ditemukan.');
 if(b.confirm!==true)fail('Konfirmasi penghapusan tahun pelajaran diperlukan.');
 const rows=(await db().prepare('SELECT * FROM records').all()).results as any[];
 const entries=rows.map(r=>({...r,value:JSON.parse(r.data)}));
 const examIds=new Set(entries.filter(r=>r.kind==='exam'&&(r.value.year||'2026/2027')===year.name).map(r=>r.id));
 const attempts=(await db().prepare('SELECT * FROM attempts').all()).results as any[];
 if(attempts.some(r=>examIds.has(r.exam_id)&&JSON.parse(r.data).status==='Mengerjakan'))fail('Selesaikan ujian yang sedang dikerjakan sebelum menghapus tahun pelajaran.');
 const writes:any[]=[];
 const drop=(key:string)=>writes.push(db().prepare('DELETE FROM records WHERE id=?').bind(key));
 for(const r of entries){const v=r.value;
  if(r.kind==='bank')continue; // Question bank survives academic-year removal.
  if(['student','staff'].includes(r.kind)&&(r.kind==='student'||v.role==='Guru')&&(v.year||'2026/2027')===year.name){
   const prefix=(r.kind==='student'?'student':'teacher')+'-year:';
   const replacement=entries.find(x=>x.id.startsWith(prefix)&&x.id.endsWith(':'+r.id)&&x.value.year!==year.name&&!x.value.deletedAt)||entries.find(x=>x.kind==='academic_profile'&&x.id.endsWith(':'+r.id)&&x.value.profileYear!==year.name&&!x.value.deletedAt);
   if(replacement){const next={...replacement.value,id:r.id};delete next.profileKind;delete next.profileYear;next.semester2Only=replacement.kind==='academic_profile';writes.push(db().prepare('UPDATE records SET data=?,version=version+1 WHERE id=?').bind(JSON.stringify(next),r.id));}
   else {drop(r.id);const principal=r.kind==='student'?'student-login-'+(demo?'demo-':'')+r.id:r.id;for(const account of entries.filter(x=>x.value.staffId===r.id||x.value.staffId===principal||x.value.studentId===r.id||x.id==='account-vault-'+principal)){if(['credential','session','student_identity','account_vault','generated_account'].includes(account.kind)||account.id==='account-vault-'+principal)drop(account.id);}}
   continue;
  }
  if(r.id===year.id||examIds.has(r.id)||[...examIds].some(eid=>r.id==='shared-'+eid||r.id==='snapshot-'+eid)||v.profileYear===year.name||v.form?.year===year.name||['student_year','teacher_year','class','subject','topic','draft','exam'].includes(r.kind)&&(v.year||'2026/2027')===year.name||r.id==='semester2-ready:'+year.name)drop(r.id);
 }
 for(const eid of examIds)writes.push(db().prepare('DELETE FROM attempts WHERE exam_id=?').bind(eid));
 const remaining=entries.filter(r=>r.kind==='year'&&r.id!==year.id&&!r.value.deletedAt).sort((a,b)=>b.value.name.localeCompare(a.value.name));
 const nextYear=activeYear===year.name?(remaining[0]?.value.name||''):activeYear;
 if(activeYear===year.name)writes.push(db().prepare('INSERT INTO records(id,kind,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=records.version+1').bind('active-year','config',JSON.stringify({name:nextYear})));
 await db().batch(writes);await audit(staff,'Hapus tahun pelajaran',year.name);return Response.json({ok:true,year:nextYear});
}
if(b.action==='archiveQuestion'){
 const source=await rawGet(b.bankId);if(!source||source._kind!=='bank'||!source.deletedAt||!source.retainQuestions)fail('Arsip soal tidak ditemukan.');
 const authorize=(bank:any)=>{if(staff.role==='Guru'){if(bank.unit!==staff.unit||bank.createdBy!==staff.id)fail('Guru hanya dapat mengelola soal buatannya sendiri.');}else can(staff,bank.unit,'bank',bank.subject);};authorize(source);
 if(source.version!==b.version)fail('Data telah berubah. Muat ulang dan coba lagi.');
 const question=source.questions.find((q:any)=>q.id===b.questionId);if(!question)fail('Soal tidak ditemukan.');
 if(!['edit','move','delete'].includes(b.operation))fail('Tindakan tidak valid.');
 let destination:any=null;
 if(b.operation==='edit'){const revised=sanitizeQ(b.question);revised.id=id();revised.sourceId=revised.id;source.questions=source.questions.map((q:any)=>q.id===question.id?revised:q);}
 else {if(b.confirm!==true)fail('Konfirmasi tindakan diperlukan.');source.questions=source.questions.filter((q:any)=>q.id!==question.id);}
 if(b.operation==='move'){
  destination=await rawGet(b.targetId);if(!destination||destination._kind!=='bank'||destination.deletedAt)fail('Paket tujuan tidak ditemukan.');authorize(destination);
  if(destination.unit!==source.unit||destination.subject!==source.subject||source.grade&&destination.grade!==source.grade)fail('Unit, mapel, dan tingkat paket tujuan harus sama.');
  if(destination.version!==b.targetVersion)fail('Paket tujuan telah berubah. Muat ulang dan coba lagi.');
  const moved={...question,id:id(),sourceId:question.sourceId||question.id};destination.questions=[...destination.questions,moved];
 }
 // Guard every version in one transaction. NULL violates the data NOT NULL constraint and rolls back both writes.
 const changes=[source,...(destination?[destination]:[])];const writes=changes.map(bank=>{const {version,_kind,...value}=bank;return db().prepare('UPDATE records SET data=CASE WHEN version=? THEN ? ELSE NULL END,version=version+1 WHERE id=?').bind(version,JSON.stringify(value),bank.id)});
 await db().batch(writes);await audit(staff,'Arsip soal '+b.operation,question.id);return Response.json({ok:true});
}
if(b.action==='saveYear'||b.action==='activateYear'){
 if(staff.role!=='Super Admin')fail('Hanya Super Admin mengelola tahun pelajaran.');
 const name=String(b.data?.name||'').trim();if(!/^\d{4}\/\d{4}$/.test(name)||Number(name.slice(5))!==Number(name.slice(0,4))+1)fail('Gunakan tahun pelajaran berurutan, contoh 2026/2027.');
 const old=b.data.id?await get(b.data.id):(await all('year')).find((y:any)=>y.name===name);
 if(b.action==='activateYear'){if(!old||old._kind!=='year')fail('Tahun tidak ditemukan.');const active=await get('active-year');await put('config',{...active,id:'active-year',name:old.name});return Response.json({ok:true,year:old.name});}
 if(b.data.id&&(!old||old._kind!=='year'))fail('Tahun tidak ditemukan.');
 if(old&&old.name!==name){if((await all('year')).some((y:any)=>y.id!==old.id&&y.name===name))fail('Tahun pelajaran sudah ada.');
 const rows=(await db().prepare('SELECT * FROM records').all()).results as any[];const changes=[];
 for(const row of rows){const value=JSON.parse(row.data);let changed=false;if(value.year===old.name){value.year=name;changed=true;}if(value.profileYear===old.name){value.profileYear=name;changed=true;}if(value.form?.year===old.name){value.form.year=name;changed=true;}if(row.id==='active-year'&&value.name===old.name){value.name=name;changed=true;}if(row.id===old.id){value.name=name;value.semesters=[1,2];changed=true;}if(changed)changes.push(db().prepare('UPDATE records SET data=?,version=version+1 WHERE id=?').bind(JSON.stringify(value),row.id));}
 if(changes.length)await db().batch(changes);for(const row of rows){for(const kind of ['teacher','student']){const prefix=kind+'-year:'+old.name+':';if(row.id.startsWith(prefix))await db().prepare('UPDATE records SET id=? WHERE id=?').bind(kind+'-year:'+name+':'+row.id.slice(prefix.length),row.id).run();}const prefix='semester2:'+old.name+':';if(row.id.startsWith(prefix)||row.id==='semester2-ready:'+old.name){const next=row.id.startsWith(prefix)?'semester2:'+name+':'+row.id.slice(prefix.length):'semester2-ready:'+name;await db().prepare('UPDATE records SET id=? WHERE id=?').bind(next,row.id).run();}}
 }else await put('year',{...old,id:old?.id||'year-'+name,name,semesters:[1,2]});
 await audit(staff,'Simpan tahun pelajaran',name);return Response.json({ok:true,year:name});
}
if(b.action==='bulkStudents'){
 if(!['Super Admin','Admin Unit'].includes(staff.role))fail('Hanya admin mengelola siswa.');if(!Array.isArray(b.ids)||!b.ids.length||b.ids.length>1000||!['move','delete'].includes(b.operation))fail('Pilihan siswa tidak valid.');
 const selected=[];for(const sid of [...new Set(b.ids)]){const p=await get(String(sid));if(!p||p._kind!=='student'||p.deletedAt||!belongsYear(p))fail('Siswa tidak tersedia pada tahun ini.');can(staff,p.unit,'student');if((await db().prepare('SELECT data FROM attempts WHERE student_id=?').bind(p.id).all()).results.some((r:any)=>JSON.parse(r.data).status==='Mengerjakan'))fail('Siswa masih mengerjakan ujian.');selected.push(p);}
 const target=b.operation==='move'?await get(b.classId):null;if(b.operation==='move'&&(!target||target._kind!=='class'||target.deletedAt||!belongsYear(target)||selected.some(p=>p.unit!==target.unit)))fail('Pilih kelas tujuan pada unit dan tahun yang sama.');
 for(const p of selected){await put('student',target?{...p,className:target.name}:{...p,deletedAt:Date.now(),disabled:true});}await audit(staff,b.operation==='move'?'Pindah siswa massal':'Hapus siswa massal',String(selected.length));return Response.json({ok:true,count:selected.length});
}
if(b.action==='deleteMaster'){
 const kind=b.kind;if(!['class','student','staff','subject'].includes(kind))fail('Jenis data tidak valid.');const old=await get(b.id);
 if(!old||old._kind!==kind||old.deletedAt||!belongsYear(old))fail('Data tidak ditemukan pada tahun ini.');
 if(!['Super Admin','Admin Unit'].includes(staff.role)||(staff.role==='Admin Unit'&&old.unit!==staff.unit))fail('Data di luar kewenangan.');
 if(kind==='staff'&&(old.role!=='Guru'||old.id===staff.id))fail('Hanya data guru lain yang dapat dihapus.');
 if(kind==='class'&&((await all('student')).some((x:any)=>x.unit===old.unit&&x.className===old.name&&(x.year||'2026/2027')===old.year)||(await all('exam')).some((x:any)=>x.unit===old.unit&&x.className===old.name&&(x.year||'2026/2027')===old.year)))fail('Kelas masih digunakan siswa atau jadwal. Pindahkan siswa dan selesaikan pengaturan jadwal dahulu.');
 if(kind==='student'&&(await db().prepare('SELECT data FROM attempts WHERE student_id=?').bind(old.id).all()).results.some((r:any)=>JSON.parse(r.data).status==='Mengerjakan'))fail('Siswa sedang mengerjakan ujian. Selesaikan ujian dahulu.');
 await put(kind,{...old,deletedAt:Date.now(),disabled:true});
 if(kind==='student'&&period.semester===1){const principal='student-login-'+(demo?'demo-':'')+old.id;const identity=await env.DB!.prepare('SELECT data FROM records WHERE id=?').bind(principal).first() as any;if(identity)await env.DB!.prepare('UPDATE records SET data=?,version=version+1 WHERE id=?').bind(JSON.stringify({...JSON.parse(identity.data),disabled:true}),principal).run();}
 await audit(staff,'Hapus '+kind,old.id);return Response.json({ok:true});
}
if(b.action==='deleteExam'||b.action==='deleteBank'){
 const kind=b.action==='deleteExam'?'exam':'bank',old=await get(b.id);if(!old||old._kind!==kind||old.deletedAt||!belongsYear(old))fail('Data tidak ditemukan pada tahun ini.');
 if(kind==='exam'){can(staff,old.unit,'exam');if((await db().prepare('SELECT data FROM attempts WHERE exam_id=?').bind(old.id).all()).results.some((r:any)=>JSON.parse(r.data).status==='Mengerjakan'))fail('Ujian sedang dikerjakan. Jadwal belum dapat dihapus.');}
 else{if(staff.role!=='Guru')can(staff,old.unit,'bank',old.subject);else if(!teaches(staff,old)&&!(await all('exam')).some((e:any)=>e.bankId===old.id&&examPermission(staff,e,'bank')))fail('Paket di luar penugasan.');if(staff.role==='Guru'&&old.createdBy!==staff.id)fail('Hanya pembuat dapat menghapus paket.');for(const e of (await all('exam')).filter((e:any)=>e.bankId===old.id)){if(await get('snapshot-'+e.id))continue;await put('exam',{...e,bankId:''});}}
 await put(kind,{...old,deletedAt:Date.now(),...(kind==='bank'?{retainQuestions:!!b.keepQuestions}:{status:'Dibatalkan'})});await audit(staff,'Hapus '+kind,old.id);return Response.json({ok:true});
}
if(b.action==='saveDraft'||b.action==='deleteDraft'){const key=b.id||id(),old=await get(key);if(old&&(old._kind!=='draft'||old.ownerId!==staff.id))fail('Draft bukan milik Anda.');if(b.action==='deleteDraft'){await db().prepare('DELETE FROM records WHERE id=?').bind(key).run();return Response.json({ok:true});}if(!['Guru','Admin Unit','Super Admin'].includes(staff.role))fail('Akses ditolak.');await put('draft',{id:key,...(old?{version:old.version}:{}),ownerId:staff.id,...period,form:b.data,updatedAt:Date.now()});return Response.json({id:key});}
if(b.action==='saveDuties'){const e=await get(b.examId);if(!e||e._kind!=='exam'||e.deletedAt)fail('Jadwal tidak ditemukan.');can(staff,e.unit,'exam');const duties=b.duties||[];for(const d of duties){const t=await get(d.staffId);if(!t||t.role!=='Guru'||t.unit!==e.unit||!['full','grade','proctor'].includes(d.role))fail('Pilih guru dan tugas dari unit yang sama.');}await put('exam',{...e,duties});await audit(staff,'Penugasan jadwal',e.id);return Response.json({ok:true});}
if(b.action==='generateShared'||b.action==='viewShared'){
 const e=await get(b.examId);
 if(!e||e._kind!=='exam'||e.deletedAt)fail('Jadwal tidak ditemukan.');
 requireExam(staff,e,'token');
 if(!tokenScheduleOpen(e,Date.now()))fail('Token tersedia untuk jadwal aktif yang belum berakhir.');
 const existing=await get('shared-'+e.id);
 let token:string;
 if(existing)token=await readSharedToken(e.id,existing);
 else{
   if(b.action==='viewShared')fail('Token belum dibuat.');
   await roster(e,Date.now()>=Date.parse(e.start));
   if(e.tokenMode!=='shared')await put('exam',{...e,tokenMode:'shared'});
   const prepared=await prepareSharedToken(e);
   token=prepared.token;
   if(prepared.created)await audit(staff,'Siapkan token ujian',e.id);
 }
 return Response.json({token,examId:e.id,exam:e.title,className:e.className,expiresAt:Date.parse(e.end),serverNow:Date.now()},{headers:{'Cache-Control':'no-store'}});
}
if(b.action==='publishMany'){const ids=b.ids;if(!Array.isArray(ids)||!ids.length||ids.length>1000)fail('Pilih hasil yang akan dipublikasikan.');const ready=[];for(const key of [...new Set(ids)]){const row:any=await db().prepare('SELECT * FROM attempts WHERE id=?').bind(key).first();if(!row)fail('Hasil tidak ditemukan.');const a=await readAttempt(row);const e=await get(a.examId);requireExam(staff,e,'grade');if(alignGradingKeys(a,await get(e.bankId))||!a.graded||a.status!=='Dikumpulkan')fail('Semua siswa terpilih harus selesai dinilai.');if(!a.published)ready.push({id:a.id,version:a.version});}if(ready.length){const terms=ready.map(()=>'(id=? AND version=?)').join(' OR ');const params=ready.flatMap(a=>[a.id,a.version]);const result=await db().prepare("UPDATE attempts SET data=json_set(data,'$.published',json('true'),'$.publishedAt',?),version=version+1 WHERE ("+terms+") AND (SELECT COUNT(*) FROM attempts WHERE "+terms+")=?").bind(Date.now(),...params,...params,ready.length).run();if(result.meta.changes!==ready.length)fail('Data nilai berubah. Muat ulang sebelum mempublikasikan.');}await audit(staff,'Publikasi nilai terpilih',String(ready.length));return Response.json({ok:true});}
if(b.action==='makeup'||b.action==='retake'){
 const row:any=b.id?await db().prepare('SELECT * FROM attempts WHERE id=?').bind(b.id).first():null;const a=row?{...JSON.parse(row.data),version:row.version}:null,e=await get(a?.examId||b.examId);if(!e||e._kind!=='exam'||e.deletedAt)fail('Jadwal tidak ditemukan.');if(!examPermission(staff,e,'monitor'))fail('Tidak berwenang membuat ujian ulang.');if(String(b.reason||'').trim().length<5)fail('Isi alasan ujian ulang minimal 5 karakter.');const studentId=a?.studentId||b.studentId;if(!(await participants(e)).some((p:any)=>p.id===studentId))fail('Siswa bukan peserta ujian ini.');
 const actual:any=await db().prepare('SELECT * FROM attempts WHERE student_id=? AND exam_id=?').bind(studentId,e.id).first();const prior=actual?await readAttempt(actual):null,retake=b.action==='retake';if(retake){if(b.confirmDelete!==undefined&&typeof b.confirmDelete!=='boolean')fail('Pilihan hapus tidak valid.');if(prior?.status!=='Dikumpulkan')fail('Ujian ulang memerlukan hasil yang telah dikumpulkan.');}else if(prior&&prior.status!=='Belum mulai')fail('Susulan khusus peserta yang belum mengikuti ujian.');
 const start=Date.parse(b.start),end=Date.parse(b.end);if(!(start<end)||end<=Date.now())fail('Isi jadwal susulan yang valid.');if((await all('exam')).some((x:any)=>x.parentExamId===e.id&&x.studentIds?.includes(studentId)&&!x.deletedAt))fail('Jadwal susulan/ulang siswa ini sudah tersedia. Buka jadwal tersebut.');const snapshot=await freezeExam(e),key='followup-'+await hash(e.id+':'+studentId);const next={...e,id:key,version:undefined,title:e.title+(retake?' — Ujian ulang':' — Susulan'),makeup:true,retake,retakeReason:String(b.reason).trim(),retakeBy:staff.name,parentExamId:e.id,studentIds:[studentId],participantsSelected:true,excludedStudentIds:[],start:new Date(start).toISOString(),end:new Date(end).toISOString(),tokenMode:'shared'};
 const guard=actual?db().prepare('INSERT INTO records(id,kind,data) SELECT CASE WHEN EXISTS(SELECT 1 FROM attempts WHERE id=? AND version=?) AND EXISTS(SELECT 1 FROM records WHERE id=? AND version=?) THEN ? ELSE ? END,?,?').bind(actual.id,actual.version,e.id,e.version,key,e.id,'exam',JSON.stringify(next)):db().prepare('INSERT INTO records(id,kind,data) SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM attempts WHERE student_id=? AND exam_id=?) AND EXISTS(SELECT 1 FROM records WHERE id=? AND version=?) THEN ? ELSE ? END,?,?').bind(studentId,e.id,e.id,e.version,key,e.id,'exam',JSON.stringify(next));const writes=[guard,db().prepare('INSERT INTO records(id,kind,data) VALUES(?,?,?)').bind('snapshot-'+key,'snapshot',JSON.stringify({questions:retake&&!b.confirmDelete?prior.questions:snapshot.questions,...(retake&&!b.confirmDelete?{resumeFor:studentId,resumeAnswers:prior.answers||{},resumeFlags:prior.flags||[]}:{}),bankId:e.bankId,at:Date.now()}))];
 // Hide the original schedule for this pupil; deleting a retake affects only this exam attempt.
 const parent={...e,excludedStudentIds:[...new Set([...(e.excludedStudentIds||[]),studentId])]};writes.push(db().prepare('UPDATE records SET data=?,version=version+1 WHERE id=? AND version=?').bind(JSON.stringify(parent),e.id,e.version));
 if(actual&&(!retake||b.confirmDelete===true)){for(const alias of (await all('token_session')).filter((x:any)=>x.attemptId===actual.id))writes.push(db().prepare('DELETE FROM records WHERE id=?').bind(alias.id));writes.push(db().prepare('DELETE FROM records WHERE id=?').bind('vault-'+actual.id));writes.push(db().prepare('DELETE FROM attempts WHERE id=? AND version=?').bind(actual.id,actual.version));}await db().batch(writes);await roster(next);const {token}=await prepareSharedToken(next);await audit(staff,retake?(b.confirmDelete?'Ujian ulang; hasil lama siswa dihapus':'Ujian ulang; melanjutkan jawaban'):'Buat ujian susulan',studentId+' · '+e.id+' · '+b.reason);return Response.json({...(examPermission(staff,e,'token')?{token}:{}),examId:key,exam:next.title,className:next.className,message:'Jadwal dan token sudah disiapkan.'});
}
if(b.action==='importTeachers'){if(!['Super Admin','Admin Unit'].includes(staff.role))fail('Hanya admin mengimpor guru.');if(!Array.isArray(b.rows)||!b.rows.length||b.rows.length>500)fail('Impor 1–500 guru.');const errors:string[]=[],prepared:any[]=[],seen=new Set();for(const [i,r] of b.rows.entries()){const x={niy:String(r.NIY||'').trim(),name:String(r.Nama||'').trim(),email:String(r.Email||'').trim(),unit:String(r.Unit||'').trim(),gender:String(r.JK||'').trim(),subject:String(r.Mapel||'').trim(),role:'Guru',permission:'Full akses',assignments:[] as any[]};try{if(staff.role!=='Super Admin'&&x.unit!==staff.unit)fail('Unit di luar kewenangan.');if(!x.name||!['SD','SMP','SMA'].includes(x.unit)||!['','L','P'].includes(x.gender))fail('Nama, unit atau JK tidak valid.');if(x.email&&!x.email.includes('@'))fail('Email tidak valid.');if(x.subject)x.subject=(await subjectFor(x.unit,x.subject)).name;const names=String(r.Kelas||'').split(';').map(n=>n.trim()).filter(Boolean);for(let n=0;n<names.length;n++){const c=(await all('class')).find((c:any)=>c.unit===x.unit&&c.year===period.year&&c.name.toLowerCase()===names[n].toLowerCase());if(!c)fail('Kelas belum terdaftar.');names[n]=c.name;}x.assignments=x.subject?[{unit:x.unit,subject:x.subject,classes:names}]:[];const key=x.unit+':'+(x.niy||x.email||x.name);if(seen.has(key))fail('Guru ganda dalam file.');seen.add(key);prepared.push(x);}catch(e:any){errors.push('Baris '+(i+2)+': '+e.message);}}if(errors.length)return Response.json({valid:false,errors});if(!b.commit)return Response.json({valid:true,count:prepared.length});for(const data of prepared){const old=(await all('staff')).find((t:any)=>t.unit===data.unit&&((data.niy&&t.niy===data.niy)||(data.email&&t.email===data.email)||(!data.niy&&!data.email&&t.name===data.name)));if(old){data.id=old.id;data.gender=data.gender||old.gender;data.subject=data.subject||(belongsYear(old)?old.subject:'');data.assignments=[...(belongsYear(old)?old.assignments||[]:[]).filter((a:any)=>!data.assignments.some((n:any)=>n.subject===a.subject&&n.unit===a.unit)),...data.assignments.map((n:any)=>{const prev=(belongsYear(old)?old.assignments||[]:[]).find((a:any)=>a.subject===n.subject&&a.unit===n.unit);return {...n,classes:[...new Set([...(prev?.classes||[]),...n.classes])]} })];}const response=await handleChildPost(new Request(req.url,{method:'POST',headers:req.headers,body:JSON.stringify({action:'saveStaff',data,period})}));if(!response.ok){const d:any=await response.json();fail(d.error);}}return Response.json({ok:true,count:prepared.length});}
if(b.action==='saveClass'||b.action==='importClasses'){
 const rows=b.action==='saveClass'?[b.data]:b.rows;if(!Array.isArray(rows)||!rows.length||rows.length>500)fail('Isi 1–500 kelas.');const prepared=[];const seen=new Set();const duplicates:string[]=[];
 for(const r of rows){const x={id:r.id,version:r.version,name:String(r.name||r.Kelas||r['Nama Kelas']||'').trim().toUpperCase(),unit:r.unit||r.Unit,year:r.year||r.Tahun||period.year,grade:String(r.grade||r.Tingkat||''),homeroomId:r.homeroomId||''};can(staff,x.unit,'student');if(!x.name||!/^\d{4}\/\d{4}$/.test(x.year)||!(x.unit==='SD'?['5','6']:['1','2','3']).includes(x.grade))fail('Lengkapi nama kelas, unit dan tingkat (SD: 5/6; SMP/SMA: 1/2/3).');if(x.homeroomId){const t=await get(x.homeroomId);if(!t||t.role!=='Guru'||t.unit!==x.unit)fail('Wali kelas harus guru pada unit yang sama.');}const unique=x.unit+':'+x.year+':'+x.name;if(seen.has(unique)){duplicates.push(x.name);continue;}seen.add(unique);const prior=(await all('class')).find((c:any)=>c.unit===x.unit&&c.name.toLowerCase()===x.name.toLowerCase()&&c.year===x.year);if(prior){duplicates.push(prior.name);x.name=prior.name;}if(!x.id&&prior){x.id=prior.id;x.version=prior.version;if(!x.homeroomId)x.homeroomId=prior.homeroomId||'';}const old=x.id?await get(x.id):null;if(x.id&&(!old||old._kind!=='class'||old.unit!==x.unit))fail('Kelas tidak valid.');if(old&&old.year!==x.year)fail('Tahun kelas tersimpan tidak dapat diubah.');if(old&&x.version!==undefined&&old.version!==x.version)fail('Data telah berubah. Muat ulang.');if((await all('class')).some((c:any)=>c.id!==x.id&&c.unit===x.unit&&c.name.toLowerCase()===x.name.toLowerCase()&&c.year===x.year))fail('Kelas sudah terdaftar: '+x.name);prepared.push(x);}
 if(b.action==='importClasses'&&!b.commit)return Response.json({valid:true,count:prepared.length,duplicates:[...new Set(duplicates)]});
 for(const x of prepared){const old=x.id?await get(x.id):null;if(old&&old.name!==x.name){const linked=(await all('exam')).filter((e:any)=>inPeriod(e)&&e.unit===x.unit&&e.className===old.name);for(const e of linked)if((await db().prepare('SELECT data FROM attempts WHERE exam_id=?').bind(e.id).all()).results.some((a:any)=>JSON.parse(a.data).status==='Mengerjakan'))fail('Kelas sedang mengikuti ujian.');for(const pupil of (await all('student')).filter((p:any)=>p.unit===x.unit&&p.year===x.year&&p.className===old.name))await put('student',{...pupil,className:x.name});for(const e of linked)await put('exam',{...e,className:x.name});for(const t of (await all('staff')).filter((t:any)=>t.role==='Guru'&&belongsYear(t)))if(t.assignments?.some((a:any)=>a.unit===x.unit&&a.classes?.includes(old.name)))await put('staff',{...t,assignments:t.assignments.map((a:any)=>a.unit===x.unit?{...a,classes:a.classes?.map((n:string)=>n===old.name?x.name:n)}:a)});}await db().prepare('INSERT OR IGNORE INTO records(id,kind,data) VALUES(?,?,?)').bind('year-'+x.year,'year',JSON.stringify({name:x.year})).run();await put('class',x);}await audit(staff,'Simpan kelas',String(prepared.length));return Response.json({ok:true});}
if(b.action==='saveTopic'||b.action==='deleteTopic'){const x=b.data||{};const old=x.id?await get(x.id):null;if(x.id&&(!old||old._kind!=='topic'))fail('Topik tidak ditemukan.');can(staff,old?.unit||x.unit,'exam');if(b.action==='deleteTopic'){if((await all('exam')).some((e:any)=>e.unit===old.unit&&e.topic===old.name&&inPeriod(e))||(await all('bank')).some((e:any)=>e.unit===old.unit&&e.topic===old.name&&inPeriod(e)))fail('Topik telah digunakan; tidak dapat dihapus.');await db().prepare('DELETE FROM records WHERE id=?').bind(old.id).run();return Response.json({ok:true});}if(!String(x.name||'').trim())fail('Isi nama topik.');if((await all('topic')).some((t:any)=>t.id!==x.id&&t.unit===x.unit&&inPeriod(t)&&t.name.toLowerCase()===x.name.trim().toLowerCase()))fail('Topik sudah ada.');await put('topic',{...old,...period,name:x.name.trim(),unit:x.unit});if(old&&old.name!==x.name.trim()){for(const kind of ['exam','bank'])for(const row of (await all(kind)).filter((r:any)=>inPeriod(r)&&r.unit===old.unit&&r.topic===old.name))await put(kind,{...row,topic:x.name.trim()});}return Response.json({ok:true});}
if(b.action==='accountCards'){if(!['Super Admin','Admin Unit'].includes(staff.role))fail('Hanya admin dapat mencetak akun.');const kind=b.kind==='teacher'?'staff':'student';const people=(await all(kind)).filter(belongsYear).filter((p:any)=>(kind!=='staff'||p.role==='Guru')&&(staff.role==='Super Admin'||p.unit===staff.unit)&&(!b.unit||p.unit===b.unit)&&(!b.className||p.className===b.className)&&(!b.id||p.id===b.id));const cards=[];for(const person of people){const login=await generatedAccount(person,kind==='student',demo,!!b.reset&&!!b.id);cards.push({assignments:person.assignments||[],kind:kind==='staff'?'teacher':'student',name:person.name,nis:person.nis||'',niy:person.niy||'',contractCode:person.niy?'':person.unit+'.'+(person.contractNo||'001')+'K',teaching:(person.assignments||[]).map((a:any)=>a.subject+' — '+(a.classes?.length?a.classes.join(', '):'Semua kelas')).join('; ')||person.subject||'',unit:person.unit,className:person.className||'',...login});}await audit(staff,'Cetak / unduh akun',kind);return Response.json({cards},{headers:{'Cache-Control':'no-store'}});}
if(b.action==='importStudents'){if(!Array.isArray(b.rows)||!b.rows.length||b.rows.length>1000)fail('Impor 1–1.000 siswa sekaligus.');const errors:string[]=[];const existing=await all('student');const seen=new Set();const rows=b.rows.map((r:any,i:number)=>{const x={name:String(r.Nama||'').trim().toUpperCase(),nis:String(r.NIS||'').trim(),unit:String(r.Unit||staff.unit||'').trim(),className:String(r.Kelas||'').trim(),year:String(r.Tahun||period.year).trim(),gender:String(r.JK||'').toUpperCase()};try{can(staff,x.unit,'student')}catch{errors.push('Baris '+(i+2)+': unit tidak diizinkan.');}if(x.gender&&!['L','P'].includes(x.gender))errors.push('Baris '+(i+2)+': JK harus L atau P.');if(!x.name||!x.nis||!x.className||(!x.gender&&!existing.some((s:any)=>s.unit===x.unit&&s.nis===x.nis&&s.gender)))errors.push('Baris '+(i+2)+': data wajib kosong.');const key=x.unit+':'+x.nis;if(seen.has(key))errors.push('Baris '+(i+2)+': NIS sudah ada / ganda.');seen.add(key);return x;});const newClasses:any[]=[];for(const [i,x] of rows.entries()){const classroom=(await all('class')).find((c:any)=>c.unit===x.unit&&c.year===x.year&&c.name.toLowerCase()===x.className.toLowerCase());if(classroom)x.className=classroom.name;else{const rawGrade=x.className.match(/^\s*(\d+)/)?.[1];const grade=String(x.unit==='SMP'&&Number(rawGrade)>=7?Number(rawGrade)-6:x.unit==='SMA'&&Number(rawGrade)>=10?Number(rawGrade)-9:rawGrade||'');if(!(x.unit==='SD'?['5','6']:['1','2','3']).includes(grade))errors.push('Baris '+(i+2)+': tingkat kelas tidak dapat dibaca. Awali nama kelas dengan tingkat atau buat kelas dahulu.');else{x.className=x.className.toUpperCase();if(!newClasses.some(c=>c.unit===x.unit&&c.name===x.className))newClasses.push({name:x.className,unit:x.unit,year:x.year,grade,homeroomId:''});}}}if(errors.length)return Response.json({errors,valid:false});const duplicates=rows.filter((x:any)=>existing.some((s:any)=>s.unit===x.unit&&s.nis===x.nis)).map((x:any)=>x.name);if(!b.commit)return Response.json({valid:true,count:rows.length,duplicates,newClasses:newClasses.map(c=>c.name)});for(const c of newClasses)await put('class',c);for(const x of rows){const prev=existing.find((s:any)=>s.unit===x.unit&&s.nis===x.nis);if(!prev&&await get('student-'+x.unit+'-'+x.nis))fail('NIS ini pernah dihapus. Hubungi pengelola untuk pemulihan identitas sebelum mengimpor ulang.');await put('student',{...prev,...x,gender:x.gender||prev?.gender||'',...(prev?{id:prev.id,version:prev.version}:{id:'student-'+x.unit+'-'+x.nis,accountId:null})});}await audit(staff,'Impor siswa',String(rows.length));return Response.json({ok:true,count:rows.length});}
if(['releaseSession','extraTime','pauseTime','proctorNote'].includes(b.action)){const row:any=await db().prepare('SELECT * FROM attempts WHERE id=?').bind(b.id).first();if(!row)fail('Peserta tidak ditemukan.');const a=await readAttempt(row),e=await get(a.examId);requireExam(staff,e,'token');if(Date.now()<Date.parse(e.start)||Date.now()>=Date.parse(e.end))fail('Di luar jadwal pengawasan.');await settleAttempt(a);if(String(b.reason||'').trim().length<5)fail('Isi alasan tindakan pengawas.');if(a.status==='Dikumpulkan')fail('Ujian sudah selesai; buat jadwal susulan.');if(b.action==='releaseSession'){if(a.securityLocked)fail('Siswa yang terkunci harus memilih Lanjutkan ujian. Jika kesempatan habis, gunakan Ujian ulang.');delete a.securityLocked;delete a.securityReason;delete a.sessionHash;if(a.status==='Mengerjakan'&&!a.pausedAt){a.pausedAt=Date.now();a.remainingMs=Math.max(0,a.deadline-Date.now());a.remainingSubmitMs=Math.max(0,(a.submitAfter||0)-Date.now());}}else if(b.action==='proctorNote'){/* Catatan tidak mengubah sesi atau waktu. */}else if(b.action==='pauseTime'){const minutes=Number(b.minutes);if(a.status!=='Mengerjakan'||a.pausedAt||!Number.isInteger(minutes)||minutes<1||minutes>120)fail('Jeda 1–120 menit hanya untuk ujian berjalan yang tidak terkunci/dijeda.');a.pausedAt=Date.now();a.pauseUntil=a.pausedAt+minutes*60000;a.remainingMs=Math.max(0,a.deadline-a.pausedAt);a.remainingSubmitMs=Math.max(0,(a.submitAfter||0)-a.pausedAt);}else{const minutes=Number(b.minutes);if(a.status!=='Mengerjakan'||!Number.isInteger(minutes)||minutes<1||minutes>120)fail('Tambahan waktu 1–120 menit untuk ujian berjalan.');a.deadline+=minutes*60000;if(a.pausedAt)a.remainingMs+=minutes*60000;}a.actionNotes=[...(a.actionNotes||[]),{name:staff.name,action:b.action==='releaseSession'?'Lepas sesi / waktu dijeda':b.action==='pauseTime'?'Jeda '+b.minutes+' menit':b.action==='proctorNote'?'Catatan pengawas':'Tambah '+b.minutes+' menit',reason:b.reason,at:Date.now()}];await saveAttempt(a);await audit(staff,b.action+' · '+b.reason,a.id);return Response.json({ok:true});}
if(b.action==='backup'){if(staff.role!=='Super Admin'||demo)fail('Backup hanya untuk Super Admin utama.');const records=(await db().prepare('SELECT * FROM records WHERE kind NOT IN (?,?)').bind('session','login_limit').all()).results;const attempts=(await db().prepare('SELECT * FROM attempts').all()).results;await audit(staff,'Ekspor backup',String(records.length));return Response.json({schema:1,createdAt:new Date().toISOString(),records,attempts:attempts.map(({question_data,data,...row}:any)=>({...row,data:question_data==null?data:JSON.stringify({...JSON.parse(data),questions:JSON.parse(question_data)})}))},{headers:{'Cache-Control':'no-store'}});}
if(b.action==='prepareUpdate'){if(staff.role!=='Super Admin')fail('Hanya Super Admin dapat menyiapkan katalog.');await ensureCatalog();return Response.json({ok:true});}
else if(b.action==='saveSubject'){const name=String(b.data?.name||'').trim(),unit=b.data?.unit;can(staff,unit,'subject');if(!subjectCatalog[unit]||!name||name.length>100)fail('Lengkapi nama mata pelajaran dan unit.');const old=b.data.id?await get(b.data.id):null;if(b.data.id&&(!old||old._kind!=='subject'||old.deletedAt||old.unit!==unit||!belongsYear(old)))fail('Mapel tidak ditemukan pada unit ini.');const duplicate=(await all('subject')).find((m:any)=>m.unit===unit&&m.name.toLowerCase()===name.toLowerCase()&&m.id!==old?.id);if(old&&duplicate)fail('Nama mata pelajaran sudah digunakan.');const prior=old||duplicate;const key=prior?.id||'subject-'+await hash(period.year+':'+unit+':'+name.toLowerCase());const grades=Array.isArray(b.data.grades)?b.data.grades:(prior?.grades||[]);if(!grades.length)fail('Pilih minimal satu tingkat terlebih dahulu.');if(grades.some((g:string)=>!(unit==='SD'?['5','6']:['1','2','3']).includes(g)))fail('Tingkat tidak valid.');if(old&&old.name!==name){const changes=[];for(const kind of ['bank','exam','staff'])for(const row of await all(kind)){if(kind!=='staff'&&!inPeriod(row))continue;let changed=false;if(row.unit===unit&&row.subject===old.name){row.subject=name;changed=true;}for(const task of row.assignments||[])if(task.unit===unit&&task.subject===old.name){task.subject=name;changed=true;}if(changed)await put(kind,row);}}const questionTypes=b.data.questionTypes??(old?.questionTypes)??(unit==='SMA'?smaQuestionTypes:Object.keys(questionTypeLabels));if(!Array.isArray(questionTypes)||!questionTypes.length||questionTypes.some((t:string)=>!questionTypeLabels[t]))fail('Pilih minimal satu jenis soal yang valid.');await put('subject',{year:period.year,questionTypes,id:key,...(prior?{version:prior.version}:{}),name:old?name:prior?.name||name,unit,grades});await audit(staff,'Simpan mata pelajaran',name);}
else if(b.action==='listTokens'){const e=await get(b.examId);if(!e||e._kind!=='exam'||e.deletedAt)fail('Jadwal tidak ditemukan.');can(staff,e.unit,'token');const issued=await tokenList(e);await audit(staff,'Lihat / unduh daftar token',e.title);return Response.json({issued},{headers:{'Cache-Control':'no-store'}});}
else if(b.action==='startSimulation'){const bank=await get(b.bankId);if(!bank||bank._kind!=='bank'||!bank.simulation)fail('Paket simulasi tidak ditemukan.');if(staff.role==='Guru'){if(bank.unit!==staff.unit)fail('Unit di luar kewenangan.');}else can(staff,bank.unit,'token');const sid='demo-student-'+bank.unit;await db().prepare('INSERT OR IGNORE INTO records(id,kind,data) VALUES (?,?,?)').bind(sid,'student',JSON.stringify({id:sid,name:'Siswa Simulasi '+bank.unit,nis:'DEMO-'+bank.unit,unit:bank.unit,className:'SIMULASI',simulation:true,accountId:null})).run();const examId=await put('exam',{...period,title:bank.title+' · '+new Date().toLocaleString('id-ID',{timeZone:'Asia/Jakarta'}),subject:bank.subject,subjectId:bank.subjectId,unit:bank.unit,className:'SIMULASI',bankId:bank.id,grade:bank.grade||'',duration:bank.duration||30,start:new Date().toISOString(),end:new Date(Date.now()+(bank.duration||30)*60000).toISOString(),status:'Aktif',simulation:true});await freezeExam(await get(examId));const a={id:id(),studentId:sid,examId,status:'Belum mulai',answers:{},published:false,simulation:true};const token=await issueToken(a);await audit(staff,'Mulai simulasi',bank.title);return Response.json({token,examId},{headers:{'Cache-Control':'no-store'}});}
else if(b.action==='saveStudent'){const input=b.data;const s={id:input.id,version:input.version,name:String(input.name||'').trim().toUpperCase(),nis:String(input.nis||''),className:String(input.className||''),unit:input.unit,accountId:null,year:String(input.year||period.year),gender:String(input.gender||'')};can(staff,s.unit,'student');if(s.gender&&!['L','P'].includes(s.gender))fail('Jenis kelamin harus L atau P.');await validateClass(s.unit,s.className,s.year);s.className=(await all('class')).find((c:any)=>c.unit===s.unit&&c.year===s.year&&c.name.toLowerCase()===s.className.toLowerCase()).name;if(!s.name?.trim()||!s.nis?.trim()||!s.className?.trim())fail('Lengkapi nama, NIS, dan kelas.');if(s.id){const old=await get(s.id);if(!old||old._kind!=='student')fail('Siswa tidak ditemukan.');can(staff,old.unit,'student');s.accountId=old.accountId||null}const duplicate=(await all('student')).find((x:any)=>x.unit===s.unit&&x.nis===s.nis&&x.id!==s.id);if(duplicate){if(s.id)fail('NIS sudah dipakai di unit ini.');s.id=duplicate.id;s.version=duplicate.version;s.accountId=duplicate.accountId;s.gender=s.gender||duplicate.gender||'';}const key=await put('student',s);await generatedAccount({...s,id:key},true,demo);await audit(staff,'Simpan siswa',key);}
else if(b.action==='saveBank'){const input=b.data;const s={...period,id:input.id,version:input.version,duration:Number(input.duration||30),title:String(input.title||''),subject:String(input.subject||''),subjectId:'',simulation:false,unit:input.unit,questions:input.questions,additionalQuestionTypes:input.additionalQuestionTypes||[],topic:String(input.topic||''),grade:String(input.grade||''),examIds:Array.isArray(input.examIds)?input.examIds:[],createdBy:staff.id,createdByName:staff.name};if(staff.role==='Guru'){if(staff.unit!==s.unit)fail('Unit di luar kewenangan.');if(!s.examIds.length&&!teaches(staff,s)&&!homeroomCanWrite(staff,s))fail('Mapel di luar penugasan.');}else can(staff,s.unit,'bank',s.subject);if(s.id){const old=await get(s.id);if(!old||old._kind!=='bank'||old.deletedAt)fail('Paket tidak ditemukan');if(staff.role!=='Guru')can(staff,old.unit,'bank',old.subject);s.simulation=!!old.simulation;s.createdBy=old.createdBy||staff.id;s.createdByName=old.createdByName||staff.name;if(staff.role==='Guru'&&old.createdBy!==staff.id)fail('Guru hanya dapat mengubah soal buatannya sendiri.');}if(!Number.isFinite(s.duration)||s.duration<1||s.duration>480)fail('Durasi 1–480 menit.');if(!s.title?.trim()||!s.subject?.trim()||!s.questions?.length)fail('Lengkapi paket dan soal.');{const sub=await subjectFor(s.unit,s.subject);s.subjectId=sub.id;s.subject=sub.name;if(!Array.isArray(s.additionalQuestionTypes)||s.additionalQuestionTypes.some((t:any)=>typeof t!=='string'||!questionTypeLabels[t]))fail('Jenis soal tambahan tidak valid.');const previous=s.id?await get(s.id):null;const retained=previous?.subject===s.subject&&previous?.unit===s.unit?(previous.questions||[]).map((q:any)=>q.format||q.type):[];const allowed=[...(sub.questionTypes||Object.keys(questionTypeLabels)),...s.additionalQuestionTypes,...retained];const errors:string[]=[];
s.questions.forEach((q:any,index:number)=>{
 try{
  if(!allowed.includes(q.format||q.type))fail('Jenis soal tidak diizinkan pada mata pelajaran dan unit ini.');
  if(['PG','PG_KOMPLEKS'].includes(q.type)&&q.format!=='BENAR_SALAH'&&q.options?.length>(s.unit==='SMA'||q.type==='PG_KOMPLEKS'?6:4))fail('PG SD/SMP maksimal A–D; PG kompleks dan SMA maksimal A–F.');
  s.questions[index]=sanitizeQ(q);
 }catch(error:any){errors.push('Soal '+(index+1)+': '+error.message);}
});
if(errors.length)fail(errors.join('\n'));}const priorQuestions=s.id?(await get(s.id))?.questions||[]:[];const priorById=new Map<string,Question>(priorQuestions.map((q:Question)=>[q.id,q]));
const sourceIds=new Set(s.questions.filter((q:Question)=>q.sourceId&&!priorById.has(q.id)).map((q:Question)=>q.sourceId));
const sourceById=new Map<string,Question>();
if(sourceIds.size){
 const availableExams=staff.role==='Guru'?await all('exam'):[];
 for(const bank of (await all('bank')).filter(b=>canPreviewBank(staff,b,availableExams)))for(const q of bank.questions||[]){
  if(sourceIds.has(q.id)&&!sourceById.has(q.id))sourceById.set(q.id,q);
 }
}
for(const q of s.questions){const original=priorById.get(q.id)||sourceById.get(q.sourceId);if(original){const content=(x:any)=>JSON.stringify([x.type,x.text,x.options,x.key,x.left||[],x.right||[],x.images||[],x.keywords||'',!!x.caseSensitive,x.format||'']);if(content(original)!==content(q)&&!(priorQuestions.some((prior:any)=>prior.id===q.id)&&content({...original,key:q.key,keywords:q.keywords,caseSensitive:q.caseSensitive})===content(q))){q.id=id();q.sourceId=q.id;}}}if(new Set(s.questions.map((q:Question)=>q.id)).size!==s.questions.length)fail('Kode soal harus unik dalam paket.');const assigned=[];for(const eid of s.examIds){const e=await get(eid);if(!e||e._kind!=='exam'||e.unit!==s.unit||e.subject!==s.subject||!examPermission(staff,e,'bank'))fail('Jadwal di luar penugasan / mapel.');if(staff.role==='Guru'&&e.bankId&&e.bankId!==s.id&&!teacherDuty(staff,e,'bank'))fail('Jadwal ini sudah memiliki paket soal.');if(s.grade&&e.grade&&e.grade!==s.grade)fail('Tingkat soal harus sesuai jadwal.');if(e.topic&&e.topic!==s.topic)fail('Topik soal harus sesuai jadwal.');if((await db().prepare('SELECT id FROM attempts WHERE exam_id=? LIMIT 1').bind(e.id).first())||await get('snapshot-'+e.id)){if(e.bankId!==s.id)fail('Soal jadwal sudah dikunci setelah token dibuat.');if(input.excludedByExam&&e.id in input.excludedByExam&&JSON.stringify([...input.excludedByExam[e.id]].sort())!==JSON.stringify([...(e.excludedStudentIds||[])].sort()))fail('Peserta dikunci setelah token dibuat.');continue;}if(input.excludedByExam&&Object.prototype.hasOwnProperty.call(input.excludedByExam,e.id)){const ids=input.excludedByExam[e.id];const pupils=(await studentsFor(e)).filter((x:any)=>x.unit===e.unit&&x.className===e.className&&(x.year||'2026/2027')===(e.year||'2026/2027'));if(!Array.isArray(ids)||ids.some((id:string)=>!pupils.some((p:any)=>p.id===id)))fail('Pilihan peserta tidak valid.');e.excludedStudentIds=ids;}assigned.push(e);}const key=await put('bank',s);for(const e of assigned)await put('exam',{...e,bankId:key});await audit(staff,'Simpan paket soal',key);}
else if(b.action==='saveExam'){
 const input=b.data;can(staff,input.unit,'exam');const names=Array.isArray(input.classes)&&input.classes.length?[...new Set(input.classes)]:[input.className];if(input.id&&names.length!==1)fail('Edit satu jadwal per kelas.');const prepared=[];
 for(const className of names){const s={...period,id:input.id,version:input.version,title:String(input.title||''),topic:String(input.topic||''),grade:String(input.grade||''),unit:input.unit,className:String(className||''),bankId:input.bankId||'',duties:input.duties||[],makeup:!!input.makeup,studentIds:Array.isArray(input.studentIds)?input.studentIds:[],participantsSelected:!!input.participantsSelected,excludedStudentIds:(input.excludedByClass?.[String(className)]||input.excludedStudentIds||[]),duration:Number(input.duration),start:input.start,end:input.end,status:'Aktif',subject:String(input.subject||''),subjectId:'',year:String(input.year||period.year),instructions:String(input.instructions||'')};await validateClass(s.unit,s.className,s.year);const pupils=(await all('student')).filter((p:any)=>p.unit===s.unit&&p.className===s.className&&(p.year||'2026/2027')===s.year);if(!Array.isArray(s.excludedStudentIds)||s.excludedStudentIds.some((id:string)=>!pupils.some((p:any)=>p.id===id))||s.studentIds.some((id:string)=>!pupils.some((p:any)=>p.id===id)))fail('Peserta harus berasal dari kelas yang dipilih.');const classroom=(await all('class')).find((c:any)=>c.unit===s.unit&&c.name===s.className&&c.year===s.year);if(s.grade&&classroom.grade&&s.grade!==classroom.grade)fail('Kelas tidak sesuai tingkat.');if(s.id){const old=await get(s.id);if(!old||old._kind!=='exam')fail('Jadwal tidak ditemukan.');can(staff,old.unit,'exam');if(old.unit!==s.unit||old.className!==s.className)fail('Kelas jadwal yang diedit harus tetap sama. Buat jadwal baru untuk kelas lain.');if(await db().prepare('SELECT id FROM attempts WHERE exam_id=? LIMIT 1').bind(s.id).first())fail('Jadwal bertoken dikunci.');}if(s.bankId){const bank=await get(s.bankId);if(!bank||bank._kind!=='bank'||bank.deletedAt||bank.unit!==s.unit)fail('Paket tidak valid.');if(s.subject&&s.subject.toLowerCase()!==bank.subject.toLowerCase())s.bankId='';else s.subject=bank.subject;}{const sub=await subjectFor(s.unit,s.subject);s.subjectId=sub.id;s.subject=sub.name;}if(!s.title.trim()||!(s.duration>0&&s.duration<=480)||!(Date.parse(s.start)<Date.parse(s.end)))fail('Lengkapi jadwal dan durasi.');if(s.topic&&!(await all('topic')).some((t:any)=>t.unit===s.unit&&t.name===s.topic&&inPeriod(t)))fail('Pilih topik dari master.');if((await all('exam')).some((e:any)=>!e.simulation&&inPeriod(e)&&e.id!==s.id&&e.unit===s.unit&&e.className===s.className&&e.subject===s.subject&&Date.parse(e.start)<Date.parse(s.end)&&Date.parse(e.end)>Date.parse(s.start)))fail('Jadwal mata pelajaran '+s.subject+' bertabrakan pada kelas '+s.className);prepared.push(s);}
 for(const s of prepared)await put('exam',s);await audit(staff,'Simpan jadwal',input.title);
}
else if(b.action==='generate'){const e=await get(b.examId);if(!e||e._kind!=='exam'||e.deletedAt)fail('Jadwal tidak ditemukan');can(staff,e.unit,'token');await freezeExam(e);const students=await participants(e);const issued=[];for(const s of students){if(await db().prepare('SELECT id FROM attempts WHERE student_id=? AND exam_id=?').bind(s.id,e.id).first())continue;const a={id:id(),studentId:s.id,examId:e.id,status:'Belum mulai',answers:{},published:false};const token=await issueToken(a);issued.push({name:s.name,nis:s.nis,className:s.className,token,exam:e.title})}await audit(staff,'Generate token',e.title);return Response.json({issued});}
else if(b.action==='reissue'){
const row:any=await db().prepare('SELECT * FROM attempts WHERE id=?').bind(b.id).first();if(!row)fail('Peserta tidak ditemukan.');const a={...JSON.parse(row.data),version:row.version};const e=await get(a.examId);can(staff,e.unit,'token');if(a.status==='Dikumpulkan')fail('Ujian sudah dikumpulkan.');const st=await get(a.studentId);if(a.status==='Mengerjakan'&&a.sessionHash)await put('token_session',{id:'token-session-'+row.token_hash,attemptId:a.id,sessionHash:a.sessionHash});const token=await issueToken(a,true);await audit(staff,'Ganti token; jawaban dan waktu tetap',a.id);return Response.json({issued:[{name:st.name,nis:st.nis,className:st.className,token,exam:e.title}]});
}
else if(b.action==='grade'||b.action==='publish'||b.action==='reopenGrade'){
const row:any=await db().prepare('SELECT * FROM attempts WHERE id=?').bind(b.id).first();if(!row)fail('Hasil tidak ditemukan');const a=await readAttempt(row);const e=await get(a.examId);requireExam(staff,e,'grade');;if(a.status!=='Dikumpulkan')fail('Ujian belum dikumpulkan.');if(b.action==='reopenGrade'){if(!a.published)fail('Nilai belum terbit.');a.published=false;a.graded=false;delete a.publishedAt;await saveAttempt(a);await audit(staff,'Buka koreksi ulang',a.id);return Response.json({ok:true});}if(a.published)fail('Nilai sudah dipublikasikan dan dikunci.');alignGradingKeys(a,await get(e.bankId));if(b.action==='grade'){const automatic=mark(a.questions,a.answers);for(const q of a.questions){if(!editableGrade(q))continue;const g=b.grades[q.id];if(g==null||g===''||!Number.isFinite(Number(g))||Number(g)<0||Number(g)>q.points)fail('Isi nilai seluruh soal dalam batas poin.');}a.grades=Object.fromEntries(a.questions.map((q:Question)=>[q.id,editableGrade(q)?Number(b.grades[q.id]):automatic[q.id]]));a.feedback=String(b.feedback||'');a.correctedBy=staff.email;a.correctedAt=Date.now();a.score=Math.round(Object.values(a.grades).reduce((s:number,n:any)=>s+Number(n),0)/(a.questions.reduce((s:number,q:any)=>s+q.points,0))*10000)/100;a.graded=true;}else{if(!a.graded)fail('Selesaikan koreksi dahulu.');a.published=true;a.publishedAt=Date.now()}await saveAttempt(a);await audit(staff,b.action==='grade'?'Koreksi nilai':'Publikasi nilai',a.id);
}
else if(b.action==='saveStaff'){const input=b.data;if(staff.role!=='Super Admin'&&!(staff.role==='Admin Unit'&&input.role==='Guru'&&input.unit===staff.unit))fail('Akses pengelola tidak diizinkan.');const s={year:period.year,niy:String(input.niy||''),name:String(input.name||''),email:String(input.email||'').trim(),role:input.role,unit:input.unit,subject:String(input.subject||''),subjectId:'',gender:String(input.gender||''),permission:input.role==='Guru'?'Full akses':input.permission,assignments:Array.isArray(input.assignments)?input.assignments:[]};if(!s.name.trim())fail('Isi nama pengelola.');if(!s.email&&s.role==='Guru')s.email=(s.niy||id())+'@teacher.local';if(!s.email?.includes('@')||!['Super Admin','Admin Unit','Guru'].includes(s.role))fail('Email atau peran tidak valid.');if(!['Full akses','Upload dan koreksi','Koreksi saja'].includes(s.permission))fail('Hak akses tidak valid.');for(const task of s.assignments){if(s.role==='Guru'&&task.unit!==s.unit)fail('Unit penugasan harus sama dengan unit utama guru.');task.subject=(await subjectFor(task.unit,task.subject)).name;if(!Array.isArray(task.classes))fail('Penugasan kelas tidak valid.');if(task.classes.includes('__NONE__'))fail('Pilih minimal satu kelas atau centang Semua kelas.');if(staff.role==='Admin Unit'&&task.unit!==staff.unit)fail('Penugasan di luar unit.');const classes=await all('class');if(task.classes.some((n:string)=>!classes.some((c:any)=>c.unit===task.unit&&c.year===period.year&&c.name===n)))fail('Pilih kelas dari master.');}if(s.role==='Guru'){s.subject=s.assignments[0]?.subject||s.subject;if(s.subject){const sub=await subjectFor(s.unit,s.subject);s.subjectId=sub.id;s.subject=sub.name;}}const people=await all('staff');const existing=input.id?people.find((x:any)=>x.id===input.id):people.find((x:any)=>(s.niy&&x.niy===s.niy&&x.unit===s.unit)||x.email.toLowerCase()===s.email.toLowerCase()||(!s.niy&&!input.email&&x.unit===s.unit&&x.name===s.name));if(existing&&!input.email)s.email=existing.email;if(existing&&!s.niy)s.niy=existing.niy||'';if(input.id&&!existing)fail('Guru tidak ditemukan.');if(s.niy&&people.some((p:any)=>p.id!==existing?.id&&String(p.niy||'').toLowerCase()===s.niy.toLowerCase()))fail('NIY sudah digunakan.');if(people.some((x:any)=>x.id!==existing?.id&&x.email.toLowerCase()===s.email.toLowerCase()))fail('Email sudah digunakan.');if(existing&&staff.role==='Admin Unit'&&(existing.role!=='Guru'||existing.unit!==staff.unit))fail('Akun di luar unit.');if(existing?.email.toLowerCase()===user.email.toLowerCase())fail('Akun sendiri tidak dapat diubah di sini.');const staffKey=await put('staff',{...existing,...s,contractNo:existing?.contractNo||String(people.filter((p:any)=>p.role==='Guru'&&p.unit===s.unit).length+1).padStart(3,'0'),disabled:existing?.disabled||false,demo:demo||existing?.demo||false,...(existing?{id:existing.id,version:existing.version}:{})});if(s.role==='Guru'){if(demo){const person=await get(staffKey);await env.DB!.prepare('INSERT INTO records(id,kind,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=records.version+1').bind(staffKey,'staff',JSON.stringify({...person,demo:true})).run();}await generatedAccount(await get(staffKey),false,demo);}await audit(staff,'Atur akses pengelola',s.email);}
else fail('Tindakan tidak dikenal');return Response.json({ok:true});
}catch(e:any){return Response.json({error:e.message||'Terjadi kesalahan'},{status:400})}}

if(demo&&!await get("catalog-v2"))await ensureCatalog();
return {GET,POST};
}
async function entryTeacherNavigation(staff:any,req:Request){
 const query=new URL(req.url).searchParams;
 const recordsTable=staff.demo?'demo_records':'records';
 const yearRow=query.get('year')?null:await env.DB.prepare('SELECT data FROM '+recordsTable+' WHERE id=?').bind('active-year').first();
 const year=query.get('year')||(yearRow?JSON.parse(String(yearRow.data)).name:'2026/2027');
 const semester=query.get('semester')==='2'?2:1;
 const {results}=await env.DB.prepare("SELECT json_remove(data,'$.instructions','$.studentIds','$.excludedStudentIds') AS data FROM "+recordsTable+" WHERE kind=? AND json_extract(data,'$.unit')=?").bind('exam',staff.unit).all();
 const exams=results.map(row=>JSON.parse(row.data)).filter(e=>!e.deletedAt&&(e.year||'2026/2027')===year&&Number(e.semester||1)===semester);
 return teacherNavigation(staff,exams);
}
async function readEntry(req:Request){
 const headers={'Cache-Control':'no-store'};
 let account:Awaited<ReturnType<typeof actor>>;
 try{account=await actor(req);}
 catch(error:any){return Response.json({error:error.message},{status:401,headers});}
 const staff=account.staff;
 if(staff?.disabled||staff?.deletedAt)return Response.json({error:'Akun tidak aktif.'},{status:401,headers});
 if(!staff){
   const installed=await env.DB.prepare('SELECT id FROM records WHERE id=?').bind('installation').first();
   return Response.json({needsSetup:!installed,user:account.user},{headers});
 }
 const [teacherExamMode,navigation]=await Promise.all([
   currentTeacherExamMode(staff),
   staff.role==='Guru'?entryTeacherNavigation(staff,req):undefined,
 ]);
 return Response.json({entry:{name:staff.name,role:staff.role,authMethod:account.authMethod,navigation,...(teacherExamMode?{teacherExamMode}:{})}},{headers});
}
export async function GET(req:Request){try{if(new URL(req.url).searchParams.get('entry')==='1')return await readEntry(req);return await (await handlers(req)).GET(req)}catch{return Response.json({error:"Tidak dapat memuat data."},{status:400})}}
export async function POST(req:Request){try{return await (await handlers(req)).POST(req)}catch{return Response.json({error:"Permintaan tidak valid."},{status:400})}}

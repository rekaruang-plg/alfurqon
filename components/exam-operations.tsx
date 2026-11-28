'use client';
import React,{useState,useEffect,useRef} from 'react';
import AppDialog from './app-dialog';
import DateTimeField from './date-time-field';
import ExamTokenList from './exam-token-list';
import {gradingStatus,monitoringScheduleStatus} from '../lib/exam-status';
const stamp=(v:any)=>v?new Date(v).toLocaleString('id-ID',{timeZone:'Asia/Jakarta',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
export const examStatus=(e:any)=>e.makeup?'Susulan':Date.now()<Date.parse(e.start)?'Belum Mulai':Date.now()>=Date.parse(e.end)?'Selesai':'Sedang Berlangsung';
const pointFormat=new Intl.NumberFormat('id-ID',{maximumFractionDigits:2});
export default function ExamOperations({tab,data,run,edit,initialId,navigate}:{tab:string;data:any;run:any;edit:any;initialId?:string;navigate:(id:string)=>void}){
const [selected,S]=useState(initialId||''),[topic,T]=useState(''),[subject,M]=useState(''),[unit,U]=useState(''),[checks,C]=useState<string[]>([]),[shown,V]=useState<any>(null),[busy,B]=useState(false),[makeup,K]=useState<any>(null);
const [sort,setSort]=useState({key:'',direction:1});
function sorted(items:any[],value:(item:any,key:string)=>any){return [...items].sort((a,b)=>String(value(a,sort.key)??'').localeCompare(String(value(b,sort.key)??''),'id',{numeric:true})*sort.direction)}
function header(label:string){return <th aria-sort={sort.key===label?(sort.direction===1?'ascending':'descending'):'none'}><button className="sort-header" onClick={()=>setSort({key:label,direction:sort.key===label?-sort.direction:1})}>{label} {sort.key===label?(sort.direction===1?'↑':'↓'):'↕'}</button></th>}
const [publishConfirm,setPublishConfirm]=useState(false);
const [exporting,setExporting]=useState(false),[exportError,setExportError]=useState('');
useEffect(()=>{S(initialId||'');C([]);V(null);K(null)},[tab,initialId]);
const [clock,setClock]=useState(Date.now());
useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(timer)},[]);
const grading=tab==='Koreksi & nilai',tokenPage=tab==='Token ujian',monitorPage=tab==='Monitoring',teacher=data.staff.role==='Guru';
const tokenState=(e:any)=>{if(monitorPage)return monitoringScheduleStatus(e,clock)||'Belum mulai';if(grading&&data.menu)return 'Selesai';const ps=data.students.filter((s:any)=>s.unit===e.unit&&s.className===e.className&&!(e.excludedStudentIds||[]).includes(s.id)&&(!(e.participantsSelected||e.studentIds?.length)||e.studentIds.includes(s.id)));if(clock>=Date.parse(e.end))return 'Selesai';if(ps.length&&ps.every((s:any)=>data.attempts.some((a:any)=>a.examId===e.id&&a.studentId===s.id&&a.status==='Dikumpulkan')))return 'Selesai';if(grading)return data.attempts.some((a:any)=>a.examId===e.id&&a.status!=='Belum mulai')?'Aktif':'Belum mulai';return e.tokenExpiresAt?'Aktif':'Belum mulai'};
const exams=data.exams.filter((e:any)=>(!unit||e.unit===unit)&&(!topic||e.topic===topic)&&(!subject||e.subject===subject)&&(grading||e.canMonitor)&&(!grading||e.canGrade));
const exam=exams.find((e:any)=>e.id===selected);
type Progress={examId:string;attempts:any[];students?:any[];tokenExpiresAt?:number};
const [live,setLive]=useState<Progress|null>(null);
const [monitorError,setMonitorError]=useState('');
const [gradeReload,setGradeReload]=useState(0);
const [refreshingProgress,setRefreshingProgress]=useState(false);
const refreshProgress=useRef<(()=>void)|null>(null);
const monitoring=tab==='Monitoring'&&!!exam;
const scopedGrading=grading&&!!data.menu&&!!exam;
const examId=exam?.id;
const year=data.period?.year;
const semester=data.period?.semester;
useEffect(()=>{
 setLive(null);
 setMonitorError('');
 setRefreshingProgress(false);
 if(!(monitoring||scopedGrading)||!examId)return;
 let cancelled=false;
 let rosterLoaded=false;
 let inFlight=false;
 let timer:ReturnType<typeof setTimeout>;
 const controller=new AbortController();
 const query=new URLSearchParams({year:String(year),semester:String(semester)});
 if(scopedGrading){query.set('detail','gradeExam');query.set('id',examId);query.set('menuVersion','3');}
 else query.set('monitorExam',examId);
 const canPoll=()=>monitoring&&monitoringScheduleStatus(exam,Date.now())==='Berlangsung';
 const poll=()=>{
   if(canPoll())void refresh();
 };
 async function refresh(manual=false){
   if(cancelled||inFlight)return;
   clearTimeout(timer);
   inFlight=true;
   try{
     if(monitoring&&!manual&&document.visibilityState==='hidden')return;
     if(monitoring)setRefreshingProgress(true);
     if(monitoring&&!rosterLoaded)query.set('withParticipants','1');
     else query.delete('withParticipants');
     const response=await fetch('/api/cbt?'+query,{cache:'no-store',signal:controller.signal});
     if(scopedGrading&&response.status===409){
       const result=await response.json() as {error?:string};
       throw Error(result.error||'Ujian masih berlangsung.');
     }
     if(!response.ok)throw Error(response.status===401?'Sesi berakhir. Masuk kembali untuk memantau.':scopedGrading?'Detail nilai belum bisa dimuat.':'Progres belum bisa diperbarui.');
     const next=await response.json() as Progress;
     if(!cancelled&&next.examId===examId&&Array.isArray(next.attempts)){
       rosterLoaded=true;
       setLive(previous=>previous?.examId===next.examId?{...previous,...next}:next);
       setMonitorError('');
     }
   }catch(error:any){
     if(!cancelled)setMonitorError(error.message||'Progres belum bisa diperbarui.');
   }finally{
     inFlight=false;
     if(!cancelled){
       if(monitoring)setRefreshingProgress(false);
       if(canPoll())timer=setTimeout(poll,15000+Math.floor(Math.random()*3000));
     }
   }
 }
 if(monitoring)refreshProgress.current=()=>{void refresh(true);};
 void refresh(true);
 return ()=>{cancelled=true;refreshProgress.current=null;controller.abort();clearTimeout(timer);};
},[monitoring,scopedGrading,exam,examId,year,semester,data,gradeReload]);
const rows=(monitoring||scopedGrading)&&live?.examId===selected?live.attempts:data.attempts.filter((a:any)=>a.examId===selected);

const loadedRoster=live?.examId===selected?live.students:undefined;
const pupils=loadedRoster??(exam?data.students.filter((s:any)=>!(exam.excludedStudentIds||[]).includes(s.id)).filter((s:any)=>(exam.participantsSelected||exam.studentIds?.length)?exam.studentIds.includes(s.id):s.unit===exam.unit&&s.className===exam.className&&(s.year||'2026/2027')===(exam.year||'2026/2027')):[]);
const waitingForProgress=(monitoring&&data.operations||scopedGrading)&&live?.examId!==selected;
const attemptsByStudent=new Map(rows.map((a:any)=>[a.studentId,a]));
const roster=grading&&exam&&!loadedRoster?data.students.filter((s:any)=>attemptsByStudent.has(s.id)||pupils.includes(s)):pupils;
const records=(waitingForProgress?[]:roster).map((s:any)=>({student:s,a:attemptsByStudent.get(s.id)||{studentId:s.id,status:'Belum mulai'}}));
const gradeStatus=gradingStatus;
const workStatus=(a:any)=>a.status==='Dikumpulkan'?(a.timedOut?'Selesai – habis waktu':'Selesai'):a.securityLocked?'Terkunci · Perlu lanjutkan ujian':a.pausedAt?'Dijeda / pindah perangkat':a.status==='Mengerjakan'?'Sedang dikerjakan':'Belum mulai';
const notes=(a:any)=><>{!grading&&<p>Kesempatan lanjut terpakai: {a.resetCount||0} / 3</p>}{(a.actionNotes||[]).map((n:any,i:number)=><p key={i}><strong>{n.name}</strong> · {n.action}<small>{n.reason} · {stamp(n.at)}</small></p>)}</>;
async function act(action:string,payload:any){B(true);try{return await run(action,payload)}finally{B(false)}}
const selectedTokenExpiry=live?.examId===selected?live.tokenExpiresAt??exam?.tokenExpiresAt:exam?.tokenExpiresAt;
async function token(e:any){
 const r=await act(selectedTokenExpiry>clock?'viewShared':'generateShared',{examId:e.id});
 if(r)V(r);
}
async function exportValues(){
 setExporting(true);
 setExportError('');
 try{
   const Excel=await import('exceljs');
   const workbook=new Excel.Workbook();
   const sheet=workbook.addWorksheet('Nilai siswa',{views:[{state:'frozen',ySplit:1}]});
   sheet.columns=[
     {header:'Nama siswa',width:32},{header:'NIS',width:16},{header:'Unit',width:10},{header:'Kelas',width:18},
     {header:'Ujian',width:32},{header:'Topik',width:26},{header:'Mapel',width:25},{header:'Poin diperoleh',width:17},
     {header:'Poin maksimum',width:17},{header:'Nilai akhir (0–100)',width:21},{header:'Status poin',width:21},{header:'Status penilaian',width:23},
   ];
   sheet.getRow(1).font={bold:true};
   sheet.autoFilter='A1:L1';
   for(const {student:s,a} of records){
     sheet.addRow([s.name,String(s.nis??''),exam.unit,exam.className,exam.title,exam.topic,exam.subject,
       a.points?.earned??null,a.points?.maximum??null,a.graded||a.published?a.score??null:null,
       a.points?(a.points.provisional?'Sementara':'Lengkap'):null,gradeStatus(a)]);
   }
   const file=await workbook.xlsx.writeBuffer();
   const url=URL.createObjectURL(new Blob([file],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
   const link=document.createElement('a');
   link.href=url;
   link.download='nilai-'+[exam.subject,exam.className].join('-').replace(/[^\p{L}\p{N}-]+/gu,'-').toLowerCase()+'.xlsx';
   link.click();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
 }catch{
   setExportError('Excel belum bisa diunduh. Coba lagi.');
 }finally{
   setExporting(false);
 }
}
if(tokenPage)return <ExamTokenList exams={data.exams} students={data.students} canFilterUnit={data.staff.role==='Super Admin'} clock={clock} run={run} navigate={navigate}/>;
const eligible=records.filter(({a}:any)=>a.id&&a.graded&&!a.published&&!a.readOnly).map(({a}:any)=>a.id);
return <>{monitorPage&&<ExamTokenList mode="monitoring" hidden={!!exam} exams={data.exams} students={data.students} canFilterUnit={data.staff.role==='Super Admin'} clock={clock} navigate={id=>{S(id);C([])}}/>}{waitingForProgress&&!monitorError&&<p role="status">Memuat progres peserta…</p>}{(monitoring||scopedGrading)&&monitorError&&<div role="status" className="notice">{monitorError}{!waitingForProgress&&' Data terakhir masih ditampilkan.'}{scopedGrading&&<button onClick={()=>setGradeReload(value=>value+1)}>Coba muat detail lagi</button>}</div>}{!selected||!exam?grading&&<><div className="toolbar">{data.staff.role==='Super Admin'&&<select aria-label="Unit" value={unit} onChange={e=>U(e.target.value)}><option value="">Semua unit</option>{['SD','SMP','SMA'].map(x=><option key={x}>{x}</option>)}</select>}<select aria-label="Topik" value={topic} onChange={e=>T(e.target.value)}><option value="">Semua topik</option>{Array.from(new Set(data.exams.map((e:any)=>e.topic))).filter(Boolean).map((x:any)=><option key={x}>{x}</option>)}</select><select aria-label="Mapel" value={subject} onChange={e=>M(e.target.value)}><option value="">Semua mapel</option>{Array.from(new Set(data.exams.map((e:any)=>e.subject))).map((x:any)=><option key={x}>{x}</option>)}</select></div><div className="panel table-wrap"><table><thead><tr>{['Unit','Topik / ujian','Mapel','Kelas','Peserta','Status','Aksi'].map(x=>x==='Aksi'?<th key={x}>Aksi</th>:<React.Fragment key={x}>{header(x)}</React.Fragment>)}</tr></thead><tbody>{sorted(exams,(e,k)=>({'Unit':e.unit,'Topik / ujian':e.topic+' '+e.title,'Mapel':e.subject,'Kelas':e.className,'Peserta':e.participantCount,'Status':tokenState(e),'Jadwal WIB':e.start}[k])).map((e:any)=><tr key={e.id}><td>{e.unit}</td><td>{e.topic}<small>{e.title}</small></td><td>{e.subject}</td><td>{e.className}</td><td>{e.participantCount??'—'}</td><td>Jadwal berakhir</td><td><button onClick={()=>{S(e.id);C([])}}>Lihat detail</button></td></tr>)}</tbody></table>{!exams.length&&<p>Belum ada ujian selesai sesuai filter.</p>}</div></>:<><div className="toolbar"><button onClick={()=>{S('');C([]);V(null);K(null)}}>← Kembali ke daftar ujian</button><h2>{exam.topic} · {exam.subject} · {exam.unit} {exam.className}</h2></div><p>{stamp(exam.start)} — {stamp(exam.end)} · {tokenState(exam)}</p>{exam.retakeReason&&<p>Alasan ujian ulang: {exam.retakeReason} · {exam.retakeBy}</p>}<div className="toolbar">{monitoring&&<button disabled={refreshingProgress} onClick={()=>refreshProgress.current?.()}>{refreshingProgress?'Memperbarui progres…':'Perbarui progres'}</button>}{exam.canProctor&&!grading&&<><button disabled={busy||tokenState(exam)==='Selesai'} onClick={()=>token(exam)}>{selectedTokenExpiry>clock?'Lihat token':'Siapkan token'}</button></>}{grading&&<><button disabled={waitingForProgress||exporting||!records.length} onClick={exportValues}>{exporting?'Menyiapkan Excel…':'Unduh nilai semua siswa (.xlsx)'}</button>{exportError&&<span role="alert">{exportError}</span>}{exam.canGrade&&<button className="primary" disabled={busy||!checks.length} onClick={()=>setPublishConfirm(true)}>Publish {checks.length} nilai terpilih</button>}</>}</div><div className="panel table-wrap"><table><thead><tr>{grading&&exam.canGrade&&<th><input aria-label="Pilih semua nilai siap terbit" type="checkbox" checked={!!eligible.length&&eligible.every((id:string)=>checks.includes(id))} onChange={e=>C(e.target.checked?eligible:[])}/></th>}{header('Nama siswa')}{header('Topik / mapel')}{header('Soal terjawab')}{!grading&&header('Jadwal WIB')}{grading&&<th>Total poin</th>}{header(grading?'Status nilai':'Status')}{grading&&header('Waktu selesai')}<th>Aksi</th><th>{grading?'Tindakan pengawas':'Catatan aksi'}</th></tr></thead><tbody>{sorted(records,({student:s,a},k)=>({'Nama siswa':s.name,'Topik / mapel':exam.topic+' '+exam.subject,'Soal terjawab':a.answeredCount??Object.values(a.answers||{}).filter(Boolean).length,'Status':workStatus(a),'Status nilai':gradeStatus(a),'Waktu selesai':a.submittedAt||0}[k])).map(({student:s,a}:any)=><tr key={s.id}>{grading&&exam.canGrade&&<td><input aria-label={'Publikasikan '+s.name} type="checkbox" disabled={!eligible.includes(a.id)} checked={checks.includes(a.id)} onChange={e=>C(e.target.checked?[...checks,a.id]:checks.filter(id=>id!==a.id))}/></td>}<td>{s.name}<small>{s.nis} · {s.className}</small></td><td>{exam.topic}<small>{exam.subject}</small></td><td>{a.answeredCount??Object.values(a.answers||{}).filter(Boolean).length} / {a.questionCount??a.questions?.length??'—'}</td>{!grading&&<td>{stamp(exam.start)}<small>s.d. {stamp(exam.end)} · {exam.duration} menit</small></td>}{grading&&<td>{a.points?<>{pointFormat.format(a.points.earned)} / {pointFormat.format(a.points.maximum)}{a.points.provisional&&<small>Sementara</small>}</>:'—'}</td>}<td>{grading?<span className={'badge '+(a.published?'green':a.graded?'amber':'')}>{gradeStatus(a)}{a.graded&&<small>{a.score}</small>}</span>:workStatus(a)}</td>{grading&&<td>{a.status==='Dikumpulkan'?(a.timedOut?'Selesai > waktu habis':'Selesai'):'Tidak ujian / belum selesai'}<small>{stamp(a.submittedAt)}</small></td>}<td>{grading?<>{a.status==='Dikumpulkan'&&!a.readOnly&&<button onClick={()=>data.menu?edit('gradeSummary',{id:a.id}):edit('grade',{...a,grades:Object.fromEntries((a.questions||[]).map((q:any)=>[q.id,!a.graded&&!a.correctedAt&&(q.manualGrading||['ISIAN','URAIAN'].includes(q.type))?'':a.grades?.[q.id]]))})}>{a.published?'Lihat nilai':'Koreksi'}</button>}{a.published&&exam.canGrade&&!a.readOnly&&<button disabled={busy} onClick={()=>{if(window.confirm('Buka koreksi ulang? Nilai disembunyikan dari siswa hingga dipublikasikan kembali.'))void act('reopenGrade',{id:a.id})}}>Koreksi ulang</button>}</>:a.id&&a.status!=='Dikumpulkan'&&exam.canProctor&&<button onClick={()=>edit('supervise',{id:a.id,reason:'',minutes:10,action:'releaseSession'})}>Tindakan pengawas</button>}{exam.canManageAttempt&&['Belum mulai','Dikumpulkan'].includes(a.status)&&<button onClick={()=>grading?navigate(exam.id):K({id:a.id,examId:exam.id,studentId:s.id,name:s.name,start:'',end:'',reason:'',retake:a.status==='Dikumpulkan',confirmDelete:false})}>Ujian ulang</button>}</td><td>{a.exitReason&&<p>{a.exitReason}</p>}{notes(a)}</td></tr>)}</tbody></table></div></>}{shown&&(!shown.expiresAt||clock<shown.expiresAt)&&<section className="panel token-display"><button onClick={()=>V(null)}>Tutup token</button><h2>{shown.exam} · {shown.className}</h2><p>Token mulai ujian</p><strong>{shown.token}</strong>{shown.expiresAt&&<p>Berlaku sampai {stamp(shown.expiresAt)}.</p>}{!shown.token&&<p>{shown.message}</p>}<p>Siswa harus login ke akun masing-masing.</p></section>}{makeup&&selected===makeup.examId&&<section className="panel"><h3>Jadwal ujian ulang · {makeup.name}</h3>{makeup.retake&&<label className="check-inline"><input type="checkbox" checked={!!makeup.confirmDelete} onChange={e=>K({...makeup,confirmDelete:e.target.checked})}/>Hapus permanen jawaban dan nilai lama siswa ini untuk ujian tersebut. Jika tidak dicentang, siswa melanjutkan jawaban lama pada jadwal baru.</label>}<label className="field">Alasan / catatan<textarea required value={makeup.reason} onChange={e=>K({...makeup,reason:e.target.value})}/></label><DateTimeField label="Mulai WIB" value={makeup.start} onChange={v=>K({...makeup,start:v})}/><DateTimeField label="Selesai WIB" value={makeup.end} onChange={v=>K({...makeup,end:v})}/><button disabled={busy||makeup.reason.trim().length<5||!makeup.start||!makeup.end||makeup.end<=makeup.start} onClick={async()=>{const r=await act(makeup.retake?'retake':'makeup',{...makeup,start:new Date(makeup.start+'+07:00').toISOString(),end:new Date(makeup.end+'+07:00').toISOString()});if(r){V({...r,localAt:Date.now()});K(null)}}}>Simpan jadwal ujian ulang</button><button onClick={()=>K(null)}>Batal</button></section>}{publishConfirm&&<AppDialog title="Publikasikan nilai terpilih?" onClose={()=>!busy&&setPublishConfirm(false)}><p>Nilai {checks.length} siswa akan terlihat oleh siswa dan dikunci setelah dipublikasikan.</p><div className="dialog-actions"><button disabled={busy} onClick={()=>setPublishConfirm(false)}>Batal</button><button className="primary" disabled={busy||!checks.length} onClick={async()=>{if(await act("publishMany",{ids:checks})){C([]);setPublishConfirm(false)}}}>Publikasikan nilai</button></div></AppDialog>}</>;
}



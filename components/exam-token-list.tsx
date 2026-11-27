'use client';

import { useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, ClipboardCopy, Clock3, KeyRound, UsersRound } from 'lucide-react';
import { monitoringScheduleStatus } from '../lib/exam-status';

type Exam = {
  id: string;
  unit: string;
  title: string;
  topic: string;
  subject: string;
  className: string;
  year?: string;
  start: string;
  end: string;
  status?: string;
  canProctor: boolean;
  canMonitor?: boolean;
  participantsSelected?: boolean;
  studentIds?: string[];
  excludedStudentIds?: string[];
  sharedCode?: string;
  tokenExpiresAt?: number;
};
type Student = { id: string; unit: string; className: string; year?: string };
type Props = {
  exams: Exam[];
  students: Student[];
  canFilterUnit: boolean;
  clock: number;
  navigate: (id: string) => void;
} & ({ mode?: 'token'; run: (action: string, payload: { examId: string }, message: string) => Promise<{ token?: string } | null> }
  | { mode: 'monitoring'; hidden?: boolean; run?: never });

const zone = 'Asia/Jakarta';
const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: zone, dateStyle: 'short' });
const dateLabel = new Intl.DateTimeFormat('id-ID', { timeZone: zone, dateStyle: 'full' });
const timeLabel = new Intl.DateTimeFormat('id-ID', { timeZone: zone, hour: '2-digit', minute: '2-digit' });

export default function ExamTokenList(props: Props) {
  const {exams,students,canFilterUnit,clock,navigate,mode,run}=props;
  const monitoring=mode==='monitoring';
  const [filters, setFilters] = useState({ date: '', unit: '', topic: '', subject: '', status: '' });
  const busy = useRef(false);
  const [preparing, setPreparing] = useState('');
  const [issued, setIssued] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ id: string; copied: boolean }>();
  const enrollment = useMemo(() => {
    const byClass = new Map<string, string[]>();
    const visibleIds = new Set<string>();
    for (const student of students) {
      visibleIds.add(student.id);
      const key = JSON.stringify([student.unit, student.className, student.year || '2026/2027']);
      const ids = byClass.get(key) || [];
      ids.push(student.id);
      byClass.set(key, ids);
    }
    return { byClass, visibleIds };
  }, [students]);
  if(monitoring&&props.hidden)return null;
  const schedules=exams.flatMap(exam=>{
    const status=monitoring
      ?exam.canMonitor&&monitoringScheduleStatus(exam,clock)
      :exam.canProctor&&clock<Date.parse(exam.end)&&(clock>=Date.parse(exam.start)?'Berlangsung':'Belum mulai');
    return status?[{exam,status}]:[];
  }).sort((left,right)=>{
    if(monitoring&&left.status!==right.status)return left.status==='Berlangsung'?-1:1;
    if(left.status==='Selesai')return Date.parse(right.exam.end)-Date.parse(left.exam.end);
    return Date.parse(left.exam.start)-Date.parse(right.exam.start);
  });
  const days = new Map<string, string>();
  const groups = new Map<string, { label: string; schedules: typeof schedules }>();
  for (const schedule of schedules) {
    const {exam,status}=schedule;
    const start = new Date(exam.start);
    const key = dateKey.format(start);
    days.set(key, dateLabel.format(start));
    if ((filters.date && filters.date !== key) || (filters.unit && filters.unit !== exam.unit) ||
        (filters.topic && filters.topic !== exam.topic) || (filters.subject && filters.subject !== exam.subject) ||
        (filters.status && filters.status !== status)) continue;
    const groupKey=monitoring?status+'|'+key:key;
    const group=groups.get(groupKey)||{label:days.get(key)!,schedules:[]};
    group.schedules.push(schedule);
    groups.set(groupKey,group);
  }
  const options = (field: 'unit' | 'topic' | 'subject') =>
    [...new Set(schedules.map(({exam}) => exam[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id'));
  const change = (key: keyof typeof filters, value: string) => setFilters(previous => ({ ...previous, [key]: value }));

  async function prepare(exam: Exam) {
    if (busy.current||!run) return;
    busy.current = true;
    setPreparing(exam.id);
    try {
      const result = await run(exam.tokenExpiresAt ? 'viewShared' : 'generateShared', { examId: exam.id }, 'Token ujian siap');
      if (result?.token) {
        const code = result.token;
        setIssued(previous => ({ ...previous, [exam.id]: code }));
      }
    } finally {
      busy.current = false;
      setPreparing('');
    }
  }

  async function copy(exam: Exam, code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setFeedback({ id: exam.id, copied: true });
    } catch {
      setFeedback({ id: exam.id, copied: false });
    }
  }

  return <div className="token-schedule">
    <div className="token-schedule-filters">
      <label>Tanggal<select value={filters.date} onChange={e => change('date', e.target.value)}>
        <option value="">Semua tanggal</option>
        {[...days].map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      {canFilterUnit && <label>Unit<select value={filters.unit} onChange={e => change('unit', e.target.value)}>
        <option value="">Semua unit</option>
        {options('unit').map(unit => <option key={unit}>{unit}</option>)}
      </select></label>}
      <label>Topik<select value={filters.topic} onChange={e => change('topic', e.target.value)}>
        <option value="">Semua topik</option>
        {options('topic').map(topic => <option key={topic}>{topic}</option>)}
      </select></label>
      <label>Mata pelajaran<select value={filters.subject} onChange={e => change('subject', e.target.value)}>
        <option value="">Semua mapel</option>
        {options('subject').map(subject => <option key={subject}>{subject}</option>)}
      </select></label>
      <label>Status ujian<select value={filters.status} onChange={e => change('status', e.target.value)}>
        <option value="">Semua status</option>
        {!monitoring&&<option>Belum mulai</option>}
        <option>Berlangsung</option>
        {monitoring&&<option>Selesai</option>}
      </select></label>
    </div>

    {[...groups].map(([key, group], index) => <section key={key} className="token-schedule-day" aria-labelledby={'token-day-'+index}>
      <div className="token-day-heading">
        <h2 id={'token-day-'+index}><CalendarDays size={17} aria-hidden="true"/>{group.label}</h2>
        <span>{group.schedules.length} jadwal</span>
      </div>
      <ul className="token-schedule-list">
        {group.schedules.map(({exam,status}) => {
          const code = exam.sharedCode || issued[exam.id];
          const ids = exam.participantsSelected || exam.studentIds?.length
            ? (exam.studentIds || []).filter(id => enrollment.visibleIds.has(id))
            : enrollment.byClass.get(JSON.stringify([exam.unit, exam.className, exam.year || '2026/2027'])) || [];
          const excluded = new Set(exam.excludedStudentIds);
          const participants = ids.filter(id => !excluded.has(id)).length;
          return <li key={exam.id} className="token-schedule-row">
            <div className="token-exam">
              <h3>{exam.title}</h3>
              <p>{[exam.topic, exam.subject].filter(Boolean).filter((item, i, all) => all.indexOf(item) === i).join(' · ')}</p>
              <span className="token-class"><span>{exam.unit}</span>{exam.className}</span>
            </div>
            <div className="token-schedule-meta">
              <span className={'token-schedule-status'+(status==='Berlangsung'?' running':status==='Selesai'?' finished':'')}>{status}</span>
              <span><Clock3 size={15} aria-hidden="true"/>{timeLabel.format(new Date(exam.start))}–{timeLabel.format(new Date(exam.end))} WIB</span>
              <span><UsersRound size={15} aria-hidden="true"/>{participants} peserta</span>
            </div>
            <div className="token-row-controls">
              {!monitoring&&(code ? <div className="token-row-code">
                <span>Token ujian</span>
                <div>
                  <code>{code}</code>
                  <button type="button" onClick={()=>void copy(exam,code)} aria-label={'Salin token '+exam.title+' '+exam.className} title="Salin token">
                    {feedback?.id===exam.id&&feedback.copied?<Check size={17} aria-hidden="true"/>:<ClipboardCopy size={17} aria-hidden="true"/>}
                  </button>
                </div>
              </div> : <button type="button" className="primary" disabled={!!preparing} onClick={()=>void prepare(exam)}>
                <KeyRound size={16} aria-hidden="true"/>{preparing===exam.id?'Menyiapkan…':exam.tokenExpiresAt?'Lihat token':'Siapkan token'}
              </button>)}
              <button type="button" onClick={()=>navigate(exam.id)} aria-label={(monitoring?'Lihat detail ':'Peserta ')+exam.title+' '+exam.className}>
                <UsersRound size={16} aria-hidden="true"/>{monitoring?'Lihat detail':'Peserta'}
              </button>
              {feedback?.id===exam.id&&<small className="token-copy-feedback" role="status">{feedback.copied?'Token disalin':'Salin kode secara manual'}</small>}
            </div>
          </li>;
        })}
      </ul>
    </section>)}
    {!groups.size&&<p className="token-schedule-empty">{monitoring?'Belum ada ujian berlangsung atau selesai yang sesuai dengan filter.':'Tidak ada jadwal yang sesuai dengan filter.'}</p>}
  </div>;
}

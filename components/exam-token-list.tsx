'use client';

import { useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, ClipboardCopy, Clock3, KeyRound, UsersRound } from 'lucide-react';

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
  canProctor: boolean;
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
  run: (action: string, payload: { examId: string }, message: string) => Promise<{ token?: string } | null>;
  navigate: (id: string) => void;
};

const zone = 'Asia/Jakarta';
const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: zone, dateStyle: 'short' });
const dateLabel = new Intl.DateTimeFormat('id-ID', { timeZone: zone, dateStyle: 'full' });
const timeLabel = new Intl.DateTimeFormat('id-ID', { timeZone: zone, hour: '2-digit', minute: '2-digit' });

export default function ExamTokenList({ exams, students, canFilterUnit, clock, run, navigate }: Props) {
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
  // The API has already scoped schedules and codes to the current operator.
  const schedules = exams.filter(exam => exam.canProctor && clock < Date.parse(exam.end))
    .sort((left, right) => Date.parse(left.start) - Date.parse(right.start));
  const days = new Map<string, string>();
  const groups = new Map<string, Exam[]>();
  for (const exam of schedules) {
    const start = new Date(exam.start);
    const key = dateKey.format(start);
    const status = clock >= +start ? 'Berlangsung' : 'Belum mulai';
    days.set(key, dateLabel.format(start));
    if ((filters.date && filters.date !== key) || (filters.unit && filters.unit !== exam.unit) ||
        (filters.topic && filters.topic !== exam.topic) || (filters.subject && filters.subject !== exam.subject) ||
        (filters.status && filters.status !== status)) continue;
    const group = groups.get(key) || [];
    group.push(exam);
    groups.set(key, group);
  }
  const options = (field: 'unit' | 'topic' | 'subject') =>
    [...new Set(schedules.map(exam => exam[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id'));
  const change = (key: keyof typeof filters, value: string) => setFilters(previous => ({ ...previous, [key]: value }));

  async function prepare(exam: Exam) {
    if (busy.current) return;
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
        <option>Belum mulai</option>
        <option>Berlangsung</option>
      </select></label>
    </div>

    {[...groups].map(([key, group], index) => <section key={key} className="token-schedule-day" aria-labelledby={'token-day-'+index}>
      <div className="token-day-heading">
        <h2 id={'token-day-'+index}><CalendarDays size={17} aria-hidden="true"/>{days.get(key)}</h2>
        <span>{group.length} jadwal</span>
      </div>
      <ul className="token-schedule-list">
        {group.map(exam => {
          const active = Date.parse(exam.start) <= clock;
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
              <span className={'token-schedule-status'+(active?' running':'')}>{active?'Berlangsung':'Belum mulai'}</span>
              <span><Clock3 size={15} aria-hidden="true"/>{timeLabel.format(new Date(exam.start))}–{timeLabel.format(new Date(exam.end))} WIB</span>
              <span><UsersRound size={15} aria-hidden="true"/>{participants} peserta</span>
            </div>
            <div className="token-row-controls">
              {code ? <div className="token-row-code">
                <span>Token ujian</span>
                <div>
                  <code>{code}</code>
                  <button type="button" onClick={()=>void copy(exam,code)} aria-label={'Salin token '+exam.title+' '+exam.className} title="Salin token">
                    {feedback?.id===exam.id&&feedback.copied?<Check size={17} aria-hidden="true"/>:<ClipboardCopy size={17} aria-hidden="true"/>}
                  </button>
                </div>
              </div> : <button type="button" className="primary" disabled={!!preparing} onClick={()=>void prepare(exam)}>
                <KeyRound size={16} aria-hidden="true"/>{preparing===exam.id?'Menyiapkan…':exam.tokenExpiresAt?'Lihat token':'Siapkan token'}
              </button>}
              <button type="button" onClick={()=>navigate(exam.id)} aria-label={'Peserta '+exam.title+' '+exam.className}><UsersRound size={16} aria-hidden="true"/>Peserta</button>
              {feedback?.id===exam.id&&<small className="token-copy-feedback" role="status">{feedback.copied?'Token disalin':'Salin kode secara manual'}</small>}
            </div>
          </li>;
        })}
      </ul>
    </section>)}
    {!groups.size&&<p className="token-schedule-empty">Tidak ada jadwal yang sesuai dengan filter.</p>}
  </div>;
}

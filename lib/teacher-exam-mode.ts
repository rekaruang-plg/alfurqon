export const teacherExamMenus = ['Buat soal', 'Bank soal', 'Koreksi & nilai'];
export const teacherExamActions = ['saveBank', 'deleteBank', 'archiveQuestion', 'grade', 'publish', 'publishMany', 'reopenGrade'];
export const teacherExamModeMessage = 'Menu ini dibuka kembali setelah Mode Ujian berakhir. Jadwal, Token Ujian, dan Monitoring tetap tersedia.';

export type TeacherExamMode = {
  until: number;
  home: 'Token ujian' | 'Jadwal ujian';
};

type ExamWindow = {
  start: string;
  end: string;
  proctor: boolean;
  effectiveEnd?: number;
};

const minute = 60_000;
export const teacherExamLead = 30 * minute;
export const teacherExamGrace = 15 * minute;
const day = 24 * 60 * minute;
const wib = 7 * 60 * minute;

export function wibDayStart(time: number){
  return Math.floor((time + wib) / day) * day - wib;
}

export function teacherExamWindow(exams: ExamWindow[], now: number){
  const days = new Map<number, { first: number; last: number; proctor: boolean }>();
  for (const exam of exams){
    const start = Date.parse(exam.start);
    const end = Math.max(Date.parse(exam.end), exam.effectiveEnd || 0);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const date = wibDayStart(start);
    const window = days.get(date) ?? { first: start, last: end, proctor: false };
    window.first = Math.min(window.first, start);
    window.last = Math.max(window.last, end);
    window.proctor ||= exam.proctor && now >= start - teacherExamLead && now < end + teacherExamGrace;
    days.set(date, window);
  }
  let until = 0;
  let proctor = false;
  for (const window of days.values()){
    const end = window.last + teacherExamGrace;
    if (now >= window.first - teacherExamLead && now < end){
      until = Math.max(until, end);
      proctor ||= window.proctor;
    }
  }
  return until ? { until, home: proctor ? 'Token ujian' : 'Jadwal ujian' } satisfies TeacherExamMode : null;
}

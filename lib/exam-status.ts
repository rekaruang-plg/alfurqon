export function gradingStatus(a:any){if(a.status!=='Dikumpulkan')return a.status==='Mengerjakan'?'Sedang dikerjakan':'Belum mulai';return a.published?'Nilai di Publish':a.graded?'Sudah dinilai':a.correctedAt?'Proses Penilaian':'Perlu dinilai';}

export function monitoringScheduleStatus(exam:{start:string;end:string;status?:string},now:number){
 if(exam.status&&exam.status!=='Aktif'&&exam.status!=='Selesai')return;
 const start=Date.parse(exam.start),end=Date.parse(exam.end);
 if(!(start<end&&start<=now))return;
 return now<end?'Berlangsung':'Selesai';
}

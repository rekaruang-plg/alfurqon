import type {Question} from './model';
export const written=(q:Question)=>q.type==='URAIAN'||q.type==='ISIAN';
export function answeredQuestion(q:Question,v:string=''){if(q.type==='MENJODOHKAN'){const a=v.split(',');return (q.left||[]).every((_,i)=>/^\d+$/.test(a[i]||'')&&Number(a[i])<(q.right?.length||0));}if(q.type==='PG')return /^\d+$/.test(v)&&Number(v)<q.options.length;if(q.type==='PG_KOMPLEKS')return !!v&&v.split(',').every(x=>/^\d+$/.test(x)&&Number(x)<q.options.length);return !!v.trim();}
export const editableGrade=(q:Question)=>q.type!=='PG'||!!q.manualGrading;
export function submissionIssue(a:any,now=Date.now()){if(now>=a.deadline)return '';if(now<(a.submitAfter??a.startedAt+(a.deadline-a.startedAt)/4))return 'Ujian baru dapat dikumpulkan setelah ¼ durasi pengerjaan.';if(a.questions?.some((q:Question)=>!answeredQuestion(q,a.answers?.[q.id])))return 'Jawab semua butir soal sebelum mengumpulkan ujian.';return '';}
export function keywordScore(q:Question,answer:string=''){const normalize=(s:string)=>(q.caseSensitive?s.normalize('NFKC'):s.normalize('NFKC').toLowerCase()).replace(/[\u064B-\u065F]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();const keys=(q.keywords||'').split(/[;\n]/).map(normalize).filter(Boolean);if(!keys.length)return 0;const text=' '+normalize(answer)+' ';return Math.round(keys.filter(k=>text.includes(' '+k+' ')).length/keys.length*q.points*100)/100;}


export function submissionDelay(deadline:number,now:number,automatic:boolean,random=Math.random()){
 if(automatic)return Math.floor(random*3501);
 const timeWithMargin=deadline-now-2500;
 return Math.max(0,Math.min(Math.floor(timeWithMargin),Math.floor(random*2201)));
}

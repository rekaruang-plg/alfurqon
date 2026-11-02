import {keywordScore,written} from './review-policy';
export type Question={presentation?:string;stimulusId?:string;stimulus?:string;caseSensitive?:boolean;format?:string;sourceLabel?:string;importIssues?:string[];importReviewed?:boolean;importSource?:string;scope?:string;sourceId?:string;keywords?:string;images?:string[];id:string;type:'PG'|'PG_KOMPLEKS'|'URAIAN'|'ISIAN'|'MENJODOHKAN';text:string;options:string[];key:string;points:number;mode:string;left?:string[];right?:string[]};
export const units=['SD','SMP','SMA'];
export const starterQuestions:Question[]=[
{id:'q1',type:'PG',text:'Hasil dari 12 × 8 adalah …',options:['86','96','108','112'],key:'1',points:20,mode:'TEKS'},
{id:'q2',type:'PG',text:'Pecahan yang senilai dengan ½ adalah …',options:['2/3','2/4','3/4','1/4'],key:'1',points:20,mode:'TEKS'},
{id:'q3',type:'PG',text:'Sebuah persegi memiliki sisi 9 cm. Kelilingnya adalah …',options:['18 cm','27 cm','36 cm','81 cm'],key:'2',points:20,mode:'TEKS'},
{id:'q4',type:'URAIAN',text:'Tuliskan cara menghitung luas segitiga dengan alas 12 cm dan tinggi 8 cm.',options:[],key:'L = ½ × 12 × 8 = 48 cm². Beri poin untuk rumus, substitusi, dan hasil.',points:40,mode:'MATEMATIKA'}];
export function shuffle<T>(items:T[]){const groups:T[][]=[],byId=new Map<string,T[]>();for(const item of items){const key=(item as any)?.stimulusId;if(key){const group=byId.get(key);if(group)group.push(item);else {const g=[item];byId.set(key,g);groups.push(g);}}else groups.push([item]);}const a=groups;for(let i=a.length-1;i>0;i--){const j=crypto.getRandomValues(new Uint32Array(1))[0]%(i+1);[a[i],a[j]]=[a[j],a[i]]}return a.flat()}
// Pick an unused group permutation, with bounded enumeration after a random start.
export function uniqueQuestionOrder<T extends {id:string;stimulusId?:string}>(items:T[],usedOrders:string[]){
 const groups:T[][]=[],byId=new Map<string,T[]>();
 for(const item of items){if(item.stimulusId){const existing=byId.get(item.stimulusId);if(existing)existing.push(item);else{const group=[item];byId.set(item.stimulusId,group);groups.push(group)}}else groups.push([item]);}
 const order=shuffle(groups.map((_,i)=>i)),counts=new Map<string,number>();
 for(const key of usedOrders)counts.set(key,(counts.get(key)||0)+1);
 let best:any=null;
 // At most usedCount + 1 candidates are needed to find an unused permutation.
 let limit=1;for(let i=2;i<=groups.length&&limit<=counts.size;i++)limit=Math.min(counts.size+1,limit*i);
 for(let step=0;step<limit;step++){
  const questions=order.flatMap(i=>groups[i]),signature=JSON.stringify(questions.map(q=>q.id)),count=counts.get(signature)||0;
  const candidate={questions,signature,unique:count===0,groupCount:groups.length};
  if(!count)return candidate;
  if(!best||count<best.count)best={...candidate,count};
  let i=order.length-2;while(i>=0&&order[i]>=order[i+1])i--;
  if(i<0)order.reverse();else{let j=order.length-1;while(order[j]<=order[i])j--;[order[i],order[j]]=[order[j],order[i]];const tail=order.splice(i+1).reverse();order.push(...tail);}
 }
 return {questions:best.questions as T[],signature:best.signature as string,unique:false,groupCount:groups.length};
}
export function choiceSet(value:string){return [...new Set(value.split(',').filter(v=>v!==''))].sort((a,b)=>Number(a)-Number(b)).join(',')}
export function toggleChoice(value:string,index:number){const values=value?value.split(','):[];const key=String(index);return choiceSet((values.includes(key)?values.filter(x=>x!==key):[...values,key]).join(','))}
export function mark(questions:Question[], answers:Record<string,string>){return Object.fromEntries(questions.map(q=>[q.id,written(q)?keywordScore(q,answers[q.id]):q.type==='PG'?(answers[q.id]===q.key?q.points:0):q.type==='PG_KOMPLEKS'?(choiceSet(answers[q.id]||'')===choiceSet(q.key)?q.points:0):(()=>{const keys=q.key.split(',');const got=(answers[q.id]||'').split(',');return keys.reduce((s,k,i)=>s+(k.trim()===got[i]?.trim()?q.points/keys.length:0),0)})()]))}

export function toggleAssignedClass(selected:string[]|undefined,name:string,available:string[]){
 const current=selected?.length?selected.filter(n=>n!=='__NONE__'):[...available];
 const next=current.includes(name)?current.filter(n=>n!==name):[...current,name];
 return next.length?next:['__NONE__'];
}
export function scheduleDuration(start:string,end:string){
 const minutes=(Date.parse(end+'+07:00')-Date.parse(start+'+07:00'))/60000;
 return Number.isFinite(minutes)&&minutes>0?minutes:0;
}
export function compareAcademicNames(a:any,b:any,direction:string){return (direction==='desc'?-1:1)*String(a.name||a.title||'').localeCompare(String(b.name||b.title||''),'id',{numeric:true,sensitivity:'base'});}

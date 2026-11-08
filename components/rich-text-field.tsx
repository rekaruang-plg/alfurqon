'use client';
import {useRef} from 'react';
import {formulaTemplates} from './question-content';
export default function RichTextField({label,value,onChange,readOnly=false,formulas=false}:{label:string;value:string;onChange:(value:string)=>void;readOnly?:boolean;formulas?:boolean}){
 const ref=useRef<HTMLTextAreaElement>(null);
 function insert(before:string,after=''){const el=ref.current;if(!el)return;const start=el.selectionStart,end=el.selectionEnd;onChange(value.slice(0,start)+before+value.slice(start,end)+after+value.slice(end));requestAnimationFrame(()=>{el.focus();el.setSelectionRange(start+before.length,end+before.length)})}
 return <div className="field"><label>{label}<textarea ref={ref} aria-label={label} dir="auto" rows={3} value={value} readOnly={readOnly} onChange={e=>onChange(e.target.value)}/></label>{!readOnly&&<div className="formula-tools" aria-label={'Format '+label}>{[['b','Bold'],['i','Italic'],['u','Underline']].map(([tag,name])=><button key={tag} type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>insert('['+tag+']','[/'+tag+']')}>{name}</button>)}{formulas&&formulaTemplates.map(([name,text])=><button key={name} type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>insert(text)}>{name}</button>)}</div>}</div>
}

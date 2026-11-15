'use client';
import {useRef} from 'react';
import {symbolSets} from '../lib/question-settings';
import {formulaTemplates} from './question-content';
export default function RichTextField({label,value,onChange,readOnly=false,formulas=false,formatting=true,subject=''}:{label:string;value:string;onChange:(value:string)=>void;readOnly?:boolean;formulas?:boolean;formatting?:boolean;subject?:string}){
 const mode=/arab|tahsin/i.test(subject)?'ARAB':/fisika/i.test(subject)?'FISIKA':/kimia/i.test(subject)?'KIMIA':formulas?'MATEMATIKA':'';
 const ref=useRef<HTMLTextAreaElement>(null);
 function insert(before:string,after=''){const el=ref.current;if(!el)return;const start=el.selectionStart,end=el.selectionEnd;onChange(value.slice(0,start)+before+value.slice(start,end)+after+value.slice(end));requestAnimationFrame(()=>{el.focus();el.setSelectionRange(start+before.length,end+before.length)})}
 return <div className="field rich-text-field"><label><span>{label}</span><textarea ref={ref} aria-label={label} dir="auto" rows={4} value={value} readOnly={readOnly} onChange={e=>onChange(e.target.value)}/></label>{!readOnly&&(formatting||!!mode)&&<div className="formula-tools" aria-label={'Format '+label}>{formatting&&[['b','Bold'],['i','Italic'],['u','Underline'],['left','Rata kiri'],['center','Rata tengah'],['right','Rata kanan']].map(([tag,name])=><button key={tag} type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>insert('['+tag+']','[/'+tag+']')}>{name}</button>)}{mode&&<details><summary>Keyboard / simbol {mode.toLowerCase()}</summary>{symbolSets[mode].map(symbol=><button key={symbol} type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>insert(symbol)}>{symbol}</button>)}{formulas&&formulaTemplates.map(([name,text])=><button key={name} type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>insert(text)}>{name}</button>)}</details>}</div>}</div>
}

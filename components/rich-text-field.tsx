'use client';
import {useRef,useState} from 'react';
import FormulaDialog from './formula-dialog';
import {symbolSets} from '../lib/question-settings';
import {formulaTemplates} from './question-content';
export default function RichTextField({label,value,onChange,readOnly=false,formulas=false,formatting=true,subject=''}:{label:string;value:string;onChange:(value:string)=>void;readOnly?:boolean;formulas?:boolean;formatting?:boolean;subject?:string}){
 const mode=/arab|tahsin/i.test(subject)?'ARAB':/fisika/i.test(subject)?'FISIKA':/kimia/i.test(subject)?'KIMIA':formulas?'MATEMATIKA':'';
 const ref=useRef<HTMLTextAreaElement>(null);
 const [formulaEdit,setFormulaEdit]=useState<{start:number;end:number;initial:string;replacing:boolean}|null>(null);
 const failed=[...value.matchAll(/\\\([\s\S]*?\\\)|\[PERIKSA RUMUS\]/gi)].filter(m=>/\[PERIKSA RUMUS\]/i.test(m[0]));
 function openFormula(match?:RegExpMatchArray){
  const start=match?.index??ref.current?.selectionStart??value.length;
  const end=match?start+match[0].length:ref.current?.selectionEnd??start;
  const selected=value.slice(start,end).trim();
  const initial=selected.startsWith('\\(')&&selected.endsWith('\\)')?selected.slice(2,-2):'';
  setFormulaEdit({start,end,initial,replacing:!!match||!!initial});
 }
 function applyFormula(formula:string){
  if(!formulaEdit)return;
  const {start,end}=formulaEdit;
  onChange(value.slice(0,start)+formula+value.slice(end));
  setFormulaEdit(null);
  requestAnimationFrame(()=>{ref.current?.focus();ref.current?.setSelectionRange(start+formula.length,start+formula.length);});
 }

 function insert(before:string,after=''){const el=ref.current;if(!el)return;const start=el.selectionStart,end=el.selectionEnd;onChange(value.slice(0,start)+before+value.slice(start,end)+after+value.slice(end));requestAnimationFrame(()=>{el.focus();el.setSelectionRange(start+before.length,end+before.length)})}
 return <div className="field rich-text-field"><label><span>{label}</span><textarea ref={ref} aria-label={label} dir="auto" rows={4} value={value} readOnly={readOnly} onChange={e=>onChange(e.target.value)}/></label>{!readOnly&&<div className="formula-tools" aria-label={'Format '+label}><button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>openFormula()}>Sisipkan rumus</button>{failed.map((match,index)=><button type="button" key={match.index} onClick={()=>openFormula(match)}>Perbaiki rumus{failed.length>1?' '+(index+1):''}</button>)}{formatting&&[['b','Bold'],['i','Italic'],['u','Underline'],['left','Rata kiri'],['center','Rata tengah'],['right','Rata kanan'],['justify','Rata kanan-kiri']].map(([tag,name])=><button key={tag} type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>insert('['+tag+']','[/'+tag+']')}>{name}</button>)}{mode&&<details className={mode==='ARAB'?'keyboard-arabic':undefined}><summary>Keyboard / simbol {mode.toLowerCase()}</summary>{symbolSets[mode].map(symbol=><button key={symbol} type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>insert(symbol)}>{symbol}</button>)}{formulas&&formulaTemplates.map(([name,text])=><button key={name} type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>insert(text)}>{name}</button>)}</details>}</div>}{formulaEdit&&<FormulaDialog initial={formulaEdit.initial} replacing={formulaEdit.replacing} onClose={()=>setFormulaEdit(null)} onApply={applyFormula}/>}</div>
}

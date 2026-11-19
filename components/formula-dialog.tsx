'use client';

import {useState} from 'react';
import katex from 'katex';
import AppDialog from './app-dialog';
import {QuestionContent} from './question-content';

const templates = [
  {name:'Pecahan', labels:['Pembilang','Penyebut'], defaults:['1','2'], build:([a,b]:string[])=>`\\frac{${a}}{${b}}`},
  {name:'Akar', labels:['Isi akar'], defaults:['x'], build:([a]:string[])=>`\\sqrt{${a}}`},
  {name:'Pangkat', labels:['Bilangan dasar','Pangkat'], defaults:['x','2'], build:([a,b]:string[])=>`{${a}}^{${b}}`},
  {name:'Indeks bawah', labels:['Simbol','Indeks'], defaults:['a','1'], build:([a,b]:string[])=>`{${a}}_{${b}}`},
  {name:'Matriks 2 × 2', labels:['Baris 1 kolom 1','Baris 1 kolom 2','Baris 2 kolom 1','Baris 2 kolom 2'], defaults:['1','2','3','4'], build:([a,b,c,d]:string[])=>`\\begin{pmatrix}${a}&${b}\\\\${c}&${d}\\end{pmatrix}`},
  {name:'Limit', labels:['Variabel','Menuju','Ekspresi'], defaults:['x','0','f(x)'], build:([a,b,c]:string[])=>`\\lim_{${a}\\to ${b}} ${c}`},
  {name:'Integral', labels:['Batas bawah','Batas atas','Ekspresi','Variabel'], defaults:['0','1','x^2','x'], build:([a,b,c,d]:string[])=>`\\int_{${a}}^{${b}} ${c}\\,d${d}`},
];

export default function FormulaDialog({initial='',replacing=false,onClose,onApply}:{initial?:string;replacing?:boolean;onClose:()=>void;onApply:(formula:string)=>void}){
  const [kind,setKind]=useState(initial?'custom':'0');
  const [values,setValues]=useState(templates[0].defaults);
  const [custom,setCustom]=useState(initial);
  const template=kind==='custom'?undefined:templates[Number(kind)];
  const formula=(template?template.build(values):custom).trim();
  let valid=!!formula && !formula.includes('\\(') && !formula.includes('\\)') && !/\[PERIKSA RUMUS\]/i.test(formula);
  if(template&&values.some(value=>!value.trim()))valid=false;
  if(valid){
    try{katex.renderToString(formula,{throwOnError:true,trust:false,maxExpand:100,maxSize:20});}
    catch{valid=false;}
  }
  return <AppDialog title={replacing?'Perbaiki rumus':'Sisipkan rumus'} onClose={onClose}>
    <label className="field"><span>Bentuk rumus</span><select value={kind} onChange={e=>{
      const next=e.target.value;
      if(next==='custom')setCustom(formula);
      else setValues(templates[Number(next)].defaults);
      setKind(next);
    }}>{templates.map((item,i)=><option key={item.name} value={i}>{item.name}</option>)}<option value="custom">Rumus sendiri (LaTeX)</option></select></label>
    {template?<div className="form-grid">{template.labels.map((label,index)=><label className="field" key={label}><span>{label}</span><input value={values[index]} maxLength={400} onChange={e=>setValues(previous=>previous.map((value,i)=>i===index?e.target.value:value))}/></label>)}</div>:<label className="field"><span>Isi rumus</span><textarea dir="ltr" rows={3} maxLength={2000} value={custom} onChange={e=>setCustom(e.target.value)}/></label>}
    <div className="notice"><div><strong>Pratinjau rumus</strong><div>{valid?<QuestionContent text={'\\('+formula+'\\)'}/>:<span role="status">Lengkapi atau perbaiki rumus untuk melihat hasilnya.</span>}</div></div></div>
    <div className="dialog-actions"><button type="button" onClick={onClose}>Batal</button><button type="button" className="primary" disabled={!valid} onClick={()=>onApply('\\('+formula+'\\)')}>{replacing?'Ganti rumus':'Masukkan rumus'}</button></div>
  </AppDialog>;
}

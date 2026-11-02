'use client';
import React,{useState} from 'react';
import {createPortal} from 'react-dom';
import AppDialog from './app-dialog';
import katex from 'katex';
import 'katex/dist/katex.min.css';
export function QuestionContent({text,images=[]}:{text:string;images?:string[]}){const parts=String(text||'').split(/(\\\([\s\S]*?\\\)|\[\[image:\d+\]\])/g);return <span className="rich-question" dir="auto">{parts.map((p,i)=>{const img=p.match(/^\[\[image:(\d+)\]\]$/);if(img){const src=images[Number(img[1])];return src&&/^data:image\/(png|jpeg|webp);base64,/.test(src)?<ZoomImage key={i} src={src}/>:<span key={i}>[Gambar tidak tersedia]</span>;}if(p.startsWith('\\(')&&p.endsWith('\\)')){try{return <span key={i} dangerouslySetInnerHTML={{__html:katex.renderToString(p.slice(2,-2),{throwOnError:true,trust:false,strict:'ignore',output:'htmlAndMathml',maxExpand:100,maxSize:20})}}/>}catch{return <span className="math-error" key={i}>{p} [periksa rumus]</span>}}return <span key={i}>{p}</span>})}</span>}
export const formulaTemplates=[['Pecahan','\\(\\frac{a}{b}\\)'],['Akar','\\(\\sqrt{x}\\)'],['Pangkat','\\(x^{2}\\)'],['Indeks','\\(H_{2}O\\)'],['Matriks','\\(\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}\\)'],['Persamaan','\\(x+y=z\\)']];

function ZoomImage({src}:{src:string}){const [open,S]=useState(false);return <span onClick={e=>e.stopPropagation()}><img src={src} alt="Gambar pada soal — klik untuk memperbesar" role="button" tabIndex={0} style={{cursor:'zoom-in'}} onClick={e=>{e.preventDefault();e.stopPropagation();S(true)}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();S(true)}}}/>{open&&createPortal(<AppDialog title="Perbesar gambar" onClose={()=>S(false)}><img src={src} alt="Gambar diperbesar" style={{maxWidth:'100%',height:'auto'}}/></AppDialog>,document.body)}</span>}

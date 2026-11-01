'use client';
import React,{useState} from 'react';
export default function PagedTable({headers,rows}:{headers:string[];rows:React.ReactNode[]}){
 const [size,S]=useState(25),[page,P]=useState(1);
 const count=rows.length,pages=Math.max(1,Math.ceil(count/size)),current=Math.min(page,pages),start=(current-1)*size;
 return <><div className="toolbar table-pagination"><label>Baris per halaman <select aria-label="Jumlah baris per halaman" value={size} onChange={e=>{S(Number(e.target.value));P(1)}}>{[10,25,50,100].map(n=><option key={n} value={n}>{n}</option>)}</select></label><span>{count?start+1:0}–{Math.min(start+size,count)} dari {count} data</span></div><div className="panel table-wrap"><table><thead><tr>{headers.map((h,i)=><th key={i}>{h}</th>)}</tr></thead><tbody>{rows.slice(start,start+size)}{!count&&<tr><td colSpan={headers.length}>Tidak ada data yang sesuai.</td></tr>}</tbody></table></div><div className="toolbar table-pagination"><button disabled={current===1} onClick={()=>P(current-1)}>Sebelumnya</button><span>Halaman {current} dari {pages}</span><button disabled={current===pages} onClick={()=>P(current+1)}>Selanjutnya</button></div></>;
}

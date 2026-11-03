'use client';
import React,{useState} from 'react';
import AppDialog from './app-dialog';
export default function StudentTokenDialog({onClose,onSubmit}:{onClose:()=>void;onSubmit:(code:string)=>Promise<void>}){
 const [code,C]=useState(''),[busy,B]=useState(false),[error,E]=useState('');
 return <AppDialog title="Masukkan token ujian" onClose={()=>{if(!busy)onClose()}}><form onSubmit={async e=>{e.preventDefault();if(busy||!code.trim())return;B(true);E('');try{await onSubmit(code.trim().toUpperCase())}catch(err){E(err instanceof Error?err.message:'Token belum dapat diperiksa. Coba kembali.')}finally{B(false)}}}><p>Masukkan token yang diberikan pengawas untuk ujian ini.</p><label className="field"><span>Token ujian</span><input autoFocus autoComplete="off" disabled={busy} value={code} onChange={e=>{C(e.target.value.toUpperCase().replace(/\s/g,''));E('')}} required/></label>{error&&<p className="notice error" role="alert">{error}</p>}<div className="toolbar"><button type="button" disabled={busy} onClick={onClose}>Batal</button><button type="submit" className="primary" disabled={busy||!code.trim()}>{busy?'Memeriksa…':'Periksa token'}</button></div></form></AppDialog>
}

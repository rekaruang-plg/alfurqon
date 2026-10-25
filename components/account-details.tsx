'use client';
import React,{useEffect,useState} from 'react';
import {printAccounts} from '../lib/print-accounts';
export default function AccountDetails({id,kind}:{id?:string;kind:'student'|'teacher'}){
 const [card,setCard]=useState<any>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;setCard(null);setError('');if(id)fetch('/api/cbt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'accountCards',kind,id})}).then(async r=>{const d:any=await r.json();if(!r.ok)throw Error(d.error);if(active){if(!d.cards?.[0])setError('Akun tidak tersedia pada kewenangan ini.');else setCard(d.cards[0]);}}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[id,kind]);
 return <section className="account-details"><h3>Akun login</h3>{!id?<p>Username dan password dibuat setelah data disimpan.</p>:error?<p role="alert">{error}</p>:!card?<p>Memuat akun…</p>:<><label className="field"><span>Username</span><input readOnly value={card.username}/></label><label className="field"><span>Password akun</span><input readOnly value={card.password||'Sudah diubah oleh pemilik akun'}/></label><button type="button" onClick={()=>printAccounts([card])}>Cetak kartu akun</button></>}</section>
}

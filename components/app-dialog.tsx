'use client';
import React,{useEffect,useRef} from 'react';
export default function AppDialog({title,children,onClose}:{title:string;children:React.ReactNode;onClose:()=>void}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const prior=document.activeElement as HTMLElement|null;ref.current?.showModal();return()=>{ref.current?.close();prior?.focus()}},[]);
 return <dialog ref={ref} className="app-dialog" aria-label={title} onCancel={e=>{e.preventDefault();onClose()}}><div className="modal-head"><h2>{title}</h2><button type="button" aria-label="Tutup dialog" onClick={onClose}>×</button></div>{children}</dialog>;
}

'use client';
import {useEffect,useRef} from 'react';
export default function ExamBrowserGuard({enabled,suspended=false,onViolation}:{enabled:boolean;suspended?:boolean;onViolation:(reason:string)=>void}){
 const callback=useRef(onViolation),paused=useRef(suspended);callback.current=onViolation;paused.current=suspended;
 useEffect(()=>{if(!enabled)return;let reported=false;const report=(reason:string)=>{if(!reported&&!paused.current){reported=true;callback.current(reason);}};
 const visibility=()=>{if(document.visibilityState==='hidden')report('hidden');};
 const fullscreen=()=>{if(!document.fullscreenElement)report('fullscreen');};
 const block=(e:Event)=>e.preventDefault();
 const keys=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&['c','x','v','p','s'].includes(e.key.toLowerCase()))e.preventDefault();};
 const beforeinput=(e:Event)=>{if(['insertFromPaste','insertFromDrop'].includes((e as InputEvent).inputType))e.preventDefault();};
 document.addEventListener('visibilitychange',visibility);document.addEventListener('fullscreenchange',fullscreen);
 for(const event of ['contextmenu','copy','cut','paste','dragstart','drop'])document.addEventListener(event,block,true);
 document.addEventListener('keydown',keys,true);document.addEventListener('beforeinput',beforeinput,true);
 return()=>{document.removeEventListener('visibilitychange',visibility);document.removeEventListener('fullscreenchange',fullscreen);for(const event of ['contextmenu','copy','cut','paste','dragstart','drop'])document.removeEventListener(event,block,true);document.removeEventListener('keydown',keys,true);document.removeEventListener('beforeinput',beforeinput,true);};
 },[enabled,suspended]);return null;
}

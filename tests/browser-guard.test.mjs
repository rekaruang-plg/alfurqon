import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
const listeners=new Map();let cleanup;const events=[];
const document={visibilityState:'visible',fullscreenElement:{},addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:(n,f)=>{if(listeners.get(n)===f)listeners.delete(n)}};
const box={exports:{},require:()=>({useRef:v=>({current:v}),useEffect:f=>{cleanup=f()}}),document};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/exam-browser-guard.tsx','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,box);
const start=(suspended=false)=>box.exports.default({enabled:true,suspended,onViolation:r=>events.push(r)});
start();for(const type of ['copy','paste','cut','contextmenu','drop']){let prevented=false;listeners.get(type)({preventDefault:()=>prevented=true});assert(prevented);}
let prevented=false;listeners.get('keydown')({key:'v',ctrlKey:true,preventDefault:()=>prevented=true});assert(prevented);
prevented=false;listeners.get('keydown')({key:'a',ctrlKey:false,preventDefault:()=>prevented=true});assert(!prevented);
document.visibilityState='hidden';listeners.get('visibilitychange')();listeners.get('fullscreenchange')();assert.deepEqual(events,['hidden']);cleanup();assert.equal(listeners.size,0);
start();document.fullscreenElement=null;listeners.get('fullscreenchange')();assert.deepEqual(events,['hidden','fullscreen']);cleanup();
start(true);listeners.get('visibilitychange')();assert.equal(events.length,2);cleanup();
console.log('PASS: clipboard/context-menu/drop blocking, typing preserved, hidden/fullscreen lock, deduplication, paused suppression and listener cleanup.');

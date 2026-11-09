import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
import ts from 'typescript';
import JSZip from 'jszip';
const require=createRequire(import.meta.url);
const domPackage=fs.readdirSync('node_modules/.pnpm').find(n=>n.startsWith('@xmldom+xmldom@'));
const {DOMParser,XMLSerializer}=require(`${process.cwd()}/node_modules/.pnpm/${domPackage}/node_modules/@xmldom/xmldom`);
function load(file,deps={}){const box={exports:{},require:n=>n==='jszip'?JSZip:deps[n],DOMParser,XMLSerializer,crypto:webcrypto};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,box);return box.exports;}
const word=load('lib/word-import.ts');const {importNaturalWord}=load('lib/natural-word-import.ts',{'./word-import':word});
const files=process.argv.slice(2);
if(!files.length)throw Error('Usage: node tests/inspect-word.mjs file1.docx [file2.docx ...]');
const route=fs.readFileSync('app/api/cbt/route.ts','utf8'),start=route.indexOf('function sanitizeQ('),end=route.indexOf('\n',start);
const box={fail:m=>{throw Error(m)},id:()=> 'new',choiceSet:s=>s};vm.runInNewContext(ts.transpileModule(route.slice(start,end)+'\nglobalThis.sanitize=sanitizeQ;', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,box);
for(const file of files){
 const r=await importNaturalWord(fs.readFileSync(file),async s=>s);
 for(const q of r.questions){
  assert(q.text.trim());assert(!/Kunci Jawaban & Rubrik|\(JAWABAN [A-F]\)/i.test(q.text));
  if(q.type.startsWith('PG'))assert(q.options.length>=2&&q.options.length<=6,'Invalid option count: '+q.sourceLabel);
  box.sanitize({...q,importReviewed:true});
 }
 console.log(file.split('/').pop(),JSON.stringify(r.counts),'keys',r.questions.filter(q=>q.key).length,'passages',r.passageCount,'all questions pass save validation');
}

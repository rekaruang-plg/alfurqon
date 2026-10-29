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
const p=t=>`<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
const cell=(t,fill='')=>`<w:tc>${fill?`<w:tcPr><w:shd w:fill="${fill}"/></w:tcPr>`:''}${p(t)}</w:tc>`;
async function doc(body){const z=new JSZip();z.file('word/document.xml',`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><w:body>${body}</w:body></w:document>`);return z.generateAsync({type:'arraybuffer'});}
const fixture=await doc(p('Bahasa Inggris')+p('MULTIPLE CHOICE')+p('This text for question no 1 and 2')+p('A shared passage about a school.')+p('1. What is the first answer?')+p('a. First')+p('b. Second')+p('2. What is the next answer?')+p('a. Apple')+p('b. Orange')+p('COMPLEX MULTIPLE CHOICE')+p('1. Select all correct statements.')+p('One statement')+p('Another statement')+p('ESSAY')+p('1. Explain the answer in detail.')+p('KUNCI JAWABAN')+p('MULTIPLE CHOICE')+'<w:tbl><w:tr>'+cell('1')+cell('A')+cell('B','FFFF00')+'</w:tr><w:tr>'+cell('2')+cell('A','92D050')+cell('B')+'</w:tr></w:tbl>'+p('COMPLEX MULTIPLE CHOICE')+'<w:tbl><w:tr>'+cell('1')+cell('✓')+cell('✓')+'</w:tr></w:tbl>');
const result=await importNaturalWord(fixture,async s=>s);
assert.equal(result.questions.length,4);assert.equal(result.questions[0].key,'1');assert.equal(result.questions[1].key,'0');assert.equal(result.questions[2].key,'0,1');assert.equal(result.questions[3].key,'');assert.ok(result.questions[3].importIssues.length);
for(const q of result.questions.slice(0,2)){assert.ok(q.stimulus.startsWith('A shared passage'));assert.ok(!q.text.includes('KUNCI'));}
const mathDoc=await doc(p('Matematika')+p('ISIAN SINGKAT')+p('1. Hitung pecahan berikut ini.')+'<w:p><m:oMath><m:f><m:num><m:r><m:t>1</m:t></m:r></m:num><m:den><m:r><m:t>2</m:t></m:r></m:den></m:f></m:oMath></w:p>');
assert.ok((await importNaturalWord(mathDoc)).questions[0].text.includes('\\frac{1}{2}'));
const route=fs.readFileSync('app/api/cbt/route.ts','utf8');const start=route.indexOf('function sanitizeQ('),end=route.indexOf('\n',start);const sandbox={fail:m=>{throw Error(m)},id:()=> 'new',choiceSet:s=>s};vm.runInNewContext(ts.transpileModule(route.slice(start,end)+'\nglobalThis.sanitize=sanitizeQ;', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,sandbox);
const question={...result.questions[3],key:'Answer',importReviewed:false};assert.throws(()=>sandbox.sanitize(question),/periksa/);const saved=sandbox.sanitize({...question,importReviewed:true});assert.ok(!('importSource' in saved));assert.ok(!('importIssues' in saved));assert.throws(()=>sandbox.sanitize({...question,importReviewed:true,key:''}),/kunci/);assert.throws(()=>sandbox.sanitize({...saved,text:'[PERIKSA GAMBAR]'}),/Perbaiki/);assert.throws(()=>sandbox.sanitize({...saved,type:'PG',options:['','valid'],key:'0'}),/tidak valid/);
for(const file of process.argv.slice(2)){const b=fs.readFileSync(file);const parsed=await importNaturalWord(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),async s=>s);assert.ok(parsed.questions.length);assert.ok(parsed.questions.every(q=>q.text.trim()&&!q.text.includes('KUNCI JAWABAN')));console.log(file.split('/').pop(),JSON.stringify(parsed.counts),'passages',parsed.passageCount);}
console.log('PASS: natural Word sections, shared passages, shaded keys, all-correct checkbox, missing-key review, native equations, server review gate and private import metadata.');
const bold=t=>`<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${t}</w:t></w:r></w:p>`;
const flex=await doc(p('Part I. Multiple Choice Questions')+p('Read the following text to answer the following questions.')+p('One shared story.')+p('1. First question?')+p('A. Incorrect')+bold('B. Correct')+p('2. Second question?')+bold('A. Ambiguous')+bold('B. Also bold')+p('Read the following text to answer the following questions.')+p('A different story.')+p('3. Third question?')+p('A. One')+bold('B. Two')+p('Part II. Essays')+p('Direction: Answer the following questions based on the text given.')+p('Essay story.')+p('1. Explain the story.'));
const flexResult=await importNaturalWord(flex,async s=>s,'bold');
assert.equal(flexResult.questions.length,4);assert.equal(flexResult.passageCount,3);assert.equal(flexResult.questions[0].key,'1');assert.equal(flexResult.questions[1].key,'');assert.equal(flexResult.questions[2].key,'1');assert.equal(flexResult.questions[3].type,'URAIAN');assert.equal(flexResult.questions[0].stimulusId,flexResult.questions[1].stimulusId);assert.notEqual(flexResult.questions[1].stimulusId,flexResult.questions[2].stimulusId);assert.equal(flexResult.questions[1].stimulus,'One shared story.');assert.ok(!flexResult.questions[1].options.join(' ').includes('different story'));
const noKey=await importNaturalWord(flex,async s=>s,'none');assert.ok(noKey.questions.every(q=>!q.key));
const {shuffle}=load('lib/model.ts',{'./review-policy':{}});
for(let i=0;i<30;i++){const out=shuffle(flexResult.questions),a=out.findIndex(q=>q.id===flexResult.questions[0].id);assert.equal(out[a+1].id,flexResult.questions[1].id);assert.equal(out.length,4);}
const grouped=sandbox.sanitize({...flexResult.questions[0],importReviewed:true});assert.equal(grouped.stimulus,'One shared story.');assert.throws(()=>sandbox.sanitize({...grouped,stimulus:''}),/Bacaan/);assert.throws(()=>sandbox.sanitize({...grouped,stimulus:'[PERIKSA GAMBAR]'}),/Perbaiki/);
console.log('PASS: flexible passages, numbered restarts, bold candidates, ambiguous keys, no-key mode, grouped shuffle and persisted passage validation.');

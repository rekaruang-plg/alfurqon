import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import Excel from 'exceljs';
function load(file){const box={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,box);return box.exports;}
const {toggleAssignedClass,scheduleDuration,compareAcademicNames}=load('lib/academic-ui.ts');
let selected=toggleAssignedClass(['__NONE__'],'6A',['6A','6B']);assert.equal(JSON.stringify(selected),'["6A"]');
selected=toggleAssignedClass(selected,'6B',['6A','6B']);assert.equal(JSON.stringify(selected),'["6A","6B"]');
assert.equal(JSON.stringify(toggleAssignedClass([],'6A',['6A','6B'])),'["6B"]');
assert.equal(JSON.stringify(toggleAssignedClass(['6A'],'6A',['6A','6B'])),'["__NONE__"]');
assert.equal(scheduleDuration('2026-11-09T08:00','2026-11-09T09:30'),90);
assert.equal(scheduleDuration('2026-11-09T23:30','2026-11-10T00:30'),60);
assert.equal(scheduleDuration('',''),0);assert.equal(scheduleDuration('2026-11-09T09:30','2026-11-09T08:00'),0);
const rows=[{name:'Matematika'},{name:'Bahasa Indonesia'},{name:'IPAS'}];assert.equal(rows.slice().sort((a,b)=>compareAcademicNames(a,b,'asc'))[0].name,'Bahasa Indonesia');assert.equal(rows.slice().sort((a,b)=>compareAcademicNames(a,b,'desc'))[0].name,'Matematika');
const {accountCardsHtml}=load('lib/print-accounts.ts');const html=accountCardsHtml([{kind:'teacher',name:'<script>bad</script>',niy:'123',unit:'SD',teaching:'Matematika — 6A',username:'123',password:'12345abc'}]);assert(html.includes('Kartu akun guru'));assert(html.includes('<dt>NIY</dt>'));assert(!html.includes('<dt>NIS</dt>'));assert(!html.includes('Kartu peserta ujian'));assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));
const pupil=accountCardsHtml([{kind:'student',name:'Siswa',nis:'001',className:'6A'}]);assert(pupil.includes('<dt>NIS</dt>'));assert(pupil.includes('<dt>Kelas</dt>'));
for(const kind of ['teacher','class','student']){const w=new Excel.Workbook();await w.xlsx.readFile('public/templates/template-'+kind+'.xlsx');assert(w.worksheets[0].rowCount>=2);if(kind==='teacher'){assert.equal(w.worksheets[0].getCell('A1').text,'NIY');assert.equal(w.worksheets[0].getCell('G1').text,'Kelas');}}
console.log('PASS: individual/all class toggles, WIB duration and invalid ranges, ascending/descending sorting, teacher/student print cards, HTML escaping, all downloadable Excel templates.');

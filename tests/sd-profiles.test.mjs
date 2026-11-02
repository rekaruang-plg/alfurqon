import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import ts from 'typescript';
function load(file,vars={}){const box={exports:{},...vars};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8').replace(/^import .*;\n/gm,''),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,box);return box.exports;}
const labels=load('lib/question-settings.ts');const p=load('lib/sd-subject-profiles.ts',labels);
assert.equal(p.sdSubjectProfiles.length,10);
for(const profile of p.sdSubjectProfiles){for(const grade of ['5','6']){assert.equal(p.sdProfile('SD',profile.name,grade).name,profile.name);const variants=p.presentationsFor('SD',profile.name,grade);assert(variants.length);assert(variants.every(v=>profile.types.includes(v.kind)&&v.hint));}assert.equal(p.sdProfile('SMP',profile.name,'1'),undefined);assert.equal(p.sdProfile('SD',profile.name,'4'),undefined);}
assert.equal(p.sdProfile('SD','MTK','5').name,'Matematika');assert.equal(p.sdProfile('SD','Komputer','6').name,'TIK');assert.equal(p.sdProfile('SD','Seni Budaya','6').name,'SBDP');
const list=p.packageQuestionTypes({questionTypes:['PG','ISIAN']},['MENJODOHKAN'],[{type:'PG',format:'BENAR_SALAH'}]);assert.equal(JSON.stringify(list),'["PG","ISIAN","MENJODOHKAN","BENAR_SALAH"]');
console.log('PASS: ten subject profiles, both SD grades, aliases, presentation-specific guidance, other-unit isolation and retained/additional question types.');

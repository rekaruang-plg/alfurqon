import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import ts from 'typescript';
function load(file,vars={}){const box={exports:{},...vars};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8').replace(/^import .*;\n/gm,''),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,box);return box.exports;}
const labels=load('lib/question-settings.ts');const p=load('lib/sd-subject-profiles.ts',labels);
assert.equal(p.sdSubjectProfiles.length,10);
for(const profile of p.sdSubjectProfiles){for(const grade of ['5','6']){assert.equal(p.sdProfile('SD',profile.name,grade).name,profile.name);const variants=p.presentationsFor('SD',profile.name,grade);assert(variants.length);assert(variants.every(v=>profile.types.includes(v.kind)&&v.hint));}assert.equal(p.sdProfile('SMP',profile.name,'1'),undefined);assert.equal(p.sdProfile('SD',profile.name,'4'),undefined);}
assert.equal(p.sdProfile('SD','MTK','5').name,'Matematika');assert.equal(p.sdProfile('SD','Komputer','6').name,'TIK');assert.equal(p.sdProfile('SD','Seni Budaya','6').name,'SBDP');
const list=p.packageQuestionTypes({questionTypes:['PG','ISIAN']},['MENJODOHKAN'],[{type:'PG',format:'BENAR_SALAH'}]);assert.equal(JSON.stringify(list),'["PG","ISIAN","MENJODOHKAN","BENAR_SALAH"]');
console.log('PASS: ten subject profiles, both SD grades, aliases, presentation-specific guidance, other-unit isolation and retained/additional question types.');
assert.equal(p.smpSubjectProfiles.length,10);
for(const profile of p.smpSubjectProfiles){for(const grade of ['1','2','3']){assert.equal(p.subjectProfile('SMP',profile.name,grade).name,profile.name);assert(p.presentationsFor('SMP',profile.name,grade).every(v=>profile.types.includes(v.kind)));}assert.equal(p.smpProfile('SMA',profile.name,'1'),undefined);assert.equal(p.smpProfile('SMP',profile.name,'4'),undefined);}
assert.equal(p.subjectProfile('SMP','TIK','2').name,'Informatika');assert.equal(p.subjectProfile('SMP','PAI','3').name,'Pendidikan Agama Islam');
assert.deepEqual(Array.from(p.subjectProfile('SMP','Bahasa Arab','1').types),['PG','PG_KOMPLEKS','URAIAN']);
assert.equal(p.subjectProfile('SMP','Matematika','3').mode,'MATEMATIKA');assert.equal(p.subjectProfile('SMP','Bahasa Arab','2').mode,'ARAB');
console.log('PASS: ten SMP profiles, all three grades, aliases, presentation guidance, subject keyboard modes and SD/SMA isolation.');

for(const grade of ['1','2','3'])for(const name of ['Fisika','Bahasa Inggris','Mapel baru']){const profile=p.subjectProfile('SMA',name,grade);assert.deepEqual(Array.from(profile.types),['PG','PG_KOMPLEKS','MENJODOHKAN']);assert.equal(p.presentationsFor('SMA',name,grade).length,7);}
assert.equal(p.smaProfile('SMA','Fisika','4'),undefined);
console.log('PASS: all SMA subjects and grades expose seven presentation patterns and three default answer types.');

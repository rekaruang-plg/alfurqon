import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import assert from 'node:assert/strict';
const box={exports:{},crypto};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/model.ts','utf8').replace(/^import .*;\n/gm,''),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,box);
const pick=box.exports.uniqueQuestionOrder;
const qs=[{id:'a',stimulusId:'story'},{id:'b',stimulusId:'story'},{id:'c'},{id:'d'}],used=[];
for(let i=0;i<6;i++){const p=pick(qs,used);assert(p.unique);assert(!used.includes(p.signature));used.push(p.signature);const ids=p.questions.map(q=>q.id);assert.equal(ids[ids.indexOf('a')+1],'b');}
assert.equal(new Set(used).size,6);assert.equal(pick(qs,used).unique,false);
const frequencies=[...used,...Array(5).fill(used[0])];assert.notEqual(pick(qs,frequencies).signature,used[0]);
const single=pick(qs.slice(0,2),['["a","b"]']);assert.equal(single.unique,false);assert.equal(single.signature,'["a","b"]');
assert.equal(JSON.stringify(qs.map(q=>q.id)),'["a","b","c","d"]');
console.log('PASS: all six group permutations used before repeats, balanced exhausted fallback, single passage, source order unchanged.');

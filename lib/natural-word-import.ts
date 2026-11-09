import JSZip from 'jszip';
import {prepareWord,shrinkImage} from './word-import';
import type {Question} from './model';
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main',R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const elements=(e:Node)=>Array.from(e.childNodes).filter(n=>n.nodeType===1) as Element[];
const descendants=(e:Element|Document,name:string)=>Array.from(e.getElementsByTagNameNS('*',name));
const value=(e:Element|undefined,name='val')=>e?.getAttributeNS(W,name)||e?.getAttribute('w:'+name)||'';
const clean=(s:string)=>s.replace(/\u00a0/g,' ').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
const comparable=(s:string)=>s.normalize('NFKC').replace(/[\u064B-\u065F\u0670\u0640\s\p{P}]/gu,'').toLowerCase();
type Kind='PG'|'PG_KOMPLEKS'|'ISIAN'|'URAIAN'|'MENJODOHKAN';
export type ImportedQuestion=Question&{sourceLabel:string;importIssues:string[];importReviewed:boolean;importSource:string};
type Block={node:Element;text:string;plain:string;fmt:string;number:number;pattern:string;listId:string;images:string[];boxes:boolean;table:boolean;marked:boolean;markedText:string;cardNumber?:string;cardKey?:string;inferred?:boolean;blueprint?:{id:string;numbers:string[];points:number[]}};
function section(text:string):Kind|undefined {
 const t=text.trim().toUpperCase().replace(/\s+/g,' ').replace(/^(?:PART\s+[IVX]+|BAGIAN\s+\d+)[.:]?\s*/, '').replace(/^(?:[A-DIVX]+[.)]\s*)?(?:SOAL\s*)?/, '');
 if(/^(?:PILIHAN GANDA KOMPLEKS?|COMPLEX MULTIPLICATION|COMPLEX MULTIPLE CHOICE|MCMA)/.test(t))return 'PG_KOMPLEKS';
 if(/^(?:PILIHAN GANDA|PILHAN GANDA|MULTIPLE CHOICE)/.test(t))return 'PG';
 if(/^(?:MENJODOHKAN)/.test(t.replace(/^SOAL\s*/,'')))return 'MENJODOHKAN';
 if(/^(?:MENCOCOKKAN)/.test(t))return 'ISIAN';
 if(/^JAWABLAH\s*(?:DENGAN|PERTANYAAN)/.test(t))return 'URAIAN';
 if(/^(?:ISIAN\s*(?:SINGKAT)?|SHORT QUESTION|SHORT ANSWER)/.test(t))return 'ISIAN';
 if(/^(?:ESSAI|ESSAYS?|ESAI|URAIAN)(?:\s*(?:QUESTIONS?|ANSWER|SOAL|BOBOT|PKWU|KELAS|\d|\(|\/).*)?$/.test(t))return 'URAIAN';
}
const manualNumber=(b:Block)=>b.fmt?null:b.plain.match(/^\s*Soal\s+(\d+)\s*(.+)/i)||b.plain.match(/^\s*(?:Soal\s+)?(\d{1,3})(?:\s*[.),]\s*|\s+(?=[A-Za-z].{15}))(\S[\s\S]*)/i);
const autoNumber=(b:Block)=>b.fmt==='decimal'&&!b.pattern.startsWith('(')&&b.plain.trim().length>1;
const optionPattern=/(?:^|[\t\n ]|(?<=\d))(\*?)([a-f])[.)]\s*/gi;
const optionBlock=(b:Block)=>['lowerLetter','upperLetter','bullet'].includes(b.fmt)||/^\s*\*?[a-f][.)]\s+/i.test(b.plain);
const answerLabel=/^(?:kunci\s+jawaban(?:\s*&\s*rubrik\s*penilaian)?|jawaban|jawab|answer)\s*:/i;

const labels:Record<Kind,string>={PG:'PG',PG_KOMPLEKS:'PG kompleks',ISIAN:'Isian',URAIAN:'Uraian',MENJODOHKAN:'Menjodohkan'};
export async function importNaturalWord(buffer:ArrayBuffer,convertImage:(src:string)=>Promise<string>=shrinkImage,keyMarker:'auto'|'table'|'bold'|'highlight'|'none'='auto'){
 const prepared=await prepareWord(buffer),zip=await JSZip.loadAsync(prepared.buffer);const parse=(s:string)=>new DOMParser().parseFromString(s,'application/xml');
 const xml=parse(await zip.file('word/document.xml')!.async('string'));if(descendants(xml,'parsererror').length)throw Error('Struktur Word tidak dapat dibaca. Simpan ulang sebagai .docx.');
 const body=descendants(xml,'body')[0];if(!body)throw Error('Isi dokumen kosong.');
 const numbering=parse(await zip.file('word/numbering.xml')?.async('string')||'<numbering/>');
 const rels=parse(await zip.file('word/_rels/document.xml.rels')?.async('string')||'<Relationships/>');
 const relationships=new Map(descendants(rels,'Relationship').filter(e=>e.getAttribute('TargetMode')!=='External').map(e=>[e.getAttribute('Id'),e.getAttribute('Target')||'']));
 const counters=new Map<string,number>(),imageCache=new Map<string,string>(),assets:string[]=[],warnings:string[]=[];
 function list(p:Element){const pr=elements(p).find(e=>e.localName==='pPr'),num=pr&&descendants(pr,'numPr')[0];if(!num)return {fmt:'',number:0,pattern:'',listId:''};const numId=value(descendants(num,'numId')[0]),level=value(descendants(num,'ilvl')[0])||'0';const n=descendants(numbering,'num').find(e=>value(e,'numId')===numId),abstract=value(n&&descendants(n,'abstractNumId')[0]);const a=descendants(numbering,'abstractNum').find(e=>value(e,'abstractNumId')===abstract),lvl=a&&elements(a).find(e=>e.localName==='lvl'&&value(e,'ilvl')===level);const fmt=value(lvl&&descendants(lvl,'numFmt')[0]),pattern=value(lvl&&descendants(lvl,'lvlText')[0]);const counter=numId+':'+level;let start=Number(value(lvl&&descendants(lvl,'start')[0])||1);const override=n&&elements(n).find(e=>e.localName==='lvlOverride'&&value(e,'ilvl')===level);if(override)start=Number(value(descendants(override,'startOverride')[0])||start);const number=counters.has(counter)?counters.get(counter)!+1:start;counters.set(counter,number);for(const key of counters.keys())if(key.startsWith(numId+':')&&Number(key.split(':')[1])>Number(level))counters.delete(key);return {fmt,number,pattern,listId:numId+':'+level};}
 async function read(e:Node,drawings=true):Promise<string>{if(e.nodeType!==1)return '';const n=e as Element,name=n.localName;if(name==='Fallback')return '';if(name==='AlternateContent'){const choice=elements(n).find(c=>c.localName==='Choice')||elements(n).find(c=>c.localName==='Fallback');return choice?joinChildren(choice,drawings):'';}if(name==='t')return n.textContent||'';if(name==='tab')return '\t';if(name==='br'||name==='cr')return '\n';if(name==='del'||name.endsWith('Pr')||name==='instrText')return '';if(['drawing','pict','object'].includes(name)){
  if(!drawings)return '';const refs=[...descendants(n,'blip').map(x=>x.getAttributeNS(R,'embed')),...descendants(n,'imagedata').map(x=>x.getAttributeNS(R,'id'))].filter(Boolean) as string[];let result='';for(const ref of [...new Set(refs)]){let marker=imageCache.get(ref);if(!marker){const target=relationships.get(ref)||'';const path=target.startsWith('/')?target.slice(1):'word/'+target.replace(/^\.\//,'');const file=zip.file(path);if(!file||!/\.(png|jpe?g|gif|webp)$/i.test(path)){warnings.push('Ada gambar/objek Word yang tidak didukung. Periksa dokumen asli dan unggah gambar pengganti.');result+=' [PERIKSA GAMBAR] ';continue;}const mime=/\.png$/i.test(path)?'png':/\.gif$/i.test(path)?'gif':/\.webp$/i.test(path)?'webp':'jpeg';const src=await convertImage('data:image/'+mime+';base64,'+await file.async('base64'));marker='[[asset:'+assets.length+']]';assets.push(src);imageCache.set(ref,marker);}result+=marker;}
  const boxes=descendants(n,'txbxContent');for(const box of boxes)result+='\n'+await joinChildren(box,drawings)+'\n';return result;
 }const t=await joinChildren(n,drawings);const vertical=value(descendants(n,'vertAlign')[0]);if(drawings&&name==='r'&&['subscript','superscript'].includes(vertical)&&t.trim())return '\\({}'+(vertical==='subscript'?'_':'^')+'{'+t.replace(/[{}%#&]/g,'\\$&')+'}\\)';return name==='p'?t+'\n':name==='tc'?t+'\t':name==='tr'?t+'\n':t;}
 async function joinChildren(e:Element,drawings:boolean){let out='';for(const c of elements(e))out+=await read(c,drawings);return out;}
 const blocks:Block[]=[];let documentFormat='Word sekolah',cardCount=0;
 async function addBlock(node:Element,meta:Partial<Block>={}){const text=clean(await read(node)).replace(/(\[\[asset:\d+\]\])(?:\s*\1)+/g,'$1');const plain=clean(await read(node,false));blocks.push({...meta,node,text,plain,...(node.localName==='p'?list(node):{fmt:'',number:0,pattern:'',listId:''}),images:[...text.matchAll(/\[\[asset:(\d+)\]\]/g)].map(m=>m[1]),boxes:descendants(node,'txbxContent').length>0,table:node.localName==='tbl',markedText:descendants(node,'r').filter(r=>descendants(r,'b').some(b=>!['0','false','off'].includes(value(b)))).map(r=>descendants(r,'t').map(t=>t.textContent||'').join('')).join(''),marked:descendants(node,'r').filter(r=>descendants(r,'t').some(t=>t.textContent?.trim())).some(r=>['auto','bold'].includes(keyMarker)?descendants(r,'b').some(b=>!['0','false','off'].includes(value(b))):keyMarker==='highlight'?descendants(r,'highlight').some(h=>!['none','white',''].includes(value(h)))||descendants(r,'color').some(c=>!['auto','000000','FFFFFF',''].includes(value(c))):false)});}
 async function addText(text:string){const p=xml.createElementNS(W,'w:p'),r=xml.createElementNS(W,'w:r'),t=xml.createElementNS(W,'w:t');t.textContent=text;r.appendChild(t);p.appendChild(r);await addBlock(p);}
 let tableKind:Kind='PG';
 for(const node of elements(body)){
  if(!['p','tbl'].includes(node.localName))continue;
  if(node.localName==='p'){const kind=section(clean(await read(node,false)));if(kind)tableKind=kind;await addBlock(node);continue;}
  const rows=elements(node).filter(e=>e.localName==='tr'),cardCells:Element[]=[];
  for(const row of rows)for(const cell of elements(row).filter(e=>e.localName==='tc')){const text=await read(cell);if(/Butir\s*Soal\s*:/i.test(text)||/No\.?\s*Soal\s*\d+/i.test(text)&&/Kunci\s*Jawaban|Buku\s*Sumber|Tipe\s*Soal/i.test(text))cardCells.push(cell);}
  if(cardCells.length){
   documentFormat='Kartu soal Word';
   if(!cardCount)await addText('PILIHAN GANDA');
   for(const cell of cardCells){
    const ps=elements(cell).filter(e=>e.localName==='p'),texts=await Promise.all(ps.map(p=>read(p))),markerIndex=texts.findIndex(t=>/^Butir\s*Soal\s*:/i.test(clean(t))),marker=markerIndex>=0?markerIndex:texts.findIndex(t=>/No\.?\s*Soal\s*\d+/i.test(t));
    if(marker<0){warnings.push('Satu kartu tidak memiliki pemisah Butir Soal yang jelas. Periksa kartu asli.');continue;}
    const metadata=(await Promise.all(ps.slice(0,markerIndex>=0?marker:marker+1).map(p=>read(p)))).join('\n');
    const cardNumber=metadata.match(/No\.?\s*Soal\s*(\d+)/i)?.[1],cardKey=metadata.match(/Kunci\s*Jawaban\s*([A-F](?:\s*[,;]\s*[A-F])*)(?=\s|$)/i)?.[1]||'';
    cardCount++;
    for(const para of ps.slice(marker+1))await addBlock(para,{cardNumber,cardKey});
   }continue;
  }
  let questionColumn=-1,numberColumn=-1,scoreColumn=-1;
  for(const row of rows.slice(0,3)){let col=0;for(const cell of elements(row).filter(e=>e.localName==='tc')){const t=clean(await read(cell,false));if(/^(?:Butir\s+)?Soal$/i.test(t))questionColumn=col;if(/^(?:Nomor|No\.?)\s*Soal$/i.test(t))numberColumn=col;if(/^(?:Skor|Bobot)$/i.test(t))scoreColumn=col;col+=Number(value(descendants(cell,'gridSpan')[0])||1);}}
  if(questionColumn>=0){
   documentFormat='Kisi-kisi dengan kolom soal';await addText('PILIHAN GANDA');let lastKind:Kind='PG',blueprint:Block['blueprint'];
   for(const row of rows){let col=0;const cells=elements(row).filter(e=>e.localName==='tc');
    const cellsByColumn=new Map<number,Element>();let at=0;for(const c of cells){cellsByColumn.set(at,c);at+=Number(value(descendants(c,'gridSpan')[0])||1);}
    const numberCell=cellsByColumn.get(numberColumn),scoreCell=cellsByColumn.get(scoreColumn);
    const numbers=numberCell?clean(await read(numberCell,false)).split(/\s+/).filter(n=>/^\d+$/.test(n)):[];
    if(numbers.length){const points=scoreCell?clean(await read(scoreCell,false)).split(/\s+/).filter(n=>/^\d+(?:[.,]\d+)?$/.test(n)).map(n=>Number(n.replace(',','.'))):[];blueprint={id:crypto.randomUUID(),numbers,points};}

    for(const cell of cells){const at=col;col+=Number(value(descendants(cell,'gridSpan')[0])||1);if(at!==questionColumn)continue;
     const text=clean(await read(cell,false));if(!text||/^(?:Butir\s+)?Soal$/i.test(text))continue;
     for(const c of cells.slice(0,cells.indexOf(cell))){const kind=section(clean(await read(c,false)));if(kind&&kind!==lastKind){await addText(labels[kind]==='Uraian'?'ESSAY':kind==='PG'?'PILIHAN GANDA':labels[kind]);lastKind=kind;}}
     for(const para of elements(cell).filter(e=>['p','tbl'].includes(e.localName)))await addBlock(para,{blueprint});
    }
   }continue;
  }
  await addBlock(node);
 }
 const header=blocks.filter(b=>b.text).slice(0,20).map(b=>b.text).join('\n');const subject=/BAHASA\s*ARAB/i.test(header)?'Bahasa Arab':/MATEMATIKA/i.test(header)?'Matematika':/BAHASA\s*INGGRIS/i.test(header)?'Bahasa Inggris':'';
 const mode=subject==='Bahasa Arab'?'ARAB':subject==='Matematika'?'MATEMATIKA':'TEKS';
 const sections:Array<{type:Kind;blocks:Block[]}>=[];let current:typeof sections[number]|undefined,keyStart=blocks.length,footer=false;
 // A missing first heading must not discard the multiple-choice pages.
 let firstQuestion=blocks.findIndex((b,i)=>(autoNumber(b)||manualNumber(b))&&blocks.slice(i+1,i+9).some(optionBlock)&&!/^PETUN|^(?:Sebelum|Setelah|Isikan|Tuliskan|Pilih|Tulisakan|Jawaban)\b/i.test(b.plain));
 if(firstQuestion<0)firstQuestion=blocks.findIndex(b=>section(b.plain));if(firstQuestion<0)firstQuestion=0;const firstHeading=blocks.findIndex(b=>section(b.plain));const earlyHeading=firstHeading>=0&&firstHeading<firstQuestion;if(earlyHeading)firstQuestion=firstHeading;
 let implicitStart=firstQuestion;
 while(implicitStart>0){const prev=blocks[implicitStart-1];if(!prev.text){implicitStart--;continue;}if((prev.fmt&&prev.fmt!=='bullet')||prev.table||section(prev.plain)||/^(?:PETUN|(?:Sebelum|Setelah|Isikan|Tuliskan|Pilih|Tulisakan)\b|(?:CP|TP)\s*[.\d]|\d+\.\d+|Mata Pelajaran|Bahasa Inggris$)/i.test(prev.plain))break;implicitStart--;}
 for(let i=0;i<blocks.length;i++){
  const b=blocks[i];
  if(/^KUNCI\s*JAWABAN(?:\s+(?:ESAI|ESSAI|ESSAY|PILIHAN|ISIAN)|\s*$)/i.test(b.plain)&&!answerLabel.test(b.plain)){keyStart=i;break;}
  const type=section(b.plain);if(type){footer=false;if(!current||current.type!==type||current.blocks.some(x=>autoNumber(x)||manualNumber(x))){current={type,blocks:[]};sections.push(current);}continue;}
  if(/^(ALHAMDULILLAH|معكم النجاح|Mengetahui)/i.test(b.plain)){footer=true;current=undefined;continue;}if(footer)continue;
  if(!current&&i>=implicitStart&&!(earlyHeading&&i<firstHeading)){current={type:'PG',blocks:[]};sections.push(current);}
  if(current&&(b.text||['lowerLetter','upperLetter'].includes(b.fmt)&&blocks.slice(Math.max(0,i-4),i+5).some(x=>x.images.length))&&!(!b.fmt&&/^(?:CP|TP)\s*[.\d]|^\d+\.\d+\s+[A-Za-z]/i.test(b.plain)))current.blocks.push(b);
 }
 const questions:ImportedQuestion[]=[];const bySection=new Map<Kind,ImportedQuestion[]>(),blueprintUsed=new Map<string,number>();
 for(const group of sections){
  if(group.type==='MENJODOHKAN'){
   for(const table of group.blocks.filter(b=>b.table)){
    const left:string[]=[],right:string[]=[];
    for(const row of elements(table.node).filter(e=>e.localName==='tr')){const cells=elements(row).filter(e=>e.localName==='tc');if(cells.length<3)continue;const texts=await Promise.all(cells.map(async c=>clean(await read(c))));if(!/^\d+\.?$/.test(texts[0]))continue;left.push(texts[1]);right.push(texts.at(-1)!);}
    if(!left.length)continue;
    const all=[...left,...right].join('\n'),ids=[...new Set(Array.from(all.matchAll(/\[\[asset:(\d+)\]\]/g),m=>Number(m[1])))],replace=(t:string)=>t.replace(/\[\[asset:(\d+)\]\]/g,(_,n)=>'[[image:'+ids.indexOf(Number(n))+']]');
    questions.push({id:crypto.randomUUID(),type:'MENJODOHKAN',text:'Jodohkan pernyataan dengan gambar atau jawaban yang sesuai.',options:[],left:left.map(replace),right:right.map(replace),images:ids.map(n=>assets[n]),key:'',points:10,mode,sourceLabel:'Menjodohkan '+left.length+' pasangan',importSource:replace(table.text),importReviewed:false,importIssues:['Kolom jawaban belum merupakan kunci pasangan. Tentukan pasangan benar sesuai dokumen.']});
   }continue;
  }
  const chunks:Block[][]=[];let chunk:Block[]|null=null,pending:Block[]=[];
  let shared:{from:number;to:number;blocks:Block[];id:string}|null=null,collectShared=false;
  const sharedMap=new Map<number,{blocks:Block[];id:string}>();
  const candidates=group.blocks.filter(autoNumber),freq=new Map<string,number>();for(const b of candidates)freq.set(b.listId,(freq.get(b.listId)||0)+1);
  const mainList=[...freq].sort((a,b)=>b[1]-a[1])[0]?.[0];
  let inAnswer=false;
  const flushShared=()=>{if(shared){for(let n=shared.from;n<=shared.to&&n<=500;n++)sharedMap.set(n,{blocks:[...shared.blocks],id:shared.id});}collectShared=false;};
  for(let bi=0;bi<group.blocks.length;bi++){
   const b=group.blocks[bi];
   const range=b.plain.match(/(?:no\.?|numbers?|questions?|nomor|soal)\s*(\d+)(?:\s*(?:and|[-–—]|to|sampai|dan)\s*(\d+))?/i);
   const sharedCue=!autoNumber(b)&&(/^(?:(?:this|the)\s+(?:text|data)\s+for|text\s+(?:\d+|for)|read\b.*(?:text|passage|following|excerpt)|(?:direction:.*)?answer.*based on the text|bacalah\b|perhatikan\s+(?:teks|bacaan)|(?:teks|bacaan)\s+(?:berikut|untuk))/i.test(b.plain));
   if(sharedCue){
    if(range&&Number(range[1])!==chunks.length+1)warnings.push('Ada rujukan nomor bacaan yang berbeda dari urutan soal. Bacaan ditempatkan pada soal sesudahnya; periksa nomor rujukan di teks.');
    if(collectShared&&shared&&!range){shared.blocks.push(b);continue;}
    shared={from:chunks.length+1,to:range?chunks.length+1+Math.max(0,Number(range[2]||range[1])-Number(range[1])):500,blocks:[],id:Array.from(crypto.getRandomValues(new Uint8Array(18)),n=>n.toString(16).padStart(2,'0')).join('')};collectShared=true;
    if(/read\b.*[.!]\s+\S/i.test(b.plain))shared.blocks.push(b);
    continue;
   }
   const manual=manualNumber(b),next=group.blocks.slice(bi+1,bi+9),hasOptions=(group.type==='PG'||group.type==='PG_KOMPLEKS')&&(chunk?.some(optionBlock)||chunk?.some(x=>[...x.text.matchAll(optionPattern)].length>=2));
   const auto=autoNumber(b)&&((!inAnswer&&b.listId===mainList&&(!chunk||group.type==='URAIAN'||group.type==='ISIAN'||autoNumber(chunk[0])&&chunk[0].listId===b.listId))||!chunk||hasOptions||answerLabel.test(next[0]?.plain||''));
   const numericStart=!!(manual&&Number(manual[1])>0&&(!chunk||hasOptions||group.type==='URAIAN'||group.type==='ISIAN'));
   // Some manuscripts omit the number entirely. Recognize a fresh A–E list after a completed question.
   const following:Block[]=[];for(const item of group.blocks.slice(bi+1,bi+30)){if(autoNumber(item)||manualNumber(item)||section(item.plain))break;following.push(item);}
   const startsNewOptions=following.some(x=>['lowerLetter','upperLetter'].includes(x.fmt)&&x.number===1||/^\s*\*?[aA][.)]\s*/.test(x.plain));
   const completeOptions=(chunk?.filter(optionBlock).length||0)>=4||chunk?.some(x=>[...x.text.matchAll(optionPattern)].length>=4);
   const immediateOption=following.find(x=>x.text||['lowerLetter','upperLetter'].includes(x.fmt));
   const questionWithoutNumber=!!immediateOption&&(['lowerLetter','upperLetter'].includes(immediateOption.fmt)&&immediateOption.number===1||/^\s*\*?[aA][.)]\s*/.test(immediateOption.plain));
   const newCard=!!b.cardNumber&&!!chunk&&chunk.some(x=>x.cardNumber&&x.cardNumber!==b.cardNumber);
   const unnumbered=(group.type==='PG'||group.type==='PG_KOMPLEKS')&&(!!completeOptions||collectShared||!chunk||newCard)&&!autoNumber(b)&&!manual&&!optionBlock(b)&&b.plain.length>15&&startsNewOptions&&(!collectShared||questionWithoutNumber);
   if(unnumbered)b.inferred=true;
   const begins=auto||numericStart||unnumbered;
   if(begins&&(subject==='Bahasa Inggris'||group.type==='ISIAN')&&!chunks.length&&pending.length){shared={from:1,to:500,blocks:pending,id:crypto.randomUUID()};pending=[];collectShared=true;}
   if(begins){if(collectShared)flushShared();chunk=[...pending,b];pending=[];chunks.push(chunk);inAnswer=false;continue;}
   if(collectShared&&shared){shared.blocks.push(b);continue;}
   if(!chunk){if(!/^(?:\(?Pilih|Questions?:|CP\b|TP\b)/i.test(b.plain))pending.push(b);continue;}
   if(answerLabel.test(b.plain))inAnswer=true;
   if(subject==='Bahasa Inggris'&&!inAnswer&&hasOptions&&!autoNumber(b)&&!manual&&!b.boxes){
    const optionCount=chunk.filter(optionBlock).length;
    if(optionCount>=5&&!['lowerLetter','upperLetter'].includes(b.fmt)&&!/^[A-F][.)]\s*/i.test(b.plain)){
     shared={from:chunks.length+1,to:500,blocks:[b],id:crypto.randomUUID()};collectShared=true;continue;
    }
   }
   chunk.push(b);
  }
  if(pending.length&&chunk)chunk.push(...pending);
  if(!chunks.length){if(group.blocks.length)warnings.push('Bagian '+labels[group.type]+' tidak memiliki nomor soal yang dikenali. Periksa kelengkapan dokumen.');continue;}
  for(let index=0;index<chunks.length;index++){
   const source=chunks[index],first=source.find(b=>b.plain)||source[0];const q:ImportedQuestion={id:Array.from(crypto.getRandomValues(new Uint8Array(18)),n=>n.toString(16).padStart(2,'0')).join(''),type:group.type,text:'',options:[],key:'',points:10,mode,images:[],scope:'',keywords:'',left:[],right:[],sourceLabel:labels[group.type]+' '+(first.cardNumber||manualNumber(first)?.[1]||(autoNumber(first)?first.number:index+1)),importIssues:[],importReviewed:false,importSource:source.map(b=>b.text).join('\n')};
   const blueprint=source.find(b=>b.blueprint)?.blueprint;
   if(blueprint){const position=blueprintUsed.get(blueprint.id)||0;blueprintUsed.set(blueprint.id,position+1);if(blueprint.numbers[position])q.sourceLabel=labels[group.type]+' '+blueprint.numbers[position];if(blueprint.points.length===blueprint.numbers.length&&blueprint.points[position]>0)q.points=blueprint.points[position];}
   if(source.some(b=>b.inferred))q.importIssues.push('Nomor soal tidak tertulis. Soal dipisahkan berdasarkan awal pilihan A; cocokkan nomor dengan Word.');
   const firstLetter=source.findIndex((b,i)=>i>0&&(['lowerLetter','upperLetter'].includes(b.fmt)||/^\s*\*?[a-f][.)]\s*/i.test(b.plain)));
   const rawOptions=new Map<number,string>(),markedOptions=new Set<number>(),explicitOptions=new Set<number>(),stem:string[]=[];let optionIndex=-1,seenFirst=false,answerMode=false;const answer:string[]=[];
   for(const b of source){let t=b.text;
    if(b===first){seenFirst=true;if(manualNumber(b))t=t.replace(/^\s*(?:Soal\s+)?\d{1,3}(?:\s*[.),]\s*|\s+)/i,'');}
    if(!seenFirst){stem.push(t);continue;}
    if(answerLabel.test(b.plain)){answerMode=true;t=t.replace(answerLabel,'').trim();if(t)answer.push(t);continue;}
    if(answerMode){answer.push(t);continue;}
    if(/^[.\s…_]+$/.test(b.plain)&&!b.images.length)continue;
    if(group.type==='PG'||group.type==='PG_KOMPLEKS'){
     const automatic=['lowerLetter','upperLetter'].includes(b.fmt)&&b!==first;
     if(automatic)t=t.replace(/^\s*[A-F][.)]\s*/,'');if(automatic)t=String.fromCharCode(97+rawOptions.size)+'. '+t;
     let matches=[...t.matchAll(optionPattern)];if(matches.length===1&&t.slice(0,matches[0].index).trim())matches=[];
     if(matches.length){
      const prefix=t.slice(0,matches[0].index).trim();if(prefix)stem.push(prefix);
      for(let m=0;m<matches.length;m++){
       const item=matches[m],letter=item[2].toLowerCase().charCodeAt(0)-97;const content=t.slice(item.index!+item[0].length,matches[m+1]?.index??t.length).trim();rawOptions.set(letter,[rawOptions.get(letter),content].filter(Boolean).join('\n'));optionIndex=letter;
       if(item[1]&&keyMarker!=='none')explicitOptions.add(letter);
       if(b.marked){const marked=comparable(b.markedText),candidate=comparable(content);if(keyMarker==='highlight'&&matches.length===1||['auto','bold'].includes(keyMarker)&&candidate&&marked&&(marked.includes(candidate)||candidate.includes(marked)&&marked.length>=candidate.length*.65))markedOptions.add(letter);else if(matches.length>1&&keyMarker==='highlight')q.importIssues.push('Beberapa opsi dalam satu baris berpenanda; tentukan kunci manual.');}
      }
     }else if(b.fmt==='bullet'&&firstLetter>=0&&source.indexOf(b)<firstLetter){stem.push(t);
     }else if(b!==first&&(b.fmt==='bullet'||/^[☐□√✓✔]/.test(b.plain))){optionIndex=rawOptions.size;rawOptions.set(optionIndex,t.replace(/^[☐□√✓✔]\s*/,''));q.type='PG_KOMPLEKS';if(b.marked&&(keyMarker==='highlight'||comparable(b.markedText).length>=comparable(t).length*.65))markedOptions.add(optionIndex);}
     else if(group.type==='PG_KOMPLEKS'&&b!==first&&!source.some(optionBlock)){optionIndex=rawOptions.size;rawOptions.set(optionIndex,t);if(b.marked&&(keyMarker==='highlight'||comparable(b.markedText).length>=comparable(t).length*.65))markedOptions.add(optionIndex);}
     else if(optionIndex>=0)rawOptions.set(optionIndex,(rawOptions.get(optionIndex)||'')+'\n'+t);
     else stem.push(autoNumber(b)&&b!==first?b.number+'. '+t:t);
    }else stem.push(autoNumber(b)&&b!==first?b.number+'. '+t:t);
   }
   if(group.type==='PG'||group.type==='PG_KOMPLEKS'){
    const letters=[...rawOptions.keys()].sort((a,b)=>a-b);q.options=letters.map(k=>rawOptions.get(k)!);
    if(letters.some((l,i)=>l!==i)||letters.length<2)q.importIssues.push('Pilihan belum lengkap atau urutan huruf tidak berurutan. Lengkapi sesuai Word.');
   }
   q.text=clean(stem.join('\n'));if(group.type==='PG_KOMPLEKS'&&group.blocks.some(b=>/pilih satu kombinasi/i.test(b.plain)))q.type='PG';
   if(/pilih\s+(?:[2-5]|dua|tiga|empat|semua)|select\s+(?:all|two|three)|lebih\s+dari\s+(?:satu|1)|pilih\s+jawaban\s+lebih/i.test(q.text))q.type='PG_KOMPLEKS';
   const inlineKey=q.text.match(/\(\s*(?:JAWABAN|KUNCI)\s*:?\s*([A-F](?:\s*[, dan]+\s*[A-F])*)\s*\)/i);
   if(inlineKey&&!q.options.length&&source.some(b=>b.images.length)){q.options=['A','B','C','D','E'].map(l=>'Pilihan '+l+' pada gambar');q.importIssues=q.importIssues.filter(s=>!s.startsWith('Pilihan belum'));q.importIssues.push('Pilihan berada dalam gambar gabungan. Cocokkan tombol A–E dengan label pada gambar.');}if(inlineKey){q.text=q.text.replace(inlineKey[0],'').trim();if(keyMarker!=='none')for(const l of inlineKey[1].toUpperCase().match(/[A-F]/g)||[])explicitOptions.add(l.charCodeAt(0)-65);}
   if(keyMarker!=='none'&&answer.length)q.key=clean(answer.join('\n'));
   if(first.cardKey&&keyMarker!=='none'){for(const l of first.cardKey.toUpperCase().match(/[A-F]/g)||[])explicitOptions.add(l.charCodeAt(0)-65);}
   const chosen=explicitOptions.size?explicitOptions:markedOptions;
   if(chosen.size){if(q.type==='PG'&&chosen.size!==1)q.importIssues.push('Lebih dari satu opsi ditandai pada PG. Pilih satu kunci manual.');else {q.key=[...chosen].sort((a,b)=>a-b).join(',');q.importIssues.push('Kunci dari penanda Word: pastikan penanda memang menunjukkan jawaban benar.');}}
   const sharedEntry=sharedMap.get(index+1),sharedBlocks=sharedEntry?.blocks||[];
   if(sharedBlocks.length){q.stimulusId=sharedEntry!.id;q.stimulus=clean(sharedBlocks.map(b=>b.text).join('\n'));q.importIssues.push('Verifikasi bacaan dan pertanyaan yang terkait.');}
   if(sharedBlocks.length)q.importSource=sharedBlocks.map(b=>b.text).join('\n')+'\n'+q.importSource;
   if(subject==='Matematika'&&source.some(b=>b.boxes||/^\s*[\d\s]+$/.test(b.plain)||/\t.*\d.*\t/.test(b.text)))q.importIssues.push('Pecahan/kolom matematika dibuat dengan tata letak manual. Periksa pembilang, penyebut, dan pembagian opsi; ubah ke rumus bila perlu.');
   if(source.some(b=>b.boxes))q.importIssues.push('Teks dalam kotak mengambang dibaca sebagai teks; periksa letaknya terhadap soal.');
   if(q.text.includes('[PERIKSA')||q.options.some(v=>v.includes('[PERIKSA')))q.importIssues.push('Ada gambar atau rumus yang harus diperbaiki sebelum disimpan.');
   // Floating drawings may be anchored before their printed choice label in Word.
   // Repair only the unambiguous one-image-per-choice layout; keep a review note.
   const sourceAssets=[...new Set(Array.from(source.map(b=>b.text).join('\n').matchAll(/\[\[asset:(\d+)\]\]/g),m=>Number(m[1])))];
   if(q.options.length>=2&&q.options.some(o=>!o.trim())&&sourceAssets.length===q.options.length&&q.options.every(o=>!o.replace(/\[\[asset:\d+\]\]/g,'').trim())){
    q.options=sourceAssets.map(n=>'[[asset:'+n+']]');q.text=q.text.replace(/\[\[asset:\d+\]\]/g,'').trim();
    q.importIssues.push('Gambar opsi mengambang dipasangkan A–'+String.fromCharCode(64+q.options.length)+' menurut urutan dokumen. Cocokkan dengan tata letak Word.');
   }
   // Use one per-question image dictionary for stems, options and shared passages.
   const ids=[...new Set(Array.from([q.stimulus||'',q.text,...q.options,q.importSource].join('\n').matchAll(/\[\[asset:(\d+)\]\]/g),m=>Number(m[1])))];
   const replace=(s:string)=>s.replace(/\[\[asset:(\d+)\]\]/g,(_,n)=>'[[image:'+ids.indexOf(Number(n))+']]');q.images=ids.map(n=>assets[n]);q.text=replace(q.text);if(q.stimulus)q.stimulus=replace(q.stimulus);q.options=q.options.map(replace);q.key=replace(q.key);q.importSource=replace(q.importSource);
   if(ids.length>8)q.importIssues.push('Lebih dari 8 gambar dalam satu soal. Kurangi gambar sebelum menyimpan.');
   questions.push(q);bySection.set(group.type,[...(bySection.get(group.type)||[]),q]);
  }
 }
 // Read answer tables only after the explicit answer-key heading. Never append them to stems.
 let keyType:Kind|undefined=section(blocks[keyStart]?.plain.replace(/^KUNCI\s*JAWABAN\s*/i,'' )||''),points=10,lastNumber=0,inferredEssay=false;const keySeen=new Set<string>();
 for(const block of keyMarker==='none'?[]:blocks.slice(keyStart+1)){
  const type=section(block.plain);if(type){keyType=type;lastNumber=0;points=Number(block.plain.match(/(?:soal|bobot)\s*(\d+(?:[.,]\d+)?)\s*(?:point|poin)/i)?.[1]||10);}
  if(!block.table)continue;
  for(const row of elements(block.node).filter(e=>e.localName==='tr')){const cells=elements(row).filter(e=>e.localName==='tc');const texts=await Promise.all(cells.map(c=>read(c).then(clean)));const rowType=section(texts.join(' '));if(rowType){keyType=rowType;lastNumber=0;continue;}const number=Number(texts[0]?.match(/^\s*(\d+)\s*\.?\s*$/)?.[1]);if(!number||!keyType)continue;
   let inferred=false;if(keyType==='ISIAN'&&number===1&&lastNumber>1&&bySection.has('URAIAN')){keyType='URAIAN';inferred=true;inferredEssay=true;}lastNumber=number;
   const q=bySection.get(keyType)?.[number-1];if(!q){warnings.push('Kunci '+labels[keyType]+' '+number+' tidak memiliki soal yang sesuai.');continue;}if(keySeen.has(keyType+number)){q.importIssues.push('Kunci ganda ditemukan; pilih kunci yang benar secara manual.');q.key='';continue;}keySeen.add(keyType+number);q.points=points;
   if(inferred||inferredEssay&&keyType==='URAIAN')q.importIssues.push('Judul bagian kunci uraian tidak tertulis. Periksa pasangan kunci ini.');
   if(keyType==='PG'){
    const marked=cells.slice(1).map((c,i)=>({i,marked:descendants(c,'shd').some(x=>['FFFF00','92D050','00FF00','00B050'].includes(value(x,'fill').toUpperCase()))||descendants(c,'highlight').some(x=>['yellow','green'].includes(value(x)))})).filter(x=>x.marked);
    if(marked.length===1&&marked[0].i<q.options.length)q.key=String(marked[0].i);else if(cells.length===2&&/^[A-F]$/i.test(texts[1]))q.key=String(texts[1].toUpperCase().charCodeAt(0)-65);else q.importIssues.push('Kunci PG tidak memiliki satu penanda warna/huruf yang jelas. Pilih kunci manual.');
   }else if(keyType==='PG_KOMPLEKS'){
    if(cells.length===q.options.length+1){q.key=texts.slice(1).flatMap((t,i)=>/[√✓✔x]/i.test(t)?[String(i)]:[]).join(',');}
    else{const answerLines=texts[1]?.split('\n').map(clean).filter(Boolean)||[];const selected:number[]=[];let unmatched=false;for(const line of answerLines){const matches=q.options.map((o,i)=>({i,t:comparable(o)})).filter(o=>o.t===comparable(line));if(matches.length===1)selected.push(matches[0].i);else unmatched=true;}if(!unmatched&&selected.length)q.key=[...new Set(selected)].sort((a,b)=>a-b).join(',');else q.importIssues.push('Teks kunci checkbox tidak cocok persis dengan opsi. Tentukan pilihan benar manual.');}
   }else q.key=[texts[1],texts[2]&&texts[2]!=='-'?'Pedoman penilaian:\n'+texts[2]:''].filter(Boolean).join('\n\n');
  }
 }
 // Numbered essay answers outside tables (question is repeated, then Jawaban:).
 if(keyMarker!=='none'&&keyStart<blocks.length){
  let target:ImportedQuestion|undefined,answerMode=false;const parts:string[]=[];
  const flush=()=>{if(target&&parts.length){target.key=clean(parts.join('\n'));}parts.length=0;};
  for(const b of blocks.slice(keyStart+1)){
   if(/^Mengetahui/i.test(b.plain)){flush();break;}
   const m=manualNumber(b);
   if(m&&bySection.get('URAIAN')?.[Number(m[1])-1]&&/\(skor\s*:?\s*\d+\)/i.test(b.plain)){flush();target=bySection.get('URAIAN')![Number(m[1])-1];answerMode=false;continue;}
   if(answerLabel.test(b.plain)&&target){answerMode=true;const t=b.text.replace(answerLabel,'').trim();if(t)parts.push(t);continue;}
   if(answerMode)parts.push(autoNumber(b)?b.number+'. '+b.text:b.text);
  }flush();
 }
 for(const q of questions){if(!q.key)q.importIssues.push('Kunci / pedoman jawaban belum tersedia. Lengkapi atau setujui untuk koreksi manual.');q.importIssues=[...new Set(q.importIssues)];}
 if(prepared.unsupported)warnings.push(prepared.unsupported+' elemen rumus belum didukung; cari penanda PERIKSA RUMUS.');if(questions.some(q=>!q.key))warnings.push('Sebagian soal belum memiliki kunci yang dapat dipastikan dari dokumen. Lengkapi atau setujui koreksi manual.');
 if(questions.length>500)throw Error('Maksimal 500 soal per impor. Pisahkan dokumen.');
 if(cardCount&&questions.length!==cardCount)warnings.push('Terdapat '+cardCount+' kartu, tetapi '+questions.length+' soal terpisah. Cocokkan isi semua kartu sebelum menyimpan.');
 if(!questions.length)throw Error('Tidak ada soal bernomor yang dapat dipisahkan. Periksa penomoran Word atau gunakan template tabel.');
 return {sourceText:blocks.map(b=>b.text).join('\n'),questions,subject,passageCount:new Set(questions.map(q=>q.stimulusId).filter(Boolean)).size,warnings:[...new Set(warnings)],counts:Object.fromEntries([...new Set(questions.map(q=>q.type))].map(kind=>[kind,questions.filter(q=>q.type===kind).length])),format:documentFormat};
}

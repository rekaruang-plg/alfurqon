import JSZip from 'jszip';
import {prepareWord,shrinkImage} from './word-import';
import type {Question} from './model';
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main',R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const elements=(e:Node)=>Array.from(e.childNodes).filter(n=>n.nodeType===1) as Element[];
const descendants=(e:Element|Document,name:string)=>Array.from(e.getElementsByTagNameNS('*',name));
const value=(e:Element|undefined,name='val')=>e?.getAttributeNS(W,name)||e?.getAttribute('w:'+name)||'';
const clean=(s:string)=>s.replace(/\u00a0/g,' ').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
const comparable=(s:string)=>s.normalize('NFKC').replace(/[\u064B-\u065F\u0670\u0640\s\p{P}]/gu,'').toLowerCase();
type Kind='PG'|'PG_KOMPLEKS'|'ISIAN'|'URAIAN';
export type ImportedQuestion=Question&{sourceLabel:string;importIssues:string[];importReviewed:boolean;importSource:string};
type Block={node:Element;text:string;plain:string;fmt:string;number:number;pattern:string;images:string[];boxes:boolean;table:boolean;marked:boolean};
function section(text:string):Kind|undefined{const t=text.trim().toUpperCase().replace(/\s+/g,' ').replace(/^PART\s+[IVX]+[.:]?\s*/, '');if(/^(?:[A-DIVX]+[.)]\s*)?(?:PILIHAN GANDA KOMPLEK[S]?|COMPLEX MULTIPLICATION|COMPLEX MULTIPLE CHOICE|MCMA)/.test(t))return 'PG_KOMPLEKS';if(/^(?:[A-DIVX]+[.)]\s*)?(?:PILIHAN GANDA|PILHAN GANDA|MULTIPLE CHOICE)/.test(t))return 'PG';if(/^(?:[A-DIVX]+[.)]\s*)?(?:ISIAN(?: SINGKAT)?|SHORT QUESTION|SHORT ANSWER)/.test(t))return 'ISIAN';if(/^(?:[A-DIVX]+[.)]\s*)?(?:ESSAI|ESSAYS?|ESAI|URAIAN)(?:\s*(?:QUESTIONS?|ANSWER|SOAL|BOBOT|\d).*)?$/.test(t))return 'URAIAN';}
const labels:Record<Kind,string>={PG:'PG',PG_KOMPLEKS:'PG kompleks',ISIAN:'Isian',URAIAN:'Uraian'};
export async function importNaturalWord(buffer:ArrayBuffer,convertImage:(src:string)=>Promise<string>=shrinkImage,keyMarker:'table'|'bold'|'highlight'|'none'='table'){
 const prepared=await prepareWord(buffer),zip=await JSZip.loadAsync(prepared.buffer);const parse=(s:string)=>new DOMParser().parseFromString(s,'application/xml');
 const xml=parse(await zip.file('word/document.xml')!.async('string'));if(descendants(xml,'parsererror').length)throw Error('Struktur Word tidak dapat dibaca. Simpan ulang sebagai .docx.');
 const body=descendants(xml,'body')[0];if(!body)throw Error('Isi dokumen kosong.');
 const numbering=parse(await zip.file('word/numbering.xml')?.async('string')||'<numbering/>');
 const rels=parse(await zip.file('word/_rels/document.xml.rels')?.async('string')||'<Relationships/>');
 const relationships=new Map(descendants(rels,'Relationship').filter(e=>e.getAttribute('TargetMode')!=='External').map(e=>[e.getAttribute('Id'),e.getAttribute('Target')||'']));
 const counters=new Map<string,number>(),imageCache=new Map<string,string>(),assets:string[]=[],warnings:string[]=[];
 function list(p:Element){const pr=elements(p).find(e=>e.localName==='pPr'),num=pr&&descendants(pr,'numPr')[0];if(!num)return {fmt:'',number:0,pattern:''};const numId=value(descendants(num,'numId')[0]),level=value(descendants(num,'ilvl')[0])||'0';const n=descendants(numbering,'num').find(e=>value(e,'numId')===numId),abstract=value(n&&descendants(n,'abstractNumId')[0]);const a=descendants(numbering,'abstractNum').find(e=>value(e,'abstractNumId')===abstract),lvl=a&&elements(a).find(e=>e.localName==='lvl'&&value(e,'ilvl')===level);const fmt=value(lvl&&descendants(lvl,'numFmt')[0]),pattern=value(lvl&&descendants(lvl,'lvlText')[0]);const counter=numId+':'+level;let start=Number(value(lvl&&descendants(lvl,'start')[0])||1);const override=n&&elements(n).find(e=>e.localName==='lvlOverride'&&value(e,'ilvl')===level);if(override)start=Number(value(descendants(override,'startOverride')[0])||start);const number=counters.has(counter)?counters.get(counter)!+1:start;counters.set(counter,number);for(const key of counters.keys())if(key.startsWith(numId+':')&&Number(key.split(':')[1])>Number(level))counters.delete(key);return {fmt,number,pattern};}
 async function read(e:Node,drawings=true):Promise<string>{if(e.nodeType!==1)return '';const n=e as Element,name=n.localName;if(name==='Fallback')return '';if(name==='AlternateContent'){const choice=elements(n).find(c=>c.localName==='Choice')||elements(n).find(c=>c.localName==='Fallback');return choice?joinChildren(choice,drawings):'';}if(name==='t')return n.textContent||'';if(name==='tab')return '\t';if(name==='br'||name==='cr')return '\n';if(name==='del'||name.endsWith('Pr')||name==='instrText')return '';if(['drawing','pict','object'].includes(name)){
  if(!drawings)return '';const refs=[...descendants(n,'blip').map(x=>x.getAttributeNS(R,'embed')),...descendants(n,'imagedata').map(x=>x.getAttributeNS(R,'id'))].filter(Boolean) as string[];let result='';for(const ref of [...new Set(refs)]){let marker=imageCache.get(ref);if(!marker){const target=relationships.get(ref)||'';const path=target.startsWith('/')?target.slice(1):'word/'+target.replace(/^\.\//,'');const file=zip.file(path);if(!file||!/\.(png|jpe?g|gif|webp)$/i.test(path)){warnings.push('Ada gambar/objek Word yang tidak didukung. Periksa dokumen asli dan unggah gambar pengganti.');result+=' [PERIKSA GAMBAR] ';continue;}const mime=/\.png$/i.test(path)?'png':/\.gif$/i.test(path)?'gif':/\.webp$/i.test(path)?'webp':'jpeg';const src=await convertImage('data:image/'+mime+';base64,'+await file.async('base64'));marker='[[asset:'+assets.length+']]';assets.push(src);imageCache.set(ref,marker);}result+=marker;}
  const boxes=descendants(n,'txbxContent');for(const box of boxes)result+='\n'+await joinChildren(box,drawings)+'\n';return result;
 }const t=await joinChildren(n,drawings);return name==='p'?t+'\n':t;}
 async function joinChildren(e:Element,drawings:boolean){let out='';for(const c of elements(e))out+=await read(c,drawings);return out;}
 const blocks:Block[]=[];for(const node of elements(body)){if(!['p','tbl'].includes(node.localName))continue;const text=clean(await read(node));const plain=clean(await read(node,false));blocks.push({node,text,plain,...(node.localName==='p'?list(node):{fmt:'',number:0,pattern:''}),images:[...text.matchAll(/\[\[asset:(\d+)\]\]/g)].map(m=>m[1]),boxes:descendants(node,'txbxContent').length>0,table:node.localName==='tbl',marked:descendants(node,'r').filter(r=>descendants(r,'t').some(t=>t.textContent?.trim())).some(r=>keyMarker==='bold'?descendants(r,'b').some(b=>!['0','false','off'].includes(value(b))):keyMarker==='highlight'?descendants(r,'highlight').some(h=>!['none','white',''].includes(value(h)))||descendants(r,'color').some(c=>!['auto','000000','FFFFFF',''].includes(value(c))):false)});}
 const header=blocks.slice(0,20).map(b=>b.plain).join('\n');const subject=/BAHASA\s*ARAB/i.test(header)?'Bahasa Arab':/MATEMATIKA/i.test(header)?'Matematika':/BAHASA\s*INGGRIS/i.test(header)?'Bahasa Inggris':'';
 const mode=subject==='Bahasa Arab'?'ARAB':subject==='Matematika'?'MATEMATIKA':'TEKS';
 const sections:Array<{type:Kind;blocks:Block[]}>=[];let current:typeof sections[number]|undefined,keyStart=blocks.length;
 for(let i=0;i<blocks.length;i++){const b=blocks[i];if(/KUNCI\s*JAWABAN/i.test(b.plain)){keyStart=i;break;}const type=section(b.plain);if(type){current={type,blocks:[]};sections.push(current);continue;}if(!current)continue;if(/^(ALHAMDULILLAH|معكم النجاح|ASESMEN SUMATIF|YAYASAN ISLAM|SEKOLAH DASAR|Mengetahui)/i.test(b.plain)){current=undefined;continue;}if(b.text)current.blocks.push(b);}
 if(!sections.length){sections.push({type:'PG',blocks:blocks.slice(0,keyStart)});warnings.push('Judul jenis soal tidak ditemukan. Jenis awal PG; periksa dan ubah jenis setiap soal.');}
 const questions:ImportedQuestion[]=[];const bySection=new Map<Kind,ImportedQuestion[]>();
 for(const group of sections){const autos=group.blocks.filter(b=>b.fmt==='decimal'&&/[.)]/.test(b.pattern)&&b.plain.replace(/\s/g,'').length>8);let chunks:Block[][]=[],chunk:Block[]|null=null,pending:Block[]=[];let shared:{from:number;to:number;blocks:Block[];id:string}|null=null,collectShared=false;
  const sharedMap=new Map<number,{blocks:Block[];id:string}>();
  for(const b of group.blocks){const sharedCue=!(b.fmt==='decimal'&&/[.)]/.test(b.pattern))&&/^(?:(?:this|the)\s+(?:text|data)\s+for|read\b.*(?:text|passage)|(?:direction:.*)?answer.*based on the text|bacalah\b|perhatikan\s+(?:teks|bacaan)|(?:teks|bacaan)\s+(?:berikut|untuk))/i.test(b.plain);
   if(sharedCue){const range=b.plain.match(/(?:no\.?|number|questions?|nomor|soal)\s*(\d+)\s*(?:and|[-–]|to|sampai|dan)\s*(\d+)/i);shared={from:range?Number(range[1]):chunks.length+1,to:range?Number(range[2]):500,blocks:[],id:Array.from(crypto.getRandomValues(new Uint8Array(18)),n=>n.toString(16).padStart(2,'0')).join('')};collectShared=true;continue;}
   const auto=b.fmt==='decimal'&&/[.)]/.test(b.pattern)&&b.plain.replace(/\s/g,'').length>8;
   const manual=autos.length<2&&b.plain.match(/^\s*(\d+)\s*[.)]\s*(\S[\s\S]*)/);
   const begins=auto||!!(manual&&Number(manual[1])===chunks.length+1&&manual[2].length>1);
   if(begins){if(collectShared&&shared){for(let n=shared.from;n<=shared.to&&n<=500;n++)sharedMap.set(n,{blocks:[...shared.blocks],id:shared.id});collectShared=false;}chunk=[...pending,b];pending=[];chunks.push(chunk);continue;}
   if(collectShared&&shared){shared.blocks.push(b);continue;}
   if(!chunk){warnings.push('Teks sebelum nomor soal perlu diperiksa: '+b.plain.slice(0,90));continue;}
   // Floating formula text boxes can precede the numbered paragraph visually.
   if(!b.plain&&b.boxes&&group.type==='PG'){pending.push(b);continue;}
   chunk.push(b);
  }
  if(pending.length&&chunk)chunk.push(...pending);
  if(!chunks.length){warnings.push('Bagian '+labels[group.type]+' tidak memiliki nomor soal yang dikenali. Periksa kelengkapan dokumen.');continue;}
  for(let index=0;index<chunks.length;index++){
   const source=chunks[index],first=source.find(b=>b.plain)||source[0];const q:ImportedQuestion={id:Array.from(crypto.getRandomValues(new Uint8Array(18)),n=>n.toString(16).padStart(2,'0')).join(''),type:group.type,text:'',options:[],key:'',points:10,mode,images:[],scope:'',keywords:'',left:[],right:[],sourceLabel:labels[group.type]+' '+(index+1),importIssues:[],importReviewed:false,importSource:source.map(b=>b.text).join('\n')};
   const rawOptions=new Map<number,string>(),markedOptions=new Set<number>(),stem:string[]=[];let optionIndex=-1,seenFirst=false;
   for(const b of source){let t=b.text;if(b===first){seenFirst=true;if(autos.length<2)t=t.replace(/^\s*\d+\s*[.)]\s*/,'');stem.push(t);continue;}if(!seenFirst){stem.push(t);continue;}if(/^Jawab\s*:/i.test(b.plain)||/^[.\s…_]+$/.test(b.plain)&&!b.images.length)continue;
    if(group.type==='PG'){
     const automatic=['lowerLetter','upperLetter'].includes(b.fmt);if(automatic)t=String.fromCharCode(96+b.number)+'. '+t;
     const matches=[...t.matchAll(/(?:^|[\t\n ]|(?<=\d))([a-f])[.)]\s*/gi)];
     if(matches.length){for(let m=0;m<matches.length;m++){const item=matches[m],letter=item[1].toLowerCase().charCodeAt(0)-97;const content=t.slice(item.index!+item[0].length,matches[m+1]?.index??t.length).trim();rawOptions.set(letter,[rawOptions.get(letter),content].filter(Boolean).join('\n'));optionIndex=letter;if(b.marked){if(matches.length===1)markedOptions.add(letter);else q.importIssues.push('Beberapa opsi dalam satu baris berpenanda; tentukan kunci manual.');}}}
     else if(optionIndex>=0){rawOptions.set(optionIndex,(rawOptions.get(optionIndex)||'')+'\n'+t);if(/\d/.test(t))q.importIssues.push('Susunan baris/pecahan pada pilihan perlu dibandingkan dengan Word.');}
     else stem.push(t);
    }else if(group.type==='PG_KOMPLEKS'){if(b.plain||b.images.length){if(b.marked)markedOptions.add(q.options.length);q.options.push(t.replace(/^\s*(?:[☐□√✓✔]|[a-fA-F][.)])\s*/,''));}}
    else stem.push(t);
   }
   if(group.type==='PG'){const letters=[...rawOptions.keys()].sort((a,b)=>a-b);q.options=letters.map(k=>rawOptions.get(k)!);if(letters.some((l,i)=>l!==i)||letters.length<2)q.importIssues.push('Pilihan belum lengkap atau urutan huruf tidak berurutan. Lengkapi sesuai Word.');}
   if(group.type==='PG_KOMPLEKS'&&source.some(b=>/\t| {4,}/.test(b.text)))q.importIssues.push('Pilihan checkbox ditata dalam kolom. Pisahkan setiap pilihan dan cocokkan urutannya dengan Word.');
   if(group.type==='PG_KOMPLEKS'&&q.options.length<2)q.importIssues.push('Pisahkan dan lengkapi pilihan checkbox sesuai dokumen asli.');
   const sharedEntry=sharedMap.get(index+1),sharedBlocks=sharedEntry?.blocks||[];q.text=clean(stem.join('\n'));if(sharedBlocks.length){q.stimulusId=sharedEntry!.id;q.stimulus=clean(sharedBlocks.map(b=>b.text).join('\n'));q.importIssues.push('Verifikasi bacaan dan pertanyaan yang terkait.');}if(['bold','highlight'].includes(keyMarker)&&markedOptions.size){if(group.type==='PG'&&markedOptions.size!==1)q.importIssues.push('Lebih dari satu opsi ditandai pada PG. Pilih satu kunci manual.');else {q.key=[...markedOptions].sort((a,b)=>a-b).join(',');q.importIssues.push('Kunci dari format teks: pastikan penanda memang menunjukkan jawaban benar.');}}
   if(sharedBlocks.length)q.importSource=sharedBlocks.map(b=>b.text).join('\n')+'\n'+q.importSource;
   if(subject==='Matematika'&&source.some(b=>b.boxes||/^\s*[\d\s]+$/.test(b.plain)||/\t.*\d.*\t/.test(b.text)))q.importIssues.push('Pecahan/kolom matematika dibuat dengan tata letak manual. Periksa pembilang, penyebut, dan pembagian opsi; ubah ke rumus bila perlu.');
   if(source.some(b=>b.boxes))q.importIssues.push('Teks dalam kotak mengambang dibaca sebagai teks; periksa letaknya terhadap soal.');
   if(q.text.includes('[PERIKSA')||q.options.some(v=>v.includes('[PERIKSA')))q.importIssues.push('Ada gambar atau rumus yang harus diperbaiki sebelum disimpan.');
   // Use one per-question image dictionary for stems, options and shared passages.
   const ids=[...new Set(Array.from([q.stimulus||'',q.text,...q.options,q.importSource].join('\n').matchAll(/\[\[asset:(\d+)\]\]/g),m=>Number(m[1])))];
   const replace=(s:string)=>s.replace(/\[\[asset:(\d+)\]\]/g,(_,n)=>'[[image:'+ids.indexOf(Number(n))+']]');q.images=ids.map(n=>assets[n]);q.text=replace(q.text);if(q.stimulus)q.stimulus=replace(q.stimulus);q.options=q.options.map(replace);q.importSource=replace(q.importSource);
   if(ids.length>8)q.importIssues.push('Lebih dari 8 gambar dalam satu soal. Kurangi gambar sebelum menyimpan.');
   questions.push(q);bySection.set(group.type,[...(bySection.get(group.type)||[]),q]);
  }
 }
 // Read answer tables only after the explicit answer-key heading. Never append them to stems.
 let keyType:Kind|undefined,points=10,lastNumber=0,inferredEssay=false;const keySeen=new Set<string>();
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
 for(const q of questions){if(!q.key)q.importIssues.push('Kunci / pedoman jawaban belum tersedia. Lengkapi sebelum menyimpan paket.');q.importIssues=[...new Set(q.importIssues)];}
 if(prepared.unsupported)warnings.push(prepared.unsupported+' elemen rumus belum didukung; cari penanda PERIKSA RUMUS.');if(keyStart===blocks.length)warnings.push(keyMarker==='table'?'Halaman kunci tidak ditemukan; lengkapi kunci manual.':'Kunci dari format teks perlu diverifikasi; bagian tanpa kunci diisi manual.');
 if(questions.length>500)throw Error('Maksimal 500 soal per impor. Pisahkan dokumen.');
 if(!questions.length)throw Error('Tidak ada soal bernomor yang dapat dipisahkan. Periksa penomoran Word atau gunakan template tabel.');
 return {sourceText:blocks.map(b=>b.text).join('\n'),questions,subject,passageCount:new Set(questions.map(q=>q.stimulusId).filter(Boolean)).size,warnings:[...new Set(warnings)],counts:Object.fromEntries([...bySection].map(([kind,qs])=>[kind,qs.length])),format:'Word sekolah'};
}

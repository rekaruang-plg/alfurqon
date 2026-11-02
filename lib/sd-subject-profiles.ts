import {questionTypeLabels} from './question-settings';
export type Presentation={id:string;label:string;kind:string;hint:string};
const variants:Record<string,Presentation>={
 pg:{id:'pg',label:'Pilihan ganda · teks langsung',kind:'PG',hint:'Tuliskan pertanyaan dan pilihan jawaban. Pilih satu kunci.'},
 pg_image:{id:'pg_image',label:'Pilihan ganda · gambar',kind:'PG',hint:'Gunakan Tambah gambar pada pertanyaan atau pilihan jawaban, lalu periksa pratinjau.'},
 pg_passage:{id:'pg_passage',label:'Pilihan ganda · bacaan / tabel bersama',kind:'PG',hint:'Gunakan Kelompok bacaan untuk menghubungkan beberapa soal. Tabel dapat dilampirkan sebagai gambar pada bacaan agar bentuknya tetap terbaca.'},
 mcma:{id:'mcma',label:'Pilihan ganda kompleks · beberapa jawaban benar',kind:'PG_KOMPLEKS',hint:'Siswa dapat mencentang lebih dari satu jawaban. Tandai semua pilihan yang benar sebagai kunci.'},
 mcma_data:{id:'mcma_data',label:'Pilihan ganda kompleks · gambar / data / pecahan',kind:'PG_KOMPLEKS',hint:'Masukkan gambar/data pada pertanyaan, gunakan tombol rumus bila perlu, lalu tandai semua jawaban benar.'},
 true_false:{id:'true_false',label:'Benar / Salah · pernyataan dari bacaan',kind:'BENAR_SALAH',hint:'Buat satu soal untuk setiap baris pernyataan Benar/Salah. Hubungkan bacaan yang sama melalui Kelompok bacaan; setiap pernyataan mendapat kunci dan poin sendiri.'},
 short:{id:'short',label:'Isian singkat',kind:'ISIAN',hint:'Tuliskan pertanyaan singkat dan jawaban acuan. Guru tetap memeriksa jawaban siswa.'},
 essay:{id:'essay',label:'Esai · jawaban langsung / terjemahan',kind:'URAIAN',hint:'Tuliskan perintah dengan jelas dan isi pedoman penilaian. Siswa menjawab dengan teks atau keyboard simbol.'},
 essay_image:{id:'essay_image',label:'Esai · gambar / diagram / perhitungan',kind:'URAIAN',hint:'Tambahkan gambar/diagram dan instruksi. Gunakan keyboard matematika atau Arab sesuai jawaban yang diperlukan.'},
 essay_passage:{id:'essay_passage',label:'Esai · bacaan bersama',kind:'URAIAN',hint:'Hubungkan pertanyaan melalui Kelompok bacaan. Urutan pertanyaan dalam satu bacaan tetap berdekatan saat diacak.'},
 essay_complete:{id:'essay_complete',label:'Esai · melengkapi teks / tabel / formulir',kind:'URAIAN',hint:'Lampirkan tabel/formulir sebagai gambar atau tulis kolom bernomor. Minta siswa menjawab tiap nomor pada kotak esai; ini bukan isian langsung di sel tabel.'}
};
const base=['PG','PG_KOMPLEKS','ISIAN','URAIAN'];
export const sdSubjectProfiles=[
 {name:'Bahasa Inggris',aliases:[],types:base,variants:['pg_passage','pg','pg_image','mcma','short','essay_image','essay','essay_passage'],mode:'TEKS'},
 {name:'TIK',aliases:['Komputer','Informatika','Teknologi Informasi dan Komunikasi'],types:base,variants:['pg','mcma','short','essay','essay_image'],mode:'TEKS'},
 {name:'Bahasa Arab',aliases:[],types:base,variants:['pg_image','pg','mcma','short','essay_complete','essay'],mode:'ARAB'},
 {name:'Pendidikan Pancasila',aliases:['PPKn','PKN'],types:base,variants:['pg','pg_image','mcma','short','essay'],mode:'TEKS'},
 {name:'PJOK',aliases:['Pendidikan Jasmani Olahraga dan Kesehatan'],types:base,variants:['pg','pg_image','mcma','short','essay'],mode:'TEKS'},
 {name:'Matematika',aliases:['MTK'],types:base,variants:['pg','pg_image','mcma_data','short','essay','essay_image'],mode:'MATEMATIKA'},
 {name:'Bahasa Indonesia',aliases:[],types:['PG','BENAR_SALAH','ISIAN','URAIAN'],variants:['pg','pg_passage','true_false','short','essay','essay_complete'],mode:'TEKS'},
 {name:'Pendidikan Agama Islam',aliases:['PAI','Pendidikan Agama Islam dan Budi Pekerti'],types:base,variants:['pg','mcma','short','essay','essay_complete'],mode:'TEKS'},
 {name:'IPAS',aliases:['Ilmu Pengetahuan Alam dan Sosial'],types:base,variants:['pg_image','pg','mcma','short','essay_image','essay'],mode:'TEKS'},
 {name:'SBDP',aliases:['SBdP','Seni Budaya','Seni Budaya dan Prakarya'],types:base,variants:['pg','pg_image','mcma','short','essay'],mode:'TEKS'}
];
const smpBase=['PG','PG_KOMPLEKS','BENAR_SALAH','URAIAN'];
export const smpSubjectProfiles=[
 {name:'Pendidikan Agama Islam',aliases:['PAI','Pendidikan Agama Islam dan Budi Pekerti'],types:smpBase,variants:['pg','pg_passage','mcma','true_false','essay'],mode:'TEKS'},
 {name:'Pendidikan Pancasila',aliases:['PPKn','PKN'],types:smpBase,variants:['pg','pg_passage','mcma','true_false','essay'],mode:'TEKS'},
 {name:'IPS',aliases:['Ilmu Pengetahuan Sosial'],types:smpBase,variants:['pg','pg_image','pg_passage','mcma_data','true_false','essay','essay_image'],mode:'TEKS'},
 {name:'Seni Budaya',aliases:['Seni Budaya dan Prakarya','SBDP'],types:smpBase,variants:['pg','pg_image','mcma','true_false','essay','essay_image'],mode:'TEKS'},
 {name:'Bahasa Inggris',aliases:[],types:smpBase,variants:['pg','pg_passage','mcma','true_false','essay_passage','essay'],mode:'TEKS'},
 {name:'Informatika',aliases:['TIK','Komputer','Teknologi Informasi dan Komunikasi'],types:smpBase,variants:['pg','pg_image','mcma','true_false','essay','essay_image'],mode:'TEKS'},
 {name:'Matematika',aliases:['MTK'],types:smpBase,variants:['pg','pg_image','pg_passage','mcma_data','true_false','essay_image','essay'],mode:'MATEMATIKA'},
 {name:'Bahasa Indonesia',aliases:[],types:smpBase,variants:['pg','pg_passage','mcma','true_false','essay_passage','essay'],mode:'TEKS'},
 {name:'PJOK',aliases:['Pendidikan Jasmani Olahraga dan Kesehatan'],types:smpBase,variants:['pg','pg_image','mcma','true_false','essay'],mode:'TEKS'},
 {name:'Bahasa Arab',aliases:[],types:['PG','PG_KOMPLEKS','URAIAN'],variants:['pg','pg_image','pg_passage','mcma','essay','essay_complete'],mode:'ARAB'}
];
export function smpProfile(unit:string,name:string,grade?:string){if(unit!=='SMP'||grade&&!['1','2','3'].includes(String(grade)))return undefined;return smpSubjectProfiles.find(p=>[p.name,...p.aliases].some(n=>normal(n)===normal(name)));}
export function subjectProfile(unit:string,name:string,grade?:string){return sdProfile(unit,name,grade)||smpProfile(unit,name,grade);}
const normal=(s:string)=>String(s||'').trim().toLowerCase();
export function sdProfile(unit:string,name:string,grade?:string){if(unit!=='SD'||grade&&!['5','6'].includes(String(grade)))return undefined;return sdSubjectProfiles.find(p=>[p.name,...p.aliases].some(n=>normal(n)===normal(name)));}
export function presentationsFor(unit:string,name:string,grade?:string){return (subjectProfile(unit,name,grade)?.variants||[]).map(id=>variants[id]);}
export function packageQuestionTypes(subject:any,extra:string[]=[],questions:any[]=[]){return [...new Set([...(subject?.questionTypes||Object.keys(questionTypeLabels)),...extra,...questions.map(q=>q.format||q.type)])].filter(t=>!!questionTypeLabels[t]);}

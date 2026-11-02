import {questionTypeLabels} from './question-settings';
export type Presentation={id:string;label:string;kind:string;hint:string};
const variants:Record<string,Presentation>={
 sma_text:{id:'sma_text',label:'1. Satu teks · banyak pertanyaan',kind:'PG',hint:'Tambahkan teks di Kelompok bacaan, lalu pilih 5–10 pertanyaan terkait. Bacaan ditampilkan pada setiap soal; kelompok tetap bersama saat diacak.'},
 sma_table:{id:'sma_table',label:'2. Teks dan tabel · banyak pertanyaan',kind:'PG',hint:'Tambahkan teks dan gambar tabel di Kelompok bacaan. Pilih semua pertanyaan yang menggunakan data tersebut.'},
 sma_labeled:{id:'sma_labeled',label:'3. Gambar berlabel · banyak pertanyaan',kind:'PG',hint:'Unggah gambar yang sudah diberi label A–E atau angka ke Kelompok bacaan dan hubungkan pertanyaannya.'},
 sma_info:{id:'sma_info',label:'4. Infografik · banyak pertanyaan',kind:'PG',hint:'Unggah infografik, grafik atau diagram ke Kelompok bacaan. Pastikan label terbaca; gambar dapat diperbesar.'},
 sma_mcma:{id:'sma_mcma',label:'5. Pilihan ganda kompleks · beberapa jawaban',kind:'PG_KOMPLEKS',hint:'Gunakan opsi A–E dan centang semua kunci benar. Tuliskan instruksi seperti Pilih TIGA jawaban. Poin penuh hanya jika kombinasi jawaban sama persis dengan kunci; selain itu nol.'},
 sma_picture:{id:'sma_picture',label:'6. Pilihan jawaban berupa gambar',kind:'PG',hint:'Gunakan Letak gambar untuk mengunggah gambar ke pilihan A–E. Isi 4–5 pilihan dan tandai satu kunci.'},
 sma_match:{id:'sma_match',label:'7. Menjodohkan gambar dan pernyataan',kind:'MENJODOHKAN',hint:'Isi satu butir per baris. Gunakan Letak gambar untuk menambahkan gambar ke kiri atau kanan. Siswa melihat pilihan berlabel A–E dan memilih pasangan untuk setiap butir.'},
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
export function subjectProfile(unit:string,name:string,grade?:string){return smaProfile(unit,name,grade)||sdProfile(unit,name,grade)||smpProfile(unit,name,grade);}
const normal=(s:string)=>String(s||'').trim().toLowerCase();
export function sdProfile(unit:string,name:string,grade?:string){if(unit!=='SD'||grade&&!['5','6'].includes(String(grade)))return undefined;return sdSubjectProfiles.find(p=>[p.name,...p.aliases].some(n=>normal(n)===normal(name)));}
export function presentationsFor(unit:string,name:string,grade?:string){return (subjectProfile(unit,name,grade)?.variants||[]).map(id=>variants[id]);}
export function packageQuestionTypes(subject:any,extra:string[]=[],questions:any[]=[]){return [...new Set([...(subject?.questionTypes||Object.keys(questionTypeLabels)),...extra,...questions.map(q=>q.format||q.type)])].filter(t=>!!questionTypeLabels[t]);}

export const smaQuestionTypes=['PG','PG_KOMPLEKS','MENJODOHKAN'];
export function smaProfile(unit:string,name:string,grade?:string){if(unit!=='SMA'||!name||grade&&!['1','2','3'].includes(String(grade)))return undefined;return {name,types:smaQuestionTypes,variants:['sma_text','sma_table','sma_labeled','sma_info','sma_mcma','sma_picture','sma_match'],mode:/arab/i.test(name)?'ARAB':/matematika/i.test(name)?'MATEMATIKA':/fisika/i.test(name)?'FISIKA':/kimia/i.test(name)?'KIMIA':'TEKS'};}

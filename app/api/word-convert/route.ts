import {env} from 'cloudflare:workers';
import {staffActor} from '../../../lib/staff-auth';
export async function POST(req:Request){
 try{
  const {staff}=await staffActor(req);
  if(!staff||!['Guru','Admin Unit','Super Admin'].includes(staff.role))return Response.json({error:'Masuk sebagai guru atau pengelola terlebih dahulu.'},{status:403});
  if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Permintaan tidak diizinkan.'},{status:403});
  const config=env as unknown as {WORD_CONVERTER_URL?:string;WORD_CONVERTER_TOKEN?:string};
  if(!config.WORD_CONVERTER_URL||!config.WORD_CONVERTER_TOKEN)return Response.json({error:'Konversi .doc belum diaktifkan di server ini. Buka file di Word, pilih Simpan Sebagai → .docx, lalu unggah kembali. Isi dan format naskah tetap boleh seperti biasa.'},{status:503});
  if(Number(req.headers.get('content-length'))>10_000_000)return Response.json({error:'Maksimal Word 10 MB.'},{status:413});
  const data=await req.arrayBuffer();if(data.byteLength>10_000_000||data.byteLength<8)return Response.json({error:'Ukuran file tidak valid.'},{status:413});
  if(![0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1].every((b,i)=>new Uint8Array(data)[i]===b))return Response.json({error:'File bukan Word .doc yang valid. Simpan ulang sebagai .docx.'},{status:400});
  const url=new URL(config.WORD_CONVERTER_URL);if(url.protocol!=='https:')throw Error('Konfigurasi layanan konversi harus HTTPS.');
  const response=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+config.WORD_CONVERTER_TOKEN,'Content-Type':'application/msword'},body:data,signal:AbortSignal.timeout(45000),redirect:'error'});
  if(!response.ok)throw Error('Konversi Word gagal. Simpan ulang file sebagai .docx dan coba kembali.');
  if(Number(response.headers.get('content-length'))>10_000_000)throw Error('Hasil konversi melebihi 10 MB.');
  const converted=await response.arrayBuffer();if(converted.byteLength>10_000_000||new Uint8Array(converted)[0]!==0x50||new Uint8Array(converted)[1]!==0x4b)throw Error('Hasil konversi tidak valid.');
  return new Response(converted,{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Konversi gagal.'},{status:400});}
}

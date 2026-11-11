import {sameOrigin} from '../../../lib/request-origin';
export const dynamic='force-dynamic';
const base='https://jxtmzusghrixplujxglj.supabase.co/functions/v1/cbt-api/';
type Context={params:Promise<{service:string}>};
async function relay(req:Request,{params}:Context){
 if(process.env.VERCEL_ENV!=='production')return new Response(null,{status:404});
 const {service}=await params;
 if(!['auth','cbt','word-convert'].includes(service))return new Response(null,{status:404});
 if(req.method==='POST'&&!sameOrigin(req))return Response.json({error:'Asal permintaan tidak valid.'},{status:403});
 const headers=new Headers({'content-type':req.headers.get('content-type')||'application/json'});
 const cookies=(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).filter(x=>/^cbt_(session|auth_mode)=/.test(x)).join('; ');
 if(cookies)headers.set('cookie',cookies);
 try {
   const upstream=await fetch(base+service+new URL(req.url).search,{method:req.method,headers,body:req.method==='POST'?await req.arrayBuffer():undefined,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(55000)});
   const out=new Headers({'Content-Type':upstream.headers.get('content-type')||'application/json','Cache-Control':'private, no-store'});
   for(const c of JSON.parse(upstream.headers.get('x-cbt-cookies')||'[]'))if(typeof c==='string'&&/^cbt_(session|auth_mode)=/.test(c))out.append('set-cookie',c);
   return new Response(upstream.body,{status:upstream.status,headers:out});
 } catch {return Response.json({error:'Tidak dapat terhubung ke layanan CBT production.'},{status:502});}
}
export const GET=relay;
export const POST=relay;

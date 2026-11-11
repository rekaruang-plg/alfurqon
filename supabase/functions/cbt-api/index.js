// The release script bundles the same authenticated handlers used in Next.
import {GET as readCBT, POST as writeCBT} from '../../../app/api/cbt/route.ts';
import {POST as authenticate} from '../../../app/api/auth/route.ts';
import {POST as convert} from '../../../app/api/word-convert/route.ts';
import {loadVault} from '../../../lib/production-db.ts';
const routes={auth:{POST:authenticate},cbt:{GET:readCBT,POST:writeCBT},'word-convert':{POST:convert}};
Deno.serve(async req=>{
 const name=new URL(req.url).pathname.split('/').at(-1);
 const fn=Object.hasOwn(routes,name)&&routes[name][req.method];
 if(!fn)return new Response(null,{status:404});
 // Browsers may only post to their own origin. The Vercel relay checks the
 // public origin itself before forwarding a request without a browser Origin.
 const origin=req.headers.get('origin');
 if(origin && origin!=='https://jxtmzusghrixplujxglj.supabase.co')return new Response(null,{status:403});
 try{
   const internal=new URL('https://cbt.internal/api/'+name);
   internal.search=new URL(req.url).search;
   const headers=new Headers(req.headers);
   headers.set('origin',internal.origin);headers.set('host',internal.host);
   headers.delete('x-vercel-forwarded-for');
   // Use the gateway's network information, never a caller-provided Vercel header.
   headers.set('x-vercel-forwarded-for',req.headers.get('cf-connecting-ip')||'gateway');
   if(name==='cbt')await loadVault();
   const response=await fn(new Request(internal,{method:req.method,headers,body:req.method==='POST'?req.body:null}));
   const out=new Headers({'Cache-Control':'private, no-store','Content-Type':response.headers.get('content-type')||'application/json'});
   const cookies=response.headers.getSetCookie();
   if(cookies.length)out.set('x-cbt-cookies',JSON.stringify(cookies));
   return new Response(response.body,{status:response.status,headers:out});
 }catch{return Response.json({error:'Layanan CBT belum tersedia.'},{status:503,headers:{'Cache-Control':'no-store'}});}
});

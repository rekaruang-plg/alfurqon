// Next's internal request URL can contain the loopback host behind a proxy.
// Compare browser Origin against the public Host received by this function.
export function sameOrigin(req:Request){
  const origin=req.headers.get('origin');
  if(!origin)return false;
  try {
    const parsed=new URL(origin);
    const host=req.headers.get('host')||new URL(req.url).host;
    return parsed.origin===origin && parsed.host===host &&
      (parsed.protocol==='https:'||parsed.protocol==='http:'&&process.env.VERCEL!=='1');
  }catch{return false;}
}

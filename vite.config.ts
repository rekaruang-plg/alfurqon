import vinext from 'vinext';
import {defineConfig} from 'vite';
import {readFileSync} from 'node:fs';
export default defineConfig(async()=>{
 const {cloudflare}=await import('@cloudflare/vite-plugin');
 const config=JSON.parse(readFileSync(new URL('./wrangler.json',import.meta.url),'utf8'));
 return {plugins:[vinext(),cloudflare({viteEnvironment:{name:'rsc',childEnvironments:['ssr']},inspectorPort:false,config})]};
});

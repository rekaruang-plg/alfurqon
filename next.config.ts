import type {NextConfig} from 'next';
const config:NextConfig={
 async rewrites(){return {beforeFiles:process.env.VERCEL_ENV==="production"?[{source:'/api/:service(auth|cbt|word-convert)',destination:'/cbt-backend/:service'}]:[],afterFiles:[],fallback:[]};}
};
export default config;

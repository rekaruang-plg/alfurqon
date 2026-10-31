import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata={title:'Al Furqon | CBT',description:'Ruang ujian digital Yayasan Sekolah Al Furqon',icons:{icon:'/favicon.svg?v=16',apple:'/logo-al-furqon.png'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="id"><body>{children}</body></html>}

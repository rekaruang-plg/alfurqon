# Al Furqon CBT

Source CBT fase 1 dengan revisi admin 1–2 dan review siswa. Dasar aplikasi: versi 6, commit `90f170c349ca746a13660e824440be42fb2aa0cf`.

Repository ini berisi kode aplikasi, schema database kosong, tes, template konfigurasi, dan panduan instalasi. Data siswa, hasil ujian, password, token, dan database produksi tidak disertakan.

## Runtime

- React / TypeScript, Vinext, Cloudflare Workers.
- Database Cloudflare D1 (dialek SQLite), binding `DB`.
- Secret `TOKEN_VAULT_KEY` untuk enkripsi token serta kartu akun.
- Node.js 24 LTS untuk build dan tes; pnpm sesuai `packageManager` di package.json.
- Login username/password mandiri. Integrasi login ChatGPT dan kepercayaan terhadap header identitas OpenAI dinonaktifkan pada ekspor ini.

**Bukan aplikasi PHP/MySQL dan belum merupakan aplikasi Node/Express untuk VPS.** Kode dapat di-clone pada server build, tetapi runtime produksinya saat ini Workers/D1. Untuk VPS mandiri, tim server perlu mengganti binding D1 dengan adapter database, menyesuaikan runtime HTTP dan autentikasi deployment. Jangan memakai `wrangler dev` sebagai server produksi internet.

## File utama

- [Panduan instalasi](docs/DEPLOYMENT.md)
- [Schema SQL](database/schema.sql)
- [Penjelasan struktur database](database/README.md)
- [Template konfigurasi](wrangler.example.json)
- [Template environment lokal](.dev.vars.example)
- [Pembuat akun Super Admin pertama](scripts/bootstrap-admin.mjs)
- [Daftar revisi terakhir](docs/review-admin-rev2-2026-10-25.md)

## Mulai

```bash
git clone https://github.com/rekaruang-plg/alfurqon.git
cd alfurqon
corepack enable
pnpm install --frozen-lockfile
cp wrangler.example.json wrangler.json
cp .dev.vars.example .dev.vars
```

Lengkapi konfigurasi database dan secret mengikuti panduan. Kemudian:

```bash
pnpm check
pnpm test
pnpm build
```

`pnpm dev` hanya untuk pengembangan. Produksi memakai `pnpm deploy` setelah database, bootstrap dan secret siap.

Pengujian fungsi menggunakan SQLite sintetis. UAT sekolah dan uji beban jaringan setempat tetap diperlukan sebelum ujian resmi.

# Instalasi mandiri Workers dan D1

Versi ini sudah dipisahkan dari hosting ChatGPT Sites. Website Sites yang sedang dipakai tidak berubah oleh proses ekspor GitHub ini.

## 1. Persiapan

Gunakan Node.js 24 LTS, Corepack/pnpm sesuai package.json, akun Cloudflare dengan Workers dan D1. HTTPS wajib karena cookie login beratribut Secure. Jangan mengaktifkan mock autentikasi atau meneruskan header identitas sebagai pengganti login.

```bash
corepack enable
pnpm install --frozen-lockfile
cp wrangler.example.json wrangler.json
pnpm exec wrangler login
pnpm exec wrangler d1 create alfurqon-cbt
```

Salin database_id hasil perintah ke `wrangler.json`. Binding harus bernama `DB`. Sesuaikan nama Worker jika perlu. File wrangler.json tidak masuk Git supaya konfigurasi setiap lingkungan terpisah.

## 2. Schema kosong

```bash
pnpm exec wrangler d1 execute alfurqon-cbt --remote --file database/schema.sql
```

Ini membuat tabel kosong. Jangan mengimpor SQL SQLite melalui phpMyAdmin/MySQL. `drizzle/` berisi migrasi awal asli; untuk instalasi baru gunakan schema.sql lengkap. Jangan menjalankan migrasi awal CREATE TABLE kembali di atas schema yang sudah ada.

Untuk pengembangan lokal, ganti `--remote` dengan `--local` pada perintah database. Pastikan selalu membedakan database lokal dan produksi.

## 3. Akun Super Admin pertama

Buat satu kali pada database baru yang belum memiliki record `installation`. Script menghasilkan SQL berisi hash password, bukan password asli. Tidak memakai password bawaan.

Contoh pada Bash:

```bash
export CBT_ADMIN_USERNAME=superadmin
export CBT_ADMIN_EMAIL=admin@domain-sekolah.sch.id
export CBT_ADMIN_NAME='Super Admin Al Furqon'
read -r -s -p 'Password awal (minimal 12 karakter): ' CBT_ADMIN_PASSWORD
export CBT_ADMIN_PASSWORD
pnpm bootstrap:admin
unset CBT_ADMIN_PASSWORD
pnpm exec wrangler d1 execute alfurqon-cbt --remote --file bootstrap-admin.sql
rm bootstrap-admin.sql
```

Jangan mengunggah file bootstrap ke Git. Jika bootstrap pernah berhasil, gunakan fitur pengelolaan akun setelah login; jangan mengulang bootstrap. Untuk lokal, buat SQL baru dan terapkan dengan --local. Jangan menjalankan dua bootstrap bersamaan.

## 4. Kunci enkripsi

Buat kunci menggunakan `openssl rand -hex 32`. Simpan hasilnya di pengelola rahasia. Untuk lokal, salin .dev.vars.example menjadi .dev.vars dan isi TOKEN_VAULT_KEY. Untuk produksi:

```bash
pnpm exec wrangler secret put TOKEN_VAULT_KEY --config wrangler.json
```

Masukkan kunci melalui prompt. Kunci harus 64 karakter heksadesimal. Gunakan kunci berbeda untuk lingkungan baru yang datanya terpisah. Jika memigrasikan data terenkripsi lama, kuncinya harus sama dengan lingkungan asal; mengganti kunci tanpa migrasi membuat token/kartu lama tidak dapat dibaca. Jangan menyimpan kunci dalam repository atau mengirimkannya lewat chat.

## 5. Build dan deploy

```bash
pnpm check
pnpm test
pnpm build
pnpm deploy
```

Deploy memakai `dist/server/wrangler.json` hasil build. Pemeriksaan deploy menolak database_id placeholder; setelah mengubah wrangler.json lakukan build ulang. Gunakan URL HTTPS yang diberikan Cloudflare. Login dengan akun bootstrap. Login pertama Super Admin menyiapkan katalog mapel/simulasi melalui aplikasi; kemudian lengkapi tahun ajaran, kelas, siswa dan guru.

Jika ingin domain sekolah, pasang domain melalui pengaturan Worker dan DNS yang dikelola sekolah. Konfigurasi tersebut tidak diubah otomatis oleh repository ini.

## 6. Pengembangan lokal

```bash
pnpm exec wrangler d1 execute alfurqon-cbt --local --file database/schema.sql
# Bootstrap akun ke DB lokal seperti langkah 3, menggunakan --local.
pnpm dev
```

Isi .dev.vars terlebih dahulu. Runtime development adalah Vinext/Workers; gunakan lingkungan yang mendukung cookie Secure untuk pengujian login. Cookie tetap Secure di produksi.

## 7. Jika server sekolah adalah VPS atau cPanel

Build ini bukan bundle PHP atau aplikasi MySQL. D1 memakai API `prepare/bind/first/all/run/batch`, SQLite JSON functions, unique indexes, dan optimistic concurrency. Porting perlu menyediakan:

- Pengganti `cloudflare:workers` dan binding DB/TOKEN_VAULT_KEY.
- Adapter database dengan transaksi batch, `meta.changes`, dan query SQLite kompatibel; migrasi eksplisit jika memilih PostgreSQL/MySQL.
- Runtime Vinext/React server yang sesuai atau migrasi server framework.
- HTTPS reverse proxy, proses aplikasi, secret management, backup dan pemulihan.
- Uji ulang session lock, token, waktu server, publish, impor dan isolasi peran.

Jangan menjalankan Wrangler dev pada alamat publik sebagai pengganti server produksi. Informasi OS, panel, runtime yang tersedia dan database tujuan diperlukan untuk membuat paket VPS yang tepat.

## 8. Migrasi data operasional

Repository hanya memuat schema. Data nyata harus diekspor terpisah oleh pengelola berwenang, diangkut melalui kanal privat, lalu dipulihkan ke database tujuan dengan studentId/attemptId tetap. Backup JSON aplikasi bukan otomatis file SQL D1; perlu proses konversi/restore yang divalidasi. Kunci enkripsi lama harus disimpan secara terpisah. Jangan commit dump data sekolah, sesi, kartu akun atau token.

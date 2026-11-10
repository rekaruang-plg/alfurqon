# CBT Al Furqon · production

Branch ini untuk **Vercel (Next.js / Node.js)** dan database **PostgreSQL Supabase**. Tidak menggunakan database atau kredensial situs testing.

1. Di proyek Vercel, hubungkan repo `rekaruang-plg/alfurqon`, lalu atur **Settings → Environments → Production → Branch Tracking** ke `production`. Gunakan root repo, preset **Next.js**, Node **24.x**, dan biarkan Output Directory otomatis. Build Command: `pnpm run build`. Jika belum muncul deployment, buat deployment baru dari commit terbaru branch ini (redeploy commit lama akan membangun kode lama).
2. Build dapat berjalan sebelum database disiapkan. Untuk login dan ujian, buat/gunakan proyek **Supabase khusus production**. Jalankan [migrasi PostgreSQL](supabase/migrations/202611110001_cbt_production.sql) pada SQL Editor sebagai pemilik database. Migrasi membuat tabel privat dan tahun 2026/2027, tanpa siswa, soal atau nilai contoh. Jangan jalankan schema SQLite pada Supabase.
3. Di **Vercel → Settings → Environment Variables**, tambahkan khusus **Production**:
   - `DATABASE_URL`: connection string **Transaction pooler** PostgreSQL dari panel Connect Supabase. Gunakan pengguna database yang punya akses ke schema `cbt`. Ganti placeholder password dengan password database yang sudah di-URL-encode.
   - `TOKEN_VAULT_KEY`: 64 digit heksadesimal acak, misalnya hasil `openssl rand -hex 32`. Simpan kunci yang sama pada deployment berikutnya agar kartu/token lama tetap bisa dibaca.
   - Jika sertifikat Supabase memerlukan CA khusus, isi `DATABASE_CA_CERT` dengan isi sertifikat CA dari dashboard Supabase. Verifikasi TLS tetap aktif.
   - Opsional untuk Word lama (.doc): `WORD_CONVERTER_URL` dan `WORD_CONVERTER_TOKEN`. Impor .docx tidak memerlukan konverter ini.
4. Buat **Super Admin pertama** pada komputer tepercaya: isi environment lokal `CBT_ADMIN_USERNAME`, `CBT_ADMIN_EMAIL`, `CBT_ADMIN_PASSWORD` (12–128 karakter), dan opsional `CBT_ADMIN_NAME`. Jalankan `pnpm bootstrap:admin`. Terapkan isi `bootstrap-admin.sql` sekali di SQL Editor setelah migrasi. Hapus file lokal setelah berhasil; jangan unggah file atau rahasianya ke GitHub. Langkah ini tidak dilakukan oleh build.
5. Setelah mengatur environment, buat deployment baru. Buka domain Vercel, masuk dengan akun CBT tersebut, pastikan unit/tahun sesuai, lalu buat akun Admin Unit. Sebelum ujian sebenarnya, cek satu siklus pembuatan jadwal, token, jawaban, koreksi dan publikasi menggunakan akun uji yang terpisah.

Untuk memeriksa build dari checkout baru: `pnpm install --frozen-lockfile`, `pnpm run build`, lalu `pnpm start`. Tes aplikasi: `pnpm test`. Tes API menggunakan data sintetis SQLite; tes tersebut tidak menjalankan migrasi Supabase. Dokumen lama yang menyebut Workers, Wrangler atau D1 hanya untuk arsitektur sebelumnya.

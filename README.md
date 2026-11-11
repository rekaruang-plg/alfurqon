# CBT Al Furqon · production

Branch GitHub `production` membangun frontend Next.js di Vercel. Hanya deployment dengan VERCEL_ENV=production yang meneruskan /api/auth, /api/cbt dan /api/word-convert ke Edge Function cbt-api di proyek Supabase alfurqon-production (jxtmzusghrixplujxglj). Preview dan pengembangan lokal tidak menggunakan penghubung ini.

Alamat HTTPS publik terdapat di app/cbt-backend/[service]/route.ts. Password basis data, kunci token, dan password akun tidak diperlukan di GitHub atau Vercel. API memeriksa sesi atau token siswa. Migrasi supabase/migrations membuat tabel privat dan kunci token. Jangan mengganti kunci saat merilis versi baru.

Login melalui halaman utama menggunakan akun CBT. Super Admin mengelola Admin Unit SD, SMP dan SMA. Jangan menjalankan bootstrap atau menyalin data testing saat memperbarui production yang sudah aktif.

Build: pnpm install --frozen-lockfile lalu pnpm run build. Vercel memakai preset Next.js dan branch produksi production. Perubahan frontend dirilis lewat GitHub. Jika mengubah handler backend atau adapter, jalankan node scripts/package-edge.mjs /tmp/cbt-edge.json dari root, lalu deploy isi array file tersebut ke Supabase Edge Function cbt-api, entrypoint supabase/functions/cbt-api/index.js, verify_jwt=false (aplikasi memvalidasi sesi sendiri). Push GitHub saja tidak memperbarui Edge Function. Untuk Word .doc lama, pengaturan opsional WORD_CONVERTER_URL dan WORD_CONVERTER_TOKEN berada di Supabase. File .docx tidak memerlukan konverter ini.

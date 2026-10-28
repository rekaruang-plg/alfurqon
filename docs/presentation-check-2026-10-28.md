# Pemeriksaan untuk presentasi 29 Oktober 2026

Nama siswa kini ditampilkan tegas di header layar ujian, bersama NIS, unit dan kelas. Header tetap terlihat ketika halaman digulir; identitas juga ditampilkan di bawah judul ujian. Data identitas berasal dari peserta ujian yang dikembalikan server.

## Masalah yang diperbaiki

1. Nama peserta sebelumnya hanya berupa teks kecil di bawah judul. Komponen identitas baru terlihat pada desktop dan layar kecil.
2. Pembatas login sebelumnya menghitung login berhasil dan berpotensi menghalangi kelas yang menggunakan IP sekolah bersama. Sekarang hanya kegagalan login yang dihitung, maksimal 10 per username dan 600 per IP per 15 menit. Namespace penghitung baru mencegah hitungan login berhasil versi lama menghalangi versi baru.
3. Status jeda tidak disertakan dalam payload siswa; UI sebelumnya memperkirakan sisa waktu sendiri setelah error. Heartbeat sekarang mengembalikan waktu jeda tersimpan tanpa mengambil alih sesi yang telah dilepas. UI menampilkan jeda dan tombol konfirmasi untuk melanjutkan. Jawaban tertunda tetap tersimpan untuk dikirim setelah sesi dilanjutkan.

## Pemeriksaan

- TypeScript dan build produksi Sites/ekspor mandiri.
- API dengan SQLite: login siswa/guru, isolasi peran/unit, token bersama dan sesi siswa, soal acak yang konsisten saat resume, penyimpanan jawaban, batas waktu, pilihan ganda kompleks, koreksi dan publikasi, reset akun, jadwal susulan, arsip data, periode dan impor, snapshot soal, backup/restore, pemisahan data demo.
- Tambahan: 70 login berhasil berturut-turut melalui IP yang sama tidak menambah penghitung gagal; 10 password salah dibatasi; identitas nama/NIS/kelas tetap sama saat enter/heartbeat/resume; heartbeat saat jeda tidak mengklaim sesi perangkat.
- Template Word 30 soal dan parser lima jenis soal.
- Browser: komponen header dengan data buatan, pergantian soal, posisi header ketika digulir, serta viewport iframe 390 piksel. Halaman fixture dihapus sebelum build produksi.

Pengujian API menggunakan database sementara, bukan data sekolah. Pemeriksaan ini bukan uji beban serentak atau UAT menyeluruh pada perangkat/jaringan sekolah. Tidak ada jaminan bebas seluruh bug. Tidak ada perubahan schema SQL.

## Alur presentasi singkat

1. Gunakan akun pengelola yang sudah disiapkan. Tampilkan Tahun Pelajaran, kelas, guru dan jadwal.
2. Buka Simulasi ujian, pilih paket, atur durasi singkat 1–2 menit jika diperlukan, kemudian mulai simulasi.
3. Tunjukkan konfirmasi identitas, nama di header, pilihan jawaban, simbol dan navigasi soal.
4. Untuk pengumpulan manual, semua pertanyaan harus dijawab, tanda ragu dihapus, dan minimal seperempat durasi telah berlalu. Jika waktu habis, ujian ditutup sesuai aturan.
5. Tunjukkan monitoring, koreksi, publikasi nilai dan hasil siswa menggunakan akun/ujian demo yang sesuai.

Sebelum presentasi, cek sekali login akun yang akan dipakai dan koneksi pada laptop presentasi. Gunakan browser/profil terpisah jika menampilkan pengelola dan siswa bersamaan, karena cookie login dalam satu profil dipakai bersama antartab.

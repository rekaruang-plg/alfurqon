# Impor Word fleksibel

Guru memilih unit, kelas, mapel, dan cara membaca kunci sebelum mengunggah. Format naskah biasa didukung tanpa template wajib. Hasil masuk ke pemeriksaan, lalu editor, dan hanya disimpan setelah guru memverifikasi. Judul Part I/II, penomoran Word, A–E, bacaan berjangkauan nomor maupun tanpa rentang, serta penomoran esai yang dimulai ulang dikenali. Nomor dan tabel yang ambigu tetap harus dibandingkan dengan Word asli; seluruh teks sumber tersedia pada dialog hasil impor.

Bacaan disimpan pada setiap soal sebagai stimulusId dan stimulus. Isi terduplikasi sengaja supaya soal yang dipilih sebagian dari bank tetap membawa bacaannya. stimulusId menyatukan kelompok saat pengacakan; urutan pertanyaan di dalam kelompok dipertahankan. Snapshot ujian lama tidak diubah. Editor kelompok menyelaraskan perubahan bacaan ke semua anggota terpilih. Gambar menggunakan kamus gambar tiap soal.

Kunci dari tebal/warna hanyalah kandidat yang wajib dikonfirmasi. Dua opsi ditandai pada PG tidak dipilih otomatis. Semua opsi boleh menjadi kunci checkbox. Tidak ada format tebal/warna kunci yang diteruskan ke siswa. Pisahkan/gabung adalah alat bantu koreksi, bukan jaminan pemulihan tata letak otomatis. Sesudah gabung, kunci dikosongkan.

## Konversi .doc lama

Aplikasi Workers tidak menjalankan LibreOffice. Endpoint /api/word-convert memerlukan WORD_CONVERTER_URL (HTTPS, contoh https://converter.example.org/convert) dan WORD_CONVERTER_TOKEN. Tanpa keduanya aplikasi menampilkan langkah Save As .docx; fitur konversi otomatis belum aktif. Rahasia hanya disimpan sebagai environment server, jangan dalam kode atau Git.

Layanan referensi: services/word-converter. Bangun image Docker pada server milik sekolah, jalankan sebagai user non-root dengan batas memori/CPU, /tmp sebagai tmpfs, filesystem read-only, cap-drop ALL, no-new-privileges, dan jaringan yang menolak akses keluar. Reverse proxy HTTPS membatasi request 10 MB dan hanya meneruskan endpoint /convert. Token minimal 32 karakter harus sama di layanan dan aplikasi. Jangan membuka layanan tanpa token. Direktori sementara dihapus setiap konversi, timeout 35 detik, maksimal dua proses bersamaan. Word dengan macro tidak dijalankan; profil LibreOffice sementara memakai tingkat keamanan tertinggi.

## Verifikasi

Uji sintetis mencakup bacaan rentang/tanpa rentang, pengacakan kelompok, kunci tebal ambigu, pilihan checkbox, kunci tabel, matematika OMML, dan gerbang pemeriksaan server. Contoh pengguna: Inggris 35 soal/5 bacaan; Arab 25 soal; matematika 20 soal setelah konversi lokal .doc. Penghitungan ini bukan pengesahan isi: tabel gambar Arab dan pecahan manual tetap memerlukan pemeriksaan guru. Dokumen ujian pengguna tidak disertakan sebagai fixture publik.

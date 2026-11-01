# Urutan soal unik per peserta

Setiap sesi ujian baru memilih urutan yang belum dipakai peserta lain dalam jadwal ujian yang sama. Pemeriksaan dan penyimpanan menggunakan satu UPDATE bersyarat agar siswa yang mulai bersamaan tidak mendapatkan urutan yang sama. Saat terjadi benturan, server memilih ulang sebelum mengembalikan soal.

- Paket guru tidak diubah. Penilaian dan jawaban tetap memakai ID soal.
- Urutan disimpan pada attempt; melanjutkan sesi tidak mengacak ulang.
- Soal dengan stimulusId sama tetap berurutan dalam satu kelompok. Yang diacak adalah kelompok dan soal mandiri.
- Urutan sesi lama diperhitungkan, tanpa mengubah soal atau jawaban yang sudah dimulai.
- Jika seluruh permutasi habis, ujian tetap berjalan dengan urutan yang paling sedikit digunakan. Misalnya 3 kelompok hanya menyediakan 6 susunan, walaupun jumlah pertanyaannya lebih banyak.
- Ruang demo memakai tabel demo yang terpisah. Tidak perlu migrasi schema karena metadata tersimpan di JSON attempts.
- Batas percobaan benturan 40; jika terlampaui siswa mendapat pesan untuk menekan mulai kembali. Tidak ada jawaban atau sesi yang dihapus.

Validasi: tests/unique-order.test.mjs mencakup keunikan sampai kapasitas habis, kelompok bacaan, fallback seimbang dan keutuhan sumber. tests/api.test.mjs menguji 30 peserta mulai konkuren pada database SQLite dalam memori melalui handler API, pemeriksaan sesi lama tanpa metadata urutan, jawaban tersimpan, dan melanjutkan ujian. Ini bukan uji beban produksi Cloudflare.

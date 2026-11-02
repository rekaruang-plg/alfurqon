# Profil soal SD kelas 5 dan 6

Referensi: sepuluh naskah mapel yang diberikan pada 2 November 2026. Naskah berlabel kelas VI; profil awal berlaku untuk kelas 5 dan 6 sesuai permintaan.

| Mapel | Jenis jawaban bawaan |
|---|---|
| Bahasa Inggris | PG, PG kompleks, isian, uraian |
| TIK / Komputer | PG, PG kompleks, isian, uraian |
| Bahasa Arab | PG, PG kompleks, isian, uraian |
| Pendidikan Pancasila | PG, PG kompleks, isian, uraian |
| PJOK | PG, PG kompleks, isian, uraian |
| Matematika / MTK | PG, PG kompleks, isian, uraian |
| Bahasa Indonesia | PG, Benar/Salah, isian, uraian |
| Pendidikan Agama Islam / PAI | PG, PG kompleks, isian, uraian |
| IPAS | PG, PG kompleks, isian, uraian |
| SBDP / Seni Budaya | PG, PG kompleks, isian, uraian |

Bahasa Indonesia: bagian berjudul PG kompleks pada contoh berisi tabel pernyataan Benar/Salah. Pilihan ganda kompleks biasa dapat ditambahkan melalui tombol Tambah tipe soal lain.

## Alur editor

1. Pilih unit, tingkat, dan mata pelajaran.
2. Pilihan Jenis soal mengikuti master mapel. Variasi penyajian mengikuti bentuk dalam contoh: teks, gambar, bacaan/tabel bersama, dan esai melengkapi teks/formulir.
3. Variasi penyajian memberi panduan memakai fitur yang tersedia; tidak mengisi jawaban/kunci otomatis.
4. Tambah tipe soal lain membuka enam jenis jawaban yang didukung. Tambahan disimpan pada paket, bukan mengubah master mapel. Soal lama dan tipe dari impor tetap dapat diedit dan disimpan.
5. Jenis yang sedang digunakan tetap tersedia. Pengubahan jenis soal mengosongkan kunci untuk mencegah kunci salah.

## Batas penyajian tabel

- Tabel Benar/Salah: satu soal per pernyataan, dengan bacaan yang dihubungkan melalui Kelompok bacaan.
- Tabel/formulir yang harus dilengkapi: lampirkan gambar atau kolom bernomor dan jawaban bernomor di kotak esai; belum ada isian langsung pada sel tabel.
- Berkas PAI asli .doc: heading/jenis soal ditinjau dari berkas lokal, bukan bukti layanan konversi .doc telah aktif pada server. Upload .doc tetap membutuhkan konverter; .docx disarankan.
- Naskah asli dan kunci tidak dimasukkan ke repository atau otomatis diterbitkan menjadi ujian.

## Master dan penyimpanan

Migrasi transaksional sekali jalan ketika Super Admin atau Admin Unit SD membuka data. Master SD yang belum ada ditambahkan; alias mapel dipakai kembali. Tingkat 5/6 dan jenis awal diterapkan pada profil SD. Data SMP/SMA, paket soal, jawaban dan snapshot ujian tidak diubah. Pengaturan master setelah migrasi tidak ditimpa pada login berikutnya. Semester 2 memakai profil akademik periodenya sendiri.

Field JSON tambahan: `bank.additionalQuestionTypes` dan `question.presentation`; tidak memerlukan migrasi struktur tabel SQL.

## Verifikasi

Suite API lengkap lulus, termasuk pembuatan master, idempotensi, pengaturan admin setelah migrasi, tipe tambahan paket, guru sesuai penugasan, dan penolakan lintas unit. Tes profil mencakup sepuluh mapel, kelas 5/6, alias, dan isolasi unit. Browser memeriksa pilihan awal Bahasa Indonesia, tambahan Menjodohkan, payload penyimpanan, perpindahan kelas 5, serta variasi Bahasa Arab. Halaman uji dihapus sebelum build produksi.

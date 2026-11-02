# Pengaturan soal SMP — 2 November 2026

Berlaku untuk semua tingkat SMP: 1/2/3 (VII/VIII/IX).

| Mapel | Tipe bawaan |
| --- | --- |
| Pendidikan Agama Islam, Pendidikan Pancasila, IPS, Seni Budaya, Bahasa Inggris, Informatika, Matematika, Bahasa Indonesia, PJOK | PG, PG kompleks MCMA, Benar/Salah, uraian |
| Bahasa Arab | PG, PG kompleks MCMA, uraian |

Master yang belum tersedia dibuat saat Super Admin atau Admin Unit SMP membuka dashboard. Alias mapel yang sudah ada dipertahankan. Migrasi sekali per lingkup semester; pengubahan master setelah migrasi tidak ditimpa pada pemuatan berikutnya. Paket dan soal lama tidak dihapus. Tambah tipe soal lain berlaku per paket dan mempertahankan tipe yang sudah dipakai. Keyboard soal baru mengikuti Matematika/Arab.

Panduan variasi penyajian mencakup gambar, bacaan bersama, data dan uraian. Kategori Benar/Salah dibuat satu soal per pernyataan dengan bacaan bersama. Tabel bukan sel interaktif; gunakan gambar atau kolom bernomor dengan jawaban uraian.

## Catatan sumber

Teks hasil ekstraksi PAI, Pendidikan Pancasila(1), PJOK(1) identik. IPS, Seni Budaya, Informatika juga identik, demikian pula Bahasa Indonesia(1) dan Bahasa Inggris(1). Pengaturan menggunakan pola tipe dalam berkas, bukan mengimpor atau menerbitkan isi soal. Naskah asli tidak disertakan dalam repository. IPA SMP tidak memiliki berkas contoh di kiriman ini sehingga pengaturannya tetap.

## Validasi

Uji profil mencakup 10 mapel, tiga tingkat, alias, mode keyboard, dan isolasi unit. Uji API mencakup migrasi master, tambahan tipe per paket, penolakan tipe tanpa pilihan, serta pelestarian perubahan admin dan unit lain. TypeScript dan build produksi diperiksa. Browser memakai data uji lokal untuk memeriksa editor Bahasa Arab dan penambahan isian; tidak mengubah soal produksi.

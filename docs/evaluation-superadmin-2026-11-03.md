# Pemeriksaan revisi Super Admin — 3 November 2026

Sumber: EVALUASI - role super admin.pdf, catatan 3 November dan pengulangan catatan 2 November.

| Catatan | Hasil pemeriksaan |
| --- | --- |
| Jarak Tambah Soal Bank / Semua Lingkup Materi | Ditambah margin kanan dan bawah 12px. Browser mengonfirmasi computed style. |
| Screenshot input token siswa memakai prompt browser | Diganti dialog aplikasi, tombol batal, status memeriksa dan pesan gagal di dialog. Browser menguji input kosong/nonaktif, normalisasi huruf, dan pesan gagal. |
| Unit mapel guru harus mengikuti unit utama | Kode UI membatasi unit penugasan, API menolak lintas unit; suite API lulus. |
| Username tetap saat NIY diubah | Pengujian ulang API mengganti NIY, membandingkan kartu akun dan login lama: lulus. |
| Mapel duplikat memperbarui semua jenis soal | Pengujian ulang API simpan duplikat dengan enam jenis: lulus. |
| Pesan hapus mapel sesuai objek | Cabang pesan mapel sudah ada di review-workspace; ditinjau ulang. |
| Pisahkan/Gabung berupa popup | AppDialog sudah terhubung ke kedua aksi; kode diperiksa ulang. |
| Bobot uraian Arab 4, bukan 2 | Impor ulang berkas asli ASAS 1 BAR 5 25-26: 10 PG, 5 MCMA, 5 isian, 5 uraian. Kelima uraian bernilai maksimum 4. |
| Notifikasi nomor soal belum lengkap | Validasi paket dan dialog nomor/alasan masih terhubung; kode diperiksa ulang. |
| Aktif tidak membuka editor | Status berupa span badge; detail dan edit tombol terpisah; kode diperiksa ulang. |
| Generate/Generate ulang token berupa popup | Kedua aksi menuju confirmToken dan AppDialog; kode diperiksa ulang. |
| Klik tanggal/jam membuka pemilih | DateTimeField memakai onClick pada input untuk membuka kalender; kode diperiksa ulang. |
| Kembali menutup susulan pada Token/Monitoring/Koreksi | Komponen bersama mengosongkan makeup dan dialog saat kembali/pergantian tab; kode diperiksa ulang. |
| Belum Mulai berbeda dari Perlu Dinilai | Filter menggunakan jadwal; gradingStatus hanya Perlu dinilai setelah Dikumpulkan. Kode diperiksa ulang. |

Seluruh tujuh suite tests/*.test.mjs dijalankan ulang dan lulus, termasuk API/login/peran, Word, profil SD/SMP/SMA, browser guard dan pengacakan. TypeScript diperiksa. Browser memakai fixture lokal; tidak setiap skenario lama dijalankan ulang lewat browser dan tidak mengubah data sekolah produksi. Fixture dihapus sebelum publikasi.

Perbaikan bobot berlaku pada impor baru. Paket yang dahulu tersimpan dengan poin 2 perlu diedit atau diimpor ulang sebelum dipakai; riwayat/snapshot ujian tidak ditimpa otomatis.

# Revisi evaluasi Super Admin — 1 November 2026

Sumber: EVALUASI - role super admin-2.docx (teks tabel dan 15 tangkapan layar).

| No | Catatan | Implementasi |
|---|---|---|
|1|Jumlah baris kelas|10, 25, 50, 100 baris; navigasi halaman dan total hasil filter.|
|2|Pesan edit kelas menyebut tahun|Pesan khusus nama kelas; struktur periode tetap dipertahankan.|
|3|Jumlah baris siswa|Kontrol dan navigasi halaman yang sama dengan kelas.|
|4|Guru tidak bisa menyimpan kelas satu per satu|Penanda belum memilih dibuang saat memilih kelas pertama; akses tetap dibatasi ke kelas pilihan. Penanda kosong ditolak API dengan pesan yang jelas.|
|5|Lihat akun guru memakai format siswa|Identitas kartu guru, NIY/kode kontrak, mapel dan kelas ajar.|
|6|Template Excel guru tidak terunduh|File XLSX statis melalui tautan download langsung. Template kelas dan siswa juga tersedia. Workbook guru dilengkapi petunjuk.|
|7|Cetak/unduh kartu guru memakai kartu siswa|Format cetak guru terpisah; judul dan kolom sesuai guru; logo resmi.|
|8|Pesan hapus guru menyebut riwayat ujian siswa|Pesan khusus data guru, penugasan dan koreksi yang dipertahankan.|
|9|Pilih semua tingkat mapel|Checkbox Pilih semua tingkat mengikuti unit.|
|10|Mapel tanpa tingkat otomatis semua|Ditolak dengan pesan di formulir dan validasi API. Mapel lama tanpa daftar tingkat tetap dibaca sebagai semua; saat diedit, seluruh tingkat ditampilkan tercentang untuk ditinjau.|
|11|Ascending/descending mapel salah|Urutan diterapkan pada daftar setelah filter.|
|12|Tanggal/jam hanya terbuka dari ikon; durasi tidak mengikuti|Klik kolom membuka kalender internal, bulan/tanggal/jam/menit dapat dipilih. Durasi otomatis dari selisih WIB, termasuk lintas hari; rentang tidak valid ditolak. Batas durasi lama 480 menit dipertahankan.|
|13|Edit jadwal menampilkan kelas lain|Hanya kelas jadwal terpilih yang ditampilkan. Unit/tingkat/kelas tetap saat edit; API menolak memindahkan jadwal ke kelas lain. Pembuatan baru tetap dapat memilih banyak kelas.|

## Verifikasi

- TypeScript tanpa error.
- Suite API penuh: login dan hak akses, semester, data siswa, guru, jadwal, token, penyimpanan jawaban, penguncian browser, koreksi, publikasi; termasuk regresi baru untuk pemilihan kelas guru, kartu per peran, tingkat mapel wajib, dan kelas edit jadwal.
- tests/academic-ui.test.mjs: pemilihan kelas individual/semua, selisih waktu WIB dan lintas hari, urutan nama, kartu guru/siswa, escaping HTML, pembacaan ketiga file XLSX.
- Browser lokal dengan data buatan: tabel 10 baris dan halaman kedua, mapel Z–A, pesan tingkat kosong dan pilih semua, edit kelas tunggal, kalender dari klik kolom, pilihan menit dan durasi 90, payload simpan WIB, tampilan kartu guru.
- Browser download event tidak selesai di lingkungan QA; keutuhan workbook diverifikasi dengan ExcelJS dan file dipaketkan sebagai aset statis bertautan langsung.
- Halaman sementara QA dihapus sebelum build/publikasi. Data produksi tidak diubah untuk pengujian.

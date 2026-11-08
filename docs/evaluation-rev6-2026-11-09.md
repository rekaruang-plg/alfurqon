# Evaluasi revisi 6 — Super Admin

Acuan: seluruh 12 halaman EVALUASI REV.6 - role super admin.docx.

- Form guru tetap terbuka saat area luar diklik.
- Editor ujian dan bank menggunakan komponen yang sama: tanpa variasi penyajian, Bold/Italic/Underline, rumus untuk mapel terkait, gambar pada bacaan, Soal selanjutnya untuk bacaan sama, Tambah soal untuk bacaan baru.
- Hapus draft memakai dialog aplikasi; badge Aktif paket dihapus.
- Header tabel Token/Monitoring/Koreksi dapat diurutkan naik/turun. Peserta menuju detail Monitoring.
- Status Token dan Monitoring memakai perhitungan yang sama, memperhitungkan akhir jadwal, peserta selesai dan masa berlaku token. Token kedaluwarsa kembali ke Generate; tidak memutus sesi berjalan.
- Token tersedia untuk Super Admin, Admin Unit dan pengawas yang ditugaskan. Monitoring dibatasi unit/mapel/kelas penugasan.
- Siswa terlambat dapat mulai selama jadwal masih dibuka menggunakan token utama terbaru.
- Request token membuka kunci satu kali pada perangkat terikat. Token salah/kedaluwarsa/perangkat lain ditolak. Pelanggaran kedua mengumpulkan jawaban terakhir otomatis. Jumlah reset tersimpan di server dan catatan aksi.
- Halaman terkunci dapat dibuka kembali pada perangkat yang sama; membuka halaman ini tidak membuka kuncinya.
- Ujian ulang menerima alasan wajib, ditangani di Monitoring dan tersedia untuk pengelola/guru terkait/pengawas. Konfirmasi penghapusan hasil lama tetap diwajibkan.
- Tindakan Jeda waktu menghentikan hitung mundur selama 1–120 menit, kemudian melanjutkan otomatis. Lainnya menyimpan catatan tanpa mengubah jawaban/waktu.
- Koreksi tidak menyediakan kontrol token; Ujian ulang mengarah ke Monitoring.
- Tambah Soal dan pratinjau paket pada detail bank. Pengelola hanya menampilkan/membuat Super Admin dan Admin Unit; guru dikelola melalui Guru.
- Perilaku tahun/semester, dashboard, kelas, siswa, mapel dan jadwal yang ditandai sesuai dipertahankan.

## Verifikasi

Pengujian API memakai SQLite terisolasi dan login akun, termasuk batas unit SD/SMP/SMA, proctor, reset satu kali, pengumpulan pelanggaran kedua, jeda otomatis, alasan ujian ulang, isolasi semester/tahun, penyimpanan jawaban dan publikasi. Pengujian browser memakai komponen aplikasi dengan data sintetis: format teks, toolbar sesuai mapel, bacaan lanjutan, tombol Peserta, pengurutan, pengalihan Koreksi, pratinjau bank, dialog draft. Pemeriksaan TypeScript dan build produksi dilakukan sebelum terbit.

Tidak mengubah data sekolah untuk pengujian. Ini bukan uji beban perangkat/jaringan sekolah. Tidak memerlukan tabel baru; resetCount, pauseUntil dan catatan menggunakan data JSON pada tabel yang sudah ada.

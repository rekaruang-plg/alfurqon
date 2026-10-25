# Implementasi review admin revisi 2

Sumber: REVIEW CBT FIX (rev.2 admin).docx, 25 Oktober 2026. Ketentuan revisi 2 menggantikan ketentuan sebelumnya bila berbeda.

| Bagian | Implementasi |
| --- | --- |
| Tahun ajaran | Super Admin menambah/memperbarui tahun dan semester aktif. Pengelola memilih periode. Topik, jadwal, dan daftar Buat soal dipisahkan per periode. Data akademik tidak dihapus ketika berpindah semester. Bank sebagai sumber soal tetap dapat dipakai ulang. |
| Dashboard | Agenda hanya hari ini menurut WIB, status jadwal, aksi cepat monitoring kelas. |
| Menu | Data Akademik: Kelas, Siswa, Guru, Mapel. Ujian Sekolah: Jadwal, Buat soal, Token, Monitoring, Koreksi & nilai. Kelompok menu dapat dilipat. |
| Master berulang | Kelas dikenali berdasarkan unit/tahun/nama, siswa unit/NIS, guru NIY atau email/identitas sebelumnya, mapel unit/nama. Update mempertahankan ID dan riwayat; pengulangan impor tidak menghapus record. |
| Guru | Tambah, impor Excel dan template, cetak/CSV kartu akun. Username NIY atau nomor kontrak unit. Password acak dan perubahan password mandiri. Akun juga terlihat dalam formulir edit. Kelas/mapel mengajar tetap pada profil; kewenangan tambahan pada jadwal. |
| Jadwal | Lihat/edit/hapus topik yang belum digunakan. Kelas memakai checkbox termasuk kelas lama tanpa tingkat bila nama menunjukkan tingkatnya. Pemeriksaan bentrok sesuai unit/kelas/mapel/periode. Detail/edit jadwal, penugasan full upload+koreksi, korektor, dan pengawas dari master guru. |
| Buat soal | Topik/mapel/unit/tingkat; pilih judul jadwal otomatis, kelas checkbox, Word/manual, pemilih bank per tingkat/mapel dengan tipe, materi, pertanyaan dan kunci. Local autosave, draft server pribadi, pemulihan saat membuka editor, peringatan/simpan draft saat menutup. |
| Bank | Lingkup materi per soal, filter materi dan jumlah soal sesuai filter, detail tabel, edit serta pelacakan penggunaan melalui ID sumber soal pada jadwal yang dapat dilihat. |
| Token | Satu kode bersama per jadwal/kelas, hanya mulai setelah login siswa. Regenerasi mengganti kode, tidak menghapus jawaban/sesi berjalan. Kode tersimpan terenkripsi. Super Admin seluruh unit, Admin Unit unit sendiri, pengawas pada waktu jadwal. Tidak ada unduh token pada alur baru. |
| Monitoring | Daftar jadwal dengan status Belum Mulai/Sedang Berlangsung/Selesai/Susulan. Detail sebagai halaman, tanpa nilai. Status siswa, tambahan waktu, pelepasan sesi dengan jeda waktu server, catatan nama/aksi/alasan. |
| Koreksi | Daftar jadwal/status penilaian, detail halaman, warna status, waktu selesai/habis waktu, catatan pengawas. Simpan nilai, publikasi individu dan pilihan massal, CSV. Susulan membuat jadwal serta peserta khusus yang belum ujian; kode hanya terlihat bagi pengawas/admin. Nilai objektif tetap dihitung server. |
| Simulasi | Filter tingkat, judul mapel–tingkat–unit, Detail Soal, unit/tingkat/mapel/durasi dan editor tanpa topik/judul manual/pemilih bank. Generate token simulasi terpisah. |

## Kompatibilitas dan akses

Riwayat menggunakan studentId tetap. Data sebelum periode dicatat dianggap semester 1 tahun 2026/2027. Jalur token individu lama dipertahankan untuk sesi historis dan simulasi; halaman login sekolah sekarang mengarahkan siswa ke akun. Generate token bersama menyiapkan peserta, mengharuskan login untuk peserta baru/belum mulai, serta mempertahankan sesi lama yang sedang berjalan.

Token bersama hanya membuka akses ke attempt milik akun siswa, bukan menjadi identitas siswa. Pengawas tidak mendapat kunci atau jawaban untuk penilaian jika tidak memiliki tugas koreksi. Tugas khusus per jadwal dapat diperbarui tanpa mengubah jawaban dan snapshot soal. Perpindahan perangkat menyimpan sisa durasi dan sisa waktu minimum pengumpulan; waktu dilanjutkan setelah masuk kembali.

## Verifikasi

- `node tests/api.test.mjs`: endpoint CBT, login, perubahan password dan SQLite in-memory. Cakupan lama ditambah pemisahan semester, impor berulang, NIY/kontrak, bentrok mapel, tugas jadwal, token bersama/regenerasi, akun siswa berbeda, pembatasan pengawas, pause/resume, publikasi pilihan, susulan dan privasi draft.
- TypeScript dan build produksi.
- Browser: fixture komponen sintetis untuk dashboard, navigasi cepat monitoring, tabel koreksi dan checkbox publikasi, pemilih soal/filter materi/salin ID baru, dan formulir penugasan pengawas. Fixture dihapus sebelum build produksi.

Pengujian browser ini merupakan pengujian komponen, bukan UAT seluruh akun produksi. Uji beban jaringan sekolah dan UAT pengguna nyata belum dijalankan dalam sesi ini.

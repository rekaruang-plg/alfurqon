# Evaluasi revisi 4 Super Admin

Perubahan mengikuti dokumen “EVALUASI REV.4 - role super admin”. Revisi berfokus pada data akademik per semester, impor berulang, guru demo, pengelolaan jadwal/paket, serta keterbacaan antarmuka.

| Bagian evaluasi | Implementasi |
| --- | --- |
| Sidebar | Ukuran identitas, jarak, dan pemilih periode diperkecil. Pemilih hanya menampilkan semester 1 dan 2 tahun yang diaktifkan. Pilihan lama di perangkat disesuaikan dengan tahun aktif. |
| Dashboard | Jumlah siswa, guru, dan kelas ditampilkan bersama agenda ujian hari ini. |
| Tahun pelajaran | Form dibatasi lebarnya. Data master kelas, siswa, guru, dan mapel semester 2 disalin satu kali saat semester 2 pertama dibuka. Perubahan selanjutnya terpisah dari semester 1. |
| Identitas lintas semester | ID siswa dan akun tetap sama. Kelas, nama peserta, dan daftar peserta ujian mengikuti semester jadwal. Riwayat tetap memakai ID siswa yang sama. |
| Kelas manual | Urutan unit, tingkat, nama kelas, wali kelas. |
| Impor kelas | Nama dicocokkan tanpa membedakan kapital. Pratinjau memisahkan jumlah/nama duplikasi. Impor mengupdate ID lama, mempertahankan wali kelas jika tidak diisi. Tahun berasal dari periode. |
| Kelas duplikat lama | Normalisasi satu kali menggabungkan kelas dengan unit, tahun, dan nama yang sama tanpa membedakan kapital. Referensi siswa, jadwal, dan penugasan diperbarui; record asal tetap tersimpan dengan referensi penggabungan. |
| Pesan validasi/hapus | Kesalahan penyimpanan dan konfirmasi hapus menggunakan dialog aplikasi. Hapus kelas/siswa/guru tidak memakai dialog bawaan browser. |
| Tabel data | Filter Ascending A–Z / Descending Z–A pada kelas, siswa, guru, jadwal, dan paket. Tombol diberi jarak, tabel dan formulir dipadatkan. |
| Siswa manual | Urutan unit, kelas, nama, jenis kelamin, NIS. Tidak ada input tahun terpisah. Nama tampil kapital. |
| Impor siswa | NIS yang sama pada unit yang sama memperbarui identitas lama. Kelas yang belum ada dibuat saat commit impor. Tingkat dibaca dari awalan angka kelas; awalan 7–9 SMP dan 10–12 SMA dipetakan ke tingkat 1–3. Nama kelas tanpa tingkat yang dapat dikenali perlu dibuat melalui menu Kelas dahulu. Pratinjau belum menulis data. |
| Guru manual | Urutan unit, nama, NIY, JK, email. Menu Guru tidak menampilkan isian peran. Penambahan Admin Unit/Super Admin berada di Pengelola. |
| Guru demo | Guru bisa dibuat di ruang demo, tercantum di daftar guru, mendapat akun dengan namespace demo, dan login kembali ke ruang demo. Tidak mendapat akses data sekolah utama. |
| Penugasan guru | Filter tingkat membatasi kelas yang terlihat. Melepas centang Semua kelas mengosongkan pilihan. Pemilihan kelas kosong tidak diterjemahkan sebagai izin semua kelas. |
| Jadwal ujian | Tombol Edit, urutan A–Z/Z–A, dan Hapus jadwal dengan konfirmasi. Jadwal yang sedang dikerjakan tidak dapat dihapus. Jadwal yang dihapus tidak bisa digunakan untuk token/masuk ujian. |
| Editor soal | Membuka editor tidak menampilkan konfirmasi draft. Konfirmasi tampil saat menutup editor yang berubah. Simpan draft menutup editor. Draft perangkat tetap dapat dipulihkan melalui tombol khusus. |
| Opsi jawaban | Tombol × menghapus pilihan, minimum dua pilihan. Indeks kunci PG/MCMA disesuaikan ketika pilihan dihapus. Jika kunci terhapus, wajib dipilih lagi sebelum paket disimpan. |
| Kartu paket | Tombol Aktif dan Edit, Hapus dengan validasi, judul ujian hijau di dekat topik, total dan rincian tipe soal, lalu nama pembuat. |
| Hapus paket | Checkbox Simpan soal di bank data tercentang secara awal. Paket diarsipkan; jika dipilih, soal tetap tersedia untuk disalin/dipilih dari bank. Jadwal yang belum dikunci dilepas dari paket; snapshot ujian yang sudah dikunci tidak diubah. |
| Bank soal | Select all berlaku untuk hasil filter saat ini. Ukuran pencarian, checkbox, detail, dan jarak elemen diperbaiki. |

## Validasi

- `node tests/api.test.mjs`: seluruh regresi fase 1 dan revisi 1–4 lulus, termasuk endpoint login/password/cookie pada SQLite sementara.
- Pengujian baru: duplikasi kapital, kelas otomatis, upsert siswa, pemisahan data semester, identitas/token semester 2, penghapusan paket bersnapshot, pembatalan jadwal, pembuatan/login guru demo, dan penggabungan kelas lama.
- `tsc --noEmit`: lulus.
- Build produksi Sites dan ekspor mandiri: lulus.
- Pemeriksaan browser menggunakan komponen aplikasi dengan data sintetis: dashboard, pilihan tahun aktif, urutan form guru, filter tingkat, uncheck Semua kelas, pembukaan editor, dialog perubahan, penghapusan opsi dan perpindahan kunci, penutupan setelah simpan draft, konfirmasi hapus paket, select all, dan proporsi dialog.
- Halaman QA sementara dihapus sebelum build/deploy. Pengujian tidak mengubah akun atau hasil ujian asli. Pengujian beban simultan dan UAT akun sekolah belum termasuk.

## Penyimpanan dan penerapan

Skema SQL tetap kompatibel. Profil semester 2 memakai kind `academic_profile` pada tabel records yang sudah ada; tidak memerlukan penghapusan atau reset database. Normalisasi kelas dan pembuatan profil semester bersifat otomatis, satu kali, dan mempertahankan identitas. Akun pengelola tetap global; data pengajaran guru mengikuti profil semester.

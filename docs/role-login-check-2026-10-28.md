# Pemeriksaan login Guru Admin Unit dan Super Admin

Pemeriksaan menggunakan endpoint login password sebenarnya, cookie sesi hasil login, dan database SQLite sementara berisi data buatan. Akun sekolah tidak direset atau diubah untuk pengujian ini.

| Peran | Berhasil diuji | Tindakan yang ditolak |
| --- | --- | --- |
| Super Admin | Login password, melihat lintas unit, membuat pengelola, mengatur/reset login Admin Unit, menonaktifkan/mengaktifkan guru, backup | Akun dinonaktifkan tidak dapat login; sesi lama setelah reset tidak berlaku |
| Admin Unit | Login password, membaca data unit sendiri, membuat kelas/siswa unit sendiri, kartu akun siswa, token ujian, penugasan guru, reset akun guru unit sendiri | Ubah/hapus/reset akun siswa unit lain; backup utama; tahun pelajaran; membuat Super Admin; mengatur credential Super Admin |
| Guru | Login password, kelas/mapel penugasan, membuat bank mapel sendiri | Pengelolaan siswa/kelas/mapel/akun; pembuatan token tanpa wewenang; bank mapel lain; perubahan penugasan sendiri |
| Guru tugas Full | Membuat soal pada jadwal penugasan; hak koreksi tersedia | Melihat token tanpa tugas pengawas |
| Guru tugas Korektor | Hak koreksi tersedia pada jadwal | Mengunggah/mengganti soal dan melihat token |
| Guru tugas Pengawas | Melihat token pada jadwal pengawasan; data monitoring terbatas | Koreksi nilai dan perubahan soal; payload monitoring tidak berisi kunci, jawaban, atau nilai proses |

## Perbaikan

Sesi password yang tidak valid sebelumnya dapat diteruskan ke identitas ChatGPT yang masih aktif. Logout atau sesi kedaluwarsa kini meminta login ulang, termasuk ketika cookie sesi sudah dihapus otomatis oleh browser. Pilihan metode password disimpan dalam cookie HttpOnly terpisah. Penggunaan login ChatGPT harus dipilih secara eksplisit melalui tautan login yang tersedia pada versi Sites; ekspor mandiri tetap menggunakan login password.

Dashboard membersihkan form/data lama ketika sesi tidak valid atau identitas berubah. Pilihan tahun pelajaran yang sudah tidak tersedia dimuat ulang dari periode aktif. Data pilihan periode yang rusak di penyimpanan browser tidak lagi menyebabkan proses login/dashboard gagal diproses.

## Hasil dan batas pemeriksaan

Pengujian API seluruh revisi sebelumnya dan pengujian peran tambahan lolos. Pemeriksaan TypeScript serta build produksi dilakukan untuk Sites dan ekspor GitHub. Pengujian peran memakai request login/cookie dan database sementara, bukan login manual ke akun nyata Guru/Admin Unit/Super Admin pada situs produksi. Tidak dilakukan uji beban serentak atau perubahan data sekolah.

Tidak diperlukan perubahan schema SQL. Panduan presentasi sebelumnya tetap berlaku: gunakan profil/browser terpisah untuk mendemokan beberapa peran bersamaan.

# Revisi admin ke-3

Implementasi berdasarkan REVIEW CBT FIX (rev.3 admin).docx, termasuk 25 gambar referensi. Revisi ini melanjutkan revisi sebelumnya tanpa mengubah model identitas siswa atau token bersama per ujian/kelas.

| Area | Perubahan |
| --- | --- |
| Tahun Pelajaran | Submenu Data Akademik; pilihan tahun/semester di sidebar; tahun baru otomatis semester 1 dan 2; edit nama dan aktivasi tahun; referensi tahun ikut diperbarui. |
| Dashboard | Hanya agenda ujian hari ini (WIB), status waktu dan aksi monitoring kelas. |
| Kelas | Template Unit, Nama Kelas, Tingkat; tahun mengikuti periode pilihan; hapus dengan satu konfirmasi. Kelas yang masih dipakai siswa/jadwal diblokir agar relasi tidak rusak. |
| Siswa | Template tanpa tahun; nama/NIS/kelas/JK wajib; reset password acak di Edit data; hapus dari daftar aktif dengan satu konfirmasi. |
| Guru | Template NIY/Nama/Unit/JK; impor tidak memerlukan mapel atau kelas; impor ulang mempertahankan penugasan; nama mapel tidak peka kapitalisasi; checkbox banyak kelas per mapel; reset password; ubah password sendiri; hapus guru. NIY kosong tetap mendukung akun guru kontrak. |
| Mapel | Edit data termasuk nama/tingkat; dropdown memakai master; hapus dengan konfirmasi. |
| Jadwal | Daftar topik/edit/delete tetap tersedia. Mapel baru tidak lagi ditimpa paket soal lama. Validasi semua kelas sebelum menulis jadwal. Bentrok diperiksa untuk mapel, kelas dan periode yang sama. |
| Buat Soal | Unit → topik jadwal → mapel → tingkat → jadwal → kelas → judul. Unduh template Word 30 soal dari editor; parser lima jenis soal, baris kosong dilewati, pesan kesalahan menunjuk tabel. |
| Pemilihan Bank | Pop-up tabel dengan checkbox, jenis soal, lingkup materi, tingkat, pertanyaan, penggunaan dan detail kunci. Paket tanpa tingkat lama tetap dapat dipilih; soal disalin dengan ID baru. |
| Bank Soal | Kartu memakai topik paket; perubahan isi soal membuat identitas sumber baru. Penggunaan dihitung dari snapshot ujian jika telah dikunci. Perubahan bank tidak menulis ulang snapshot ujian. |

Penghapusan master mengarsipkan record, bukan menghapus sejarah ujian. Akun guru/siswa yang dihapus dinonaktifkan. Reset password mengganti revisi credential sehingga sesi sebelumnya tidak berlaku. Tidak ada data sekolah, password nyata atau token produksi yang disertakan dalam kode.

## Validasi

- Pemeriksaan TypeScript.
- Pengujian API SQLite: alur revisi 1–2 dan regresi revisi 3 (periode, impor, izin per unit, reset sesi, penghapusan, perubahan mapel dan snapshot).
- Pengujian generator/parser Word: 30 tabel, lima jenis soal, karakter Arab/simbol, validasi kunci.
- Pemeriksaan browser dengan data buatan: agenda hari ini, pengelolaan tahun, pop-up bank, checkbox/detail dan penambahan soal. Round-trip Word di browser menggunakan JSZip → persiapan Word → Mammoth → parser berhasil membaca lima soal dan melewati 25 tabel kosong.
- Build produksi Sites dan ekspor mandiri.

Belum merupakan uji beban atau UAT oleh seluruh pengguna sekolah. Tidak ada perubahan schema SQL yang diperlukan; fitur menggunakan record JSON/version yang sudah ada.

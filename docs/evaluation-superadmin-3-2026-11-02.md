# Evaluasi Super Admin 3 — 2 November 2026

Sumber: EVALUASI - role super admin-3.docx.

| Bagian | Perbaikan |
|---|---|
| Guru | Unit penugasan hanya unit utama. Ganti unit mengosongkan mapel/kelas; API menolak penugasan lintas unit. |
| Guru | Edit NIY mempertahankan username dan password akun guru yang sudah ada. Akun baru tetap memakai NIY. |
| Mata pelajaran | Tambah mapel duplikat memperbarui semua pilihan jenis soal, termasuk ketika semuanya dicentang. |
| Mata pelajaran | Konfirmasi penghapusan menggunakan pesan khusus mapel. |
| Buat soal | Pisahkan dan Gabung berikutnya memakai dialog aplikasi. Hasil perubahan perlu pemeriksaan dan pengisian ulang kunci. |
| Impor Word | Judul ESSAI (Satu Soal 4 Point) dikenali sehingga uraian tidak mewarisi bobot isian 2. |
| Simpan paket | Dialog menampilkan nomor soal, nomor sumber jika tersedia, dan alasan kunci/review belum lengkap. |
| Paket soal | Aktif menjadi badge status; Lihat detail dan Edit merupakan tindakan terpisah. |
| Token | Generate dan Generate ulang memakai dialog aplikasi. |
| Susulan | Klik kolom tanggal/jam membuka kalender; waktu selesai harus setelah mulai. |
| Navigasi | Kembali ke daftar menutup susulan di Token, Monitoring, dan Koreksi & nilai. Pergantian tab juga membersihkan dialog. |
| Koreksi | Daftar menampilkan status jadwal yang sesuai filter serta status penilaian terpisah. Detail siswa menggunakan Belum mulai / Sedang dikerjakan sampai jawaban dikumpulkan. |

## Verifikasi

- TypeScript tanpa error dan build produksi.
- Suite API: peran/login, perubahan NIY tanpa mengganti kredensial, pembatasan unit, mapel duplikat, token, nilai dan pengacakan 30 peserta.
- Impor dokumen asli ASAS 1 BAR 5 25-26: 10 PG, 5 PG kompleks, 5 isian, 5 uraian; seluruh uraian berbobot 4.
- Browser dengan data uji terpisah: popup token, kalender susulan, kembali pada ketiga menu, status belum mulai, pilihan semua jenis soal, pemisahan/penggabungan soal, pesan nomor soal, badge Aktif, unit penugasan SD dan pergantian ke SMP.
- Halaman fixture browser dihapus sebelum publikasi; tidak ada data sekolah diubah selama QA.

Perbaikan pembaca Word berlaku saat impor berikutnya. Paket yang sudah tersimpan dan snapshot ujian tidak diubah otomatis; periksa/ubah bobot paket lama atau impor ulang sebelum digunakan pada ujian baru.

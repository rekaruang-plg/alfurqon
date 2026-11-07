# Evaluasi revisi 5 — Super Admin

Acuan: EVALUASI REV.5 - role super admin.docx.

- Pengurutan naik/turun melalui judul kolom, pagination dan jumlah data di bawah tabel.
- Master tahun baru kosong, bank soal tetap tersedia; salinan semester 2 terpisah; profil tahunan menjaga identitas siswa/guru.
- Edit nama kelas memperbarui referensi periode tersebut; ditolak saat ujian berjalan.
- Checkbox siswa, pindah/hapus massal dengan konfirmasi; riwayat ujian disimpan.
- Kartu akun mengikuti tahun/semester, filter kelas dan unit untuk cetak/CSV.
- Guru: ringkasan mapel/tingkat, Lihat detail berisi akun dan penugasan, impor kelas tidak membedakan kapitalisasi.
- Jadwal memakai satu pemilih tanggal/jam.
- Popup peserta dan draft; lanjut/hapus draft; gambar tiap opsi; checkbox bacaan; pratinjau paket lengkap tanpa kunci.
- Token menampilkan jadwal/status, Generate/Lihat sesuai masa berlaku. Token baru kedaluwarsa pada batas interval 15 menit; sesi ujian berjalan tetap tersimpan.
- Bank soal: judul utama, topik lebih kecil, tanpa badge Aktif, detail tanpa edit per soal, editor tanpa pilihan topik.

Verifikasi: tujuh berkas pengujian otomatis, TypeScript, build produksi. Pemeriksaan browser dengan data sintetis mencakup pengurutan, seleksi massal, popup, editor gambar/bacaan, token, dan pemilih tanggal. Tidak mengubah data sekolah produksi; bukan uji beban jaringan sekolah. Skema tabel kompatibel, profil tahunan disimpan pada records.

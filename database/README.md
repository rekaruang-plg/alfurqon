# Struktur database CBT

`schema.sql` menggunakan SQLite/D1 dan dapat membuat database kosong. Model aktual aplikasi menggunakan tabel record JSON, bukan satu tabel SQL terpisah untuk setiap entitas.

| Tabel | Fungsi |
| --- | --- |
| records | Master, pengaturan, akun, sesi, bank soal, jadwal, audit dan vault terenkripsi; `kind` membedakan jenis record. |
| attempts | Satu hasil/sesi per student_id + exam_id. token_hash unik. data menyimpan jawaban, urutan soal beku, waktu, nilai dan status. |
| demo_records | Master dan aktivitas ruang demo. |
| demo_attempts | Percobaan ujian ruang demo. |

Kolom version mendukung optimistic concurrency. Identitas siswa dan referensi record menggunakan ID stabil. Tidak ada foreign key SQL ke tabel per entitas karena records bersifat polymorphic; validasi relasi dilakukan API.

## Jenis record utama

- student: nama, NIS, unit, kelas, tahun, gender; ID dipertahankan untuk riwayat.
- class: unit, nama, tingkat, tahun, wali kelas.
- staff: guru/admin, unit, NIY/nomor kontrak dan penugasan mapel/kelas.
- subject, year, topic: master mapel, periode, topik.
- bank: kumpulan questions dengan tipe, materi, opsi, kunci, kata kunci, poin dan mode input.
- exam: jadwal satu kelas, mata pelajaran, tahun/semester, bankId, tugas tambahan dan peserta susulan.
- snapshot: soal yang dibekukan saat ujian disiapkan.
- draft: draft soal dengan pemilik.
- credential: username, salt, hash PBKDF2-SHA256, staffId dan revision.
- student_identity: penghubung akun login dengan studentId.
- session, login_limit: sesi login dan pembatasan percobaan.
- token_vault, shared_token, account_vault: data terenkripsi menggunakan TOKEN_VAULT_KEY.
- audit, config: catatan tindakan dan status instalasi.

## Indeks

records(kind); attempts(student_id, exam_id) UNIQUE; attempts(token_hash) UNIQUE; attempts(exam_id). Tabel demo memiliki padanan indeks. Data JSON menggunakan fungsi SQLite seperti json_extract/json_set; tidak bisa langsung ditafsirkan sebagai schema MySQL.

Schema ini tidak berisi murid, jawaban, akun asli, maupun kunci produksi. Katalog contoh dibuat aplikasi setelah login Super Admin. Uji restore memakai database terpisah sebelum memindahkan data nyata.

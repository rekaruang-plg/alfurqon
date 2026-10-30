# Token dan akun singkat

Token ujian baru berisi 5 karakter A–Z/2–9 tanpa karakter yang membingungkan. Token bersama tetap berganti setiap 15 menit berdasarkan jam server. Token internal per peserta juga dibuat 5 karakter dan diperiksa agar tidak sama dengan token peserta yang masih tersimpan. Token lama tetap dapat dipakai untuk sesi lama. Ruang demo mempertahankan awalan DEMO- untuk pemisahan data simulasi.

Username siswa baru memakai NIS tanpa awalan unit. Huruf disimpan lowercase, angka nol depan dipertahankan. Bila username sudah dipakai akun lain, diberikan akhiran .1, .2 dan seterusnya; kartu login menunjukkan username sebenarnya. Tidak ada penggabungan akun lintas siswa. Akun lama tetap menggunakan username/password sebelumnya. Reset satu siswa mengubah username ke NIS bila tersedia dan membuat password baru; jika bentrok, reset ditolak dengan pesan tanpa mengambil akun lain.

Password otomatis tepat 8 karakter: ambil hanya digit NIS siswa atau NIY guru, pilih lima digit terakhir, tambahkan digit acak di kanan jika kurang dari lima, lalu tiga huruf kecil acak. Tanpa nomor induk: lima digit acak dan tiga huruf kecil acak. Contoh ilustrasi: NIS 202612345 → 12345abc; NIS 123 → 12367xyz. Suffix dan padding dibuat memakai crypto.getRandomValues. Tidak ada password contoh yang ditanam sebagai password produksi.

Guru tetap memakai NIY; guru kontrak tanpa NIY mempertahankan username nomor kontrak. Admin/Super Admin dapat memakai tombol Buat password standar 8 karakter pada pengaturan login. Tombol hanya memberi usulan; perubahan baru berlaku setelah Simpan login. Password manual, perubahan mandiri, dan pemulihan kini menerima 8–128 karakter. Akun demo baru juga memakai password 8 karakter. Password lama tidak direset massal.

Verifikasi: login siswa dan pengelola, password panjang dan pendek, padding NIS, NIS nol depan, fallback tanpa nomor, reset/recovery, minimum delapan dan penolakan tujuh karakter, token lima karakter, rotasi 15 menit, isolasi sesi/perangkat, serta regresi API lainnya.

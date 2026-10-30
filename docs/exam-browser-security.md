# Token dan pembatasan browser

Token masuk bersama kini diturunkan dari seed terenkripsi per ujian dan jendela waktu server 15 menit (00/15/30/45). Token lama langsung ditolak pada jendela berikutnya, tanpa cron. Generate ulang mengganti seed sehingga token lama langsung tidak berlaku. Token yang pernah ditampilkan sebelum pembaruan tidak digunakan sebagai seed baru. Halaman pengawas menyegarkan tampilan setiap lima detik dengan hitung mundur; ketika kedaluwarsa token lama disembunyikan.

Token masuk bukan sesi pengerjaan. Siswa yang sudah mengerjakan tidak terputus ketika token berganti. Attempt tetap terikat sessionHash; perangkat/sesi berbeda ditolak sampai pengawas melepas sesi dengan alasan. Upaya studentLaunch saat ujian aktif ditolak tanpa mengumpulkan jawaban siswa yang sedang mengerjakan.

Ujian nyata yang baru dimulai memakai browserGuard. Klik kanan, copy/cut/paste, drag/drop dan shortcut clipboard/print/save dicegah di halaman ujian. Keyboard jawaban dan keyboard simbol internal tetap tersedia. Layar penuh diminta saat tombol mulai diklik apabila API fullscreen tersedia; kegagalan permintaan tidak memulai ujian. Browser tanpa fullscreen tetap memakai deteksi halaman tersembunyi dan pembatasan clipboard.

Saat halaman hidden (pindah tab/minimize/aplikasi) atau keluar fullscreen, editor segera dikunci. Laporan securityLock menyimpan jawaban yang valid, menjeda waktu, menyimpan alasan di catatan pengawas, dan menolak enter/answer sampai pengawas releaseSession. Heartbeat tetap bisa membaca status terkunci. API memverifikasi akun dan sesi sebelum mengembalikan jawaban. Setelah releaseSession, siswa konfirmasi dan masuk kembali untuk melanjutkan sisa waktu. Kejadian ini tidak otomatis menetapkan kecurangan atau nilai nol.

Batas: situs web bukan kiosk. Pengguna dapat keluar fullscreen, menonaktifkan JavaScript, memakai perangkat kedua, atau memakai fitur OS yang tidak terdeteksi. Tidak ada jaminan blok screenshot, seluruh shortcut browser, atau aplikasi lain. Untuk penguncian perangkat diperlukan aplikasi ujian/kiosk yang dikelola sekolah; integrasi itu belum diterapkan. Percobaan copy/paste diblokir tanpa otomatis menghukum siswa. Pembatasan tidak diterapkan pada editor guru dan simulasi; ujian yang sudah berjalan sebelum deploy mempertahankan kebijakannya.

Tes: rotasi batas waktu server, penolakan token lama, kelangsungan sesi terikat, penolakan perangkat lain, penyimpanan jawaban ketika terkunci, penolakan unlock oleh siswa, dan resume setelah pengawas melepas sesi. Tidak ada migrasi destruktif.

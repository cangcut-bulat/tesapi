const express = require('express');
const chalk = require('chalk');
const fs = require('fs');
const cors = require('cors');
const path = require('path');

console.log("LOG: Script index.js dimulai."); // <-- Log 1

// Import file function.js
require("./function.js");
console.log("LOG: function.js dimuat."); // <-- Log 2

const app = express();
// PERBAIKAN PORT PENTING UNTUK PTERODACTYL
const PORT = process.env.SERVER_PORT || process.env.PORT || 8000;
console.log(`LOG: Port yang akan digunakan: ${PORT}`); // <-- Log 3 (Cek port Pterodactyl)

app.enable("trust proxy");
app.set("json spaces", 2);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cors());
console.log("LOG: Middleware dasar dimuat."); // <-- Log 4

// Static file serving
app.use('/', express.static(path.join(__dirname, '/')));
app.use('/', express.static(path.join(__dirname, 'api-page'))); // Sajikan api-page dari root
app.use('/src', express.static(path.join(__dirname, 'src')));
// Jika folder images/audio ada di root (sejajar index.js)
app.use('/images', express.static(path.join(__dirname, 'images')));
app.use('/audio', express.static(path.join(__dirname, 'audio')));
console.log("LOG: Penyajian file statis dikonfigurasi."); // <-- Log 5

// Load settings.json
const settingsPath = path.join(__dirname, './settings.json');
let settings = {};
global.endpointStatus = {}; // <-- REQ 6: Inisialisasi global status
try {
  console.log("LOG: Mencoba membaca settings.json..."); // <-- Log 6
  settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  global.settings = settings; // Simpan ke global agar bisa diakses file lain
  
  // --- REQ 6: Inisialisasi status dari settings.json ---
  for (const category in settings.endpoints) {
    if (Array.isArray(settings.endpoints[category])) {
        for (const endpoint of settings.endpoints[category]) {
            if (endpoint.path) {
                const basePath = endpoint.path.split('?')[0];
                global.endpointStatus[basePath] = endpoint.status || 'Active'; // Ambil status dari file
            }
        }
    }
  }
  console.log("LOG: settings.json berhasil dibaca dan status diinisialisasi."); // <-- Log 7
  // --- Akhir REQ 6 ---

} catch (err) {
  console.error(chalk.red(`FATAL ERROR: Gagal memuat settings.json: ${err.message}`)); // <-- Log Error Penting
  process.exit(1); // Hentikan jika settings gagal dimuat
}

global.apikey = settings.apikey || []; // Pastikan array, meskipun kosong
global.totalreq = 0;
console.log("LOG: Variabel global diinisialisasi."); // <-- Log 8

// Middleware untuk log request dan format JSON (pastikan 'settings' sudah ada)
app.use((req, res, next) => {
  console.log(chalk.bgHex('#FFFF99').hex('#333').bold(` Request Route: ${req.path} `));
  global.totalreq += 1;

  const originalJson = res.json;
  res.json = function (data) {
    if (data && typeof data === 'object' && data.status !== undefined) { // Cek status ada
      const responseData = {
        // status: data.status !== undefined ? data.status : false, // Beri default status jika tidak ada
        creator: global.settings.creator || "Rikishopreal", // Ambil dari global.settings
        ...data // Letakkan data asli setelah creator
      };
      // Hapus creator duplikat jika ada di data asli
      // delete responseData.data?.creator;
      return originalJson.call(this, responseData);
    }
    // Jika bukan format standar, kirim apa adanya
    return originalJson.call(this, data);
  };

  next();
});
console.log("LOG: Middleware response JSON dimuat."); // <-- Log 9

// Load dynamic routes
let totalRoutes = 0;
const apiFolder = path.join(__dirname, './src');
console.log("LOG: Memulai memuat rute dari folder src..."); // <-- Log 10

try { // Tambahkan try-catch di sekitar pemuatan rute
    fs.readdirSync(apiFolder).forEach((subfolder) => {
      const subfolderPath = path.join(apiFolder, subfolder);
      if (fs.statSync(subfolderPath).isDirectory()) {
        console.log(`LOG: Membaca subfolder: ${subfolder}`); // <-- Log Subfolder
        fs.readdirSync(subfolderPath).forEach((file) => {
          const filePath = path.join(subfolderPath, file);
          if (path.extname(file) === '.js') {
            try { // Try-catch per file
              console.log(`LOG: Mencoba memuat rute: ${file}...`); // <-- Log Sebelum Require
              require(filePath)(app); // Jalankan fungsi yang diekspor
              totalRoutes++;
              console.log(chalk.green(`  -> Berhasil memuat: ${file}`)); // <-- Log Setelah Require (Hijau)
            } catch (loadError) {
              // Tampilkan error jika GAGAL memuat satu file rute
              console.error(chalk.red(`  -> GAGAL memuat rute: ${file}. Error: ${loadError.message}`));
              // Anda bisa memilih untuk menghentikan server di sini jika satu rute gagal:
              // process.exit(1);
              // Atau biarkan lanjut memuat rute lain (server mungkin tetap jalan tapi endpoint yg error tidak berfungsi)
            }
          }
        });
      }
    });
    console.log(chalk.bgHex('#90EE90').hex('#333').bold(' LOG: Selesai memuat rute! ✓ ')); // <-- Log 11
    console.log(chalk.bgHex('#90EE90').hex('#333').bold(` LOG: Total Rute Dimuat: ${totalRoutes} `));
} catch (readDirError) {
    console.error(chalk.red(`FATAL ERROR: Gagal membaca folder src atau subfolder: ${readDirError.message}`));
    process.exit(1); // Hentikan jika gagal baca direktori
}


// Default home page
app.get('/', (req, res) => {
  // Sajikan index.html dari api-page
  res.sendFile(path.join(__dirname, 'api-page', 'index.html'));
});
console.log("LOG: Rute default '/' dikonfigurasi."); // <-- Log 12

// --- REQ 6: Endpoint untuk status real-time ---
app.get('/api/endpoint-status', (req, res) => {
    res.json({
        status: true,
        creator: global.settings.creator || "Rikishopreal",
        data: global.endpointStatus
    });
});
console.log("LOG: Rute '/api/endpoint-status' dikonfigurasi."); // <-- REQ 6
// --- Akhir REQ 6 ---


// 404 handler
app.use((req, res) => {
  // Sajikan 404.html dari root atau api-page
  const fourOhFourPath = path.join(__dirname, '404.html'); // Coba di root dulu
  if (fs.existsSync(fourOhFourPath)) {
      res.status(404).sendFile(fourOhFourPath);
  } else {
      // Fallback ke api-page jika tidak ada di root
      res.status(404).sendFile(path.join(__dirname, 'api-page', '404.html'));
  }
});
console.log("LOG: Handler 404 dikonfigurasi."); // <-- Log 13

// 500 error handler
app.use((err, req, res, next) => {
  console.error(chalk.red("ERROR HANDLER 500:"), err.stack); // Log error stack trace
  
  // --- REQ 6: Lacak error untuk status real-time ---
  if (req.path && global.endpointStatus[req.path] !== undefined) {
      global.endpointStatus[req.path] = 'Error';
      console.log(chalk.yellow(`LOG: Status untuk ${req.path} diatur ke 'Error' karena ada 500.`));
  }
  // --- Akhir REQ 6 ---

  // Sajikan 500.html dari root atau api-page
  const fiveHundredPath = path.join(__dirname, '500.html');
   if (fs.existsSync(fiveHundredPath)) {
       res.status(500).sendFile(fiveHundredPath);
   } else {
       res.status(500).sendFile(path.join(__dirname, 'api-page', '500.html'));
   }
});
console.log("LOG: Handler 500 dikonfigurasi."); // <-- Log 14

// Start server
console.log("LOG: Mencoba menjalankan app.listen...");
const server = app.listen(PORT, '0.0.0.0', () => {
  // Baca hostname dari settings.json, beri fallback '0.0.0.0' jika tidak ada
  const hostname = settings.publicAddress || '0.0.0.0'; // <--- UBAH DI SINI

  // Buat URL lengkap
  const accessibleUrl = `http://${hostname}:${PORT}`;

  // Tampilkan URL yang bisa diakses
  // (Saya kembalikan chalk agar warna-warni lagi)
  console.log(` Server BERHASIL berjalan di ${accessibleUrl} `);
});

server.on('error', (error) => {
  console.error(chalk.red('FATAL ERROR saat menjalankan app.listen! 💥'));
  if (error.syscall !== 'listen') {
    throw error; // Lempar error lain
  }

  // Handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      console.error(chalk.red(`Port ${PORT} memerlukan hak akses lebih tinggi (elevated privileges).`));
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(chalk.red(`Port ${PORT} sudah digunakan oleh proses lain.`));
      process.exit(1);
      break;
    default:
      console.error(chalk.red(`Error tidak dikenal saat listen:`), error);
      throw error; // Lempar error lain
  }
});

// Tambahkan penanganan error Uncaught Exception & Unhandled Rejection
process.on('uncaughtException', (err) => {
  console.error(chalk.red('UNCAUGHT EXCEPTION! 💥'), err);
  // process.exit(1); // Pertimbangkan untuk keluar jika terjadi error tak terduga
});
process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('UNHANDLED REJECTION! 💥'), reason);
  // process.exit(1);
});

console.log("LOG: Pemanggilan app.listen selesai secara sinkron.");

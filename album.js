/* ==========================================================
   BINGKAI FAMILY - PUBLIC ALBUM
   ----------------------------------------------------------
   Memuat daftar foto dari Realtime Database (path: photos)
   untuk ditampilkan di halaman utama (index.html).
   Tidak perlu login — siapa saja bisa melihat foto.

   Foto disimpan sebagai base64 string di field "data".

   Versi ini lebih defensif:
   - Handle DOM yang sudah ready sebelum script jalan
   - Logging lebih verbose untuk debugging
   - Tampilkan error spesifik kalau query gagal
   ========================================================== */
import { initializeApp } from
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  query,
  orderByChild,
  limitToLast,
  get
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

import { firebaseConfig } from "./firebase-config.js";

console.log("[Album] Module album.js dimuat.");

// Inisialisasi Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
console.log("[Album] Firebase app & database siap.");

// Elemen
const albumGrid = document.getElementById("albumGrid");
console.log("[Album] Elemen #albumGrid ditemukan:", !!albumGrid);

// Jumlah foto yang ditampilkan di halaman publik
const PHOTO_LIMIT = 30;

async function loadAlbum() {
  console.log("[Album] loadAlbum() dipanggil.");

if (!albumGrid) {
    console.error("[Album] #albumGrid tidak ditemukan di halaman ini.");
    return;
  }

  albumGrid.innerHTML =
    '<div class="album-empty">Memuat foto keluarga...</div>';

  try {
    console.log("[Album] Mengirim query ke Realtime Database...");

    const photosRef = query(
      ref(db, "photos"),
      orderByChild("createdAt"),
      limitToLast(PHOTO_LIMIT)
    );

  const snapshot = await get(photosRef);

    console.log("[Album] Query selesai. exists =", snapshot.exists());

    if (!snapshot.exists()) {
      albumGrid.innerHTML =
        '<div class="album-empty">' +
        'Belum ada foto. <a href="login.html" style="color:var(--gold);font-weight:600">' +
        'Masuk ke Admin</a> untuk menambah foto pertama.</div>';
      return;
    }

  // Reverse: terbaru di atas
    const items = [];
    snapshot.forEach((child) => {
      items.push(child.val());
    });
    items.reverse();

    console.log("[Album] Jumlah foto dimuat:", items.length);

    albumGrid.innerHTML = "";
    items.forEach((data) => {
      const photo = createPhotoCard(data);
      albumGrid.appendChild(photo);
    });

  console.log("[Album] Render selesai.");
  } catch (err) {
    console.error("[Album] Error:", err);
    albumGrid.innerHTML =
      '<div class="album-empty">' +
      'Gagal memuat foto: ' + friendlyError(err) +
      '<br><br>Pastikan:<br>' +
      '1. Konfigurasi <code>firebase-config.js</code> sudah benar<br>' +
      '2. Realtime Database Rules mengizinkan baca publik + punya .indexOn<br>' +
      '3. Database URL sudah diisi dengan benar' +
      '</div>';
  }
}

function createPhotoCard(data) {
  const a = document.createElement("a");
  a.className = "album-photo";
  a.href = data.data; // base64 data URL
  a.target = "_blank";
  a.rel = "noopener";

  const img = document.createElement("img");
  img.src = data.data;
  img.alt = data.caption || data.name || "Foto keluarga";
  img.loading = "lazy";

  const caption = document.createElement("div");
  caption.className = "album-caption";
  caption.textContent = data.caption || "";

a.appendChild(img);
  if (data.caption) a.appendChild(caption);

  return a;
}

function friendlyError(err) {
  const msg = err.message || String(err);
  if (/index not defined/i.test(msg)) {
    return 'Rules belum punya .indexOn untuk "createdAt". ' +
      'Buka README-FIREBASE.md bagian Rules.';
  }
  if (/permission denied/i.test(msg)) {
    return 'Permission denied. Periksa Realtime Database Rules.';
  }
  return msg;
}

// Trigger loadAlbum: handle kedua kasus
// (DOM masih loading, atau DOM sudah ready)
if (document.readyState === "loading") {
  console.log("[Album] DOM masih loading, tunggu DOMContentLoaded...");
  document.addEventListener("DOMContentLoaded", loadAlbum);
} else {
  console.log("[Album] DOM sudah ready, langsung load.");
  loadAlbum();
}

console.log("[Album] Album siap (RTDB mode).");

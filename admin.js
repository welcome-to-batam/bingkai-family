/* ==========================================================
   BINGKAI FAMILY - ADMIN DASHBOARD LOGIC
   ----------------------------------------------------------
   Arsitektur (Spark plan / gratis):
     - Firebase Authentication : login admin (di login.html)
     - Realtime Database       : simpan foto sebagai base64 string
     - Firebase Storage        : TIDAK DIPAKAI (butuh Blaze plan)

   Halaman ini hanya dashboard. Auth guard akan redirect ke
   login.html kalau user belum login.

   Optimasi upload (vs versi lama):
     1. Kompresi lebih agresif (800px, JPEG q 0.5, max 400 KB)
     2. Timeout 30 detik per upload — tidak menggantung selamanya
     3. Pakai get() bukan onValue() — tidak re-download terus
     4. Error message jelas untuk Permission denied / timeout
   ========================================================== */

import { initializeApp } from
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase,
  ref,
  push,
  set,
  get,
  remove,
  query,
  orderByChild
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

import { firebaseConfig } from "./firebase-config.js";

// ---- Inisialisasi Firebase ----
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// ---- Elemen DOM ----
const adminUser      = document.getElementById("adminUser");
const btnLogout      = document.getElementById("btnLogout");

const uploadForm     = document.getElementById("uploadForm");
const dropZone       = document.getElementById("dropZone");
const fileInput      = document.getElementById("fileInput");
const filePreview    = document.getElementById("filePreview");
const photoCaption   = document.getElementById("photoCaption");
const btnUpload      = document.getElementById("btnUpload");
const uploadStatus   = document.getElementById("uploadStatus");
const uploadProgress = document.getElementById("uploadProgress");
const progressFill   = document.getElementById("progressFill");
const progressText   = document.getElementById("progressText");

const photoGrid      = document.getElementById("photoGrid");
const btnRefresh     = document.getElementById("btnRefresh");

// State file yang dipilih
let selectedFiles = [];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB sebelum kompresi
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

// Setting kompresi (AGRESIF — supaya upload cepat di RTDB)
const COMPRESS_MAX_DIM = 800;       // maks dimensi piksel (turun dari 1024)
const COMPRESS_QUALITY = 0.5;       // JPEG quality 0-1 (turun dari 0.7)
const COMPRESS_FALLBACK_QUALITY = 0.35; // jika masih kebesaran
const MAX_COMPRESSED_SIZE = 400 * 1024; // 400 KB hard limit (turun dari 750 KB)

// Timeout untuk operasi database (ms)
const DB_TIMEOUT = 30000;

// =========================================================
// 1. AUTH GUARD
// =========================================================

onAuthStateChanged(auth, (user) => {
  if (!user) {
    // Belum login → balik ke halaman login
    window.location.replace("login.html");
    return;
  }

  // Sudah login → tampilkan email + load dashboard
  adminUser.hidden = false;
  adminUser.textContent = "👤 " + user.email;
  loadPhotos();
});

btnLogout.addEventListener("click", async () => {
  try {
    await signOut(auth);
    // onAuthStateChanged akan redirect ke login.html
  } catch (err) {
    console.error(err);
    alert("Gagal keluar: " + err.message);
  }
});

// =========================================================
// 2. PILIH FILE (DRAG & DROP + CLICK)
// =========================================================

dropZone.addEventListener("click", () => fileInput.click());
dropZone.addEventListener("keypress", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fileInput.click();
  }
});

fileInput.addEventListener("change", (e) => {
  handleFiles(e.target.files);
});

["dragenter", "dragover"].forEach((evt) => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });
});

["dragleave", "drop"].forEach((evt) => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
  });
});

dropZone.addEventListener("drop", (e) => {
  const files = e.dataTransfer.files;
  if (files && files.length) {
    handleFiles(files);
  }
});

function handleFiles(fileList) {
  selectedFiles = [];

  for (const file of fileList) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadStatus("Format '" + file.name + "' tidak didukung.", "error");
      continue;
    }
    if (file.size > MAX_FILE_SIZE) {
      setUploadStatus("'" + file.name + "' melebihi 10 MB.", "error");
      continue;
    }
    selectedFiles.push(file);
  }

  renderPreview();
  btnUpload.disabled = selectedFiles.length === 0;
}

function renderPreview() {
  if (selectedFiles.length === 0) {
    filePreview.hidden = true;
    filePreview.innerHTML = "";
    return;
  }

  filePreview.hidden = false;
  filePreview.innerHTML = "";

  selectedFiles.forEach((file) => {
    const item = document.createElement("div");
    item.className = "file-preview-item";

    const img = document.createElement("img");
    img.alt = file.name;
    img.src = URL.createObjectURL(file);

    const name = document.createElement("div");
    name.className = "file-name";
    name.textContent = file.name;

    item.appendChild(img);
    item.appendChild(name);
    filePreview.appendChild(item);
  });
}

// =========================================================
// 3. KOMPRESI FOTO (CANVAS) — AGRESIF
// =========================================================

/**
 * Kompres file gambar jadi JPEG base64 string.
 * - Resize ke maks COMPRESS_MAX_DIM piksel (preserve aspect ratio)
 * - Output: data URL "data:image/jpeg;base64,..."
 *
 * Versi ini lebih agresif dari versi sebelumnya:
 * - Dimensi maks 800px (sebelumnya 1024px)
 * - Quality 0.5 (sebelumnya 0.7)
 * - Hard limit 400 KB (sebelumnya 750 KB)
 */
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;

        // Resize jika melebihi maks dimensi
        if (width > COMPRESS_MAX_DIM || height > COMPRESS_MAX_DIM) {
          if (width >= height) {
            height = Math.round((height / width) * COMPRESS_MAX_DIM);
            width = COMPRESS_MAX_DIM;
          } else {
            width = Math.round((width / height) * COMPRESS_MAX_DIM);
            height = COMPRESS_MAX_DIM;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        // Background putih supaya PNG transparan tetap terlihat
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Coba quality utama dulu
        let dataUrl = canvas.toDataURL("image/jpeg", COMPRESS_QUALITY);
        let sizeBytes = estimateBase64Bytes(dataUrl);

        // Kalau masih kebesaran, coba quality lebih rendah
        if (sizeBytes > MAX_COMPRESSED_SIZE) {
          dataUrl = canvas.toDataURL("image/jpeg", COMPRESS_FALLBACK_QUALITY);
          sizeBytes = estimateBase64Bytes(dataUrl);
        }

        // Kalau masih kebesaran juga, turunkan dimensi
        if (sizeBytes > MAX_COMPRESSED_SIZE) {
          const ratio = Math.sqrt(
            MAX_COMPRESSED_SIZE / sizeBytes
          );
          const newW = Math.max(100, Math.round(width * ratio));
          const newH = Math.max(100, Math.round(height * ratio));

          canvas.width = newW;
          canvas.height = newH;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, newW, newH);
          ctx.drawImage(img, 0, 0, newW, newH);

          dataUrl = canvas.toDataURL("image/jpeg", COMPRESS_FALLBACK_QUALITY);
          sizeBytes = estimateBase64Bytes(dataUrl);
        }

        if (sizeBytes > MAX_COMPRESSED_SIZE) {
          reject(new Error(
            "Foto terlalu kompleks setelah kompresi (" +
            Math.round(sizeBytes / 1024) + " KB). Coba foto lain atau " +
            "crop sebelum upload."
          ));
          return;
        }

        resolve({ dataUrl, size: sizeBytes });
      };
      img.onerror = () => reject(new Error("Gagal memuat gambar."));
      img.src = e.target.result;
    };

    reader.onerror = () => reject(new Error("Gagal membaca file."));
    reader.readAsDataURL(file);
  });
}

/**
 * Estimasi ukuran byte dari data URL base64.
 * data URL format: "data:image/jpeg;base64,XXXX..." — kita hitung
 * panjang base64 (setelah koma) × 0.75 untuk dapat byte asli.
 */
function estimateBase64Bytes(dataUrl) {
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx < 0) return 0;
  return Math.round((dataUrl.length - commaIdx - 1) * 0.75);
   }

 // =========================================================
// 4. UTIL: TIMEOUT WRAPPER
// =========================================================

function withTimeout(promise, ms, msg) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(msg)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// =========================================================
// 5. UPLOAD FOTO
// =========================================================

uploadForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (selectedFiles.length === 0) {
    setUploadStatus("Pilih minimal satu foto.", "error");
    return;
  }

  const user = auth.currentUser;
  if (!user) {
    setUploadStatus("Sesi habis. Silakan login ulang.", "error");
   return;
  }
   
 btnUpload.disabled = true;
  btnUpload.textContent = "Mengunggah...";
  uploadProgress.hidden = false;

  const caption = photoCaption.value.trim();
  let successCount = 0;
  let failCount = 0;
  const errors = [];

  for (let i = 0; i < selectedFiles.length; i++) {
    const file = selectedFiles[i];
    const pctBase = Math.round((i / selectedFiles.length) * 100);
    const pctRange = Math.round(100 / selectedFiles.length);

   updateProgress(pctBase, "Memproses " + file.name);

    try {
      // 1) Kompres foto
      updateProgress(
        pctBase + Math.round(pctRange * 0.4),
        "Mengompres " + file.name
      );
      const { dataUrl, size } = await compressImage(file);

      // 2) Simpan ke Realtime Database (dengan timeout 30s)
      updateProgress(
        pctBase + Math.round(pctRange * 0.7),
        "Menyimpan " + file.name + " ke database"
      );

     const newPhotoRef = push(ref(db, "photos"));
      await withTimeout(
        set(newPhotoRef, {
          data: dataUrl,
          name: file.name,
          caption: caption,
          size: size,
          type: "image/jpeg",
          uploader: user.email,
          createdAt: Date.now()
        }),
        DB_TIMEOUT,
        "Timeout: penyimpanan ke database lebih dari " +
          (DB_TIMEOUT / 1000) + " detik. Periksa koneksi internet."
      );

     successCount++;
      updateProgress(pctBase + pctRange, "Selesai: " + file.name);
    } catch (err) {
      console.error("Upload error:", err);
      failCount++;
      errors.push(file.name + ": " + friendlyDbError(err));
    }
  }

  updateProgress(100, "Selesai");
  btnUpload.disabled = false;
  btnUpload.textContent = "Unggah Foto";

  if (failCount === 0) {
    setUploadStatus(
      successCount + " foto berhasil diunggah!", "success"
    );
     } else {
    setUploadStatus(
      successCount + " berhasil, " + failCount + " gagal. " +
      errors.join("; "),
      "error"
    );
  }

  setTimeout(() => {
    uploadProgress.hidden = true;
    updateProgress(0, "Mengunggah... 0%");
  }, 1500);

  selectedFiles = [];
  fileInput.value = "";
  photoCaption.value = "";
  renderPreview();
  btnUpload.disabled = true;

// Refresh daftar foto
  loadPhotos();
});

function updateProgress(pct, text) {
  progressFill.style.width = pct + "%";
  progressText.textContent = text + " (" + pct + "%)";
}

function setUploadStatus(msg, type) {
  uploadStatus.textContent = msg;
  uploadStatus.className = "upload-status" + (type ? " " + type : "");
}

/**
 * Translate error Firebase Realtime Database ke pesan ramah pengguna.
 */
function friendlyDbError(err) {
  const msg = err.message || String(err);
  if (/permission denied/i.test(msg)) {
    return "Permission denied. Salin rules dari README-FIREBASE.md " +
      "ke Realtime Database > Rules, lalu Publish.";
  }
  if (/network|fetch|connection/i.test(msg)) {
     return "Gangguan jaringan. Periksa koneksi internet.";
  }
  if (/timeout/i.test(msg)) {
    return "Timeout. Koneksi terlalu lambat. Coba foto lebih kecil.";
  }
  if (/quota/i.test(msg)) {
    return "Kuota Realtime Database habis. Lihat README bagian " +
      "Catatan Kapasitas.";
  }
  return msg;
}

// =========================================================
// 6. DAFTAR FOTO (PAKAI get(), BUKAN onValue)
// =========================================================
//
// Penting: pakai get() supaya dashboard tidak re-download semua
// foto terus-menerus. Refresh manual via tombol "Muat Ulang"
// atau otomatis setelah upload selesai.
btnRefresh.addEventListener("click", loadPhotos);

async function loadPhotos() {
  photoGrid.innerHTML = '<div class="photo-empty">Memuat foto...</div>';

  try {
    const photosRef = query(
      ref(db, "photos"),
      orderByChild("createdAt")
    );

    const snapshot = await withTimeout(
      get(photosRef),
      DB_TIMEOUT,
      "Gagal memuat foto: timeout (koneksi lambat)."
    );

   if (!snapshot.exists()) {
      photoGrid.innerHTML =
        '<div class="photo-empty">Belum ada foto. Upload foto pertamamu!</div>';
      return;
    }

    // Reverse: terbaru di atas
    const items = [];
    snapshot.forEach((child) => {
      items.push({ id: child.key, ...child.val() });
    });
    items.reverse();

    photoGrid.innerHTML = "";
    items.forEach((data) => {
      const card = createPhotoCard(data.id, data);

    photoGrid.appendChild(card);
    });
  } catch (err) {
    console.error(err);
    photoGrid.innerHTML =
      '<div class="photo-empty">Gagal memuat foto: ' +
      friendlyDbError(err) + "</div>";
  }
}

function createPhotoCard(id, data) {
  const card = document.createElement("article");
  card.className = "photo-item";

const img = document.createElement("img");
  img.className = "photo-item-img";
  img.src = data.data; // base64 data URL
  img.alt = data.caption || data.name || "Foto keluarga";
  img.loading = "lazy";

  const body = document.createElement("div");
  body.className = "photo-item-body";

  const caption = document.createElement("div");
  caption.className = "photo-item-caption";
  caption.textContent = data.caption || "(tanpa caption)";

  const meta = document.createElement("div");
  meta.className = "photo-item-meta";
  meta.textContent = formatDate(data.createdAt) + " • " +
    formatBytes(data.size);

  body.appendChild(caption);
  body.appendChild(meta);

  const actions = document.createElement("div");
  actions.className = "photo-item-actions";

  const btnView = document.createElement("button");
  btnView.className = "btn-view";
  btnView.textContent = "Lihat";

btnView.addEventListener("click", () => {
    const w = window.open("");
    if (w) {
      w.document.write(
        '<title>' + (data.caption || data.name) + '</title>' +
        '<body style="margin:0;background:#111;display:grid;place-items:center;height:100vh">' +
        '<img src="' + data.data + '" style="max-width:100%;max-height:100vh"></body>'
      );
    }
  });

   const btnDelete = document.createElement("button");
  btnDelete.className = "btn-delete";
  btnDelete.textContent = "Hapus";
  btnDelete.addEventListener("click", () => deletePhoto(id, data));

  actions.appendChild(btnView);
  actions.appendChild(btnDelete);

  card.appendChild(img);
  card.appendChild(body);
  card.appendChild(actions);

  return card;
}

async function deletePhoto(id, data) {
  if (!confirm("Hapus foto ini? Tindakan tidak bisa dibatalkan.")) return;

  try {
    await withTimeout(
      remove(ref(db, "photos/" + id)),
      DB_TIMEOUT,
      "Gagal menghapus: timeout."
    );
    loadPhotos();
  } catch (err) {
    console.error(err);
    alert("Gagal menghapus foto: " + friendlyDbError(err));
  }
}

// =========================================================
// 7. UTIL
// =========================================================

function formatDate(ms) {
  if (!ms) return "—";
  const d = new Date(ms);
  return d.toLocaleDateString("id-ID", {
    day: "numeric", month: "short", year: "numeric"
  });
}

function formatBytes(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

// Tahun footer
const footerYear = document.getElementById("footerYear");
if (footerYear) {
  footerYear.textContent =
    "© " + new Date().getFullYear() + " BINGKAI FAMILY. All Rights Reserved.";
}

console.log("BINGKAI FAMILY Dashboard siap (RTDB mode, optimized).");

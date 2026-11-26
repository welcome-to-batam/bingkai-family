/* ==========================================================
   BINGKAI FAMILY - ADMIN DASHBOARD LOGIC
   ----------------------------------------------------------
   Arsitektur (Spark plan / gratis):
     - Firebase Authentication : login admin (di login.html)
     - Realtime Database       : simpan foto sebagai base64 string
                                 + data generasi keluarga
     - Firebase Storage        : TIDAK DIPAKAI (butuh Blaze plan)

   Halaman ini hanya dashboard. Auth guard akan redirect ke
   login.html kalau user belum login.

   Fitur:
     1. Album Foto: upload foto + daftar foto + hapus
     2. Generasi Keluarga: CRUD generasi + anggota + milestone

   Optimasi upload:
     - Kompresi agresif (800px, JPEG q 0.5, max 400 KB)
     - Timeout 30 detik per upload
     - Pakai get() bukan onValue()
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
// 3b. KOMPRESI FOTO PROFIL (SQUARE CROP)
// =========================================================

/**
 * Kompres file gambar jadi JPEG base64 dengan square crop
 * (center-crop ke persegi — bagus untuk foto profil).
 *
 * - Resize ke maks 400x400 px (atau lebih kecil jika foto asli lebih kecil)
 * - JPEG quality 0.75 (fallback 0.5 jika masih kebesaran)
 * - Hard limit 150 KB
 *
 * Lebih agresif dari compressImage album karena foto profil
 * tidak perlu resolusi besar.
 */
function compressProfilePhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Center-crop ke persegi
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;

        // Target: maks 400px, atau lebih kecil jika foto asli lebih kecil
        const targetSize = Math.min(400, minDim);

        const canvas = document.createElement("canvas");
        canvas.width = targetSize;
        canvas.height = targetSize;

        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, targetSize, targetSize);
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, targetSize, targetSize);

         // Coba quality utama
        let dataUrl = canvas.toDataURL("image/jpeg", 0.75);
        let sizeBytes = estimateBase64Bytes(dataUrl);

        // Kalau masih kebesaran, turunkan quality
        if (sizeBytes > 100 * 1024) {
          dataUrl = canvas.toDataURL("image/jpeg", 0.5);
          sizeBytes = estimateBase64Bytes(dataUrl);
        }

        if (sizeBytes > 150 * 1024) {
          reject(new Error(
            "Foto terlalu besar setelah kompresi (" +
            Math.round(sizeBytes / 1024) + " KB). Coba foto lain."
          ));
          return;
        }

        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error("Gagal memuat gambar."));
      img.src = e.target.result;
    };

    reader.onerror = () => reject(new Error("Gagal membaca file."));
    reader.readAsDataURL(file);
  });
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

// =========================================================
// 8. TAB SWITCHING (Album ↔ Generasi)
// =========================================================

const tabBtns = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");

tabBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    tabBtns.forEach((b) => b.classList.toggle("active", b === btn));
    tabContents.forEach((c) => {
      const isActive = c.id === "tab-" + tab;
      c.classList.toggle("active", isActive);
      c.hidden = !isActive;
    });

    if (tab === "generasi") {
      loadGenerations();
    } else if (tab === "kalender") {
      loadEvents();
    } else if (tab === "sejarah") {
      loadArticles();
    }
  });
});

// =========================================================
// 9. GENERASI CRUD
// =========================================================

const genList = document.getElementById("genList");
const genListContainer = document.getElementById("genListContainer");
const genFormContainer = document.getElementById("genFormContainer");
const genForm = document.getElementById("genForm");
const genFormTitle = document.getElementById("genFormTitle");
const btnAddGen = document.getElementById("btnAddGen");
const btnAddMember = document.getElementById("btnAddMember");
const btnAddMilestone = document.getElementById("btnAddMilestone");
const btnCancelGen = document.getElementById("btnCancelGen");
const btnCancelGen2 = document.getElementById("btnCancelGen2");
const btnSaveGen = document.getElementById("btnSaveGen");
const genMembersContainer = document.getElementById("genMembersContainer");
const genMilestonesContainer = document.getElementById("genMilestonesContainer");

btnAddGen?.addEventListener("click", () => showGenForm(null));
btnCancelGen?.addEventListener("click", cancelGenForm);
btnCancelGen2?.addEventListener("click", cancelGenForm);
btnAddMember?.addEventListener("click", () => addGenMemberRow(null));
btnAddMilestone?.addEventListener("click", () => addGenMilestoneRow(null));

// Load daftar generasi
async function loadGenerations() {
  if (!genList) return;
  genList.innerHTML = '<div class="gen-empty">Memuat generasi...</div>';

  try {
    const snap = await withTimeout(
      get(query(ref(db, "generations"), orderByChild("order"))),
      DB_TIMEOUT,
      "Gagal memuat generasi: timeout."
    );

    if (!snap.exists()) {
      genList.innerHTML =
        '<div class="gen-empty">Belum ada generasi. Klik "+ Tambah Generasi" untuk membuat.</div>';
      return;
    }

    const gens = [];
    snap.forEach((child) => {
      gens.push({ id: child.key, ...child.val() });
    });

    genList.innerHTML = "";
    gens.forEach((g) => {
      const memberCount = g.members ? Object.keys(g.members).length : 0;
      const card = document.createElement("div");
      card.className = "gen-list-card";
      card.innerHTML = `
        <div class="gen-list-info">
          <strong>${escapeHtml(g.title || "(tanpa judul)")}</strong>
          ${g.subtitle ? `<span>${escapeHtml(g.subtitle)}</span>` : ""}
          <small>${escapeHtml(g.period || "")} • ${memberCount} anggota • ID: <code>${escapeHtml(g.id)}</code></small>
        </div>
        <div class="gen-list-actions">
          <button type="button" class="btn-edit">Edit</button>
          <button type="button" class="btn-delete">Hapus</button>
        </div>
      `;
      card.querySelector(".btn-edit").addEventListener("click", () => showGenForm(g));
      card.querySelector(".btn-delete").addEventListener("click", () => deleteGeneration(g.id, g.title));
      genList.appendChild(card);
    });
  } catch (err) {
    console.error("[Generasi] Load error:", err);
    genList.innerHTML =
      '<div class="gen-empty">Gagal memuat: ' + friendlyDbError(err) + "</div>";
  }
       }

// Tampilkan form (empty untuk baru, filled untuk edit)
function showGenForm(gen) {
  genListContainer.hidden = true;
  genFormContainer.hidden = false;

  genFormTitle.textContent = gen
    ? "Edit Generasi"
    : "Tambah Generasi Baru";

  const idField = document.getElementById("genId");
  idField.value = gen ? gen.id : "";
  idField.readOnly = !!gen;

  document.getElementById("genTitle").value = gen ? (gen.title || "") : "";
  document.getElementById("genSubtitle").value = gen ? (gen.subtitle || "") : "";
  document.getElementById("genPeriod").value = gen ? (gen.period || "") : "";
  document.getElementById("genOrder").value = gen ? (gen.order || "") : "";
  document.getElementById("genStory").value = gen ? (gen.story || "") : "";
  document.getElementById("genQuote").value = gen ? (gen.quote || "") : "";
  document.getElementById("genQuoteAuthor").value = gen ? (gen.quoteAuthor || "") : "";

  // Render members
  genMembersContainer.innerHTML = "";
  if (gen && gen.members) {
    Object.entries(gen.members).forEach(([key, m]) => {
      addGenMemberRow({ ...m, _key: key });
    });
  }

  // Render milestones
  genMilestonesContainer.innerHTML = "";
  if (gen && gen.milestones) {
    Object.entries(gen.milestones).forEach(([key, ms]) => {
      addGenMilestoneRow({ ...ms, _key: key });
    });
  }
}

function cancelGenForm() {
  genListContainer.hidden = false;
  genFormContainer.hidden = true;
}

// Tambah row anggota generasi
function addGenMemberRow(member) {
  const row = document.createElement("div");
  row.className = "sub-form-row member-row";
  row.dataset.subId = member && member._key
    ? member._key
    : "m" + Date.now() + Math.random().toString(36).slice(2, 6);

  const birthMonth = member ? (member.birthMonth || "") : "";
  const birthDay = member ? (member.birthDay || "") : "";

  const monthOptions = buildMonthOptions(birthMonth);
  const dayOptions = buildDayOptions(birthDay);

  row.innerHTML = `
    <div class="member-photo-field">
      <div class="member-photo-preview">👤</div>
      <div class="member-photo-actions">
        <button type="button" class="btn-upload-photo">📷 Upload Foto</button>
        <button type="button" class="btn-clear-photo">Hapus Foto</button>
        <input type="file" class="m-photo-file" accept="image/*" hidden>
      </div>
    </div>
    <input type="text" class="m-photo" placeholder="Atau ketik emoji (👴) atau URL foto"
      value="${escapeAttr(member ? member.photo : "")}">
    <input type="text" class="m-name" placeholder="Nama panggilan"
      value="${escapeAttr(member ? member.name : "")}">
    <input type="text" class="m-fullname" placeholder="Nama lengkap"
      value="${escapeAttr(member ? member.fullName : "")}">
    <input type="text" class="m-birth-year" placeholder="Tahun lahir (1925)"
      value="${escapeAttr(member ? member.birthYear : "")}">
    <input type="text" class="m-death-year" placeholder="Tahun wafat (kosongkan jika masih hidup)"
      value="${escapeAttr(member ? member.deathYear : "")}">
    <div class="m-birthday-field">
      <label><span>🎂 Bulan Lahir</span>
        <select class="m-birth-month">
          <option value="">— (opsional) —</option>
          ${monthOptions}
        </select>
      </label>
      <label><span>Tanggal</span>
        <select class="m-birth-day">
          <option value="">—</option>
          ${dayOptions}
        </select>
      </label>
    </div>
    <textarea class="m-bio" placeholder="Bio singkat">${escapeHtml(member ? (member.bio || "") : "")}</textarea>
    <button type="button" class="btn-remove-row">Hapus Anggota</button>

    // Wire up photo upload
  const photoInput = row.querySelector(".m-photo");
  const photoFile = row.querySelector(".m-photo-file");
  const preview = row.querySelector(".member-photo-preview");

  row.querySelector(".btn-upload-photo").addEventListener("click", () => {
    photoFile.click();
  });

  photoFile.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("File harus berupa gambar.");
      e.target.value = "";
      return;
    }

    try {
      const dataUrl = await compressProfilePhoto(file);
      photoInput.value = dataUrl;
      updateMemberPhotoPreview(preview, dataUrl);
    } catch (err) {
      alert("Gagal upload foto: " + err.message);
    }

    e.target.value = "";
  });

  row.querySelector(".btn-clear-photo").addEventListener("click", () => {
    photoInput.value = "";
    updateMemberPhotoPreview(preview, "");
  });

  photoInput.addEventListener("input", () => {
    updateMemberPhotoPreview(preview, photoInput.value);
  });

  row.querySelector(".btn-remove-row").addEventListener("click", () => row.remove());

  // Initial preview dari data yang sudah ada
  updateMemberPhotoPreview(preview, member ? (member.photo || "") : "");

  genMembersContainer.appendChild(row);
}

/**
 * Update preview foto anggota di form admin.
 * - Kalau photoValue kosong → tampilkan placeholder 👤
 * - Kalau photoValue URL/data URL → tampilkan sebagai <img>
 * - Kalau photoValue emoji/text → tampilkan sebagai text
 */
function updateMemberPhotoPreview(previewEl, photoValue) {
  if (!photoValue) {
    previewEl.innerHTML = "👤";
    return;
  }

  if (photoValue.startsWith("http://") ||
      photoValue.startsWith("https://") ||
      photoValue.startsWith("data:")) {
    previewEl.innerHTML = '<img src="' + photoValue + '" alt="Preview">';
  } else {
    // Emoji atau text
    previewEl.innerHTML = escapeHtml(photoValue);
  }
}

// Tambah row milestone
function addGenMilestoneRow(milestone) {
  const row = document.createElement("div");
  row.className = "sub-form-row";
  row.dataset.subId = milestone && milestone._key
    ? milestone._key
    : "ms" + Date.now() + Math.random().toString(36).slice(2, 6);

  row.innerHTML = `
    <input type="text" class="ms-year" placeholder="Tahun (contoh: 1945)"
      value="${escapeAttr(milestone ? milestone.year : "")}">
    <input type="text" class="ms-event" placeholder="Event / milestone"
      value="${escapeAttr(milestone ? milestone.event : "")}">
    <button type="button" class="btn-remove-row">Hapus Milestone</button>
  `;

  row.querySelector(".btn-remove-row").addEventListener("click", () => row.remove());
  genMilestonesContainer.appendChild(row);
}

// Submit form generasi
genForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const id = document.getElementById("genId").value.trim();
  if (!id) {
    alert("ID generasi wajib diisi (misal: gen1, gen2).");
    return;
  }
  if (!/^[a-zA-Z0-9\-]+$/.test(id)) {
    alert("ID hanya boleh huruf, angka, dan tanda hubung. Tanpa spasi.");
    return;
  }

  const title = document.getElementById("genTitle").value.trim();
  if (!title) {
    alert("Judul wajib diisi.");
    return;
  }

  // Kumpulkan data
  const data = {
    title: title,
    subtitle: document.getElementById("genSubtitle").value.trim(),
    period: document.getElementById("genPeriod").value.trim(),
    order: parseInt(document.getElementById("genOrder").value) || 1,
    story: document.getElementById("genStory").value.trim(),
    quote: document.getElementById("genQuote").value.trim(),
    quoteAuthor: document.getElementById("genQuoteAuthor").value.trim(),
    members: {},
    milestones: {}
  };

  // Kumpulkan members
  genMembersContainer.querySelectorAll(".sub-form-row").forEach((row) => {
    const subId = row.dataset.subId;
    const birthMonthVal = row.querySelector(".m-birth-month") ? row.querySelector(".m-birth-month").value : "";
    const birthDayVal = row.querySelector(".m-birth-day") ? row.querySelector(".m-birth-day").value : "";

    const memberData = {
      name: row.querySelector(".m-name").value.trim(),
      fullName: row.querySelector(".m-fullname").value.trim(),
      photo: row.querySelector(".m-photo").value.trim(),
      birthYear: row.querySelector(".m-birth-year").value.trim(),
      deathYear: row.querySelector(".m-death-year").value.trim(),
      bio: row.querySelector(".m-bio").value.trim()
    };

    // Hanya simpan birthday kalau diisi (untuk auto-populate kalender)
    if (birthMonthVal) {
      memberData.birthMonth = parseInt(birthMonthVal);
    }
    if (birthDayVal) {
      memberData.birthDay = parseInt(birthDayVal);
    }

    data.members[subId] = memberData;
  });

  // Kumpulkan milestones
  genMilestonesContainer.querySelectorAll(".sub-form-row").forEach((row) => {
    const subId = row.dataset.subId;
    data.milestones[subId] = {
      year: row.querySelector(".ms-year").value.trim(),
      event: row.querySelector(".ms-event").value.trim()
    };
  });

  // Save
  btnSaveGen.disabled = true;
  btnSaveGen.textContent = "Menyimpan...";

  try {
    await withTimeout(
      set(ref(db, "generations/" + id), data),
      DB_TIMEOUT,
      "Timeout menyimpan generasi."
    );
    alert("Generasi berhasil disimpan!");
    cancelGenForm();
    loadGenerations();
  } catch (err) {
    console.error("[Generasi] Save error:", err);
    alert("Gagal menyimpan: " + friendlyDbError(err));
  } finally {
    btnSaveGen.disabled = false;
    btnSaveGen.textContent = "Simpan Generasi";
  }
});

// Hapus generasi
async function deleteGeneration(id, title) {
  if (!confirm('Hapus generasi "' + (title || id) + '"? Tindakan tidak bisa dibatalkan.')) return;

  try {
    await withTimeout(
      remove(ref(db, "generations/" + id)),
      DB_TIMEOUT,
      "Gagal menghapus: timeout."
    );
    loadGenerations();
  } catch (err) {
    console.error("[Generasi] Delete error:", err);
    alert("Gagal menghapus: " + friendlyDbError(err));
  }
         }

         // =========================================================
// 10. UTIL HTML ESCAPE
// =========================================================

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(str) {
  return escapeHtml(str);
}

// Helper: build <option> untuk dropdown bulan (1-12)
function buildMonthOptions(selected) {
  const months = [
    "Januari","Februari","Maret","April","Mei","Juni",
    "Juli","Agustus","September","Oktober","November","Desember"
  ];
  let html = "";
  for (let i = 0; i < 12; i++) {
    const val = i + 1;
    const sel = String(selected) === String(val) ? " selected" : "";
    html += `<option value="${val}"${sel}>${months[i]}</option>`;
  }
  return html;
}

// Helper: build <option> untuk dropdown tanggal (1-31)
function buildDayOptions(selected) {
  let html = "";
  for (let i = 1; i <= 31; i++) {
    const sel = String(selected) === String(i) ? " selected" : "";
    html += `<option value="${i}"${sel}>${i}</option>`;
  }
  return html;
}

console.log("BINGKAI FAMILY Dashboard: modul generasi siap.");

// =========================================================
// 11. EVENTS CRUD (Kalender Keluarga)
// =========================================================

const eventList = document.getElementById("eventList");
const eventListContainer = document.querySelector("#tab-kalender .gen-list-container");
const eventFormContainer = document.getElementById("eventFormContainer");
const eventForm = document.getElementById("eventForm");
const eventFormTitle = document.getElementById("eventFormTitle");
const btnAddEvent = document.getElementById("btnAddEvent");
const btnCancelEvent = document.getElementById("btnCancelEvent");
const btnCancelEvent2 = document.getElementById("btnCancelEvent2");
const btnSaveEvent = document.getElementById("btnSaveEvent");

let editingEventId = null;

btnAddEvent?.addEventListener("click", () => showEventForm(null));
btnCancelEvent?.addEventListener("click", cancelEventForm);
btnCancelEvent2?.addEventListener("click", cancelEventForm);

async function loadEvents() {
  if (!eventList) return;
  eventList.innerHTML = '<div class="gen-empty">Memuat acara...</div>';

  try {
    const snap = await get(ref(db, "events"));

    if (!snap.exists()) {
      eventList.innerHTML =
        '<div class="gen-empty">Belum ada acara. Klik "+ Tambah Acara" untuk membuat.</div>';
      return;
    }

    const events = [];
    snap.forEach((child) => {
      events.push({ id: child.key, ...child.val() });
    });

    // Sort by date
    events.sort((a, b) => {
      const da = a.date || "";
      const db = b.date || "";
      return da.localeCompare(db);
    });

    eventList.innerHTML = "";
    events.forEach((e) => {
      const card = document.createElement("div");
      card.className = "gen-list-card";
      const typeLabel = {
        birthday: "🎂 Ulang Tahun",
        anniversary: "💍 Anniversary",
        reunion: "👨‍👩‍👧‍👦 Reuni",
        other: "📅 Acara"
      }[e.type] || "📅 Acara";

      card.innerHTML = `
        <div class="gen-list-info">
          <strong>${escapeHtml(e.title || "(tanpa judul)")}</strong>
          <span>${escapeHtml(e.date || "")} • ${escapeHtml(typeLabel)}</span>
          <small>${e.yearly ? "Ulang tahunan • " : ""}${escapeHtml(e.description || "")}</small>
        </div>
        <div class="gen-list-actions">
          <button type="button" class="btn-edit">Edit</button>
          <button type="button" class="btn-delete">Hapus</button>
        </div>
      `;
      card.querySelector(".btn-edit").addEventListener("click", () => showEventForm(e));
      card.querySelector(".btn-delete").addEventListener("click", () => deleteEvent(e.id, e.title));
      eventList.appendChild(card);
    });
  } catch (err) {
    console.error("[Events] Load error:", err);
    eventList.innerHTML =
      '<div class="gen-empty">Gagal memuat: ' + friendlyDbError(err) + "</div>";
  }
}

function showEventForm(event) {
  if (eventListContainer) eventListContainer.hidden = true;
  eventFormContainer.hidden = false;

  eventFormTitle.textContent = event ? "Edit Acara" : "Tambah Acara Baru";
  editingEventId = event ? event.id : null;

  document.getElementById("eventDate").value = event ? (event.date || "") : "";
  document.getElementById("eventType").value = event ? (event.type || "other") : "other";
  document.getElementById("eventTitle").value = event ? (event.title || "") : "";
  document.getElementById("eventDesc").value = event ? (event.description || "") : "";
  document.getElementById("eventYearly").checked = event ? !!event.yearly : false;
}

function cancelEventForm() {
  if (eventListContainer) eventListContainer.hidden = false;
  eventFormContainer.hidden = true;
  editingEventId = null;
}

eventForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const data = {
    date: document.getElementById("eventDate").value,
    type: document.getElementById("eventType").value,
    title: document.getElementById("eventTitle").value.trim(),
    description: document.getElementById("eventDesc").value.trim(),
    yearly: document.getElementById("eventYearly").checked,
    createdAt: Date.now()
  };

  if (!data.date || !data.title) {
    alert("Tanggal dan judul wajib diisi.");
    return;
  }

  btnSaveEvent.disabled = true;
  btnSaveEvent.textContent = "Menyimpan...";

  try {
    if (editingEventId) {
      await set(ref(db, "events/" + editingEventId), data);
    } else {
      const newRef = push(ref(db, "events"));
      await set(newRef, data);
    }
    alert("Acara berhasil disimpan!");
    cancelEventForm();
    loadEvents();
  } catch (err) {
    alert("Gagal menyimpan: " + friendlyDbError(err));
  } finally {
    btnSaveEvent.disabled = false;
    btnSaveEvent.textContent = "Simpan Acara";
  }
});

async function deleteEvent(id, title) {
  if (!confirm('Hapus acara "' + (title || id) + '"?')) return;
  try {
    await remove(ref(db, "events/" + id));
    loadEvents();
  } catch (err) {
    alert("Gagal menghapus: " + friendlyDbError(err));
  }
   }

// =========================================================
// 12. HISTORY ARTICLES CRUD (Sejarah Keluarga)
// =========================================================

const articleList = document.getElementById("articleList");
const articleListContainer = document.querySelector("#tab-sejarah .gen-list-container");
const articleFormContainer = document.getElementById("articleFormContainer");
const articleForm = document.getElementById("articleForm");
const articleFormTitle = document.getElementById("articleFormTitle");
const btnAddArticle = document.getElementById("btnAddArticle");
const btnCancelArticle = document.getElementById("btnCancelArticle");
const btnCancelArticle2 = document.getElementById("btnCancelArticle2");
const btnSaveArticle = document.getElementById("btnSaveArticle");

let editingArticleId = null;

btnAddArticle?.addEventListener("click", () => showArticleForm(null));
btnCancelArticle?.addEventListener("click", cancelArticleForm);
btnCancelArticle2?.addEventListener("click", cancelArticleForm);

async function loadArticles() {
  if (!articleList) return;
  articleList.innerHTML = '<div class="gen-empty">Memuat artikel...</div>';

  try {
    const snap = await get(ref(db, "history"));

    if (!snap.exists()) {
      articleList.innerHTML =
        '<div class="gen-empty">Belum ada artikel. Klik "+ Tambah Artikel" untuk membuat.</div>';
      return;
    }

    const articles = [];
    snap.forEach((child) => {
      articles.push({ id: child.key, ...child.val() });
    });

    articles.sort((a, b) => {
      const ta = a.createdAt || 0;
      const tb = b.createdAt || 0;
      return tb - ta;
    });

    articleList.innerHTML = "";
    articles.forEach((a) => {
      const card = document.createElement("div");
      card.className = "gen-list-card";
      const dateStr = a.createdAt
        ? new Date(a.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
        : "";

      card.innerHTML = `
        <div class="gen-list-info">
          <strong>${escapeHtml(a.title || "(tanpa judul)")}</strong>
          ${a.category ? `<span>${escapeHtml(a.category)}</span>` : ""}
          <small>${escapeHtml(dateStr)} • ${escapeHtml(a.excerpt || "").slice(0, 60)}${(a.excerpt || "").length > 60 ? "..." : ""}</small>
        </div>
        <div class="gen-list-actions">
          <button type="button" class="btn-edit">Edit</button>
          <button type="button" class="btn-delete">Hapus</button>
        </div>
      `;
      card.querySelector(".btn-edit").addEventListener("click", () => showArticleForm(a));
      card.querySelector(".btn-delete").addEventListener("click", () => deleteArticle(a.id, a.title));
      articleList.appendChild(card);
    });
  } catch (err) {
    console.error("[Articles] Load error:", err);
    articleList.innerHTML =
      '<div class="gen-empty">Gagal memuat: ' + friendlyDbError(err) + "</div>";
  }
}

function showArticleForm(article) {
  if (articleListContainer) articleListContainer.hidden = true;
  articleFormContainer.hidden = false;

  articleFormTitle.textContent = article ? "Edit Artikel" : "Tambah Artikel Baru";
  editingArticleId = article ? article.id : null;

  document.getElementById("articleTitle").value = article ? (article.title || "") : "";
  document.getElementById("articleCategory").value = article ? (article.category || "asal-usul") : "asal-usul";
  document.getElementById("articleExcerpt").value = article ? (article.excerpt || "") : "";
  document.getElementById("articleBody").value = article ? (article.body || "") : "";
}

function cancelArticleForm() {
  if (articleListContainer) articleListContainer.hidden = false;
  articleFormContainer.hidden = true;
  editingArticleId = null;
}

articleForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const user = auth.currentUser;
  const data = {
    title: document.getElementById("articleTitle").value.trim(),
    category: document.getElementById("articleCategory").value,
    excerpt: document.getElementById("articleExcerpt").value.trim(),
    body: document.getElementById("articleBody").value.trim(),
    author: user ? user.email : "admin",
    createdAt: Date.now()
  };

  if (!data.title || !data.body) {
    alert("Judul dan isi artikel wajib diisi.");
    return;
  }

  btnSaveArticle.disabled = true;
  btnSaveArticle.textContent = "Menyimpan...";

  try {
    if (editingArticleId) {
      await set(ref(db, "history/" + editingArticleId), data);
    } else {
      const newRef = push(ref(db, "history"));
      await set(newRef, data);
    }
    alert("Artikel berhasil disimpan!");
    cancelArticleForm();
    loadArticles();
  } catch (err) {
    alert("Gagal menyimpan: " + friendlyDbError(err));
  } finally {
    btnSaveArticle.disabled = false;
    btnSaveArticle.textContent = "Simpan Artikel";
  }
});

async function deleteArticle(id, title) {
  if (!confirm('Hapus artikel "' + (title || id) + '"?')) return;
  try {
    await remove(ref(db, "history/" + id));
    loadArticles();
  } catch (err) {
    alert("Gagal menghapus: " + friendlyDbError(err));
  }
}

console.log("BINGKAI FAMILY Dashboard: modul events + sejarah siap.");
       

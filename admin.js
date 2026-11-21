/* ==========================================================
   BINGKAI FAMILY - ADMIN PANEL LOGIC
   ----------------------------------------------------------
   Memakai Firebase Modular SDK v10+ (ESM import dari gstatic).
   Fitur:
     1. Login admin (Firebase Auth email/password)
     2. Upload foto (multiple) ke Firebase Storage
     3. Simpan metadata foto ke Firestore (collection: photos)
     4. Tampilkan & hapus foto yang sudah diupload
   ========================================================== */

import { initializeApp } from
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getStorage,
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

// ---- Inisialisasi Firebase ----
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const storage = getStorage(app);
const db = getFirestore(app);

// ---- Elemen DOM ----
const loginView      = document.getElementById("loginView");
const dashboardView  = document.getElementById("dashboardView");
const loginForm      = document.getElementById("loginForm");
const loginStatus    = document.getElementById("loginStatus");
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
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

// =========================================================
// 1. AUTENTIKASI
// =========================================================

// Pantau status login
onAuthStateChanged(auth, (user) => {
  if (user) {
    showDashboard();
    loadPhotos();
  } else {
    showLogin();
  }
});

function showLogin() {
  loginView.hidden = false;
  dashboardView.hidden = true;
  btnLogout.hidden = true;
}

function showDashboard() {
  loginView.hidden = true;
  dashboardView.hidden = false;
  btnLogout.hidden = false;
}

// Submit login
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  setLoginStatus("Sedang masuk...", "");
  btnUpload && (btnUpload.disabled = true);

  try {
    await signInWithEmailAndPassword(auth, email, password);
    setLoginStatus("Berhasil masuk!", "success");
  } catch (err) {
    console.error(err);
    setLoginStatus("Gagal masuk: " + friendlyAuthError(err.code), "error");
  }
});

// Logout
btnLogout.addEventListener("click", async () => {
  try {
    await signOut(auth);
    setLoginStatus("Keluar berhasil.", "success");
  } catch (err) {
    console.error(err);
    setLoginStatus("Gagal keluar: " + err.message, "error");
  }
});

function setLoginStatus(msg, type) {
  loginStatus.textContent = msg;
  loginStatus.className = "login-status" + (type ? " " + type : "");
}

function friendlyAuthError(code) {
  const map = {
    "auth/invalid-email": "Format email tidak valid.",
    "auth/user-disabled": "Akun ini dinonaktifkan.",
    "auth/user-not-found": "Email tidak terdaftar.",
    "auth/wrong-password": "Password salah.",
    "auth/invalid-credential": "Email atau password salah.",
    "auth/too-many-requests": "Terlalu banyak percobaan. Coba lagi nanti.",
    "auth/network-request-failed": "Gangguan jaringan. Periksa koneksi internet."
  };
  return map[code] || code || "Terjadi kesalahan.";
}

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

// Drag events
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

  // Filter file: hanya gambar + sesuai batas ukuran
  for (const file of fileList) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadStatus("Format '" + file.name + "' tidak didukung.", "error");
      continue;
    }
    if (file.size > MAX_FILE_SIZE) {
      setUploadStatus("'" + file.name + "' melebihi 5 MB.", "error");
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
// 3. UPLOAD FOTO
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

  for (let i = 0; i < selectedFiles.length; i++) {
    const file = selectedFiles[i];
    const pctBase = Math.round((i / selectedFiles.length) * 100);
    const pctRange = Math.round(100 / selectedFiles.length);

    updateProgress(pctBase, "Mengunggah " + file.name + "...");

    try {
      // Path: album/{timestamp}-{filename}
      const safeName = sanitizeFileName(file.name);
      const path = "album/" + Date.now() + "-" + safeName;
      const fileRef = storageRef(storage, path);

      // Upload ke Storage dengan progress tracking
      const uploadTask = uploadBytesResumable(fileRef, file);

      await new Promise((resolve, reject) => {
        uploadTask.on(
          "state_changed",
          (snapshot) => {
            const inner = Math.round(
              (snapshot.bytesTransferred / snapshot.totalBytes) * pctRange
            );
            updateProgress(pctBase + inner, "Mengunggah " + file.name + "...");
          },
          (err) => reject(err),
          () => resolve()
        );
      });

      // Dapatkan URL download
      const downloadUrl = await getDownloadURL(fileRef);

      // Simpan metadata ke Firestore
      await addDoc(collection(db, "photos"), {
        url: downloadUrl,
        path: path,
        name: file.name,
        caption: caption,
        size: file.size,
        type: file.type,
        uploader: user.email,
        createdAt: serverTimestamp()
      });

      successCount++;
    } catch (err) {
      console.error("Upload error:", err);
      failCount++;
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
      successCount + " berhasil, " + failCount + " gagal.", "error"
    );
  }

  // Reset form
  setTimeout(() => {
    uploadProgress.hidden = true;
    updateProgress(0, "Mengunggah... 0%");
  }, 1500);

  selectedFiles = [];
  fileInput.value = "";
  photoCaption.value = "";
  renderPreview();
  btnUpload.disabled = true;

  // Refresh galeri
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

function sanitizeFileName(name) {
  // Hapus karakter non-alfanumerik agar aman untuk path Storage
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

// =========================================================
// 4. DAFTAR FOTO
// =========================================================

btnRefresh.addEventListener("click", loadPhotos);

async function loadPhotos() {
  photoGrid.innerHTML = '<div class="photo-empty">Memuat foto...</div>';

  try {
    const q = query(collection(db, "photos"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      photoGrid.innerHTML =
        '<div class="photo-empty">Belum ada foto. Upload foto pertamamu!</div>';
      return;
    }

    photoGrid.innerHTML = "";

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const card = createPhotoCard(docSnap.id, data);
      photoGrid.appendChild(card);
    });
  } catch (err) {
    console.error(err);
    photoGrid.innerHTML =
      '<div class="photo-empty">Gagal memuat foto: ' + err.message + "</div>";
  }
}

function createPhotoCard(id, data) {
  const card = document.createElement("article");
  card.className = "photo-item";

  const img = document.createElement("img");
  img.className = "photo-item-img";
  img.src = data.url;
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
    window.open(data.url, "_blank");
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
    // 1) Hapus file di Storage
    if (data.path) {
      try {
        await deleteObject(storageRef(storage, data.path));
      } catch (err) {
        // File mungkin sudah hilang; lanjut hapus doc
        console.warn("Storage delete skipped:", err.code);
      }
    }

    // 2) Hapus dokumen di Firestore
    await deleteDoc(doc(db, "photos", id));

    loadPhotos();
  } catch (err) {
    console.error(err);
    alert("Gagal menghapus foto: " + err.message);
  }
}

// =========================================================
// 5. UTIL
// =========================================================

function formatDate(ts) {
  if (!ts) return "—";
  let d;
  if (ts.toDate) d = ts.toDate();
  else if (ts.seconds) d = new Date(ts.seconds * 1000);
  else d = new Date(ts);
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

console.log("BINGKAI FAMILY Admin siap.");
                   

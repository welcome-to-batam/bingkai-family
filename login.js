/* ==========================================================
   BINGKAI FAMILY - LOGIN PAGE
   ----------------------------------------------------------
   Halaman login terpisah dari dashboard admin.
   - Jika user sudah login → auto-redirect ke admin.html
   - Submit form → signInWithEmailAndPassword
   - Sukses → onAuthStateChanged redirect ke admin.html
   ========================================================== */

import { initializeApp } from
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const loginForm   = document.getElementById("loginForm");
const loginStatus = document.getElementById("loginStatus");

// Auto-redirect kalau sudah login (sesi tersimpan di browser)
onAuthStateChanged(auth, (user) => {
  if (user) {
    // Sudah login → langsung ke dashboard
    window.location.replace("admin.html");
  }
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  if (!email || !password) {
    setLoginStatus("Email dan password wajib diisi.", "error");
    return;
  }

  setLoginStatus("Sedang masuk...", "");

  try {
    await signInWithEmailAndPassword(auth, email, password);
    setLoginStatus("Berhasil masuk! Mengalihkan...", "success");
    // onAuthStateChanged di atas akan redirect otomatis
  } catch (err) {
    console.error("Login error:", err);
    setLoginStatus("Gagal masuk: " + friendlyAuthError(err.code), "error");
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
    "auth/user-not-found": "Email tidak terdaftar sebagai admin.",
    "auth/wrong-password": "Password salah.",
    "auth/invalid-credential": "Email atau password salah.",
    "auth/too-many-requests": "Terlalu banyak percobaan. Coba lagi nanti.",
    "auth/network-request-failed": "Gangguan jaringan. Periksa koneksi internet.",
    "auth/api-key-not-valid": "API key Firebase tidak valid. Periksa firebase-config.js.",
    "auth/api-key-not-valid.-please-pass-a-valid-api-key.":
      "API key Firebase tidak valid. Periksa firebase-config.js.",
    "auth/configuration-not-found":
      "Auth belum diaktifkan atau email/password sign-in belum di-on. " +
      "Buka Firebase Console > Authentication > Sign-in method."
  };
  return map[code] || code || "Terjadi kesalahan.";
}

// Footer year
const footerYear = document.getElementById("footerYear");
if (footerYear) {
  footerYear.textContent =
    "© " + new Date().getFullYear() + " BINGKAI FAMILY. All Rights Reserved.";
}

console.log("BINGKAI FAMILY Login siap.");

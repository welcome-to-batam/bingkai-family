/* ==========================================================
   BINGKAI FAMILY - FIREBASE CONFIGURATION
   ----------------------------------------------------------
   Ganti nilai di bawah ini dengan konfigurasi Firebase
   project milikmu. Lihat README-FIREBASE.md untuk panduan
   cara mendapatkan nilai-nilai ini dari Firebase Console.

   Pakai Firebase Modular SDK v10+ (via ESM CDN).
   ========================================================== */

// 1) KONFIGURASI PROJECT FIREBASE
//    Dari: Firebase Console > Project Settings > General >
//    "Your apps" > Web App > SDK setup and configuration
const firebaseConfig = {
  apiKey: "AIzaSyC3f28O-x79T0DICMzAHO9oTl0uxvmxtLE",
  authDomain: "bingkai-family-hartono.firebaseapp.com",
  databaseURL: "https://bingkai-family-hartono-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "bingkai-family-hartono",
  storageBucket: "bingkai-family-hartono.firebasestorage.app",
  messagingSenderId: "579275237826",
  appId: "1:579275237826:web:4bad74caf5d3482a74ce5b"
};

// 2) EKSPOR MODUL FIREBASE
//    Memakai dynamic import dari gstatic CDN agar tetap
//    kompatibel dengan GitHub Pages (tidak perlu build step).
export { firebaseConfig };

/* ==========================================================
   BINGKAI FAMILY - FIREBASE CONFIGURATION
   ----------------------------------------------------------
   Arsitektur yang dipakai (Spark plan / gratis):
     - Firebase Authentication  : login admin (email/password)
     - Realtime Database        : simpan metadata + foto (base64)
     - Firebase Storage         : TIDAK DIPAKAI (butuh Blaze plan)

   Ganti nilai di bawah ini dengan konfigurasi Firebase project
   milikmu. Lihat README-FIREBASE.md untuk panduan mendapatkan
   nilai-nilai ini dari Firebase Console.

   Pakai Firebase Modular SDK v10+ (via ESM CDN).
   ========================================================== */

const firebaseConfig = {
  apiKey: "AIzaSyC3f28O-x79T0DICMzAHO9oTl0uxvmxtLE",
  authDomain: "bingkai-family-hartono.firebaseapp.com",
  databaseURL: "https://bingkai-family-hartono-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "bingkai-family-hartono",
  storageBucket: "bingkai-family-hartono.firebasestorage.app",
  messagingSenderId: "579275237826",
  appId: "1:579275237826:web:4bad74caf5d3482a74ce5b"
};

export { firebaseConfig };

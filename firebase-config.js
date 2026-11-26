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
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "bingkai-family.firebaseapp.com",
  databaseURL: "https://bingkai-family-default-rtdb.firebaseio.com",
  projectId: "bingkai-family",
  storageBucket: "bingkai-family.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:abcdef0123456789"
};

export { firebaseConfig };

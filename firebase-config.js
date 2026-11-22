
/**
 * BINGKAI FAMILY
 * FIREBASE CONFIGURATION
 * Firebase Modular SDK 10.14.1
 */

// Firebase SDK
import { initializeApp } from
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";

import { getAuth } from
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

import { getDatabase } from
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

// Konfigurasi Firebase
const firebaseConfig = {
  apiKey: "AIzaSyC3f28O-x79T0DICMzAHO9oTl0uxvmxtLE",
  authDomain: "bingkai-family-hartono.firebaseapp.com",
  databaseURL: "https://bingkai-family-hartono-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "bingkai-family-hartono",
  storageBucket: "bingkai-family-hartono.firebasestorage.app",
  messagingSenderId: "579275237826",
  appId: "1:579275237826:web:4bad74caf5d3482a74ce5b"
};

// Inisialisasi Firebase
const app = initializeApp(firebaseConfig);

// Firebase Authentication
export const auth = getAuth(app);

// Firebase Realtime Database
export const db = getDatabase(app);

// Ekspor konfigurasi
export { app, firebaseConfig };

console.log("BINGKAI FAMILY: Firebase berhasil terhubung.");

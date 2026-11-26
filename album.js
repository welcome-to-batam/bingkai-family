/* ==========================================================
   BINGKAI FAMILY - ALBUM PAGE (Enhanced Gallery)
   Galeri foto dengan masonry layout + lightbox + search
   ========================================================== */

import { initializeApp } from
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  get,
  query,
  orderByChild,
  limitToLast
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const masonry = document.getElementById("albumMasonry");
const searchInput = document.getElementById("albumSearch");
const albumStats = document.getElementById("albumStats");

const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightboxImg");
const lightboxCaption = document.getElementById("lightboxCaption");
const lightboxClose = document.getElementById("lightboxClose");
const lightboxPrev = document.getElementById("lightboxPrev");
const lightboxNext = document.getElementById("lightboxNext");

let allPhotos = [];
let currentLightboxIdx = 0;
const PHOTO_LIMIT = 100;

async function loadAlbum() {
  if (!masonry) return;

  try {
    const photosRef = query(
      ref(db, "photos"),
      orderByChild("createdAt"),
      limitToLast(PHOTO_LIMIT)
    );

    const snap = await get(photosRef);

    if (!snap.exists()) {
      masonry.innerHTML = `
        <div class="feature-empty">
          <p>Belum ada foto di album.</p>
          <a href="login.html">Masuk Admin untuk Upload</a>
        </div>`;
      return;
    }

    allPhotos = [];
    snap.forEach((child) => {
      allPhotos.push(child.val());
    });
    allPhotos.reverse(); // terbaru di atas

    albumStats.innerHTML = `
      <div class="feature-stat"><strong>${allPhotos.length}</strong><small>FOTO</small></div>
    `;

    renderMasonry();
  } catch (err) {
    console.error("[Album] Error:", err);
    masonry.innerHTML = `
      <div class="feature-empty">
        <p>Gagal memuat album.</p>
        <small>${escapeHtml(err.message)}</small>
      </div>`;
  }
}

function renderMasonry() {
  const term = (searchInput.value || "").toLowerCase().trim();

  let filtered = allPhotos;
  if (term) {
    filtered = allPhotos.filter((p) => {
      const caption = (p.caption || "").toLowerCase();
      const name = (p.name || "").toLowerCase();
      return caption.includes(term) || name.includes(term);
    });
  }

  if (filtered.length === 0) {
    masonry.innerHTML = `
      <div class="feature-empty">
        <p>Tidak ada foto yang cocok.</p>
      </div>`;
    return;
  }

  masonry.innerHTML = filtered.map((p, idx) => `
    <div class="album-item" data-idx="${idx}">
      <img src="${escapeAttr(p.data)}" alt="${escapeAttr(p.caption || p.name || "Foto keluarga")}" loading="lazy">
      ${p.caption ? `<div class="album-item-caption">${escapeHtml(p.caption)}</div>` : ""}
    </div>
  `).join("");

  // Wire click → lightbox
  masonry.querySelectorAll(".album-item").forEach((item) => {
    item.addEventListener("click", () => {
      const idx = parseInt(item.dataset.idx);
      openLightbox(filtered, idx);
    });
  });
}

function openLightbox(photos, idx) {
  currentLightboxIdx = idx;
  showLightboxPhoto(photos);
  lightbox.classList.add("active");
}

function showLightboxPhoto(photos) {
  const p = photos[currentLightboxIdx];
  if (!p) return;
  lightboxImg.src = p.data;
  lightboxCaption.textContent = p.caption || p.name || "";
}

// Lightbox navigation
lightboxClose.addEventListener("click", () => lightbox.classList.remove("active"));

lightboxPrev.addEventListener("click", () => {
  currentLightboxIdx = (currentLightboxIdx - 1 + allPhotos.length) % allPhotos.length;
  showLightboxPhoto(allPhotos);
});

lightboxNext.addEventListener("click", () => {
  currentLightboxIdx = (currentLightboxIdx + 1) % allPhotos.length;
  showLightboxPhoto(allPhotos);
});

// Click outside to close
lightbox.addEventListener("click", (e) => {
  if (e.target === lightbox) lightbox.classList.remove("active");
});

// Keyboard nav
document.addEventListener("keydown", (e) => {
  if (!lightbox.classList.contains("active")) return;
  if (e.key === "Escape") lightbox.classList.remove("active");
  if (e.key === "ArrowLeft") lightboxPrev.click();
  if (e.key === "ArrowRight") lightboxNext.click();
});

// Search
searchInput.addEventListener("input", renderMasonry);

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function escapeAttr(str) { return escapeHtml(str); }

// Footer year
const footerYear = document.getElementById("footerYear");
if (footerYear) {
  footerYear.textContent =
    "© " + new Date().getFullYear() + " BINGKAI FAMILY. All Rights Reserved.";
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", loadAlbum);
} else {
  loadAlbum();
}

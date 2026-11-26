/* ==========================================================
   BINGKAI FAMILY - GENERASI PAGE LOGIC
   ----------------------------------------------------------
   Halaman dinamis: load data generasi dari Realtime Database
   berdasarkan URL parameter ?id=gen1
   ========================================================== */

import { initializeApp } from
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  get,
  query,
  orderByChild
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const content = document.getElementById("generasiContent");

// Baca ID generasi dari URL: generasi.html?id=gen1
const params = new URLSearchParams(window.location.search);
const genId = params.get("id") || "gen1";

console.log("[Generasi] Memuat generasi ID:", genId);

async function loadGeneration() {
  if (!content) return;

  try {
    // 1) Load data generasi ini
    const snap = await get(ref(db, "generations/" + genId));

    if (!snap.exists()) {
      showError(
        "Generasi Belum Tersedia",
        "Generasi dengan ID \"" + genId + "\" belum dibuat. " +
        "Masuk ke admin panel untuk menambahkan generasi ini."
      );
      return;
    }

    const data = snap.val();
    console.log("[Generasi] Data:", data);

    // 2) Load semua generasi untuk navigasi prev/next
    let allGens = [];
    try {
      const allSnap = await get(
        query(ref(db, "generations"), orderByChild("order"))
      );
      if (allSnap.exists()) {
        allSnap.forEach((child) => {
          allGens.push({ id: child.key, ...child.val() });
        });
      }
    } catch (navErr) {
      console.warn("[Generasi] Navigasi gagal dimuat:", navErr);
    }

    renderGeneration(data, allGens);
  } catch (err) {
    console.error("[Generasi] Error:", err);
    showError("Gagal Memuat Generasi", friendlyError(err));
  }
}

function renderGeneration(data, allGens) {
  const members = data.members
    ? Object.values(data.members)
    : [];
  const milestones = data.milestones
    ? Object.values(data.milestones)
    : [];

  // Sort milestones by year
  milestones.sort((a, b) => {
    const ya = parseInt(a.year) || 0;
    const yb = parseInt(b.year) || 0;
    return ya - yb;
  });

  // Find prev/next based on order
  const sortedGens = [...allGens].sort(
    (a, b) => (a.order || 0) - (b.order || 0)
  );
  const currentIdx = sortedGens.findIndex((g) => g.id === genId);
  const prevGen = currentIdx > 0 ? sortedGens[currentIdx - 1] : null;
  const nextGen =
    currentIdx >= 0 && currentIdx < sortedGens.length - 1
      ? sortedGens[currentIdx + 1]
      : null;

  // Build sections
  const heroSection = `
    <section class="gen-hero">
      <span class="gen-eyebrow">✦ PROFIL GENERASI</span>
      <h1>${escapeHtml(data.title || "Generasi")}</h1>
      ${data.subtitle ? `<div class="gen-subtitle">${escapeHtml(data.subtitle)}</div>` : ""}
      ${data.period ? `<div class="gen-period">${escapeHtml(data.period)}</div>` : ""}
      ${data.quote ? `
        <blockquote class="gen-quote">
          "${escapeHtml(data.quote)}"
          ${data.quoteAuthor ? `<span class="gen-quote-author">— ${escapeHtml(data.quoteAuthor)}</span>` : ""}
        </blockquote>
      ` : ""}
    </section>
  `;

  const storySection = data.story ? `
    <section class="gen-story">
      <div class="gen-section-heading">
        <span class="section-label">CERITA GENERASI</span>
        <h2>Asal-Usul & Perjalanan</h2>
      </div>
      <p>${escapeHtml(data.story).replace(/\n/g, "<br>")}</p>
    </section>
  ` : "";

  const membersSection = members.length ? `
    <section class="gen-members">
      <div class="gen-section-heading">
        <span class="section-label">ANGGOTA GENERASI</span>
        <h2>${members.length} Anggota Generasi Ini</h2>
      </div>
      <div class="gen-members-grid">
        ${members.map((m) => `
          <article class="gen-member-card">
            <div class="gen-member-photo">${renderPhoto(m.photo, m.name)}</div>
            <div class="gen-member-body">
              <div class="gen-member-name">${escapeHtml(m.name || "")}</div>
              ${m.fullName ? `<div class="gen-member-fullname">${escapeHtml(m.fullName)}</div>` : ""}
              ${(m.birthYear || m.deathYear || m.birthMonth) ? `
                <div class="gen-member-years">
                  ${escapeHtml(formatMemberYears(m))}
                </div>
              ` : ""}
              ${m.bio ? `<div class="gen-member-bio">${escapeHtml(m.bio)}</div>` : ""}
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  ` : "";

  const timelineSection = milestones.length ? `
    <section class="gen-timeline">
      <div class="gen-section-heading">
        <span class="section-label">LINIMASA</span>
        <h2>Milestone Penting</h2>
      </div>
      <div class="timeline-list">
        ${milestones.map((m) => `
          <div class="timeline-item">
            <div class="timeline-year">${escapeHtml(m.year || "")}</div>
            <div class="timeline-event">${escapeHtml(m.event || "")}</div>
          </div>
        `).join("")}
      </div>
    </section>
  ` : "";

  const navSection = `
    <nav class="gen-nav">
      <a href="${prevGen ? "generasi.html?id=" + encodeURIComponent(prevGen.id) : "#"}"
         class="${prevGen ? "" : "disabled"}">
        ← ${prevGen ? escapeHtml(prevGen.title || "Sebelumnya") : "Generasi Awal"}
      </a>
      <a href="index.html#pohon" class="gen-nav-back">↑ Pohon Keluarga</a>
      <a href="${nextGen ? "generasi.html?id=" + encodeURIComponent(nextGen.id) : "#"}"
         class="${nextGen ? "" : "disabled"}">
        ${nextGen ? escapeHtml(nextGen.title || "Selanjutnya") : "Generasi Terbaru"} →
      </a>
    </nav>
  `;

  content.innerHTML =
    heroSection +
    storySection +
    membersSection +
    timelineSection +
    navSection;

  // Update document title
  document.title =
    (data.title || "Generasi") +
    " - BINGKAI FAMILY";
}

function renderPhoto(photo, name) {
  if (!photo) return "👤";
  // Jika URL atau data URL → tampilkan sebagai <img>
  if (photo.startsWith("http://") ||
      photo.startsWith("https://") ||
      photo.startsWith("data:")) {
    return '<img src="' + photo + '" alt="' + escapeAttr(name || "") + '">';
  }
  // Selain itu (emoji, dll) → tampilkan sebagai text
  return escapeHtml(photo);
}

/**
 * Format tahun + birthday untuk display di member card.
 * Contoh: "1925 — 2010 (🎂 15 Maret)"
 */
function formatMemberYears(m) {
  let result = "";

  if (m.birthYear || m.deathYear) {
    result += (m.birthYear || "?") + " — " + (m.deathYear || "sekarang");
  }

  // Tambahkan birthday kalau ada
  if (m.birthMonth && m.birthDay) {
    const months = [
      "Januari","Februari","Maret","April","Mei","Juni",
      "Juli","Agustus","September","Oktober","November","Desember"
    ];
    const monthName = months[m.birthMonth - 1] || "";
    const birthday = " (🎂 " + m.birthDay + " " + monthName + ")";
    result += birthday;
  }

  return result;
}

function showError(title, msg) {
  content.innerHTML = `
    <div class="gen-empty-state">
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(msg)}</p>
      <a href="index.html#pohon">← Kembali ke Pohon Keluarga</a>
    </div>
  `;
}

function friendlyError(err) {
  const msg = err.message || String(err);
  if (/index not defined/i.test(msg)) {
    return 'Rules belum punya .indexOn untuk "order". ' +
      "Buka README-FIREBASE.md bagian Rules.";
  }
  if (/permission denied/i.test(msg)) {
    return "Permission denied. Periksa Realtime Database Rules.";
  }
  return msg;
}

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

// Footer year
const footerYear = document.getElementById("footerYear");
if (footerYear) {
  footerYear.textContent =
    "© " + new Date().getFullYear() + " BINGKAI FAMILY. All Rights Reserved.";
}

// Load saat halaman siap
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", loadGeneration);
} else {
  loadGeneration();
}

console.log("[Generasi] Halaman siap.");
       

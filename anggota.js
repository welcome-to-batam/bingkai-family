/* ==========================================================
   BINGKAI FAMILY - ANGGOTA PAGE
   Direktori semua anggota keluarga dengan filter & search
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

const grid = document.getElementById("anggotaGrid");
const filterTabs = document.getElementById("filterTabs");
const searchInput = document.getElementById("searchInput");
const memberStats = document.getElementById("memberStats");
const modal = document.getElementById("memberModal");
const modalCard = document.getElementById("modalCard");

let allMembers = []; // {gen, genTitle, genSubtitle, ...member}
let activeFilter = "all";

async function loadMembers() {
  if (!grid) return;

  try {
    const snap = await get(
      query(ref(db, "generations"), orderByChild("order"))
    );

    if (!snap.exists()) {
      grid.innerHTML = `
        <div class="feature-empty">
          <p>Belum ada anggota keluarga.</p>
          <a href="login.html">Masuk Admin</a>
        </div>`;
      return;
    }

    const gens = [];
    snap.forEach((child) => {
      gens.push({ id: child.key, ...child.val() });
    });

    // Flatten members
    allMembers = [];
    gens.forEach((g, idx) => {
      if (g.members) {
        Object.values(g.members).forEach((m) => {
          allMembers.push({
            ...m,
            genId: g.id,
            genTitle: g.title || "Generasi " + (idx + 1),
            genSubtitle: g.subtitle || "",
            genOrder: g.order || idx + 1
          });
        });
      }
    });

    // Stats
    memberStats.innerHTML = `
      <div class="feature-stat"><strong>${allMembers.length}</strong><small>ANGGOTA</small></div>
      <div class="feature-stat"><strong>${gens.length}</strong><small>GENERASI</small></div>
    `;

    // Build filter tabs
    let tabsHtml = '<button class="filter-btn active" data-filter="all">Semua</button>';
    gens.forEach((g, idx) => {
      tabsHtml += `<button class="filter-btn" data-filter="${g.id}">${escapeHtml(g.title || "Gen " + (idx + 1))}</button>`;
    });
    filterTabs.innerHTML = tabsHtml;

    // Wire filter buttons
    filterTabs.querySelectorAll(".filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        filterTabs.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        activeFilter = btn.dataset.filter;
        renderGrid();
      });
    });

    renderGrid();
  } catch (err) {
    console.error("[Anggota] Error:", err);
    grid.innerHTML = `
      <div class="feature-empty">
        <p>Gagal memuat anggota.</p>
        <small>${escapeHtml(err.message)}</small>
      </div>`;
  }
}

function renderGrid() {
  const searchTerm = (searchInput.value || "").toLowerCase().trim();

  let filtered = allMembers;

  if (activeFilter !== "all") {
    filtered = filtered.filter((m) => m.genId === activeFilter);
  }

  if (searchTerm) {
    filtered = filtered.filter((m) => {
      const name = (m.name || "").toLowerCase();
      const fullName = (m.fullName || "").toLowerCase();
      return name.includes(searchTerm) || fullName.includes(searchTerm);
    });
  }

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="feature-empty">
        <p>Tidak ada anggota yang cocok.</p>
      </div>`;
    return;
  }

  grid.innerHTML = filtered.map((m) => `
    <article class="anggota-card" data-id="${escapeAttr(m.genId)}">
      <div class="anggota-card-photo">${renderPhoto(m.photo, m.name)}</div>
      <div class="anggota-card-body">
        <div class="anggota-card-name">${escapeHtml(m.name || "")}</div>
        ${m.fullName ? `<div class="anggota-card-fullname">${escapeHtml(m.fullName)}</div>` : ""}
        <div class="anggota-card-meta">
          <span>${escapeHtml(m.birthYear || "")}${m.deathYear ? " - " + escapeHtml(m.deathYear) : ""}</span>
          <span class="anggota-badge">${escapeHtml(m.genTitle)}</span>
        </div>
      </div>
    </article>
  `).join("");

  // Wire click → modal
  grid.querySelectorAll(".anggota-card").forEach((card, idx) => {
    // Find member by index in filtered array
    const member = filtered[idx];
    card.addEventListener("click", () => showModal(member));
  });
}

function showModal(m) {
  modalCard.innerHTML = `
    <div class="modal-header">
      <div class="modal-photo">${renderPhoto(m.photo, m.name)}</div>
      <button type="button" class="modal-close" id="modalClose">✕</button>
    </div>
    <div class="modal-body">
      <h3>${escapeHtml(m.name || "")}</h3>
      ${m.fullName ? `<div class="modal-fullname">${escapeHtml(m.fullName)}</div>` : ""}
      <div class="modal-meta">
        ${m.birthYear ? `<div><strong>Lahir:</strong> ${escapeHtml(formatBirthday(m))}</div>` : ""}
        ${m.deathYear ? `<div><strong>Wafat:</strong> ${escapeHtml(m.deathYear)}</div>` : ""}
        <div><strong>Generasi:</strong> ${escapeHtml(m.genTitle)}</div>
      </div>
      ${m.bio ? `<div class="modal-bio">${escapeHtml(m.bio)}</div>` : ""}
      <div class="modal-actions">
        <a href="generasi.html?id=${encodeURIComponent(m.genId)}" class="btn-primary" style="display:inline-block;padding:10px 22px;border-radius:25px;font-size:13px;font-weight:600;color:white;text-decoration:none">
          Lihat di Profil Generasi →
        </a>
      </div>
    </div>
  `;

  modal.classList.add("active");
  document.getElementById("modalClose").addEventListener("click", closeModal);
}

function closeModal() {
  modal.classList.remove("active");
}

// Click outside modal to close
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});

// ESC to close
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

// Search input
searchInput.addEventListener("input", renderGrid);

function formatBirthday(m) {
  if (m.birthMonth && m.birthDay) {
    const months = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
    const monthName = months[m.birthMonth - 1] || "";
    return (m.birthYear || "") + " (" + m.birthDay + " " + monthName + ")";
  }
  return m.birthYear || "";
}

function renderPhoto(photo, name) {
  if (!photo) return "👤";
  if (photo.startsWith("http://") ||
      photo.startsWith("https://") ||
      photo.startsWith("data:")) {
    return '<img src="' + photo + '" alt="' + escapeAttr(name || "") + '">';
  }
  return escapeHtml(photo);
}

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
  document.addEventListener("DOMContentLoaded", loadMembers);
} else {
  loadMembers();
}

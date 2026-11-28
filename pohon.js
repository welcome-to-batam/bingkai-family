/* ==========================================================
   BINGKAI FAMILY - POHON KELUARGA PAGE
   Visualisasi pohon keluarga dengan semua generasi & anggota
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

const treeContainer = document.getElementById("pohonTree");
const treeStats = document.getElementById("treeStats");

async function loadTree() {
  if (!treeContainer) return;

  try {
    const snap = await get(
      query(ref(db, "generations"), orderByChild("order"))
    );

    if (!snap.exists()) {
      treeContainer.innerHTML = `
        <div class="feature-empty">
          <p>Belum ada data generasi.</p>
          <a href="login.html">Masuk Admin untuk Tambah Generasi</a>
        </div>`;
      return;
    }

    const gens = [];
    snap.forEach((child) => {
      gens.push({ id: child.key, ...child.val() });
    });

    // Stats
    const totalMembers = gens.reduce((acc, g) => {
      return acc + (g.members ? Object.keys(g.members).length : 0);
    }, 0);

    treeStats.innerHTML = `
      <div class="feature-stat"><strong>${gens.length}</strong><small>GENERASI</small></div>
      <div class="feature-stat"><strong>${totalMembers}</strong><small>ANGGOTA</small></div>
    `;

    // Render tree
    let html = "";
    gens.forEach((gen, idx) => {
      const members = gen.members
        ? Object.values(gen.members).sort((a, b) => (a.order || 0) - (b.order || 0))
        : [];
      // Pair members into couples
      const memberPairs = [];
      for (let i = 0; i < members.length; i += 2) {
        memberPairs.push(members.slice(i, i + 2));
      }
      html += `
        <div class="pohon-gen">
          <div class="pohon-gen-label">GENERASI ${idx + 1}</div>
          ${gen.subtitle ? `<div class="pohon-gen-subtitle">${escapeHtml(gen.subtitle)}</div>` : ""}
          <div class="pohon-gen-members">
            ${memberPairs.map((pair) => `
              <div class="pohon-couple-card">
                ${renderPohonMember(pair[0], gen.id)}
                ${pair[1] ? '<div class="pohon-couple-divider"></div>' + renderPohonMember(pair[1], gen.id) : ""}
              </div>
            `).join("")}
          </div>
        </div>
        ${idx < gens.length - 1 ? '<div class="pohon-connector">↓</div>' : ""}
      `;
    });

    treeContainer.innerHTML = html;
  } catch (err) {
    console.error("[Pohon] Error:", err);
    treeContainer.innerHTML = `
      <div class="feature-empty">
        <p>Gagal memuat pohon keluarga.</p>
        <small>${escapeHtml(friendlyError(err))}</small>
      </div>`;
  }
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

/**
 * Render 1 anggota kecil di dalam couple card (untuk halaman pohon).
 */
function renderPohonMember(m, genId) {
  return `
    <a href="generasi.html?id=${encodeURIComponent(genId)}" class="pohon-member">
      <div class="pohon-member-photo">${renderPhoto(m.photo, m.name)}</div>
      <strong>${escapeHtml(m.name || "")}</strong>
      <small>${escapeHtml(m.birthYear || "")}${m.deathYear ? " - " + escapeHtml(m.deathYear) : ""}</small>
    </a>
  `;
}

function friendlyError(err) {
  const msg = err.message || String(err);
  if (/index not defined/i.test(msg)) {
    return 'Rules butuh .indexOn untuk "order". Lihat README.';
  }
  if (/permission denied/i.test(msg)) {
    return "Permission denied. Periksa Realtime Database Rules.";
  }
  return msg;
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
  document.addEventListener("DOMContentLoaded", loadTree);
} else {
  loadTree();
}

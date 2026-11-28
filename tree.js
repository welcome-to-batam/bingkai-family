/* ==========================================================
   BINGKAI FAMILY - DYNAMIC FAMILY TREE
   ----------------------------------------------------------
   Load daftar generasi dari Realtime Database (path: generations)
   dan render kartu generasi yang clickable di index.html.

   Kalau admin tambah generasi baru via admin panel, kartu
   generasi itu akan otomatis muncul di halaman beranda.
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

const treeContainer = document.getElementById("treeContainer");

console.log("[Tree] treeContainer ditemukan:", !!treeContainer);

async function loadTree() {
  if (!treeContainer) {
    console.warn("[Tree] #treeContainer tidak ada di halaman ini.");
    return;
  }

  try {
    console.log("[Tree] Mengirim query ke Realtime Database...");
    const snap = await get(
      query(ref(db, "generations"), orderByChild("order"))
    );

    if (!snap.exists()) {
      console.log("[Tree] Tidak ada data generasi.");
      treeContainer.innerHTML = `
        <div class="tree-decoration">🌳</div>
        <div class="tree-empty">
          <p>Belum ada data generasi.</p>
          <a href="login.html" class="btn-secondary btn-small">
            Masuk Admin untuk Tambah Generasi
          </a>
        </div>
      `;
      return;
    }

    const gens = [];
    snap.forEach((child) => {
      gens.push({ id: child.key, ...child.val() });
    });

    console.log("[Tree] Jumlah generasi:", gens.length);
    renderTree(gens);
  } catch (err) {
    console.error("[Tree] Error:", err);
    treeContainer.innerHTML = `
      <div class="tree-decoration">🌳</div>
      <div class="tree-empty">
        <p>Gagal memuat silsilah keluarga.</p>
        <small>${escapeHtml(friendlyError(err))}</small>
        <br><br>
        <a href="login.html" class="btn-secondary btn-small">Masuk Admin</a>
      </div>
    `;
  }
}

function renderTree(gens) {
  let html = '<div class="tree-decoration">🌳</div>';

  gens.forEach((gen, idx) => {
    const members = gen.members ? Object.values(gen.members).slice(0, 4) : [];
    const memberCount = gen.members ? Object.keys(gen.members).length : 0;

    // Pair members into couples (2 per couple card)
    const memberPairs = [];
    for (let i = 0; i < members.length; i += 2) {
      memberPairs.push(members.slice(i, i + 2));
    }

    html += `
      <a href="generasi.html?id=${encodeURIComponent(gen.id)}"
         class="generation"
         aria-label="Lihat profil ${escapeAttr(gen.title || "generasi")}">
        <span class="generation-label">GENERASI ${idx + 1}</span>
        ${gen.subtitle ? `<span class="generation-subtitle">${escapeHtml(gen.subtitle)}</span>` : ""}
        <div class="generation-members">
          ${memberPairs.map((pair) => `
            <div class="tree-couple-card">
              ${renderTreeMember(pair[0])}
              ${pair[1] ? '<div class="tree-couple-divider"></div>' + renderTreeMember(pair[1]) : ""}
            </div>
          `).join("")}
        </div>
        <span class="generation-cta">
          Lihat cerita generasi →
        </span>
        ${memberCount > 4 ? `<small class="generation-more">+${memberCount - 4} anggota lainnya</small>` : ""}
      </a>
      ${idx < gens.length - 1 ? '<div class="tree-connector">↓</div>' : ""}
    `;
  });

  html += `
    <p class="demo-note">
      Klik kotak generasi untuk melihat profil & cerita lengkap.
    </p>
  `;

  treeContainer.innerHTML = html;
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
 * Render 1 anggota kecil di dalam couple card (untuk tree di beranda).
 */
function renderTreeMember(m) {
  return `
    <div class="person-card">
      <div class="person-photo">${renderPhoto(m.photo, m.name)}</div>
      <strong>${escapeHtml(m.name || "")}</strong>
      <small>${escapeHtml(m.birthYear || "")}${m.deathYear ? " - " + escapeHtml(m.deathYear) : ""}</small>
    </div>
  `;
}

function friendlyError(err) {
  const msg = err.message || String(err);
  if (/index not defined/i.test(msg)) {
    return 'Rules belum punya .indexOn untuk "order". Lihat README.';
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

// Trigger load
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", loadTree);
} else {
  loadTree();
}

console.log("[Tree] tree.js siap.");

/* ==========================================================
   BINGKAI FAMILY - SEJARAH PAGE
   List artikel sejarah keluarga + full article view
   ========================================================== */

import { initializeApp } from
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  get
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const content = document.getElementById("sejarahContent");

async function loadArticles() {
  try {
    const snap = await get(ref(db, "history"));

    if (!snap.exists()) {
      content.innerHTML = `
        <div class="feature-empty">
          <p>Belum ada artikel sejarah.</p>
          <a href="login.html">Masuk Admin untuk Tambah Artikel</a>
        </div>`;
      return;
    }

    const articles = [];
    snap.forEach((child) => {
      articles.push({ id: child.key, ...child.val() });
    });

    // Sort: terbaru di atas (pakai createdAt jika ada)
    articles.sort((a, b) => {
      const ta = a.createdAt || 0;
      const tb = b.createdAt || 0;
      return tb - ta;
    });

    renderList(articles);
  } catch (err) {
    console.error("[Sejarah] Error:", err);
    content.innerHTML = `
      <div class="feature-empty">
        <p>Gagal memuat artikel.</p>
        <small>${escapeHtml(err.message)}</small>
      </div>`;
  }
}

function renderList(articles) {
  let html = '<div class="sejarah-list">';

  articles.forEach((a) => {
    const dateStr = a.createdAt
      ? new Date(a.createdAt).toLocaleDateString("id-ID", {
          day: "numeric", month: "long", year: "numeric"
        })
      : "";

    html += `
      <a href="#" class="sejarah-card" data-id="${escapeAttr(a.id)}">
        ${a.category ? `<span class="sejarah-card-cat">${escapeHtml(a.category)}</span>` : ""}
        <h3>${escapeHtml(a.title || "(tanpa judul)")}</h3>
        ${a.excerpt ? `<div class="sejarah-card-excerpt">${escapeHtml(a.excerpt)}</div>` : ""}
        ${dateStr ? `<div class="sejarah-card-meta">📅 ${escapeHtml(dateStr)}</div>` : ""}
      </a>
    `;
  });

  html += '</div>';
  content.innerHTML = html;

  // Wire click → show full article
  content.querySelectorAll(".sejarah-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      e.preventDefault();
      const id = card.dataset.id;
      const article = articles.find((a) => a.id === id);
      if (article) showFullArticle(article);
    });
  });
}

function showFullArticle(a) {
  const dateStr = a.createdAt
    ? new Date(a.createdAt).toLocaleDateString("id-ID", {
        day: "numeric", month: "long", year: "numeric"
      })
    : "";

  // Convert body newlines to <br>
  const bodyHtml = escapeHtml(a.body || "")
    .replace(/\n/g, "<br>")
    .replace(/\n\n/g, "</p><p>");

  content.innerHTML = `
    <a href="#" class="sejarah-back" id="sejarahBack">← Kembali ke Daftar Artikel</a>
    <article class="sejarah-full">
      <h1>${escapeHtml(a.title || "")}</h1>
      <div class="sejarah-full-meta">
        ${a.category ? `<strong>${escapeHtml(a.category)}</strong> • ` : ""}
        ${dateStr ? "📅 " + escapeHtml(dateStr) : ""}
        ${a.author ? " • ✍ " + escapeHtml(a.author) : ""}
      </div>
      <div class="sejarah-full-body">
        <p>${bodyHtml}</p>
      </div>
    </article>
  `;

  document.getElementById("sejarahBack").addEventListener("click", (e) => {
    e.preventDefault();
    loadArticles();
  });

  // Scroll to top
  window.scrollTo({ top: 0, behavior: "smooth" });
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
  document.addEventListener("DOMContentLoaded", loadArticles);
} else {
  loadArticles();
}

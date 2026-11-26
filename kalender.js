/* ==========================================================
   BINGKAI FAMILY - KALENDER PAGE
   Kalender bulanan dengan events + birthday auto dari members
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

const kalenderTitle = document.getElementById("kalenderTitle");
const kalenderGrid = document.getElementById("kalenderGrid");
const upcomingList = document.getElementById("upcomingList");
const btnPrev = document.getElementById("btnPrev");
const btnNext = document.getElementById("btnNext");
const btnToday = document.getElementById("btnToday");

const MONTH_NAMES = [
  "Januari","Februari","Maret","April","Mei","Juni",
  "Juli","Agustus","September","Oktober","November","Desember"
];
const DAY_NAMES = ["Min","Sen","Sel","Rab","Kam","Jum","Sab"];

let currentDate = new Date();
let allEvents = []; // gabungan birthday + custom events

async function loadData() {
  try {
    // Load events + members (untuk birthday) secara paralel
    const [eventsSnap, gensSnap] = await Promise.all([
      get(ref(db, "events")),
      get(ref(db, "generations"))
    ]);

    allEvents = [];

    // 1) Custom events dari collection "events"
    if (eventsSnap.exists()) {
      eventsSnap.forEach((child) => {
        const e = child.val();
        allEvents.push({
          type: e.type || "other",
          title: e.title || "Acara",
          description: e.description || "",
          date: e.date, // format: "YYYY-MM-DD"
          yearly: !!e.yearly,
          source: "event"
        });
      });
    }

    // 2) Birthday dari members (kalau ada birthMonth + birthDay)
    if (gensSnap.exists()) {
      gensSnap.forEach((genChild) => {
        const gen = genChild.val();
        if (gen.members) {
          Object.values(gen.members).forEach((m) => {
            if (m.birthMonth && m.birthDay) {
              allEvents.push({
                type: "birthday",
                title: "🎂 Ulang tahun " + (m.name || ""),
                description: "Ulang tahun " + (m.fullName || m.name || ""),
                birthMonth: m.birthMonth,
                birthDay: m.birthDay,
                yearly: true,
                source: "birthday"
              });
            }
          });
        }
      });
    }

    renderCalendar();
    renderUpcoming();
  } catch (err) {
    console.error("[Kalender] Error:", err);
    kalenderGrid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--muted)">
        Gagal memuat kalender: ${escapeHtml(err.message)}
      </div>`;
  }
}

function renderCalendar() {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  kalenderTitle.textContent = MONTH_NAMES[month] + " " + year;

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startDayOfWeek = firstDay.getDay();

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  // Day names header
  let html = DAY_NAMES.map((d) =>
    `<div class="kalender-day-name">${d}</div>`
  ).join("");

  // Empty cells before first day
  for (let i = 0; i < startDayOfWeek; i++) {
    html += '<div class="kalender-cell other-month"></div>';
  }

  // Days of month
  for (let day = 1; day <= daysInMonth; day++) {
    const isToday = isCurrentMonth && day === today.getDate();
    const dayEvents = getEventsForDate(year, month, day);

    let eventsHtml = dayEvents.map((e) => {
      const cls = e.type || "other";
      const title = escapeHtml(e.title);
      return `<span class="kalender-event ${cls}" title="${title}">${title}</span>`;
    }).join("");

    html += `
      <div class="kalender-cell ${isToday ? "today" : ""}">
        <span class="day-num">${day}</span>
        ${eventsHtml}
      </div>
    `;
  }

  // Fill remaining cells to complete grid (42 cells = 6 rows × 7)
  const totalCells = startDayOfWeek + daysInMonth;
  const remaining = (7 - (totalCells % 7)) % 7;
  for (let i = 0; i < remaining; i++) {
    html += '<div class="kalender-cell other-month"></div>';
  }

  kalenderGrid.innerHTML = html;
}

function getEventsForDate(year, month, day) {
  return allEvents.filter((e) => {
    if (e.source === "birthday") {
      return e.birthMonth === (month + 1) && e.birthDay === day;
    }
    // Custom event
    if (!e.date) return false;
    const parts = e.date.split("-");
    const eYear = parseInt(parts[0]);
    const eMonth = parseInt(parts[1]);
    const eDay = parseInt(parts[2]);

    if (e.yearly) {
      return eMonth === (month + 1) && eDay === day;
    }
    return eYear === year && eMonth === (month + 1) && eDay === day;
  });
}

function renderUpcoming() {
  const now = new Date();
  const nowTs = now.getTime();
  const oneYearLater = nowTs + (365 * 24 * 60 * 60 * 1000);

  // Compute next occurrence for each event
  const upcoming = allEvents.map((e) => {
    let nextDate;

    if (e.source === "birthday") {
      // Next birthday
      let candidate = new Date(now.getFullYear(), e.birthMonth - 1, e.birthDay);
      if (candidate.getTime() < nowTs) {
        candidate = new Date(now.getFullYear() + 1, e.birthMonth - 1, e.birthDay);
      }
      nextDate = candidate;
    } else if (e.date) {
      const parts = e.date.split("-");
      const eYear = parseInt(parts[0]);
      const eMonth = parseInt(parts[1]);
      const eDay = parseInt(parts[2]);

      if (e.yearly) {
        let candidate = new Date(now.getFullYear(), eMonth - 1, eDay);
        if (candidate.getTime() < nowTs) {
          candidate = new Date(now.getFullYear() + 1, eMonth - 1, eDay);
        }
        nextDate = candidate;
      } else {
        nextDate = new Date(eYear, eMonth - 1, eDay);
      }
    }

    if (!nextDate) return null;
    return { ...e, nextDate };
  }).filter((e) => e && e.nextDate.getTime() >= nowTs && e.nextDate.getTime() <= oneYearLater);

  // Sort by date
  upcoming.sort((a, b) => a.nextDate.getTime() - b.nextDate.getTime());

  // Take first 8
  const top = upcoming.slice(0, 8);

  if (top.length === 0) {
    upcomingList.innerHTML = "<p style='color:var(--muted);font-size:12px'>Tidak ada acara mendatang.</p>";
    return;
  }

  upcomingList.innerHTML = top.map((e) => {
    const d = e.nextDate;
    const dateStr = d.toLocaleDateString("id-ID", {
      day: "numeric", month: "short", year: "numeric"
    });
    const typeLabel = {
      birthday: "🎂 Ulang Tahun",
      anniversary: "💍 Anniversary",
      reunion: "👨‍👩‍👧‍👦 Reuni",
      other: "📅 Acara"
    }[e.type] || "📅 Acara";

    const typeColor = {
      birthday: "#c0392b",
      anniversary: "#8e44ad",
      reunion: "#263d35",
      other: "#c5a15d"
    }[e.type] || "#c5a15d";

    return `
      <div class="upcoming-item">
        <div class="upcoming-date">${escapeHtml(dateStr)}</div>
        <div class="upcoming-title">${escapeHtml(e.title)}</div>
        <span class="upcoming-type" style="background:${typeColor}">${escapeHtml(typeLabel)}</span>
      </div>
    `;
  }).join("");
}

// Navigation
btnPrev.addEventListener("click", () => {
  currentDate.setMonth(currentDate.getMonth() - 1);
  renderCalendar();
});

btnNext.addEventListener("click", () => {
  currentDate.setMonth(currentDate.getMonth() + 1);
  renderCalendar();
});

btnToday.addEventListener("click", () => {
  currentDate = new Date();
  renderCalendar();
});

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Footer year
const footerYear = document.getElementById("footerYear");
if (footerYear) {
  footerYear.textContent =
    "© " + new Date().getFullYear() + " BINGKAI FAMILY. All Rights Reserved.";
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", loadData);
} else {
  loadData();
}

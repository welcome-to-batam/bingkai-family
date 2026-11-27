document.addEventListener("DOMContentLoaded", function () {

  const menuToggle = document.getElementById("menuToggle");
  const navigation = document.getElementById("navigation");

  if (menuToggle && navigation) {

    menuToggle.addEventListener("click", function () {

      const isOpen = navigation.classList.toggle("active");

      menuToggle.classList.toggle("is-open", isOpen);

      menuToggle.setAttribute("aria-expanded", String(isOpen));

      menuToggle.setAttribute(
        "aria-label",
        isOpen ? "Tutup menu" : "Buka menu"
      );

    });

    navigation.querySelectorAll("a").forEach(function (link) {

      link.addEventListener("click", function () {

        navigation.classList.remove("active");
        menuToggle.classList.remove("is-open");

        menuToggle.setAttribute("aria-expanded", "false");
        menuToggle.setAttribute("aria-label", "Buka menu");

      });

    });

  }

  const footerYear = document.querySelector(".footer small");

  if (footerYear) {
    footerYear.textContent =
      "© " + new Date().getFullYear() +
      " BINGKAI FAMILY. All Rights Reserved.";
  }

  console.log("BINGKAI FAMILY berhasil dimuat.");

});

// ==================================
// SERVICE WORKER REGISTRATION
// BINGKAI FAMILY
// ==================================

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {

    navigator.serviceWorker.register("./sw.js")
      .then((registration) => {
        console.log(
          "BINGKAI FAMILY: Service Worker aktif.",
          registration.scope
        );
      })
      .catch((error) => {
        console.error(
          "Service Worker gagal diaktifkan:",
          error
        );
      });

  });
}

// ==================================
// PWA INSTALL BUTTON (Mengambang)
// ==================================
//
// Tombol install mengambang di bawah-tengah layar.
// - Muncul saat beforeinstallprompt event fires (browser siap install)
// - Hilang saat user scroll, muncul lagi saat scroll berhenti
// - Hilang permanen setelah app terinstall
// - Muncul lagi kalau app di-uninstall (event fires lagi di visit berikutnya)
// - Tidak muncul kalau sudah jalan sebagai PWA (display-mode: standalone)

(function () {
  // Jangan jalankan di halaman admin/login (tidak perlu install di sana)
  // Hanya tampilkan di halaman publik: index, generasi, pohon, anggota, album, kalender, sejarah, privasi

  // Cek apakah sudah jalan sebagai PWA (installed)
  if (window.matchMedia("(display-mode: standalone)").matches) {
    console.log("[Install] App sudah terinstall (standalone mode), tombol install tidak ditampilkan");
    return;
  }

  // Cek apakah browser support beforeinstallprompt
  // iOS Safari tidak support — di iOS user harus manual "Add to Home Screen"
  if (!("BeforeInstallPromptEvent" in window) && !window.beforeinstallprompt) {
    // Mungkin iOS — kita bisa tampilkan tooltip nanti kalau perlu
    console.log("[Install] Browser tidak support beforeinstallprompt (mungkin iOS)");
    // Tetap lanjut untuk deteksi runtime
  }

  let deferredPrompt = null;
  let isInstalled = false;
  let scrollTimeout = null;
  let isScrolling = false;
  let buttonVisible = false;

  // Buat tombol install
  const installBtn = document.createElement("button");
  installBtn.id = "pwaInstallBtn";
  installBtn.className = "pwa-install-btn pwa-hidden"; // hidden by default
  installBtn.innerHTML = "📱 Install Aplikasi";
  installBtn.setAttribute("aria-label", "Install aplikasi BINGKAI FAMILY");

  // Tambah ke body setelah DOM ready
  function addButton() {
    if (!document.body.contains(installBtn)) {
      document.body.appendChild(installBtn);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", addButton);
  } else {
    addButton();
  }

  // Show / hide button functions
  function showButton() {
    if (isInstalled || !deferredPrompt) return;
    if (buttonVisible) return;
    installBtn.classList.remove("pwa-hidden");
    buttonVisible = true;
  }

  function hideButton() {
    if (!buttonVisible) return;
    installBtn.classList.add("pwa-hidden");
    buttonVisible = false;
  }

  // Capture beforeinstallprompt event
  window.addEventListener("beforeinstallprompt", (e) => {
    // Cegah browser tampilkan prompt default (kita pakai tombol custom)
    e.preventDefault();
    deferredPrompt = e;
    console.log("[Install] beforeinstallprompt fired — tombol install siap");

    // Tampilkan tombol (dengan delay kecil supaya smooth)
    setTimeout(showButton, 500);
  });

  // Listen appinstalled event — hide permanently
  window.addEventListener("appinstalled", () => {
    isInstalled = true;
    deferredPrompt = null;
    hideButton();
    console.log("[Install] App berhasil terinstall — tombol disembunyikan");
  });

  // Click handler untuk tombol install
  installBtn.addEventListener("click", async () => {
    if (!deferredPrompt) {
      console.log("[Install] deferredPrompt tidak ada");
      return;
    }

    // Sembunyikan tombol saat diklik
    hideButton();

    // Tampilkan install prompt
    deferredPrompt.prompt();

    // Tunggu user choice
    const choiceResult = await deferredPrompt.userChoice;
    console.log("[Install] User choice:", choiceResult.outcome);

    if (choiceResult.outcome === "accepted") {
      isInstalled = true;
      console.log("[Install] User accepted install");
    } else {
      console.log("[Install] User dismissed install");
      // Tampilkan lagi tombol setelah 2 detik kalau user dismiss
      // (beforeinstallprompt tidak fire lagi di page load yang sama,
      //  jadi tombol tidak akan muncul lagi sampai reload)
    }

    deferredPrompt = null;
  });

  // Scroll detection: hide saat scroll, show saat scroll berhenti
  function handleScroll() {
    if (!buttonVisible || isInstalled) return;

    // Sembunyikan saat mulai scroll
    if (!isScrolling) {
      isScrolling = true;
      hideButton();
    }

    // Clear timeout sebelumnya
    clearTimeout(scrollTimeout);

    // Set timeout — kalau tidak scroll selama 400ms, anggap scroll berhenti
    scrollTimeout = setTimeout(() => {
      isScrolling = false;
      // Tampilkan lagi kalau belum installed dan deferredPrompt masih ada
      if (!isInstalled && deferredPrompt) {
        showButton();
      }
    }, 400);
  }

  // Pasang scroll listener (passive supaya tidak block scroll)
  window.addEventListener("scroll", handleScroll, { passive: true });

  // Kalau user berhenti scroll lalu idle, tetap tampilkan
  // (sudah dihandle oleh timeout di handleScroll)

  console.log("[Install] PWA install button script siap");
})();

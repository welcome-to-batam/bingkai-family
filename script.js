
/* =================================
   BINGKAI FAMILY
   Main JavaScript
================================= */

document.addEventListener("DOMContentLoaded", function () {

  // MENU NAVIGASI MOBILE
  const menuToggle = document.getElementById("menuToggle");
  const navigation = document.getElementById("navigation");

  if (menuToggle && navigation) {

    menuToggle.addEventListener("click", function () {

      const isOpen = navigation.classList.toggle("active");

      menuToggle.textContent = isOpen ? "✕" : "☰";

      menuToggle.setAttribute("aria-expanded", isOpen);

    });

    // Tutup menu setelah tautan diklik
    navigation.querySelectorAll("a").forEach(function (link) {

      link.addEventListener("click", function () {

        navigation.classList.remove("active");

        menuToggle.textContent = "☰";

        menuToggle.setAttribute("aria-expanded", "false");

      });

    });

  }

  // TAHUN OTOMATIS PADA FOOTER
  const footerYear = document.querySelector(".footer small");

  if (footerYear) {
    footerYear.textContent =
      "© " + new Date().getFullYear() +
      " BINGKAI FAMILY. All Rights Reserved.";
  }

  console.log("BINGKAI FAMILY berhasil dimuat.");

});

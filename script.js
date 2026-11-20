
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


/**
 * BINGKAI FAMILY
 * FAMILY TREE
 *
 * Membaca anggota keluarga dari Firebase
 * dan menampilkan Generasi 1, 2, dan 3.
 */

import { db } from "./firebase-config.js";
import {
  ref,
  get
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

document.addEventListener("DOMContentLoaded", () => {

  const generationTabs = document.querySelectorAll(".generation-tab");
  const membersContainer = document.getElementById("familyMembers");
  const message = document.getElementById("familyTreeMessage");

  if (!membersContainer || !generationTabs.length) return;

  // FAMILY_ID diambil dari alamat halaman:
  // ?family=UID_ADMIN
  const params = new URLSearchParams(window.location.search);
  const familyId = params.get("family");

  let membersData = [];

  function showMessage(text) {
    membersContainer.replaceChildren();

    const info = document.createElement("div");
    info.className = "album-empty";
    info.textContent = text;

    membersContainer.appendChild(info);
  }

  function renderMembers(generation) {

    membersContainer.replaceChildren();

    const filteredMembers = membersData.filter(member => {
      return String(member.generation) === String(generation);
    });

    if (filteredMembers.length === 0) {
      showMessage(
        "Belum ada anggota keluarga pada Generasi " + generation + "."
      );
      return;
    }

    filteredMembers.forEach(member => {

      const card = document.createElement("article");
      card.className = "person-card";

      const photo = document.createElement("div");
      photo.className = "person-photo";

      const imageData = member.photo || member.image || "";

      if (
        typeof imageData === "string" &&
        (
          imageData.startsWith("data:image/") ||
          imageData.startsWith("https://")
        )
      ) {
        const image = document.createElement("img");
        image.src = imageData;
        image.alt = member.name || "Anggota keluarga";
        image.loading = "lazy";
        photo.appendChild(image);
      } else {
        photo.textContent =
          member.gender === "Perempuan" ? "👩" : "👨";
      }

      const name = document.createElement("strong");
      name.textContent = member.name || "Tanpa nama";

      const description = document.createElement("small");
      description.textContent =
        member.shortBio || "Anggota keluarga";

      card.appendChild(photo);
      card.appendChild(name);
      card.appendChild(description);

      membersContainer.appendChild(card);
    });
  }

  async function loadFamilyMembers() {

    if (!familyId) {
      showMessage(
        "Keluarga belum dipilih. Gunakan alamat halaman dengan parameter ?family=UID_ADMIN."
      );

      if (message) {
        message.textContent =
          "Data silsilah akan tampil setelah identitas keluarga ditentukan.";
      }

      return;
    }

    try {

      showMessage("Memuat anggota keluarga...");

      const membersRef = ref(
        db,
        "families/" + familyId + "/publicMembers"
      );

      const snapshot = await get(membersRef);

      membersData = [];

      if (snapshot.exists()) {
        const data = snapshot.val();

        membersData = Object.entries(data).map(([id, member]) => ({
          id,
          ...member
        }));
      }

      renderMembers(1);

      if (message) {
        message.textContent =
          "Pilih generasi untuk melihat anggota keluarga.";
      }

    } catch (error) {

      console.error("Gagal membaca silsilah:", error);

      showMessage(
        "Gagal memuat data keluarga. Periksa koneksi internet dan Firebase Rules."
      );
    }
  }

  generationTabs.forEach(tab => {

    tab.addEventListener("click", () => {

      const generation = tab.dataset.generation;

      generationTabs.forEach(item => {
        item.classList.toggle("active", item === tab);
      });

      renderMembers(generation);

    });

  });

  loadFamilyMembers();

});
                                                 

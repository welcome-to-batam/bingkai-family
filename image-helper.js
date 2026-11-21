
/**
 * IMAGE HELPER
 * BINGKAI FAMILY
 *
 * Mengubah foto menjadi Base64
 * untuk penyimpanan Firebase Realtime Database.
 */

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {

    if (!(file instanceof Blob)) {
      reject(new Error("File foto tidak valid."));
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Gagal mengubah foto menjadi Base64."));
        return;
      }

      resolve(reader.result);
    };

    reader.onerror = () => {
      reject(new Error("Foto gagal dibaca."));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Memeriksa ukuran foto sebelum disimpan.
 */

export function getImageSize(file) {
  if (!(file instanceof Blob)) {
    return 0;
  }

  return file.size;
}

// Ícones de perfil disponíveis. A mesma lista existe no servidor
// (server/src/index.js) pra validar — mantenha as duas em sincronia.
export const AVAILABLE_ICONS = [
  "😀", "😎", "🤖", "🐱", "🐶", "🦊", "🐼", "🦄",
  "👾", "🎮", "🔥", "⚡", "🌟", "🍕", "⚽", "🎸",
];

const STORAGE_KEY = "plugdj-icon";

export function getStoredIcon() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeIcon(icon) {
  try {
    localStorage.setItem(STORAGE_KEY, icon);
  } catch {
    // localStorage indisponível (modo privado, etc.) — sem problema, só não
    // vai lembrar da escolha na próxima visita.
  }
}

export function isImageIcon(icon) {
  return typeof icon === "string" && icon.startsWith("data:image");
}

const ICON_IMAGE_SIZE = 64;

// Lê um arquivo de imagem, recorta um quadrado central e redimensiona pra
// um ícone bem pequeno (sem servidor de arquivos, ele vira uma miniatura
// embutida direto na URL — por isso precisa ficar minúsculo).
export function fileToIconDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Escolha um arquivo de imagem."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Arquivo de imagem inválido."));
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const canvas = document.createElement("canvas");
        canvas.width = ICON_IMAGE_SIZE;
        canvas.height = ICON_IMAGE_SIZE;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(
          img,
          (img.width - side) / 2,
          (img.height - side) / 2,
          side,
          side,
          0,
          0,
          ICON_IMAGE_SIZE,
          ICON_IMAGE_SIZE
        );
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

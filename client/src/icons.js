// Ícones de perfil disponíveis. A mesma lista existe no servidor
// (server/src/index.js) pra validar — mantenha as duas em sincronia.
export const AVAILABLE_ICONS = [
  "😀", "😎", "🤖", "🐱", "🐶", "🦊", "🐼", "🦄",
  "👾", "🎮", "🔥", "⚡", "🌟", "🍕", "⚽", "🎸",
];

const STORAGE_KEY = "somnacaixa-icon";

// Só emojis da lista. Um ícone salvo antes (quando dava pra enviar imagem)
// é ignorado.
export function getStoredIcon() {
  try {
    const icon = localStorage.getItem(STORAGE_KEY);
    return AVAILABLE_ICONS.includes(icon) ? icon : null;
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

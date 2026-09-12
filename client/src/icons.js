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

const STORAGE_KEY = "somnacaixa-name";

// Lembra o último nome usado pra próxima visita. Igual ao ícone e ao tema:
// se o localStorage não estiver disponível (modo privado, etc.), só não lembra.
export function getStoredName() {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function storeName(name) {
  try {
    localStorage.setItem(STORAGE_KEY, name);
  } catch {
    // sem problema, só não vai lembrar na próxima visita
  }
}

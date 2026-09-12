// Extrai o ID de um vídeo do YouTube a partir de várias formas de URL
// (watch?v=, youtu.be/, embed/) ou aceita um ID puro (11 caracteres).
const ID_RE = /^[a-zA-Z0-9_-]{11}$/;

export function extractYoutubeId(input) {
  if (!input) return null;
  const trimmed = input.trim();

  if (ID_RE.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    if (url.hostname === "youtu.be") {
      const id = url.pathname.slice(1);
      return ID_RE.test(id) ? id : null;
    }
    if (url.hostname.includes("youtube.com")) {
      if (url.pathname === "/watch") {
        const id = url.searchParams.get("v");
        return id && ID_RE.test(id) ? id : null;
      }
      const embedMatch = url.pathname.match(/\/(embed|shorts)\/([a-zA-Z0-9_-]{11})/);
      if (embedMatch) return embedMatch[2];
    }
  } catch {
    // não era uma URL válida
  }
  return null;
}

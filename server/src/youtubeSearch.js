const SEARCH_ENDPOINT = "https://www.googleapis.com/youtube/v3/search";
const MAX_RESULTS = 8;

// Busca vídeos no YouTube usando a API oficial (YouTube Data API v3).
// Lança um Error com uma mensagem já amigável em português em caso de falha,
// pra podermos repassar direto pro cliente.
export async function searchYoutube(query, apiKey) {
  if (!apiKey) {
    throw new Error(
      "Busca do YouTube não configurada: defina YOUTUBE_API_KEY no servidor."
    );
  }

  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    maxResults: String(MAX_RESULTS),
    q: query,
    key: apiKey,
  });

  const res = await fetch(`${SEARCH_ENDPOINT}?${params.toString()}`);
  if (!res.ok) {
    // Repassa o motivo real que o Google devolveu (ex: "API key not valid",
    // "quotaExceeded") em vez de só o status HTTP — bem mais fácil de
    // diagnosticar do que um "falhou (status 400)" genérico.
    const body = await res.json().catch(() => null);
    const reason = body?.error?.message || body?.error?.errors?.[0]?.reason;
    if (res.status === 403) {
      throw new Error(`Cota da API do YouTube excedida ou chave inválida. ${reason || ""}`.trim());
    }
    throw new Error(`Busca do YouTube falhou (status ${res.status}). ${reason || ""}`.trim());
  }

  const data = await res.json();
  return (data.items || [])
    .filter((item) => item.id?.videoId)
    .map((item) => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails?.default?.url,
    }));
}

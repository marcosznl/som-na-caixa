const SEARCH_ENDPOINT = "https://www.googleapis.com/youtube/v3/search";
const VIDEOS_ENDPOINT = "https://www.googleapis.com/youtube/v3/videos";
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

// Converte uma duração ISO 8601 (formato que o YouTube usa, ex: "PT3M33S")
// em segundos.
function parseIsoDuration(iso) {
  const match = iso?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return null;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  return hours * 3600 + minutes * 60 + seconds;
}

// Busca a duração real do vídeo (em segundos), usada como rede de segurança
// pra avançar a fila sozinho se o cliente do DJ não avisar que acabou.
// Custa só 1 unidade de cota (bem mais barato que a busca, que custa 100) —
// retorna null em qualquer falha, pra quem chamar decidir um valor padrão.
export async function fetchVideoDuration(videoId, apiKey) {
  if (!apiKey) return null;
  try {
    const params = new URLSearchParams({ part: "contentDetails", id: videoId, key: apiKey });
    const res = await fetch(`${VIDEOS_ENDPOINT}?${params.toString()}`);
    if (!res.ok) return null;
    const data = await res.json();
    return parseIsoDuration(data.items?.[0]?.contentDetails?.duration) ?? null;
  } catch {
    return null;
  }
}

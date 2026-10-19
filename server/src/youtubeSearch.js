const SEARCH_ENDPOINT = "https://www.googleapis.com/youtube/v3/search";
const VIDEOS_ENDPOINT = "https://www.googleapis.com/youtube/v3/videos";
const MAX_RESULTS = 8;

// A cota gratuita do YouTube é de ~100 buscas por dia pro site inteiro, então
// buscas repetidas (mesmo texto) reaproveitam o resultado por algumas horas.
// Durações de vídeo praticamente não mudam e também ficam guardadas.
const SEARCH_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const SEARCH_CACHE_MAX = 500;
const DURATION_CACHE_MAX = 2000;
const searchCache = new Map(); // texto normalizado -> { results, at }
const durationCache = new Map(); // videoId -> segundos

// Map mantém a ordem de inserção: quando enche, descarta o mais antigo.
function remember(cache, key, value, max) {
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > max) {
    cache.delete(cache.keys().next().value);
  }
}

function normalizeQuery(query) {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

// Busca vídeos no YouTube usando a API oficial (YouTube Data API v3).
// Lança um Error com uma mensagem já amigável em português em caso de falha,
// pra podermos repassar direto pro cliente.
export async function searchYoutube(query, apiKey) {
  const cacheKey = normalizeQuery(query);
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < SEARCH_CACHE_TTL_MS) {
    return cached.results;
  }

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
  const results = (data.items || [])
    .filter((item) => item.id?.videoId)
    .map((item) => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails?.default?.url,
    }));
  remember(searchCache, cacheKey, { results, at: Date.now() }, SEARCH_CACHE_MAX);
  return results;
}

// Converte uma duração ISO 8601 (formato que o YouTube usa, ex: "PT3M33S")
// em segundos.
export function parseIsoDuration(iso) {
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
  if (durationCache.has(videoId)) return durationCache.get(videoId);
  if (!apiKey) return null;
  try {
    const params = new URLSearchParams({ part: "contentDetails", id: videoId, key: apiKey });
    const res = await fetch(`${VIDEOS_ENDPOINT}?${params.toString()}`);
    if (!res.ok) return null;
    const data = await res.json();
    const duration = parseIsoDuration(data.items?.[0]?.contentDetails?.duration) ?? null;
    if (duration) remember(durationCache, videoId, duration, DURATION_CACHE_MAX);
    return duration;
  } catch {
    return null;
  }
}

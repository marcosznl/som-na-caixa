// Limitador simples por "balde de fichas": cada ação tem um balde com um
// número máximo de fichas (rajada permitida) que vai se recarregando aos
// poucos. Cada uso gasta uma ficha; sem ficha, a ação é recusada.

// capacity = quantas vezes seguidas dá pra fazer; refillMs = de quanto em
// quanto tempo volta uma ficha.
export const LIMITS = {
  chat: { capacity: 5, refillMs: 1000 },
  reaction: { capacity: 8, refillMs: 300 },
  vote: { capacity: 10, refillMs: 500 },
  queueAdd: { capacity: 10, refillMs: 2000 },
  roomCreate: { capacity: 3, refillMs: 20 * 1000 },
  roomJoin: { capacity: 10, refillMs: 2000 },
  icon: { capacity: 5, refillMs: 5000 },
  search: { capacity: 10, refillMs: 10 * 1000 },
};

// `buckets` é um objeto qualquer onde guardar o estado (ex: socket.data.buckets
// pra limites por conexão, ou uma entrada de Map pra limites por IP).
export function takeToken(buckets, action, now = Date.now()) {
  const limit = LIMITS[action];
  if (!limit) throw new Error(`Limite desconhecido: ${action}`);
  const bucket = buckets[action] ?? { tokens: limit.capacity, updatedAt: now };
  const refilled = Math.floor((now - bucket.updatedAt) / limit.refillMs);
  if (refilled > 0) {
    bucket.tokens = Math.min(limit.capacity, bucket.tokens + refilled);
    bucket.updatedAt += refilled * limit.refillMs;
  }
  if (bucket.tokens >= limit.capacity) {
    // Balde cheio: o relógio de recarga só começa a contar a partir do uso.
    bucket.updatedAt = now;
  }
  buckets[action] = bucket;
  if (bucket.tokens <= 0) return false;
  bucket.tokens -= 1;
  return true;
}

// Limites por IP (usado na busca, que é HTTP e não tem socket). Limpa de
// tempos em tempos os IPs que já recuperaram todas as fichas, pra o Map não
// crescer pra sempre.
export function createIpLimiter(action, cleanupEveryMs = 10 * 60 * 1000) {
  const byIp = new Map();
  const limit = LIMITS[action];
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [ip, buckets] of byIp) {
      const bucket = buckets[action];
      if (!bucket || now - bucket.updatedAt >= limit.capacity * limit.refillMs) {
        byIp.delete(ip);
      }
    }
  }, cleanupEveryMs);
  timer.unref();

  return function allow(ip) {
    let buckets = byIp.get(ip);
    if (!buckets) {
      buckets = {};
      byIp.set(ip, buckets);
    }
    return takeToken(buckets, action);
  };
}

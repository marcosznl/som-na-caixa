// Estado de uma sala, tudo em memória (reinicia se o servidor cair).
// A ideia central: existe uma "cabine" (booth) com a fila de DJs, e cada DJ
// tem sua própria fila de músicas (pode adicionar quantas quiser a qualquer
// momento). O DJ da vez toca a próxima música da fila dele; quando acaba (ou
// é pulada), passa a vez para o próximo da cabine.

const MAX_CHAT_HISTORY = 100;
const MAX_PLAY_HISTORY = 50;
const MAX_QUEUE_PER_USER = 20;

export function createRoomState() {
  return {
    users: new Map(), // socketId -> { id, name, queue: [{videoId, title}] }
    booth: [], // array de socketId, ordem da fila de DJs
    currentDjIndex: -1, // índice em `booth` de quem está tocando agora
    currentTrack: null, // { videoId, title, startedAt, djId, djName, historyId, up, down, skip }
    chatHistory: [], // { id, author, text, at }
    playHistory: [], // { id, videoId, title, djName, startedAt, up, down }, mais recente primeiro
  };
}

export function addUser(state, socketId, name, icon) {
  state.users.set(socketId, { id: socketId, name, icon: icon || null, queue: [] });
}

// Retorna false se a pessoa não estiver mais na sala (ex: desconectou logo
// depois de escolher o ícone).
export function setUserIcon(state, socketId, icon) {
  const user = state.users.get(socketId);
  if (!user) return false;
  user.icon = icon;
  return true;
}

export function removeUser(state, socketId) {
  state.users.delete(socketId);
  removeVotesOf(state, socketId);
  const boothIndex = state.booth.indexOf(socketId);
  const wasCurrentDj = boothIndex !== -1 && boothIndex === state.currentDjIndex;

  if (boothIndex !== -1) {
    state.booth.splice(boothIndex, 1);
    // Ajusta o índice do DJ atual se removemos alguém antes dele.
    if (boothIndex < state.currentDjIndex) {
      state.currentDjIndex -= 1;
    } else if (boothIndex === state.currentDjIndex) {
      state.currentDjIndex -= 1; // será avançado por advanceQueue()
    }
  }

  return { wasCurrentDj };
}

export function joinBooth(state, socketId) {
  if (state.booth.includes(socketId)) return false;
  state.booth.push(socketId);
  return true;
}

export function leaveBooth(state, socketId) {
  const boothIndex = state.booth.indexOf(socketId);
  if (boothIndex === -1) return { removed: false, wasCurrentDj: false };

  const wasCurrentDj = boothIndex === state.currentDjIndex;
  state.booth.splice(boothIndex, 1);
  if (boothIndex < state.currentDjIndex) {
    state.currentDjIndex -= 1;
  } else if (boothIndex === state.currentDjIndex) {
    state.currentDjIndex -= 1;
  }
  // Ao sair da cabine, descarta a fila de músicas pendente dessa pessoa.
  const user = state.users.get(socketId);
  if (user) user.queue = [];
  return { removed: true, wasCurrentDj };
}

// Adiciona uma música ao fim da fila pessoal de um usuário. Retorna false se
// a fila dele já estiver no limite.
export function addToQueue(state, socketId, track) {
  const user = state.users.get(socketId);
  if (!user) return false;
  if (user.queue.length >= MAX_QUEUE_PER_USER) return false;
  user.queue.push(track);
  return true;
}

// Remove uma música da fila pessoal pelo índice (usado quando a pessoa
// desiste de uma música que ainda não tocou).
export function removeFromQueue(state, socketId, index) {
  const user = state.users.get(socketId);
  if (!user || index < 0 || index >= user.queue.length) return false;
  user.queue.splice(index, 1);
  return true;
}

// Move uma música de posição dentro da fila pessoal (arrastar e soltar).
// Retorna false se os índices forem inválidos.
export function reorderQueue(state, socketId, fromIndex, toIndex) {
  const user = state.users.get(socketId);
  if (!user) return false;
  const { queue } = user;
  if (
    !Number.isInteger(fromIndex) ||
    !Number.isInteger(toIndex) ||
    fromIndex < 0 ||
    fromIndex >= queue.length ||
    toIndex < 0 ||
    toIndex >= queue.length ||
    fromIndex === toIndex
  ) {
    return false;
  }
  const [moved] = queue.splice(fromIndex, 1);
  queue.splice(toIndex, 0, moved);
  return true;
}

// Tira a próxima música da fila pessoal de alguém (usado quando chega a vez
// dela de tocar). Retorna null se a fila estiver vazia.
export function popNextFromQueue(state, socketId) {
  const user = state.users.get(socketId);
  if (!user || user.queue.length === 0) return null;
  return user.queue.shift();
}

// Avança a fila para o próximo DJ disponível. Retorna o socketId do novo DJ
// (ou null se a cabine estiver vazia).
export function advanceQueue(state) {
  state.currentTrack = null;
  if (state.booth.length === 0) {
    state.currentDjIndex = -1;
    return null;
  }
  state.currentDjIndex = (state.currentDjIndex + 1) % state.booth.length;
  return state.booth[state.currentDjIndex];
}

export function getCurrentDjId(state) {
  if (state.currentDjIndex < 0 || state.currentDjIndex >= state.booth.length) {
    return null;
  }
  return state.booth[state.currentDjIndex];
}

export function pushChatMessage(state, message) {
  state.chatHistory.push(message);
  if (state.chatHistory.length > MAX_CHAT_HISTORY) {
    state.chatHistory.shift();
  }
}

// Registra uma música que começou a tocar no histórico (mais recente primeiro).
export function pushPlayHistory(state, entry) {
  state.playHistory.unshift(entry);
  if (state.playHistory.length > MAX_PLAY_HISTORY) {
    state.playHistory.pop();
  }
}

// Votos da música atual. "up"/"down" são o curti/não curti (só informativos,
// ficam no histórico); "skip" é o voto pra pular. Cada lista guarda ids de
// conexão, então uma pessoa conta uma vez só. O DJ não vota na própria música.
export function toggleVote(state, socketId, kind) {
  const track = state.currentTrack;
  if (!track || track.djId === socketId || !state.users.has(socketId)) return false;
  if (kind === "skip") {
    track.skip = track.skip.includes(socketId)
      ? track.skip.filter((id) => id !== socketId)
      : [...track.skip, socketId];
    return true;
  }
  if (kind !== "up" && kind !== "down") return false;
  const alreadyThere = track[kind].includes(socketId);
  track.up = track.up.filter((id) => id !== socketId);
  track.down = track.down.filter((id) => id !== socketId);
  if (!alreadyThere) track[kind] = [...track[kind], socketId];
  return true;
}

function removeVotesOf(state, socketId) {
  const track = state.currentTrack;
  if (!track) return;
  track.up = track.up.filter((id) => id !== socketId);
  track.down = track.down.filter((id) => id !== socketId);
  track.skip = track.skip.filter((id) => id !== socketId);
}

// Metade de quem está ouvindo (todo mundo menos o DJ), arredondando pra cima.
export function skipVotesNeeded(state) {
  const listeners = Math.max(0, state.users.size - 1);
  return Math.max(1, Math.ceil(listeners / 2));
}

export function shouldSkip(state) {
  const track = state.currentTrack;
  return Boolean(track) && track.skip.length >= skipVotesNeeded(state);
}

// Copia o placar de curti/não curti da música atual pra entrada dela no
// histórico. Retorna true se encontrou a entrada.
export function syncHistoryVotes(state) {
  const track = state.currentTrack;
  if (!track) return false;
  const entry = state.playHistory.find((item) => item.id === track.historyId);
  if (!entry) return false;
  entry.up = track.up.length;
  entry.down = track.down.length;
  return true;
}

// O que todo mundo da sala precisa ver. Ficam de fora o chat e o histórico
// (mandados à parte, só quando mudam), os ícones (mandados com a lista de
// pessoas) e o conteúdo das filas pessoais (só o dono recebe o dele).
export function serializeState(state) {
  const currentDjId = getCurrentDjId(state);
  const track = state.currentTrack;
  return {
    booth: state.booth
      .map((id) => state.users.get(id))
      .filter(Boolean)
      .map((user) => ({ id: user.id, name: user.name, queueLength: user.queue.length })),
    currentDjId,
    currentTrack: track
      ? {
          videoId: track.videoId,
          title: track.title,
          startedAt: track.startedAt,
          duration: track.duration,
          djId: track.djId,
          djName: track.djName,
          up: track.up,
          down: track.down,
          skip: track.skip,
          skipNeeded: skipVotesNeeded(state),
        }
      : null,
  };
}

export function serializeUsers(state) {
  return Array.from(state.users.values()).map(({ id, name, icon }) => ({ id, name, icon }));
}

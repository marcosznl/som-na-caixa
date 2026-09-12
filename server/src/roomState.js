// Estado da sala única, tudo em memória (reinicia se o servidor cair).
// A ideia central: existe uma "cabine" (booth) com a fila de DJs, e cada DJ
// tem sua própria fila de músicas (pode adicionar quantas quiser a qualquer
// momento). O DJ da vez toca a próxima música da fila dele; quando acaba (ou
// é pulada), passa a vez para o próximo da cabine.

const MAX_CHAT_HISTORY = 100;
const MAX_QUEUE_PER_USER = 20;

export function createRoomState() {
  return {
    users: new Map(), // socketId -> { id, name, queue: [{videoId, title}] }
    booth: [], // array de socketId, ordem da fila de DJs
    currentDjIndex: -1, // índice em `booth` de quem está tocando agora
    currentTrack: null, // { videoId, title, startedAt, djId, djName }
    chatHistory: [], // { id, author, text, at }
  };
}

export function addUser(state, socketId, name) {
  state.users.set(socketId, { id: socketId, name, queue: [] });
}

export function removeUser(state, socketId) {
  state.users.delete(socketId);
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

// Serializa o estado pro cliente (troca socketId por nomes onde faz sentido).
export function serializeState(state) {
  const currentDjId = getCurrentDjId(state);
  return {
    users: Array.from(state.users.values()),
    booth: state.booth.map((id) => state.users.get(id)).filter(Boolean),
    currentDjId,
    currentTrack: state.currentTrack,
    chatHistory: state.chatHistory,
  };
}

import "dotenv/config";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import { nanoid } from "nanoid";
import {
  createRoomState,
  addUser,
  removeUser,
  setUserIcon,
  joinBooth,
  leaveBooth,
  advanceQueue,
  addToQueue,
  removeFromQueue,
  reorderQueue,
  popNextFromQueue,
  getCurrentDjId,
  pushChatMessage,
  pushPlayHistory,
  serializeState,
} from "./roomState.js";
import { extractYoutubeId } from "./youtube.js";
import { searchYoutube, fetchVideoDuration } from "./youtubeSearch.js";

// Busca o título do vídeo via oEmbed público do YouTube (sem precisar de API key).
async function fetchYoutubeTitle(videoId) {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(
        `https://www.youtube.com/watch?v=${videoId}`
      )}&format=json`
    );
    if (!res.ok) return videoId;
    const data = await res.json();
    return data.title || videoId;
  } catch {
    return videoId;
  }
}

const PORT = process.env.PORT || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const MAX_NAME_LENGTH = 24;
const MAX_ROOM_NAME_LENGTH = 40;
const MAX_CHAT_LENGTH = 300;
const ALLOWED_REACTIONS = ["🔥", "💃", "👍", "😂", "❤️"];
const AVAILABLE_ICONS = [
  "😀", "😎", "🤖", "🐱", "🐶", "🦊", "🐼", "🦄",
  "👾", "🎮", "🔥", "⚡", "🌟", "🍕", "⚽", "🎸",
];
// Uma imagem enviada como ícone chega como data URI (já reduzida a uma
// miniatura pequena no cliente); esse teto é só uma proteção extra contra
// alguém mandar uma string enorme.
const MAX_ICON_IMAGE_LENGTH = 60_000;

function isValidIcon(icon) {
  if (AVAILABLE_ICONS.includes(icon)) return true;
  return typeof icon === "string" && icon.startsWith("data:image/") && icon.length <= MAX_ICON_IMAGE_LENGTH;
}

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.get("/health", (_req, res) => res.json({ ok: true }));

// Sem limite artificial aqui — quando a cota real do Google acabar, a busca
// simplesmente falha com o motivo devolvido por eles (ver youtubeSearch.js),
// e ainda dá pra colar o link direto no mesmo campo enquanto isso.
app.get("/api/search", async (req, res) => {
  const query = String(req.query.q || "").trim();
  if (!query) {
    res.status(400).json({ error: "Parâmetro 'q' é obrigatório." });
    return;
  }
  try {
    const results = await searchYoutube(query, YOUTUBE_API_KEY);
    res.json({ results });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Serve o front-end (React já buildado) direto pelo mesmo servidor, pra
// deploy ser um serviço só em vez de dois. Em desenvolvimento local o front
// roda separado (Vite na porta 5173) e essa pasta nem existe — sem problema,
// express.static simplesmente não encontra nada e segue o jogo.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDistPath = path.join(__dirname, "..", "..", "client", "dist");
app.use(express.static(clientDistPath));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CLIENT_ORIGIN },
  // Se a conexão cair por um instante (wifi falhando, celular trocando de
  // rede) e voltar dentro desse prazo, o socket.io recupera o mesmo
  // socket.id sozinho — combinado com o "atraso de saída" mais abaixo, a
  // pessoa nem percebe que caiu.
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
  },
});

// Todas as salas abertas, em memória. Cada sala tem seu próprio estado
// (cabine, música, chat, histórico) e seu próprio timer de segurança. Uma sala
// some sozinha quando a última pessoa sai.
const rooms = new Map(); // roomId -> { id, name, state, safetyTimeout }
const socketRooms = new Map(); // socketId -> roomId (em qual sala cada um está)

// Quem já escolheu um nome mas ainda não entrou em nenhuma sala fica nesse
// canal do socket.io, recebendo a lista de salas atualizada.
const LOBBY_CHANNEL = "lobby";

// Rede de segurança: se o cliente do DJ não avisar que a música acabou
// (aba em segundo plano, travou, etc.), o servidor avança a fila sozinho
// depois da duração real do vídeo (+ uma folga). Cada sala guarda o timer e
// a faixa a que ele se refere, pra cancelar se a música mudar antes por
// outro motivo.
const SAFETY_GRACE_MS = 15 * 1000;
const SAFETY_FALLBACK_MS = 15 * 60 * 1000; // se não der pra saber a duração

function clearSafetyTimeout(room) {
  if (room.safetyTimeout) {
    clearTimeout(room.safetyTimeout);
    room.safetyTimeout = null;
  }
}

async function scheduleSafetyTimeout(room, track) {
  const duration = await fetchVideoDuration(track.videoId, YOUTUBE_API_KEY);
  // Enquanto buscava a duração a faixa pode ter mudado (pulada, sala
  // fechada, etc.) — se não for mais a mesma, essa agenda já não faz sentido.
  if (rooms.get(room.id) !== room || room.state.currentTrack !== track) return;
  if (duration) {
    // Também aproveita pra mandar a duração pro cliente, usada na barra de
    // progresso — chega um instante depois do início, sem problema.
    track.duration = duration;
    broadcastState(room);
  }
  const timeoutMs = duration ? duration * 1000 + SAFETY_GRACE_MS : SAFETY_FALLBACK_MS;
  room.safetyTimeout = setTimeout(() => {
    if (room.state.currentTrack === track) {
      moveToNextDj(room);
    }
  }, timeoutMs);
}

// Dá uma folga de alguns segundos antes de realmente tirar alguém que
// desconectou — se for só uma queda rápida de rede, ela reconecta e nem
// percebe que caiu (a fila/música dela continuam intactas nesse meio tempo).
const pendingDisconnects = new Map(); // socketId -> timeout
const DISCONNECT_GRACE_MS = 20 * 1000;

function listRooms() {
  return Array.from(rooms.values()).map((room) => ({
    id: room.id,
    name: room.name,
    userCount: room.state.users.size,
    currentTrackTitle: room.state.currentTrack?.title ?? null,
  }));
}

function broadcastLobby() {
  io.to(LOBBY_CHANNEL).emit("lobby:sync", listRooms());
}

// Toda mudança numa sala também pode mudar o que aparece na lista de salas
// (quantas pessoas, o que está tocando), então já atualiza as duas coisas.
function broadcastState(room) {
  io.to(room.id).emit("state:sync", { ...serializeState(room.state), roomName: room.name });
  broadcastLobby();
}

function getRoomOf(socketId) {
  const roomId = socketRooms.get(socketId);
  return roomId ? rooms.get(roomId) : undefined;
}

function startTrackForCurrentDj(room, videoId, title) {
  const { state } = room;
  const djId = getCurrentDjId(state);
  if (!djId) return;
  const dj = state.users.get(djId);
  const track = {
    videoId,
    title: title || videoId,
    startedAt: Date.now(),
    djId,
    djName: dj?.name ?? "???",
  };
  state.currentTrack = track;
  pushChatMessage(state, {
    id: nanoid(),
    system: true,
    kind: "track",
    text: `${track.djName} está tocando: ${track.title}`,
    at: Date.now(),
  });
  pushPlayHistory(state, {
    id: nanoid(),
    videoId: track.videoId,
    title: track.title,
    djName: track.djName,
    startedAt: track.startedAt,
  });
  clearSafetyTimeout(room);
  scheduleSafetyTimeout(room, track);
}

// Se ninguém está tocando, puxa a próxima música da fila pessoal do DJ atual
// e começa a tocar. Retorna true se conseguiu iniciar algo.
function tryPlayNextIfIdle(room) {
  const { state } = room;
  if (state.currentTrack) return false;
  const djId = getCurrentDjId(state);
  if (!djId) return false;
  const track = popNextFromQueue(state, djId);
  if (!track) return false;
  startTrackForCurrentDj(room, track.videoId, track.title);
  broadcastState(room);
  return true;
}

// Avança a cabine pro próximo DJ. Se ele já tiver músicas na fila pessoal,
// toca automaticamente; senão, avisa que é a vez dele escolher uma.
function moveToNextDj(room) {
  clearSafetyTimeout(room);
  advanceQueue(room.state);
  if (tryPlayNextIfIdle(room)) return;
  broadcastState(room);
  const nextDjId = getCurrentDjId(room.state);
  if (nextDjId) {
    io.to(nextDjId).emit("dj:yourTurn");
  }
}

// Coloca a pessoa numa sala (saindo da anterior, se estava em alguma).
function enterRoom(socket, room) {
  leaveCurrentRoom(socket.id);
  socket.leave(LOBBY_CHANNEL);
  socket.join(room.id);
  socketRooms.set(socket.id, room.id);
  addUser(room.state, socket.id, socket.data.name, socket.data.icon);
  pushChatMessage(room.state, {
    id: nanoid(),
    system: true,
    kind: "join",
    text: `${socket.data.name} entrou na sala.`,
    at: Date.now(),
  });
  broadcastState(room);
}

// Tira a pessoa da sala em que ela está (se estiver em alguma). Se a sala
// ficar vazia, ela é apagada.
function leaveCurrentRoom(socketId) {
  const room = getRoomOf(socketId);
  if (!room) return;
  socketRooms.delete(socketId);
  io.sockets.sockets.get(socketId)?.leave(room.id);
  const user = room.state.users.get(socketId);
  const { wasCurrentDj } = removeUser(room.state, socketId);

  if (room.state.users.size === 0) {
    clearSafetyTimeout(room);
    rooms.delete(room.id);
    broadcastLobby();
    return;
  }

  pushChatMessage(room.state, {
    id: nanoid(),
    system: true,
    kind: "leave",
    text: `${user?.name ?? "Alguém"} saiu da sala.`,
    at: Date.now(),
  });
  if (wasCurrentDj) {
    moveToNextDj(room);
  } else {
    broadcastState(room);
  }
}

io.on("connection", (socket) => {
  // Reconectou a tempo (dentro da folga) depois de uma queda rápida: cancela
  // a remoção que estava agendada e não precisa passar pelo user:join de novo
  // — pro socket.io, é literalmente a mesma conexão de antes (mesmo id, mesmas
  // salas e mesmo socket.data).
  if (socket.recovered) {
    const pending = pendingDisconnects.get(socket.id);
    if (pending) {
      clearTimeout(pending);
      pendingDisconnects.delete(socket.id);
    }
    const room = getRoomOf(socket.id);
    if (room) {
      broadcastState(room);
    } else {
      socket.emit("lobby:sync", listRooms());
    }
  }

  // Escolheu o nome na tela inicial: guarda nome/ícone na conexão e manda pra
  // lista de salas.
  socket.on("user:join", ({ name: rawName, icon } = {}, ack) => {
    const name = String(rawName || "").trim().slice(0, MAX_NAME_LENGTH) || `user-${nanoid(4)}`;
    socket.data.name = name;
    socket.data.icon = isValidIcon(icon) ? icon : null;
    socket.join(LOBBY_CHANNEL);
    ack?.({ id: socket.id, name, rooms: listRooms() });
  });

  socket.on("room:create", ({ name: rawName } = {}, ack) => {
    if (!socket.data.name) {
      ack?.({ error: "Escolha um nome antes de criar uma sala." });
      return;
    }
    const name = String(rawName || "").trim().slice(0, MAX_ROOM_NAME_LENGTH);
    if (!name) {
      ack?.({ error: "Dê um nome pra sala." });
      return;
    }
    const nameTaken = Array.from(rooms.values()).some(
      (room) => room.name.toLowerCase() === name.toLowerCase()
    );
    if (nameTaken) {
      ack?.({ error: "Já existe uma sala com esse nome." });
      return;
    }
    const room = { id: nanoid(8), name, state: createRoomState(), safetyTimeout: null };
    rooms.set(room.id, room);
    enterRoom(socket, room);
    ack?.({ roomId: room.id });
  });

  socket.on("room:join", ({ roomId } = {}, ack) => {
    if (!socket.data.name) {
      ack?.({ error: "Escolha um nome antes de entrar numa sala." });
      return;
    }
    const room = rooms.get(roomId);
    if (!room) {
      ack?.({ error: "Essa sala não existe mais." });
      return;
    }
    if (getRoomOf(socket.id) !== room) {
      enterRoom(socket, room);
    }
    ack?.({ roomId: room.id });
  });

  // Volta pra lista de salas.
  socket.on("room:leave", (ack) => {
    leaveCurrentRoom(socket.id);
    socket.join(LOBBY_CHANNEL);
    ack?.({ rooms: listRooms() });
  });

  socket.on("user:setIcon", (icon) => {
    if (!isValidIcon(icon)) return;
    socket.data.icon = icon;
    const room = getRoomOf(socket.id);
    if (room && setUserIcon(room.state, socket.id, icon)) {
      broadcastState(room);
    }
  });

  socket.on("booth:join", () => {
    const room = getRoomOf(socket.id);
    if (!room) return;
    const { state } = room;
    const user = state.users.get(socket.id);
    if (!user) return;
    const joined = joinBooth(state, socket.id);
    if (!joined) return;
    pushChatMessage(state, {
      id: nanoid(),
      system: true,
      kind: "dj",
      text: `${user.name} entrou na fila de DJs.`,
      at: Date.now(),
    });
    // Se ninguém estava tocando, esse pode virar o DJ da vez imediatamente.
    if (getCurrentDjId(state) === null) {
      moveToNextDj(room);
    } else {
      broadcastState(room);
    }
  });

  socket.on("booth:leave", () => {
    const room = getRoomOf(socket.id);
    if (!room) return;
    const { wasCurrentDj } = leaveBooth(room.state, socket.id);
    if (wasCurrentDj) {
      moveToNextDj(room);
    } else {
      broadcastState(room);
    }
  });

  // Adiciona uma música à fila pessoal de quem está na cabine. Aceita ou um
  // resultado de busca já resolvido ({ videoId, title }) ou um link colado
  // manualmente ({ url }), como alternativa. Pode ser chamado quantas vezes
  // quiser, a qualquer momento (não só na sua vez).
  socket.on("queue:add", async ({ videoId, url, title } = {}, ack) => {
    const room = getRoomOf(socket.id);
    if (!room || !room.state.booth.includes(socket.id)) {
      ack?.({ error: "Entre na fila de DJs antes de adicionar músicas." });
      return;
    }
    const resolvedId = videoId || extractYoutubeId(url);
    if (!resolvedId) {
      ack?.({ error: "Link do YouTube inválido." });
      return;
    }
    // Se o título já veio da busca, usamos direto; senão (link colado),
    // buscamos via oEmbed.
    const resolvedTitle = title || (await fetchYoutubeTitle(resolvedId));
    // A busca do título é assíncrona: nesse meio tempo a pessoa pode ter
    // saído da sala ou da cabine.
    if (getRoomOf(socket.id) !== room || !room.state.booth.includes(socket.id)) {
      ack?.({ error: "Entre na fila de DJs antes de adicionar músicas." });
      return;
    }
    const added = addToQueue(room.state, socket.id, { videoId: resolvedId, title: resolvedTitle });
    if (!added) {
      ack?.({ error: "Sua fila já está cheia." });
      return;
    }
    broadcastState(room);
    tryPlayNextIfIdle(room); // caso seja a vez dele e ninguém esteja tocando
    ack?.({ ok: true });
  });

  socket.on("queue:remove", (index) => {
    const room = getRoomOf(socket.id);
    if (room && removeFromQueue(room.state, socket.id, index)) {
      broadcastState(room);
    }
  });

  socket.on("queue:reorder", ({ fromIndex, toIndex } = {}) => {
    const room = getRoomOf(socket.id);
    if (room && reorderQueue(room.state, socket.id, fromIndex, toIndex)) {
      broadcastState(room);
    }
  });

  // Disparado pelo cliente do DJ atual quando o vídeo termina naturalmente.
  socket.on("track:ended", () => {
    const room = getRoomOf(socket.id);
    if (!room || getCurrentDjId(room.state) !== socket.id) return;
    moveToNextDj(room);
  });

  // Qualquer pessoa na cabine (ou o próprio DJ) pode pular a música atual.
  socket.on("track:skip", () => {
    const room = getRoomOf(socket.id);
    if (!room) return;
    const currentDjId = getCurrentDjId(room.state);
    if (!currentDjId) return;
    const isDj = socket.id === currentDjId;
    const isInBooth = room.state.booth.includes(socket.id);
    if (!isDj && !isInBooth) return;
    moveToNextDj(room);
  });

  socket.on("chat:message", (text) => {
    const room = getRoomOf(socket.id);
    const user = room?.state.users.get(socket.id);
    if (!user) return;
    const clean = String(text || "").trim().slice(0, MAX_CHAT_LENGTH);
    if (!clean) return;
    pushChatMessage(room.state, {
      id: nanoid(),
      author: user.name,
      authorId: user.id,
      text: clean,
      at: Date.now(),
    });
    broadcastState(room);
  });

  // Reação rápida (emoji flutuante) — não faz parte do estado da sala, é só
  // um "ao vivo": repassa pra todo mundo da sala na hora, sem guardar histórico.
  socket.on("reaction:send", (emoji) => {
    const room = getRoomOf(socket.id);
    if (!room) return;
    if (!ALLOWED_REACTIONS.includes(emoji)) return;
    io.to(room.id).emit("reaction:fly", { id: nanoid(), emoji, x: Math.random() });
  });

  socket.on("disconnect", () => {
    if (!getRoomOf(socket.id)) return;
    // Não tira a pessoa na hora — dá uma folga curta pro caso de ser só uma
    // queda de rede passageira e ela reconectar sozinha (ver connectionStateRecovery
    // acima). Só remove de verdade se o tempo passar sem reconexão.
    const timeoutHandle = setTimeout(() => {
      pendingDisconnects.delete(socket.id);
      leaveCurrentRoom(socket.id);
    }, DISCONNECT_GRACE_MS);
    pendingDisconnects.set(socket.id, timeoutHandle);
  });
});

server.listen(PORT, () => {
  console.log(`Som na Caixa server rodando em http://localhost:${PORT}`);
});

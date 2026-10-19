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
  toggleVote,
  shouldSkip,
  syncHistoryVotes,
  serializeState,
  serializeUsers,
} from "./roomState.js";
import { extractYoutubeId } from "./youtube.js";
import { searchYoutube, fetchVideoDuration } from "./youtubeSearch.js";
import { takeToken, createIpLimiter } from "./rateLimit.js";

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
// Teto de salas abertas ao mesmo tempo, contra alguém criando salas sem parar.
const MAX_ROOMS = 100;
const TOO_FAST = "Calma, você está fazendo isso rápido demais. Espere alguns segundos.";
const ALLOWED_REACTIONS = ["🔥", "💃", "👍", "😂", "❤️"];
const AVAILABLE_ICONS = [
  "😀", "😎", "🤖", "🐱", "🐶", "🦊", "🐼", "🦄",
  "👾", "🎮", "🔥", "⚡", "🌟", "🍕", "⚽", "🎸",
];
function isValidIcon(icon) {
  return AVAILABLE_ICONS.includes(icon);
}

const app = express();
// No Render o app fica atrás de proxies: sem isso, todo mundo pareceria ter
// o mesmo IP e o limite de busca valeria pro site inteiro. O Render põe o IP
// real como primeiro da lista X-Forwarded-For, que é o que `true` usa. Esse
// primeiro valor pode ser forjado, mas aí o pior caso é alguém escapar do
// limite, e não o site inteiro ficar limitado.
app.set("trust proxy", true);
app.use(cors({ origin: CLIENT_ORIGIN }));
app.get("/health", (_req, res) => res.json({ ok: true }));

// A cota do YouTube é compartilhada pelo site inteiro, então cada IP tem um
// limite de buscas (buscas repetidas vêm do cache e não gastam cota). Quando
// a cota real do Google acabar, a busca falha com o motivo devolvido por eles
// (ver youtubeSearch.js), e ainda dá pra colar o link direto no mesmo campo.
const allowSearch = createIpLimiter("search");

app.get("/api/search", async (req, res) => {
  const query = String(req.query.q || "").trim().slice(0, 200);
  if (!query) {
    res.status(400).json({ error: "Parâmetro 'q' é obrigatório." });
    return;
  }
  if (!allowSearch(req.ip)) {
    res.status(429).json({ error: TOO_FAST });
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

// Quem está na página inicial (fora de qualquer sala) fica nesse canal do
// socket.io, recebendo a lista de salas atualizada.
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

// O estado da sala vai em pedaços, cada um só quando muda: assim uma
// mensagem de chat não reenvia a sala inteira (com ícones, filas e histórico)
// pra todo mundo.
// - state:sync    cabine, música atual e votos
// - users:sync    quem está na sala, com os ícones
// - chat:sync     chat inteiro (ao entrar); depois só chat:new, uma por vez
// - history:sync  músicas que já tocaram
// - queue:sync    a fila pessoal, só pro dono
// Mudanças no estado e nas pessoas também mudam a lista de salas (quantas
// pessoas, o que está tocando), então já atualizam a página inicial.
function broadcastState(room) {
  io.to(room.id).emit("state:sync", serializeState(room.state));
  broadcastLobby();
}

function broadcastUsers(room) {
  io.to(room.id).emit("users:sync", serializeUsers(room.state));
  broadcastLobby();
}

function broadcastHistory(room) {
  io.to(room.id).emit("history:sync", room.state.playHistory);
}

function sendQueue(room, socketId) {
  const user = room.state.users.get(socketId);
  if (user) io.to(socketId).emit("queue:sync", user.queue);
}

function postChat(room, message) {
  const full = { id: nanoid(), at: Date.now(), ...message };
  pushChatMessage(room.state, full);
  io.to(room.id).emit("chat:new", full);
}

function postSystem(room, kind, text) {
  postChat(room, { system: true, kind, text });
}

// Tudo de uma vez pra quem acabou de entrar (ou voltou de uma queda e pode
// ter perdido alguma atualização).
function sendSnapshot(socket, room) {
  socket.emit("room:entered", { roomId: room.id, roomName: room.name });
  socket.emit("users:sync", serializeUsers(room.state));
  socket.emit("chat:sync", room.state.chatHistory);
  socket.emit("history:sync", room.state.playHistory);
  socket.emit("state:sync", serializeState(room.state));
  sendQueue(room, socket.id);
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
  const historyId = nanoid();
  const track = {
    videoId,
    title: title || videoId,
    startedAt: Date.now(),
    djId,
    djName: dj?.name ?? "???",
    historyId,
    up: [],
    down: [],
    skip: [],
  };
  state.currentTrack = track;
  postSystem(room, "track", `${track.djName} está tocando: ${track.title}`);
  pushPlayHistory(state, {
    id: historyId,
    videoId: track.videoId,
    title: track.title,
    djName: track.djName,
    startedAt: track.startedAt,
    up: 0,
    down: 0,
  });
  broadcastHistory(room);
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
  sendQueue(room, djId);
  startTrackForCurrentDj(room, track.videoId, track.title);
  broadcastState(room);
  return true;
}

// Avança a cabine pro próximo DJ. Se ele já tiver músicas na fila pessoal,
// toca automaticamente; senão, avisa que é a vez dele escolher uma.
function moveToNextDj(room) {
  clearSafetyTimeout(room);
  // Fecha o placar de curti/não curti da música que está saindo.
  if (syncHistoryVotes(room.state)) broadcastHistory(room);
  advanceQueue(room.state);
  if (tryPlayNextIfIdle(room)) return;
  broadcastState(room);
  const nextDjId = getCurrentDjId(room.state);
  if (nextDjId) {
    io.to(nextDjId).emit("dj:yourTurn");
  }
}

// Depois de um voto pra pular (ou de alguém sair, o que diminui quantos votos
// são precisos), confere se já deu pra pular.
function skipIfVoted(room) {
  if (!shouldSkip(room.state)) return false;
  postSystem(room, "skip", `A sala votou e pulou: ${room.state.currentTrack.title}`);
  moveToNextDj(room);
  return true;
}

function cleanName(raw, max) {
  return String(raw || "").trim().replace(/\s+/g, " ").slice(0, max);
}

function nameTakenInRoom(room, name, exceptSocketId) {
  const lower = name.toLowerCase();
  for (const user of room.state.users.values()) {
    if (user.id !== exceptSocketId && user.name.toLowerCase() === lower) return true;
  }
  return false;
}

// Coloca a pessoa numa sala (saindo da anterior, se estava em alguma).
function enterRoom(socket, room) {
  leaveCurrentRoom(socket.id);
  socket.leave(LOBBY_CHANNEL);
  socketRooms.set(socket.id, room.id);
  addUser(room.state, socket.id, socket.data.name, socket.data.icon);
  // O aviso de entrada vai pra quem já estava na sala; quem entrou recebe
  // ele junto com o resto do chat no snapshot.
  postSystem(room, "join", `${socket.data.name} entrou na sala.`);
  broadcastUsers(room);
  socket.join(room.id);
  sendSnapshot(socket, room);
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

  postSystem(room, "leave", `${user?.name ?? "Alguém"} saiu da sala.`);
  broadcastUsers(room);
  if (wasCurrentDj) {
    moveToNextDj(room);
  } else if (!skipIfVoted(room)) {
    broadcastState(room);
  }
}

io.on("connection", (socket) => {
  socket.data.buckets = socket.data.buckets ?? {};
  const allow = (action) => takeToken(socket.data.buckets, action);

  // Conexão nova: já entra na lista de salas, que aparece na página inicial
  // antes mesmo de a pessoa escolher um nome.
  if (!socket.recovered) {
    socket.join(LOBBY_CHANNEL);
    socket.emit("lobby:sync", listRooms());
  }

  // Reconectou a tempo (dentro da folga) depois de uma queda rápida: cancela
  // a remoção que estava agendada — pro socket.io, é literalmente a mesma
  // conexão de antes (mesmo id, mesmas salas e mesmo socket.data).
  if (socket.recovered) {
    const pending = pendingDisconnects.get(socket.id);
    if (pending) {
      clearTimeout(pending);
      pendingDisconnects.delete(socket.id);
    }
    const room = getRoomOf(socket.id);
    if (room) {
      sendSnapshot(socket, room);
    } else {
      socket.emit("lobby:sync", listRooms());
    }
  }

  // Nome e ícone vão junto com o pedido de criar ou entrar numa sala, já que
  // a escolha do nome fica na mesma página da lista.
  function setIdentity(name, icon) {
    socket.data.name = name;
    socket.data.icon = isValidIcon(icon) ? icon : null;
  }

  socket.on("room:create", ({ roomName, name: rawName, icon } = {}, ack) => {
    const name = cleanName(roomName, MAX_ROOM_NAME_LENGTH);
    const userName = cleanName(rawName, MAX_NAME_LENGTH);
    if (!userName) {
      ack?.({ error: "Escolha um nome antes de criar uma sala." });
      return;
    }
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
    if (rooms.size >= MAX_ROOMS) {
      ack?.({ error: "O limite de salas abertas foi atingido. Entre em uma das salas da lista." });
      return;
    }
    if (!allow("roomCreate")) {
      ack?.({ error: TOO_FAST });
      return;
    }
    setIdentity(userName, icon);
    const room = { id: nanoid(8), name, state: createRoomState(), safetyTimeout: null };
    rooms.set(room.id, room);
    enterRoom(socket, room);
    ack?.({ roomId: room.id });
  });

  socket.on("room:join", ({ roomId, name: rawName, icon } = {}, ack) => {
    const userName = cleanName(rawName, MAX_NAME_LENGTH);
    if (!userName) {
      ack?.({ error: "Escolha um nome antes de entrar numa sala." });
      return;
    }
    const room = rooms.get(roomId);
    if (!room) {
      ack?.({ error: "Essa sala não existe mais. Ela fecha quando todo mundo sai." });
      return;
    }
    if (getRoomOf(socket.id) === room) {
      ack?.({ roomId: room.id });
      return;
    }
    if (nameTakenInRoom(room, userName, socket.id)) {
      ack?.({ error: "Já tem alguém com esse nome nessa sala. Escolha outro." });
      return;
    }
    if (!allow("roomJoin")) {
      ack?.({ error: TOO_FAST });
      return;
    }
    setIdentity(userName, icon);
    enterRoom(socket, room);
    ack?.({ roomId: room.id });
  });

  // Volta pra página inicial.
  socket.on("room:leave", (ack) => {
    leaveCurrentRoom(socket.id);
    socket.join(LOBBY_CHANNEL);
    ack?.({ rooms: listRooms() });
  });

  socket.on("user:setIcon", (icon) => {
    if (!isValidIcon(icon) || !allow("icon")) return;
    socket.data.icon = icon;
    const room = getRoomOf(socket.id);
    if (room && setUserIcon(room.state, socket.id, icon)) {
      broadcastUsers(room);
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
    postSystem(room, "dj", `${user.name} entrou na fila de DJs.`);
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
    const { removed, wasCurrentDj } = leaveBooth(room.state, socket.id);
    if (!removed) return;
    sendQueue(room, socket.id);
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
    if (!allow("queueAdd")) {
      ack?.({ error: TOO_FAST });
      return;
    }
    const resolvedId = (typeof videoId === "string" && extractYoutubeId(videoId)) || extractYoutubeId(url);
    if (!resolvedId) {
      ack?.({ error: "Link do YouTube inválido." });
      return;
    }
    // Se o título já veio da busca, usamos direto; senão (link colado),
    // buscamos via oEmbed.
    const cleanTitle = typeof title === "string" ? title.trim().slice(0, 200) : "";
    const resolvedTitle = cleanTitle || (await fetchYoutubeTitle(resolvedId));
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
    sendQueue(room, socket.id);
    // caso seja a vez dele e ninguém esteja tocando
    if (!tryPlayNextIfIdle(room)) broadcastState(room);
    ack?.({ ok: true });
  });

  socket.on("queue:remove", (index) => {
    const room = getRoomOf(socket.id);
    if (room && removeFromQueue(room.state, socket.id, index)) {
      sendQueue(room, socket.id);
      broadcastState(room);
    }
  });

  socket.on("queue:reorder", ({ fromIndex, toIndex } = {}) => {
    const room = getRoomOf(socket.id);
    if (room && reorderQueue(room.state, socket.id, fromIndex, toIndex)) {
      sendQueue(room, socket.id);
    }
  });

  // Disparado pelo cliente do DJ atual quando o vídeo termina naturalmente.
  socket.on("track:ended", () => {
    const room = getRoomOf(socket.id);
    if (!room || getCurrentDjId(room.state) !== socket.id) return;
    moveToNextDj(room);
  });

  // O DJ pode pular a própria música na hora. Os outros votam (ver
  // track:vote), e a música é pulada quando metade de quem ouve votar.
  socket.on("track:skip", () => {
    const room = getRoomOf(socket.id);
    if (!room || !room.state.currentTrack) return;
    if (room.state.currentTrack.djId !== socket.id) return;
    moveToNextDj(room);
  });

  // Curti / não curti / votar pra pular. Clicar de novo desfaz o voto.
  socket.on("track:vote", (kind) => {
    const room = getRoomOf(socket.id);
    if (!room || !allow("vote")) return;
    if (!toggleVote(room.state, socket.id, kind)) return;
    if (kind === "skip" && skipIfVoted(room)) return;
    broadcastState(room);
  });

  socket.on("chat:message", (text, ack) => {
    const room = getRoomOf(socket.id);
    const user = room?.state.users.get(socket.id);
    if (!user) return;
    const clean = String(text || "").trim().slice(0, MAX_CHAT_LENGTH);
    if (!clean) return;
    if (!allow("chat")) {
      ack?.({ error: TOO_FAST });
      return;
    }
    postChat(room, { author: user.name, authorId: user.id, text: clean });
    ack?.({ ok: true });
  });

  // Reação rápida (emoji flutuante) — não faz parte do estado da sala, é só
  // um "ao vivo": repassa pra todo mundo da sala na hora, sem guardar histórico.
  socket.on("reaction:send", (emoji) => {
    const room = getRoomOf(socket.id);
    if (!room) return;
    if (!ALLOWED_REACTIONS.includes(emoji) || !allow("reaction")) return;
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
  console.log(`Som na Caixa server rodando em http://localhost:${server.address().port}`);
});

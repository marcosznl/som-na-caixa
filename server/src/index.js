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
  joinBooth,
  leaveBooth,
  advanceQueue,
  addToQueue,
  removeFromQueue,
  popNextFromQueue,
  getCurrentDjId,
  pushChatMessage,
  serializeState,
} from "./roomState.js";
import { extractYoutubeId } from "./youtube.js";
import { searchYoutube } from "./youtubeSearch.js";

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
const ROOM_PASSWORD = process.env.ROOM_PASSWORD || "";
const MAX_NAME_LENGTH = 24;
const MAX_CHAT_LENGTH = 300;

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
});

const state = createRoomState();

function broadcastState() {
  io.emit("state:sync", serializeState(state));
}

function startTrackForCurrentDj(videoId, title) {
  const djId = getCurrentDjId(state);
  if (!djId) return;
  const dj = state.users.get(djId);
  state.currentTrack = {
    videoId,
    title: title || videoId,
    startedAt: Date.now(),
    djId,
    djName: dj?.name ?? "???",
  };
  pushChatMessage(state, {
    id: nanoid(),
    system: true,
    kind: "track",
    text: `${state.currentTrack.djName} está tocando: ${state.currentTrack.title}`,
    at: Date.now(),
  });
}

// Se ninguém está tocando, puxa a próxima música da fila pessoal do DJ atual
// e começa a tocar. Retorna true se conseguiu iniciar algo.
function tryPlayNextIfIdle() {
  if (state.currentTrack) return false;
  const djId = getCurrentDjId(state);
  if (!djId) return false;
  const track = popNextFromQueue(state, djId);
  if (!track) return false;
  startTrackForCurrentDj(track.videoId, track.title);
  broadcastState();
  return true;
}

// Avança a cabine pro próximo DJ. Se ele já tiver músicas na fila pessoal,
// toca automaticamente; senão, avisa que é a vez dele escolher uma.
function moveToNextDj() {
  advanceQueue(state);
  if (tryPlayNextIfIdle()) return;
  broadcastState();
  const nextDjId = getCurrentDjId(state);
  if (nextDjId) {
    io.to(nextDjId).emit("dj:yourTurn");
  }
}

io.on("connection", (socket) => {
  socket.on("user:join", ({ name: rawName, password } = {}, ack) => {
    if (ROOM_PASSWORD && password !== ROOM_PASSWORD) {
      ack?.({ error: "Senha da sala incorreta." });
      return;
    }
    const name = String(rawName || "").trim().slice(0, MAX_NAME_LENGTH) || `user-${nanoid(4)}`;
    addUser(state, socket.id, name);
    ack?.({ id: socket.id, name });
    broadcastState();
    pushChatMessage(state, {
      id: nanoid(),
      system: true,
      kind: "join",
      text: `${name} entrou na sala.`,
      at: Date.now(),
    });
    broadcastState();
  });

  socket.on("booth:join", () => {
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
      moveToNextDj();
    } else {
      broadcastState();
    }
  });

  socket.on("booth:leave", () => {
    const { wasCurrentDj } = leaveBooth(state, socket.id);
    if (wasCurrentDj) {
      moveToNextDj();
    } else {
      broadcastState();
    }
  });

  // Adiciona uma música à fila pessoal de quem está na cabine. Aceita ou um
  // resultado de busca já resolvido ({ videoId, title }) ou um link colado
  // manualmente ({ url }), como alternativa. Pode ser chamado quantas vezes
  // quiser, a qualquer momento (não só na sua vez).
  socket.on("queue:add", async ({ videoId, url, title } = {}, ack) => {
    if (!state.booth.includes(socket.id)) {
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
    const added = addToQueue(state, socket.id, { videoId: resolvedId, title: resolvedTitle });
    if (!added) {
      ack?.({ error: "Sua fila já está cheia." });
      return;
    }
    broadcastState();
    tryPlayNextIfIdle(); // caso seja a vez dele e ninguém esteja tocando
    ack?.({ ok: true });
  });

  socket.on("queue:remove", (index) => {
    if (removeFromQueue(state, socket.id, index)) {
      broadcastState();
    }
  });

  // Disparado pelo cliente do DJ atual quando o vídeo termina naturalmente.
  socket.on("track:ended", () => {
    if (getCurrentDjId(state) !== socket.id) return;
    moveToNextDj();
  });

  // Qualquer pessoa na cabine (ou o próprio DJ) pode pular a música atual.
  socket.on("track:skip", () => {
    const currentDjId = getCurrentDjId(state);
    if (!currentDjId) return;
    const isDj = socket.id === currentDjId;
    const isInBooth = state.booth.includes(socket.id);
    if (!isDj && !isInBooth) return;
    moveToNextDj();
  });

  socket.on("chat:message", (text) => {
    const user = state.users.get(socket.id);
    if (!user) return;
    const clean = String(text || "").trim().slice(0, MAX_CHAT_LENGTH);
    if (!clean) return;
    pushChatMessage(state, {
      id: nanoid(),
      author: user.name,
      authorId: user.id,
      text: clean,
      at: Date.now(),
    });
    broadcastState();
  });

  socket.on("disconnect", () => {
    const user = state.users.get(socket.id);
    const { wasCurrentDj } = removeUser(state, socket.id);
    if (user) {
      pushChatMessage(state, {
        id: nanoid(),
        system: true,
        kind: "leave",
        text: `${user.name} saiu da sala.`,
        at: Date.now(),
      });
    }
    if (wasCurrentDj) {
      moveToNextDj();
    } else {
      broadcastState();
    }
  });
});

server.listen(PORT, () => {
  console.log(`plug.dj-pessoal server rodando em http://localhost:${PORT}`);
});

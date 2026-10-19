// Sobe o servidor de verdade numa porta livre e conversa com ele como o
// navegador faria, pelo socket.io.
import { test, before, after } from "node:test";
// Cada teste tem no máximo 10 s, pra um travamento não segurar a suíte.
const TEST_TIMEOUT_MS = 10_000;
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { io } from "socket.io-client";

const SERVER_ENTRY = fileURLToPath(new URL("../src/index.js", import.meta.url));
let serverProcess;
let url;
const sockets = [];

before(async () => {
  // Sem chave do YouTube: nenhum teste depende de rede externa.
  serverProcess = spawn(process.execPath, [SERVER_ENTRY], {
    env: { ...process.env, PORT: "0", YOUTUBE_API_KEY: "" },
    stdio: ["ignore", "pipe", "inherit"],
  });
  url = await new Promise((resolve, reject) => {
    serverProcess.once("exit", (code) => reject(new Error(`servidor saiu (${code})`)));
    serverProcess.stdout.on("data", (chunk) => {
      const match = String(chunk).match(/http:\/\/localhost:(\d+)/);
      if (match) resolve(`http://localhost:${match[1]}`);
    });
  });
});

after(() => {
  for (const socket of sockets) socket.close();
  serverProcess?.kill();
});

// Cliente que guarda o último valor de cada evento e todas as mensagens de chat.
async function connect() {
  const socket = io(url, { transports: ["websocket"], forceNew: true });
  sockets.push(socket);
  const client = { socket, last: {}, chat: [], counts: {} };
  socket.onAny((event, payload) => {
    client.last[event] = payload;
    client.counts[event] = (client.counts[event] ?? 0) + 1;
    if (event === "chat:new") client.chat.push(payload);
    if (event === "chat:sync") client.chat = [...payload];
  });
  await new Promise((resolve) => socket.once("lobby:sync", resolve));
  return client;
}

function call(client, event, payload) {
  return new Promise((resolve) =>
    payload === undefined
      ? client.socket.emit(event, resolve)
      : client.socket.emit(event, payload, resolve)
  );
}

async function waitFor(check, label, timeoutMs = 3000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error(`tempo esgotado esperando: ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

let roomCounter = 0;
const uniqueRoomName = () => `Sala de teste ${++roomCounter}`;

test("a lista de salas chega ao abrir a página, sem nome", { timeout: TEST_TIMEOUT_MS }, async () => {
  const visitor = await connect();
  assert.ok(Array.isArray(visitor.last["lobby:sync"]));
});

test("criar e entrar em sala, com nomes validados", { timeout: TEST_TIMEOUT_MS }, async () => {
  const ana = await connect();
  const bia = await connect();
  const roomName = uniqueRoomName();

  assert.match((await call(ana, "room:create", { roomName, name: "" })).error, /nome/);
  assert.match((await call(ana, "room:create", { roomName: "  ", name: "Ana" })).error, /nome pra sala/);

  const { roomId } = await call(ana, "room:create", { roomName, name: "Ana" });
  assert.ok(roomId);
  assert.equal(ana.last["room:entered"].roomName, roomName);
  await waitFor(() => bia.last["lobby:sync"].some((room) => room.id === roomId), "sala na lista");

  const duplicateRoom = await call(bia, "room:create", { roomName: roomName.toUpperCase(), name: "Bia" });
  assert.match(duplicateRoom.error, /Já existe uma sala/);

  const sameName = await call(bia, "room:join", { roomId, name: "ana" });
  assert.match(sameName.error, /Já tem alguém com esse nome/);

  assert.deepEqual(await call(bia, "room:join", { roomId, name: "Bia" }), { roomId });
  await waitFor(() => ana.last["users:sync"]?.length === 2, "duas pessoas na sala");
  assert.ok(bia.chat.some((message) => message.text === "Bia entrou na sala."));

  const gone = await call(bia, "room:join", { roomId: "nao-existe", name: "Bia" });
  assert.match(gone.error, /não existe mais/);

  await call(ana, "room:leave");
  await waitFor(() => bia.last["users:sync"]?.length === 1, "Ana sair");
  // Quem sai recebe a lista de salas na própria resposta do room:leave.
  const { rooms } = await call(bia, "room:leave");
  assert.equal(rooms.some((room) => room.id === roomId), false);
});

test("mensagem de chat chega sozinha, sem reenviar o estado da sala", { timeout: TEST_TIMEOUT_MS }, async () => {
  const ana = await connect();
  const bia = await connect();
  const { roomId } = await call(ana, "room:create", { roomName: uniqueRoomName(), name: "Ana" });
  await call(bia, "room:join", { roomId, name: "Bia" });
  await waitFor(() => ana.last["users:sync"]?.length === 2, "duas pessoas");

  const stateCountBefore = bia.counts["state:sync"];
  const usersCountBefore = bia.counts["users:sync"];
  assert.deepEqual(await call(ana, "chat:message", "oi"), { ok: true });
  await waitFor(() => bia.chat.some((message) => message.text === "oi"), "mensagem chegar");
  assert.equal(bia.counts["state:sync"], stateCountBefore);
  assert.equal(bia.counts["users:sync"], usersCountBefore);
});

test("chat tem limite de mensagens seguidas", { timeout: TEST_TIMEOUT_MS }, async () => {
  const ana = await connect();
  await call(ana, "room:create", { roomName: uniqueRoomName(), name: "Ana" });
  const results = [];
  for (let i = 0; i < 6; i++) results.push(await call(ana, "chat:message", `msg ${i}`));
  assert.equal(results.filter((result) => result.ok).length, 5);
  assert.match(results[5].error, /rápido demais/);
});

test("criar salas tem limite", { timeout: TEST_TIMEOUT_MS }, async () => {
  const ana = await connect();
  const results = [];
  for (let i = 0; i < 4; i++) {
    results.push(await call(ana, "room:create", { roomName: uniqueRoomName(), name: "Ana" }));
  }
  assert.equal(results.filter((result) => result.roomId).length, 3);
  assert.match(results[3].error, /rápido demais/);
});

test("fila pessoal vai só pro dono; votos pulam a música", { timeout: TEST_TIMEOUT_MS }, async () => {
  const dj = await connect();
  const ouvinte1 = await connect();
  const ouvinte2 = await connect();
  const { roomId } = await call(dj, "room:create", { roomName: uniqueRoomName(), name: "DJ" });
  await call(ouvinte1, "room:join", { roomId, name: "Ouvinte 1" });
  await call(ouvinte2, "room:join", { roomId, name: "Ouvinte 2" });

  dj.socket.emit("booth:join");
  await waitFor(() => dj.last["state:sync"]?.currentDjId === dj.socket.id, "virar DJ");
  const added = await call(dj, "queue:add", { videoId: "dQw4w9WgXcQ", title: "Música 1" });
  assert.deepEqual(added, { ok: true });
  await call(dj, "queue:add", { videoId: "9bZkp7q19f0", title: "Música 2" });

  await waitFor(() => ouvinte1.last["state:sync"]?.currentTrack?.title === "Música 1", "tocar");
  // Cada um só recebe a própria fila (a do ouvinte está vazia).
  assert.deepEqual(ouvinte1.last["queue:sync"], []);
  assert.deepEqual(dj.last["queue:sync"].map((track) => track.title), ["Música 2"]);
  assert.equal(ouvinte1.last["state:sync"].booth[0].queueLength, 1);

  // Ouvinte não pula direto: o pedido de pular é só do DJ.
  ouvinte1.socket.emit("track:skip");
  ouvinte1.socket.emit("track:vote", "up");
  await waitFor(() => ouvinte2.last["state:sync"].currentTrack.up.length === 1, "curtida");
  assert.equal(ouvinte2.last["state:sync"].currentTrack.title, "Música 1");
  assert.equal(ouvinte2.last["state:sync"].currentTrack.skipNeeded, 1);

  ouvinte2.socket.emit("track:vote", "skip");
  await waitFor(() => ouvinte1.last["state:sync"].currentTrack?.title === "Música 2", "pular por voto");
  assert.ok(ouvinte1.chat.some((message) => message.kind === "skip"));
  const finished = ouvinte1.last["history:sync"].find((entry) => entry.title === "Música 1");
  assert.equal(finished.up, 1);

  // O DJ pula a própria música na hora.
  dj.socket.emit("track:skip");
  await waitFor(() => ouvinte1.last["state:sync"].currentTrack === null, "DJ pular");
});

test("busca tem limite por IP", { timeout: TEST_TIMEOUT_MS }, async () => {
  const statuses = [];
  for (let i = 0; i < 11; i++) {
    const res = await fetch(`${url}/api/search?q=teste`);
    statuses.push(res.status);
  }
  // Sem chave configurada a busca falha (502), mas o limite vem antes.
  assert.equal(statuses.filter((status) => status === 502).length, 10);
  assert.equal(statuses[10], 429);
});

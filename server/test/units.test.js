import { test } from "node:test";
import assert from "node:assert/strict";
import { takeToken, LIMITS } from "../src/rateLimit.js";
import { extractYoutubeId } from "../src/youtube.js";
import { parseIsoDuration } from "../src/youtubeSearch.js";
import {
  createRoomState,
  addUser,
  removeUser,
  joinBooth,
  advanceQueue,
  addToQueue,
  reorderQueue,
  toggleVote,
  skipVotesNeeded,
  shouldSkip,
  serializeState,
} from "../src/roomState.js";

test("limite: permite a rajada e depois recusa até recarregar", () => {
  const buckets = {};
  const { capacity, refillMs } = LIMITS.chat;
  const start = 1_000_000;
  for (let i = 0; i < capacity; i++) {
    assert.equal(takeToken(buckets, "chat", start), true);
  }
  assert.equal(takeToken(buckets, "chat", start), false);
  assert.equal(takeToken(buckets, "chat", start + refillMs - 1), false);
  assert.equal(takeToken(buckets, "chat", start + refillMs), true);
  assert.equal(takeToken(buckets, "chat", start + refillMs), false);
});

test("limite: nunca passa da capacidade, mesmo parado por muito tempo", () => {
  const buckets = {};
  const { capacity } = LIMITS.reaction;
  takeToken(buckets, "reaction", 0);
  let allowed = 0;
  while (takeToken(buckets, "reaction", 10_000_000)) allowed++;
  assert.equal(allowed, capacity);
});

test("extractYoutubeId entende os formatos de link", () => {
  assert.equal(extractYoutubeId("dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(extractYoutubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1"), "dQw4w9WgXcQ");
  assert.equal(extractYoutubeId("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(extractYoutubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(extractYoutubeId("https://example.com/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(extractYoutubeId("não é link"), null);
});

test("parseIsoDuration converte a duração do YouTube em segundos", () => {
  assert.equal(parseIsoDuration("PT3M33S"), 213);
  assert.equal(parseIsoDuration("PT1H2M3S"), 3723);
  assert.equal(parseIsoDuration("PT45S"), 45);
  assert.equal(parseIsoDuration(undefined), null);
});

function roomWithTrack(userIds) {
  const state = createRoomState();
  for (const id of userIds) addUser(state, id, `nome-${id}`, null);
  joinBooth(state, userIds[0]);
  advanceQueue(state);
  state.currentTrack = { videoId: "x", title: "t", djId: userIds[0], up: [], down: [], skip: [] };
  return state;
}

test("votos: metade de quem ouve (sem contar o DJ) pula a música", () => {
  const state = roomWithTrack(["dj", "a", "b", "c", "d"]);
  assert.equal(skipVotesNeeded(state), 2);
  toggleVote(state, "a", "skip");
  assert.equal(shouldSkip(state), false);
  toggleVote(state, "b", "skip");
  assert.equal(shouldSkip(state), true);
});

test("votos: sair da sala tira o voto e pode baixar o mínimo", () => {
  const state = roomWithTrack(["dj", "a", "b", "c"]);
  assert.equal(skipVotesNeeded(state), 2);
  toggleVote(state, "a", "skip");
  toggleVote(state, "b", "skip");
  removeUser(state, "b");
  assert.deepEqual(state.currentTrack.skip, ["a"]);
  assert.equal(skipVotesNeeded(state), 1);
  assert.equal(shouldSkip(state), true);
});

test("votos: curti e não curti se excluem, clicar de novo desfaz, DJ não vota", () => {
  const state = roomWithTrack(["dj", "a"]);
  toggleVote(state, "a", "up");
  assert.deepEqual(state.currentTrack.up, ["a"]);
  toggleVote(state, "a", "down");
  assert.deepEqual(state.currentTrack.up, []);
  assert.deepEqual(state.currentTrack.down, ["a"]);
  toggleVote(state, "a", "down");
  assert.deepEqual(state.currentTrack.down, []);
  assert.equal(toggleVote(state, "dj", "up"), false);
  assert.equal(toggleVote(state, "a", "outra-coisa"), false);
});

test("estado público não expõe ícones nem o conteúdo das filas", () => {
  const state = createRoomState();
  addUser(state, "a", "Ana", "🦊");
  joinBooth(state, "a");
  addToQueue(state, "a", { videoId: "dQw4w9WgXcQ", title: "música" });
  const publicState = serializeState(state);
  assert.deepEqual(publicState.booth, [{ id: "a", name: "Ana", queueLength: 1 }]);
  assert.equal(JSON.stringify(publicState).includes("🦊"), false);
  assert.equal(JSON.stringify(publicState).includes("música"), false);
});

test("reordenar a fila recusa índices inválidos", () => {
  const state = createRoomState();
  addUser(state, "a", "Ana", null);
  addToQueue(state, "a", { videoId: "1", title: "um" });
  addToQueue(state, "a", { videoId: "2", title: "dois" });
  assert.equal(reorderQueue(state, "a", 0, 5), false);
  assert.equal(reorderQueue(state, "a", 0, 1), true);
  assert.deepEqual(
    state.users.get("a").queue.map((track) => track.title),
    ["dois", "um"]
  );
});

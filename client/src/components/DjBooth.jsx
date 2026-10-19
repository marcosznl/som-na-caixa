import { socket } from "../socket";
import SongPicker from "./SongPicker";
import MyQueueList from "./MyQueueList";
import Equalizer from "./Equalizer";
import { nameToColor } from "../nameColor";

export default function DjBooth({ booth, currentDjId, currentTrack, myId, myQueue }) {
  const isInBooth = booth.some((user) => user.id === myId);
  const isCurrentDj = currentDjId === myId;
  const needsFirstSong = isCurrentDj && !currentTrack && myQueue.length === 0;

  function toggleBooth() {
    socket.emit(isInBooth ? "booth:leave" : "booth:join");
  }

  return (
    <div className="dj-booth">
      <div className="dj-booth__header">
        <h2>Fila de DJs</h2>
        <button className={isInBooth ? "btn btn--danger" : "btn btn--primary"} onClick={toggleBooth}>
          {isInBooth ? "Sair da fila" : "Entrar na fila"}
        </button>
      </div>

      {isInBooth && (
        <div className={`dj-booth__submit${needsFirstSong ? " dj-booth__submit--alert" : ""}`}>
          <p>
            {needsFirstSong
              ? "🎤 É a sua vez! Adicione uma música pra começar a tocar:"
              : "Adicione quantas músicas quiser à sua fila:"}
          </p>
          <SongPicker />

          {myQueue.length > 0 && <MyQueueList queue={myQueue} />}
        </div>
      )}

      {currentTrack && (
        <div className="dj-booth__now-playing">
          <Equalizer />
          <span>Tocando agora:</span> <strong>{currentTrack.title}</strong>
          <span className="dj-booth__now-playing-dj">
            {" "}
            — DJ <span style={{ color: nameToColor(currentTrack.djName) }}>{currentTrack.djName}</span>
          </span>
          {currentTrack.djId === myId && (
            <button className="btn btn--ghost" onClick={() => socket.emit("track:skip")}>
              Pular minha música
            </button>
          )}
        </div>
      )}

      <ol className="dj-booth__list">
        {booth.length === 0 && <li className="dj-booth__empty">Ninguém na fila ainda.</li>}
        {booth.map((user, index) => (
          <li key={user.id} className={user.id === currentDjId ? "is-playing" : ""}>
            {user.id === currentDjId ? <Equalizer /> : `${index + 1}. `}
            <span style={{ color: nameToColor(user.name) }}>{user.name}</span>
            {user.id === myId ? " (você)" : ""}
            {user.queueLength > 0 ? ` — ${user.queueLength} na fila` : ""}
          </li>
        ))}
      </ol>
    </div>
  );
}

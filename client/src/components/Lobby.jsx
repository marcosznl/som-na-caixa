import { useState } from "react";
import ThemeToggle from "./ThemeToggle";

// Lista de salas abertas: dá pra criar uma nova ou entrar numa que já existe.
// As salas vivem só em memória no servidor e somem quando a última pessoa sai.
export default function Lobby({ rooms, onCreate, onJoin }) {
  const [newRoomName, setNewRoomName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(action) {
    setBusy(true);
    setError("");
    const failure = await action();
    setBusy(false);
    if (failure) setError(failure);
  }

  function handleCreate(event) {
    event.preventDefault();
    const trimmed = newRoomName.trim();
    if (!trimmed) return;
    run(() => onCreate(trimmed));
  }

  return (
    <div className="join-screen">
      <ThemeToggle />
      <div className="join-screen__card lobby">
        <h1>Som na Caixa 🎧</h1>
        <p>Crie uma sala ou entre em uma que já está aberta.</p>

        <form className="lobby__create" onSubmit={handleCreate}>
          <input
            autoFocus
            maxLength={40}
            placeholder="Nome da nova sala"
            value={newRoomName}
            onChange={(event) => setNewRoomName(event.target.value)}
          />
          <button type="submit" className="btn btn--primary" disabled={busy || !newRoomName.trim()}>
            Criar
          </button>
        </form>
        {error && <p className="join-screen__error">{error}</p>}

        <h2 className="lobby__heading">Salas abertas</h2>
        <ul className="lobby__list">
          {rooms.length === 0 && (
            <li className="lobby__empty">Nenhuma sala aberta ainda. Crie a primeira.</li>
          )}
          {rooms.map((room) => (
            <li key={room.id} className="lobby__room">
              <div className="lobby__room-info">
                <strong className="lobby__room-name">{room.name}</strong>
                <span className="lobby__room-meta">
                  {room.userCount} {room.userCount === 1 ? "pessoa" : "pessoas"}
                  {room.currentTrackTitle ? ` · 🎵 ${room.currentTrackTitle}` : ""}
                </span>
              </div>
              <button className="btn" disabled={busy} onClick={() => run(() => onJoin(room.id))}>
                Entrar
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

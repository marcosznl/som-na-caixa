import { useState } from "react";
import ThemeToggle from "./ThemeToggle";

// Página inicial: escolhe o nome e, na mesma tela, cria uma sala nova ou
// entra numa que já existe. As salas vivem só em memória no servidor e somem
// quando a última pessoa sai.
export default function Lobby({
  name,
  onNameChange,
  rooms,
  roomsLoaded,
  inviteRoomId,
  onDismissInvite,
  notice,
  onCreate,
  onJoin,
}) {
  const [newRoomName, setNewRoomName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const hasName = Boolean(name.trim());
  const invitedRoom = inviteRoomId ? rooms.find((room) => room.id === inviteRoomId) : null;

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
    if (!trimmed || !hasName) return;
    run(() => onCreate(trimmed));
  }

  return (
    <div className="join-screen">
      <ThemeToggle />
      <div className="join-screen__card lobby">
        <h1>Som na Caixa 🎧</h1>
        <p>Escolha um nome, crie uma sala ou entre em uma que já está aberta.</p>

        <input
          autoFocus
          maxLength={24}
          placeholder="Seu nome"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
        />

        {inviteRoomId && roomsLoaded && (
          <div className="lobby__invite">
            {invitedRoom ? (
              <>
                <p>
                  Você foi convidado pra sala <strong>{invitedRoom.name}</strong>.
                </p>
                <button
                  className="btn btn--primary"
                  disabled={busy || !hasName}
                  onClick={() => run(() => onJoin(invitedRoom.id))}
                >
                  {hasName ? "Entrar na sala" : "Escolha um nome pra entrar"}
                </button>
              </>
            ) : (
              <>
                <p>A sala do convite não existe mais. Ela fecha quando todo mundo sai.</p>
                <button className="btn" onClick={onDismissInvite}>
                  Ver as outras salas
                </button>
              </>
            )}
          </div>
        )}

        <form className="lobby__create" onSubmit={handleCreate}>
          <input
            maxLength={40}
            placeholder="Nome da nova sala"
            value={newRoomName}
            onChange={(event) => setNewRoomName(event.target.value)}
          />
          <button
            type="submit"
            className="btn btn--primary"
            disabled={busy || !hasName || !newRoomName.trim()}
          >
            Criar sala
          </button>
        </form>
        {(error || notice) && <p className="join-screen__error">{error || notice}</p>}

        <h2 className="lobby__heading">Salas abertas</h2>
        <ul className="lobby__list">
          {!roomsLoaded && <li className="lobby__empty">Carregando salas…</li>}
          {roomsLoaded && rooms.length === 0 && (
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
              <button
                className="btn"
                disabled={busy || !hasName}
                title={hasName ? undefined : "Escolha um nome primeiro"}
                onClick={() => run(() => onJoin(room.id))}
              >
                Entrar
              </button>
            </li>
          ))}
        </ul>
        {!hasName && rooms.length > 0 && (
          <p className="lobby__hint">Escolha um nome para entrar numa sala.</p>
        )}
      </div>
    </div>
  );
}

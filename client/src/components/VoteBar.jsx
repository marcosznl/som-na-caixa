import { socket } from "../socket";

// Curti / não curti e voto pra pular a música atual. Clicar de novo desfaz o
// voto. O DJ não vota na própria música (ele tem o botão de pular direto).
export default function VoteBar({ currentTrack, myId }) {
  const { up, down, skip, skipNeeded, djId } = currentTrack;
  const isDj = djId === myId;

  function vote(kind) {
    socket.emit("track:vote", kind);
  }

  return (
    <div className="vote-bar">
      <button
        className={`vote-bar__btn${up.includes(myId) ? " is-active" : ""}`}
        onClick={() => vote("up")}
        disabled={isDj}
        title={isDj ? "Você é o DJ dessa música" : "Curti"}
      >
        👍 <span>{up.length}</span>
      </button>
      <button
        className={`vote-bar__btn${down.includes(myId) ? " is-active" : ""}`}
        onClick={() => vote("down")}
        disabled={isDj}
        title={isDj ? "Você é o DJ dessa música" : "Não curti"}
      >
        👎 <span>{down.length}</span>
      </button>
      {!isDj && (
        <button
          className={`vote-bar__btn${skip.includes(myId) ? " is-active" : ""}`}
          onClick={() => vote("skip")}
          title="A música é pulada quando metade de quem está ouvindo votar"
        >
          ⏭ Pular <span>{skip.length}/{skipNeeded}</span>
        </button>
      )}
    </div>
  );
}

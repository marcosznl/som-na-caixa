import { useState } from "react";
import { socket } from "../socket";

// Fila pessoal com reordenação por arrastar-e-soltar (HTML5 drag and drop
// nativo, sem dependência extra — a lista costuma ter poucos itens).
export default function MyQueueList({ queue }) {
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);

  function handleDrop(toIndex) {
    if (dragIndex !== null && dragIndex !== toIndex) {
      socket.emit("queue:reorder", { fromIndex: dragIndex, toIndex });
    }
    setDragIndex(null);
    setOverIndex(null);
  }

  return (
    <div className="dj-booth__my-queue">
      <p className="dj-booth__my-queue-heading">Sua fila ({queue.length})</p>
      <ol>
        {queue.map((track, index) => (
          <li
            key={`${track.videoId}-${index}`}
            draggable
            className={index === overIndex ? "is-drag-over" : ""}
            onDragStart={() => setDragIndex(index)}
            onDragOver={(event) => {
              event.preventDefault();
              setOverIndex(index);
            }}
            onDragLeave={() => setOverIndex((current) => (current === index ? null : current))}
            onDrop={(event) => {
              event.preventDefault();
              handleDrop(index);
            }}
            onDragEnd={() => {
              setDragIndex(null);
              setOverIndex(null);
            }}
          >
            <span className="dj-booth__my-queue-handle" title="Arraste para reordenar">
              ⠿
            </span>
            <span className="dj-booth__my-queue-title">{track.title}</span>
            <button className="btn btn--ghost btn--small" onClick={() => socket.emit("queue:remove", index)}>
              Remover
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

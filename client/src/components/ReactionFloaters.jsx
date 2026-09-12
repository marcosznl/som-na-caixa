import { useEffect, useState } from "react";
import { socket } from "../socket";

const FLOAT_DURATION_MS = 2000;

// Fica em cima do player (posicionado pelo CSS do pai) e mostra os emojis
// que qualquer um na sala mandou, subindo e sumindo sozinhos.
export default function ReactionFloaters() {
  const [floaters, setFloaters] = useState([]);

  useEffect(() => {
    function handleFly({ id, emoji, x }) {
      setFloaters((current) => [...current, { id, emoji, x }]);
      setTimeout(() => {
        setFloaters((current) => current.filter((floater) => floater.id !== id));
      }, FLOAT_DURATION_MS);
    }
    socket.on("reaction:fly", handleFly);
    return () => socket.off("reaction:fly", handleFly);
  }, []);

  return (
    <div className="reaction-floaters">
      {floaters.map((floater) => (
        <span
          key={floater.id}
          className="reaction-floaters__item"
          style={{ left: `${10 + floater.x * 80}%` }}
        >
          {floater.emoji}
        </span>
      ))}
    </div>
  );
}

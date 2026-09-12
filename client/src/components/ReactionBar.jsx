import { socket } from "../socket";

const EMOJIS = ["🔥", "💃", "👍", "😂", "❤️"];

export default function ReactionBar() {
  return (
    <div className="reaction-bar">
      {EMOJIS.map((emoji) => (
        <button
          key={emoji}
          className="reaction-bar__btn"
          onClick={() => socket.emit("reaction:send", emoji)}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

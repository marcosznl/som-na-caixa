import { useEffect, useRef, useState } from "react";
import { socket } from "../socket";
import { nameToColor, initialOf } from "../nameColor";

const SYSTEM_META = {
  join: { icon: "🚪", color: "#37b24d" },
  leave: { icon: "👋", color: "#868e96" },
  dj: { icon: "🎧", color: "#7048e8" },
  track: { icon: "🎵", color: "#f08c00" },
};
const DEFAULT_SYSTEM_META = { icon: "ℹ️", color: "#868e96" };

export default function Chat({ messages, height }) {
  const [text, setText] = useState("");
  const listRef = useRef(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  function handleSubmit(event) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    socket.emit("chat:message", trimmed);
    setText("");
  }

  // Fica sempre do mesmo tamanho do player de vídeo (medido em Room.jsx),
  // com rolagem interna pro que não couber — em vez de esticar até o
  // tamanho da coluna inteira (que incluiria a fila de DJs).
  const style = height
    ? { height: `${height}px`, maxHeight: "none", flexGrow: 0, flexShrink: 0 }
    : undefined;

  return (
    <div className="chat" style={style}>
      <h2>Chat</h2>
      <div className="chat__messages" ref={listRef}>
        {messages.map((message) => {
          if (message.system) {
            const meta = SYSTEM_META[message.kind] || DEFAULT_SYSTEM_META;
            return (
              <div
                key={message.id}
                className="chat__message chat__message--system"
                style={{ "--msg-color": meta.color }}
              >
                <span className="chat__system-icon">{meta.icon}</span>
                <span className="chat__system-text">{message.text}</span>
              </div>
            );
          }

          const color = nameToColor(message.author);
          return (
            <div key={message.id} className="chat__message">
              <span className="chat__avatar" style={{ background: color }}>
                {initialOf(message.author)}
              </span>
              <span className="chat__bubble" style={{ "--msg-color": color }}>
                <strong className="chat__author" style={{ color }}>
                  {message.author}
                </strong>
                <span className="chat__text">{message.text}</span>
              </span>
            </div>
          );
        })}
      </div>
      <form className="chat__form" onSubmit={handleSubmit}>
        <input
          maxLength={300}
          placeholder="Escreva uma mensagem…"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit" className="btn btn--primary" disabled={!text.trim()}>
          Enviar
        </button>
      </form>
    </div>
  );
}

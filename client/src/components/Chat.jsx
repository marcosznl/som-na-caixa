import { useEffect, useRef, useState } from "react";
import { socket } from "../socket";

export default function Chat({ messages }) {
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

  return (
    <div className="chat">
      <h2>Chat</h2>
      <div className="chat__messages" ref={listRef}>
        {messages.map((message) =>
          message.system ? (
            <div key={message.id} className="chat__message chat__message--system">
              {message.text}
            </div>
          ) : (
            <div key={message.id} className="chat__message">
              <strong>{message.author}:</strong> {message.text}
            </div>
          )
        )}
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

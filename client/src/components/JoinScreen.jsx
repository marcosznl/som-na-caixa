import { useState } from "react";
import ThemeToggle from "./ThemeToggle";

export default function JoinScreen({ onJoin, error }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(event) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onJoin(trimmed, password);
  }

  return (
    <div className="join-screen">
      <ThemeToggle />
      <form className="join-screen__card" onSubmit={handleSubmit}>
        <h1>Plug.DJ 🎧</h1>
        <p>Escolha um nome para entrar na sala.</p>
        <input
          autoFocus
          maxLength={24}
          placeholder="Seu nome"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <input
          type="password"
          placeholder="Senha da sala (se houver)"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {error && <p className="join-screen__error">{error}</p>}
        <button type="submit" disabled={!name.trim()}>
          Entrar na sala
        </button>
      </form>
    </div>
  );
}

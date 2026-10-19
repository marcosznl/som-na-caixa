import { useState } from "react";
import ThemeToggle from "./ThemeToggle";

export default function JoinScreen({ onJoin, error }) {
  const [name, setName] = useState("");

  function handleSubmit(event) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onJoin(trimmed);
  }

  return (
    <div className="join-screen">
      <ThemeToggle />
      <form className="join-screen__card" onSubmit={handleSubmit}>
        <h1>Som na Caixa 🎧</h1>
        <p>Escolha um nome para continuar.</p>
        <input
          autoFocus
          maxLength={24}
          placeholder="Seu nome"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        {error && <p className="join-screen__error">{error}</p>}
        <button type="submit" className="btn btn--primary join-screen__submit" disabled={!name.trim()}>
          Continuar
        </button>
      </form>
    </div>
  );
}

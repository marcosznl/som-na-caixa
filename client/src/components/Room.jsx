import { useEffect, useRef, useState } from "react";
import Player from "./Player";
import DjBooth from "./DjBooth";
import Chat from "./Chat";
import History from "./History";
import ThemeToggle from "./ThemeToggle";
import ReactionBar from "./ReactionBar";
import ReactionFloaters from "./ReactionFloaters";
import ProgressBar from "./ProgressBar";
import IconPicker from "./IconPicker";

export default function Room({ roomState, myId }) {
  const { users, booth, currentDjId, currentTrack, chatHistory, playHistory } = roomState;
  const isCurrentDj = currentDjId === myId;
  const me = users.find((user) => user.id === myId);
  const myBoothEntry = booth.find((user) => user.id === myId);
  // É a vez dela tocar, mas ainda não tem nada tocando nem música na fila
  // própria — precisa escolher uma agora.
  const needsFirstSong = isCurrentDj && !currentTrack && (myBoothEntry?.queue?.length ?? 0) === 0;

  // Mede a altura real do player pra o chat ficar do mesmo tamanho (em vez
  // de esticar até o tamanho da coluna inteira, incluindo a fila de DJs).
  const playerWrapRef = useRef(null);
  const [playerHeight, setPlayerHeight] = useState(null);

  useEffect(() => {
    const el = playerWrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      setPlayerHeight(entry.contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Título da aba mostra a música tocando — ou, se é a sua vez e ninguém
  // escolheu nada ainda, pisca um aviso, já que é fácil não perceber o
  // painel se a aba estiver em segundo plano.
  useEffect(() => {
    if (needsFirstSong) {
      let show = true;
      document.title = "🎤 Sua vez de tocar!";
      const interval = setInterval(() => {
        show = !show;
        document.title = show ? "🎤 Sua vez de tocar!" : "Som na Caixa";
      }, 800);
      return () => clearInterval(interval);
    }
    document.title = currentTrack ? `🎵 ${currentTrack.title}` : "Som na Caixa";
  }, [needsFirstSong, currentTrack]);

  useEffect(() => {
    return () => {
      document.title = "Som na Caixa";
    };
  }, []);

  return (
    <div className="room">
      <header className="room__header">
        <h1>Som na Caixa 🎧</h1>
        <div className="room__header-right">
          <span className="room__user-count">{users.length} na sala</span>
          <IconPicker currentIcon={me?.icon} />
          <ThemeToggle />
        </div>
      </header>
      <div className="room__body">
        <main className="room__main">
          <div className="room__player-wrap" ref={playerWrapRef}>
            <Player currentTrack={currentTrack} isCurrentDj={isCurrentDj} />
            <ReactionFloaters />
          </div>
          <ProgressBar currentTrack={currentTrack} />
          <ReactionBar />
          <DjBooth booth={booth} currentDjId={currentDjId} currentTrack={currentTrack} myId={myId} />
        </main>
        <aside className="room__sidebar">
          <Chat messages={chatHistory} height={playerHeight} users={users} />
          <History history={playHistory} />
        </aside>
      </div>
    </div>
  );
}

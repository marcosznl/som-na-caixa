import { useEffect, useRef, useState } from "react";
import Player from "./Player";
import DjBooth from "./DjBooth";
import Chat from "./Chat";
import History from "./History";
import ThemeToggle from "./ThemeToggle";
import ReactionBar from "./ReactionBar";
import ReactionFloaters from "./ReactionFloaters";

export default function Room({ roomState, myId }) {
  const { users, booth, currentDjId, currentTrack, chatHistory, playHistory } = roomState;
  const isCurrentDj = currentDjId === myId;

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

  return (
    <div className="room">
      <header className="room__header">
        <h1>plug.dj pessoal 🎧</h1>
        <div className="room__header-right">
          <span className="room__user-count">{users.length} na sala</span>
          <ThemeToggle />
        </div>
      </header>
      <div className="room__body">
        <main className="room__main">
          <div className="room__player-wrap" ref={playerWrapRef}>
            <Player currentTrack={currentTrack} isCurrentDj={isCurrentDj} />
            <ReactionFloaters />
          </div>
          <ReactionBar />
          <DjBooth booth={booth} currentDjId={currentDjId} currentTrack={currentTrack} myId={myId} />
        </main>
        <aside className="room__sidebar">
          <Chat messages={chatHistory} height={playerHeight} />
          <History history={playHistory} />
        </aside>
      </div>
    </div>
  );
}

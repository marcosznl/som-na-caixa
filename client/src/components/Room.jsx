import Player from "./Player";
import DjBooth from "./DjBooth";
import Chat from "./Chat";
import UserList from "./UserList";
import ThemeToggle from "./ThemeToggle";

export default function Room({ roomState, myId }) {
  const { users, booth, currentDjId, currentTrack, chatHistory } = roomState;
  const isCurrentDj = currentDjId === myId;

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
          <Player currentTrack={currentTrack} isCurrentDj={isCurrentDj} />
          <DjBooth booth={booth} currentDjId={currentDjId} currentTrack={currentTrack} myId={myId} />
        </main>
        <aside className="room__sidebar">
          <Chat messages={chatHistory} />
          <UserList users={users} booth={booth} currentDjId={currentDjId} myId={myId} />
        </aside>
      </div>
    </div>
  );
}

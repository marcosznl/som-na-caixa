import { nameToColor } from "../nameColor";

export default function UserList({ users, booth, currentDjId, myId }) {
  const boothIds = new Set(booth.map((user) => user.id));

  return (
    <div className="user-list">
      <h2>Quem está na sala ({users.length})</h2>
      <ul>
        {users.map((user) => (
          <li key={user.id}>
            <span className="user-list__icon">
              {user.id === currentDjId ? "🎧" : boothIds.has(user.id) ? "🎤" : "👤"}
            </span>
            <span style={{ color: nameToColor(user.name) }}>{user.name}</span>
            {user.id === myId ? " (você)" : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

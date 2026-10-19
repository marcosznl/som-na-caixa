import { useEffect, useRef, useState } from "react";
import { socket } from "./socket";
import { getStoredIcon } from "./icons";
import { getStoredName, storeName } from "./storedName";
import Lobby from "./components/Lobby";
import Room from "./components/Room";
import "./App.css";

const EMPTY_ROOM_STATE = {
  roomId: null,
  roomName: "",
  users: [],
  booth: [],
  currentDjId: null,
  currentTrack: null,
  chatHistory: [],
  playHistory: [],
  myQueue: [],
};

// Quanto tempo esperar por uma reconexão automática antes de desistir e
// mandar a pessoa de volta pra página inicial. O servidor já dá sua própria
// folga antes de tirar alguém de verdade (ver DISCONNECT_GRACE_MS no
// servidor) — esse valor aqui só precisa ser generoso o bastante pra cobrir
// isso mais o tempo de reconexão do socket.io em si.
const RECONNECT_TIMEOUT_MS = 25 * 1000;

// O link de convite é a própria página com ?sala=<id>.
function readInviteFromUrl() {
  return new URLSearchParams(window.location.search).get("sala");
}

function setUrlRoom(roomId) {
  const url = roomId ? `?sala=${encodeURIComponent(roomId)}` : window.location.pathname;
  window.history.replaceState(null, "", url);
}

export default function App() {
  // O nome fica aqui (e não no Lobby) pra continuar preenchido quando a
  // pessoa sai de uma sala e volta pra lista. Também fica guardado no
  // navegador pra próxima visita.
  const [name, setName] = useState(getStoredName);
  const [inviteRoomId, setInviteRoomId] = useState(readInviteFromUrl);
  const [inRoom, setInRoom] = useState(false);
  const [notice, setNotice] = useState("");
  const [reconnecting, setReconnecting] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [roomsLoaded, setRoomsLoaded] = useState(false);
  const [roomState, setRoomState] = useState(EMPTY_ROOM_STATE);
  const reconnectTimeoutRef = useRef(null);
  const inRoomRef = useRef(false);

  useEffect(() => {
    const merge = (patch) => setRoomState((current) => ({ ...current, ...patch }));

    function leaveAfterConnectionLoss() {
      inRoomRef.current = false;
      setInRoom(false);
      setRoomState(EMPTY_ROOM_STATE);
      setNotice("Conexão perdida com o servidor. Entre na sala novamente.");
    }
    function handleEntered({ roomId, roomName }) {
      merge({ roomId, roomName });
    }
    function handleState(state) {
      merge(state);
    }
    function handleUsers(users) {
      merge({ users });
    }
    function handleChatSync(chatHistory) {
      merge({ chatHistory });
    }
    // Depois de uma queda rápida o socket.io reenvia o que ficou pendente, e
    // o servidor também manda o chat inteiro — ignora o que já está na lista.
    function handleChatNew(message) {
      setRoomState((current) =>
        current.chatHistory.some((item) => item.id === message.id)
          ? current
          : { ...current, chatHistory: [...current.chatHistory, message].slice(-100) }
      );
    }
    function handleHistory(playHistory) {
      merge({ playHistory });
    }
    function handleQueue(myQueue) {
      merge({ myQueue });
    }
    function handleLobbySync(nextRooms) {
      setRooms(nextRooms);
      setRoomsLoaded(true);
    }
    function handleDisconnect() {
      if (!inRoomRef.current) return;
      // Não tira da sala na hora — o socket.io já tenta reconectar sozinho,
      // e o servidor segura seu lugar por um tempo (queda rápida de rede não
      // deveria te tirar da sala).
      setReconnecting(true);
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(() => {
        setReconnecting(false);
        leaveAfterConnectionLoss();
      }, RECONNECT_TIMEOUT_MS);
    }
    function handleConnect() {
      clearTimeout(reconnectTimeoutRef.current);
      setReconnecting(false);
      // Reconectou, mas o servidor não reconheceu a conexão antiga (passou do
      // prazo de recuperação ou o servidor reiniciou): a sala se perdeu,
      // então volta pra página inicial.
      if (inRoomRef.current && !socket.recovered) {
        leaveAfterConnectionLoss();
      }
    }

    const handlers = {
      "room:entered": handleEntered,
      "state:sync": handleState,
      "users:sync": handleUsers,
      "chat:sync": handleChatSync,
      "chat:new": handleChatNew,
      "history:sync": handleHistory,
      "queue:sync": handleQueue,
      "lobby:sync": handleLobbySync,
      disconnect: handleDisconnect,
      connect: handleConnect,
    };
    for (const [event, handler] of Object.entries(handlers)) socket.on(event, handler);
    // Conecta logo de cara pra lista de salas aparecer na página inicial.
    socket.connect();
    return () => {
      for (const [event, handler] of Object.entries(handlers)) socket.off(event, handler);
      clearTimeout(reconnectTimeoutRef.current);
    };
  }, []);

  // Usado tanto pra criar uma sala nova quanto pra entrar numa que já existe.
  // Devolve a mensagem de erro (ou null) pro Lobby mostrar.
  function enterRoom(event, payload) {
    setNotice("");
    const trimmedName = name.trim();
    return new Promise((resolve) => {
      socket.emit(event, { ...payload, name: trimmedName, icon: getStoredIcon() }, (response) => {
        if (response?.error) {
          resolve(response.error);
          return;
        }
        storeName(trimmedName);
        setUrlRoom(response.roomId);
        setInviteRoomId(null);
        inRoomRef.current = true;
        setInRoom(true);
        resolve(null);
      });
    });
  }

  function handleLeaveRoom() {
    socket.emit("room:leave", (response) => {
      setRooms(response?.rooms ?? []);
    });
    setUrlRoom(null);
    inRoomRef.current = false;
    setRoomState(EMPTY_ROOM_STATE);
    setInRoom(false);
  }

  return (
    <>
      {reconnecting && (
        <div className="reconnect-banner">Conexão instável, reconectando…</div>
      )}
      {inRoom ? (
        <Room roomState={roomState} myId={socket.id} onLeave={handleLeaveRoom} />
      ) : (
        <Lobby
          name={name}
          onNameChange={setName}
          rooms={rooms}
          roomsLoaded={roomsLoaded}
          inviteRoomId={inviteRoomId}
          onDismissInvite={() => {
            setInviteRoomId(null);
            setUrlRoom(null);
          }}
          notice={notice}
          onCreate={(roomName) => enterRoom("room:create", { roomName })}
          onJoin={(roomId) => enterRoom("room:join", { roomId })}
        />
      )}
    </>
  );
}

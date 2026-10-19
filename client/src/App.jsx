import { useEffect, useRef, useState } from "react";
import { socket } from "./socket";
import { getStoredIcon } from "./icons";
import JoinScreen from "./components/JoinScreen";
import Lobby from "./components/Lobby";
import Room from "./components/Room";
import "./App.css";

const EMPTY_ROOM_STATE = {
  users: [],
  booth: [],
  currentDjId: null,
  currentTrack: null,
  chatHistory: [],
  playHistory: [],
  roomName: "",
};

// Quanto tempo esperar por uma reconexão automática antes de desistir e
// mandar a pessoa de volta pra tela de entrada. O servidor já dá sua própria
// folga antes de tirar alguém de verdade (ver DISCONNECT_GRACE_MS no
// servidor) — esse valor aqui só precisa ser generoso o bastante pra cobrir
// isso mais o tempo de reconexão do socket.io em si.
const RECONNECT_TIMEOUT_MS = 25 * 1000;

export default function App() {
  // "name" (tela inicial) -> "lobby" (lista de salas) -> "room" (dentro de uma sala)
  const [screen, setScreen] = useState("name");
  const [joinError, setJoinError] = useState("");
  const [reconnecting, setReconnecting] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [roomState, setRoomState] = useState(EMPTY_ROOM_STATE);
  const reconnectTimeoutRef = useRef(null);
  const joinedRef = useRef(false);

  useEffect(() => {
    function handleSync(nextState) {
      setRoomState(nextState);
    }
    function handleLobbySync(nextRooms) {
      setRooms(nextRooms);
    }
    function handleDisconnect() {
      if (!joinedRef.current) return;
      // Não kicka pra tela de login na hora — o socket.io já tenta
      // reconectar sozinho, e o servidor segura seu lugar por um tempo
      // (queda rápida de rede não deveria te tirar da sala).
      setReconnecting(true);
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(() => {
        joinedRef.current = false;
        setScreen("name");
        setRoomState(EMPTY_ROOM_STATE);
        setReconnecting(false);
        setJoinError("Conexão perdida com o servidor. Tente entrar novamente.");
      }, RECONNECT_TIMEOUT_MS);
    }
    function handleConnect() {
      clearTimeout(reconnectTimeoutRef.current);
      setReconnecting(false);
      // Reconectou, mas o servidor não reconheceu a conexão antiga (passou do
      // prazo de recuperação ou o servidor reiniciou): nome e sala se
      // perderam, então volta pra tela inicial.
      if (joinedRef.current && !socket.recovered) {
        joinedRef.current = false;
        setScreen("name");
        setRoomState(EMPTY_ROOM_STATE);
        setJoinError("Conexão perdida com o servidor. Tente entrar novamente.");
      }
    }

    socket.on("state:sync", handleSync);
    socket.on("lobby:sync", handleLobbySync);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect", handleConnect);
    return () => {
      socket.off("state:sync", handleSync);
      socket.off("lobby:sync", handleLobbySync);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect", handleConnect);
      clearTimeout(reconnectTimeoutRef.current);
    };
  }, []);

  function handleJoin(name) {
    setJoinError("");
    socket.connect();
    socket.emit("user:join", { name, icon: getStoredIcon() }, (response) => {
      joinedRef.current = true;
      setRooms(response?.rooms ?? []);
      setScreen("lobby");
    });
  }

  // Usado tanto pra criar uma sala nova quanto pra entrar numa que já existe.
  // Devolve a mensagem de erro (ou null) pro Lobby mostrar.
  function enterRoom(event, payload) {
    return new Promise((resolve) => {
      socket.emit(event, payload, (response) => {
        if (response?.error) {
          resolve(response.error);
          return;
        }
        setScreen("room");
        resolve(null);
      });
    });
  }

  function handleLeaveRoom() {
    socket.emit("room:leave", (response) => {
      setRooms(response?.rooms ?? []);
    });
    setRoomState(EMPTY_ROOM_STATE);
    setScreen("lobby");
  }

  if (screen === "name") {
    return <JoinScreen onJoin={handleJoin} error={joinError} />;
  }

  return (
    <>
      {reconnecting && (
        <div className="reconnect-banner">Conexão instável, reconectando…</div>
      )}
      {screen === "lobby" ? (
        <Lobby
          rooms={rooms}
          onCreate={(name) => enterRoom("room:create", { name })}
          onJoin={(roomId) => enterRoom("room:join", { roomId })}
        />
      ) : (
        <Room roomState={roomState} myId={socket.id} onLeave={handleLeaveRoom} />
      )}
    </>
  );
}

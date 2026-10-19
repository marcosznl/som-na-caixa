import { useEffect, useRef, useState } from "react";
import { socket } from "./socket";
import { getStoredIcon } from "./icons";
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
// mandar a pessoa de volta pra página inicial. O servidor já dá sua própria
// folga antes de tirar alguém de verdade (ver DISCONNECT_GRACE_MS no
// servidor) — esse valor aqui só precisa ser generoso o bastante pra cobrir
// isso mais o tempo de reconexão do socket.io em si.
const RECONNECT_TIMEOUT_MS = 25 * 1000;

export default function App() {
  // O nome fica aqui (e não no Lobby) pra continuar preenchido quando a
  // pessoa sai de uma sala e volta pra lista.
  const [name, setName] = useState("");
  const [inRoom, setInRoom] = useState(false);
  const [notice, setNotice] = useState("");
  const [reconnecting, setReconnecting] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [roomState, setRoomState] = useState(EMPTY_ROOM_STATE);
  const reconnectTimeoutRef = useRef(null);
  const inRoomRef = useRef(false);

  useEffect(() => {
    function leaveAfterConnectionLoss() {
      inRoomRef.current = false;
      setInRoom(false);
      setRoomState(EMPTY_ROOM_STATE);
      setNotice("Conexão perdida com o servidor. Entre na sala novamente.");
    }
    function handleSync(nextState) {
      setRoomState(nextState);
    }
    function handleLobbySync(nextRooms) {
      setRooms(nextRooms);
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

    socket.on("state:sync", handleSync);
    socket.on("lobby:sync", handleLobbySync);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect", handleConnect);
    // Conecta logo de cara pra lista de salas aparecer na página inicial.
    socket.connect();
    return () => {
      socket.off("state:sync", handleSync);
      socket.off("lobby:sync", handleLobbySync);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect", handleConnect);
      clearTimeout(reconnectTimeoutRef.current);
    };
  }, []);

  // Usado tanto pra criar uma sala nova quanto pra entrar numa que já existe.
  // Devolve a mensagem de erro (ou null) pro Lobby mostrar.
  function enterRoom(event, payload) {
    setNotice("");
    return new Promise((resolve) => {
      socket.emit(event, { ...payload, name, icon: getStoredIcon() }, (response) => {
        if (response?.error) {
          resolve(response.error);
          return;
        }
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
          notice={notice}
          onCreate={(roomName) => enterRoom("room:create", { roomName })}
          onJoin={(roomId) => enterRoom("room:join", { roomId })}
        />
      )}
    </>
  );
}

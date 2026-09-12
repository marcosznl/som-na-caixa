import { useEffect, useRef, useState } from "react";
import { socket } from "./socket";
import JoinScreen from "./components/JoinScreen";
import Room from "./components/Room";
import "./App.css";

const EMPTY_ROOM_STATE = {
  users: [],
  booth: [],
  currentDjId: null,
  currentTrack: null,
  chatHistory: [],
};

// Quanto tempo esperar por uma reconexão automática antes de desistir e
// mandar a pessoa de volta pra tela de entrada. O servidor já dá sua própria
// folga antes de tirar alguém de verdade (ver DISCONNECT_GRACE_MS no
// servidor) — esse valor aqui só precisa ser generoso o bastante pra cobrir
// isso mais o tempo de reconexão do socket.io em si.
const RECONNECT_TIMEOUT_MS = 25 * 1000;

export default function App() {
  const [joined, setJoined] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [reconnecting, setReconnecting] = useState(false);
  const [roomState, setRoomState] = useState(EMPTY_ROOM_STATE);
  const reconnectTimeoutRef = useRef(null);
  const joinedRef = useRef(false);

  useEffect(() => {
    function handleSync(nextState) {
      setRoomState(nextState);
    }
    function handleDisconnect() {
      if (!joinedRef.current) return;
      // Não kicka pra tela de login na hora — o socket.io já tenta
      // reconectar sozinho, e o servidor segura seu lugar por um tempo
      // (queda rápida de rede não deveria te tirar da sala).
      setReconnecting(true);
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(() => {
        setJoined(false);
        setReconnecting(false);
        setJoinError("Conexão perdida com o servidor. Tente entrar novamente.");
      }, RECONNECT_TIMEOUT_MS);
    }
    function handleConnect() {
      clearTimeout(reconnectTimeoutRef.current);
      setReconnecting(false);
    }

    socket.on("state:sync", handleSync);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect", handleConnect);
    return () => {
      socket.off("state:sync", handleSync);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect", handleConnect);
      clearTimeout(reconnectTimeoutRef.current);
    };
  }, []);

  function handleJoin(name, password) {
    setJoinError("");
    socket.connect();
    socket.emit("user:join", { name, password }, (response) => {
      if (response?.error) {
        // Não desconecta aqui: isso disparava o handler de "disconnect" e
        // sobrescrevia essa mensagem de erro com "Conexão perdida...".
        // Ficar conectado sem ter "entrado" é inofensivo — o servidor não
        // adiciona esse socket a lugar nenhum até um user:join bem-sucedido.
        setJoinError(response.error);
        return;
      }
      joinedRef.current = true;
      setJoined(true);
    });
  }

  if (!joined) {
    return <JoinScreen onJoin={handleJoin} error={joinError} />;
  }

  return (
    <>
      {reconnecting && (
        <div className="reconnect-banner">Conexão instável, reconectando…</div>
      )}
      <Room roomState={roomState} myId={socket.id} />
    </>
  );
}

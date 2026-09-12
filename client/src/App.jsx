import { useEffect, useState } from "react";
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

export default function App() {
  const [joined, setJoined] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [roomState, setRoomState] = useState(EMPTY_ROOM_STATE);

  useEffect(() => {
    function handleSync(nextState) {
      setRoomState(nextState);
    }
    function handleDisconnect() {
      setJoined(false);
      setJoinError("Conexão perdida com o servidor. Tente entrar novamente.");
    }

    socket.on("state:sync", handleSync);
    socket.on("disconnect", handleDisconnect);
    return () => {
      socket.off("state:sync", handleSync);
      socket.off("disconnect", handleDisconnect);
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
      setJoined(true);
    });
  }

  if (!joined) {
    return <JoinScreen onJoin={handleJoin} error={joinError} />;
  }

  return <Room roomState={roomState} myId={socket.id} />;
}

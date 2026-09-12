import { io } from "socket.io-client";

// Em desenvolvimento, o front (Vite, porta 5173) e o back (porta 3001) são
// dois servidores separados, então precisamos apontar explicitamente pra
// :3001. Em produção, o mesmo servidor serve o front e a API/websocket, então
// "" (mesma origem) é o certo — e é por isso que SERVER_URL fica vazio ali.
export const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ?? (import.meta.env.DEV ? "http://localhost:3001" : "");

// autoConnect: false porque só queremos conectar depois que o usuário
// escolher um nome na tela inicial. Passar "" faria o socket.io tentar se
// conectar a um host literal vazio, então usamos undefined pra cair no
// comportamento padrão (mesma origem da página).
export const socket = io(SERVER_URL || undefined, { autoConnect: false });

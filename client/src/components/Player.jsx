import { useEffect, useRef, useState } from "react";
import { useYoutubeApi } from "../useYoutubeApi";
import { socket } from "../socket";

// Reconcilia o tempo do player com o horário em que a faixa começou no
// servidor. Só chamamos seekTo se o desvio for perceptível, pra não ficar
// dando pulinhos no vídeo por causa de pequenas variações de rede.
const DRIFT_TOLERANCE_SECONDS = 1.5;

export default function Player({ currentTrack, isCurrentDj }) {
  const YT = useYoutubeApi();
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const loadedVideoIdRef = useRef(null);
  const [isReady, setIsReady] = useState(false);

  // Cria o player uma vez que a API estiver disponível.
  useEffect(() => {
    if (!YT || playerRef.current) return;
    playerRef.current = new YT.Player(containerRef.current, {
      height: "100%",
      width: "100%",
      playerVars: { autoplay: 1, controls: 1, rel: 0 },
      events: {
        onReady: () => setIsReady(true),
        onStateChange: (event) => {
          if (event.data === YT.PlayerState.ENDED && isCurrentDj) {
            socket.emit("track:ended");
          }
        },
      },
    });
  }, [YT, isCurrentDj]);

  // Sincroniza o vídeo/posição sempre que a faixa atual muda (ou assim que o
  // player fica pronto, caso a faixa já estivesse tocando quando entramos).
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !isReady) return;

    if (!currentTrack) {
      loadedVideoIdRef.current = null;
      if (player.stopVideo) player.stopVideo();
      return;
    }

    const elapsed = Math.max(0, (Date.now() - currentTrack.startedAt) / 1000);

    if (loadedVideoIdRef.current !== currentTrack.videoId) {
      loadedVideoIdRef.current = currentTrack.videoId;
      player.loadVideoById({ videoId: currentTrack.videoId, startSeconds: elapsed });
      return;
    }

    const drift = Math.abs(player.getCurrentTime() - elapsed);
    if (drift > DRIFT_TOLERANCE_SECONDS) {
      player.seekTo(elapsed, true);
    }
  }, [currentTrack, isReady]);

  // Corrige o "relógio" periodicamente (proteção contra desvio ao longo do tempo).
  useEffect(() => {
    if (!isReady || !currentTrack) return;
    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player || loadedVideoIdRef.current !== currentTrack.videoId) return;
      const elapsed = (Date.now() - currentTrack.startedAt) / 1000;
      const drift = Math.abs(player.getCurrentTime() - elapsed);
      if (drift > DRIFT_TOLERANCE_SECONDS) {
        player.seekTo(elapsed, true);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [currentTrack, isReady]);

  return (
    <div className="player">
      <div className="player__frame" ref={containerRef} />
      {!currentTrack && (
        <div className="player__placeholder">Aguardando o DJ escolher uma música…</div>
      )}
    </div>
  );
}

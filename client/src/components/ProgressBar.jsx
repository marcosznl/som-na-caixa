import { useEffect, useState } from "react";
import { nameToColor } from "../nameColor";

export default function ProgressBar({ currentTrack }) {
  // Só o relógio fica no estado; a porcentagem é calculada a cada render.
  const [now, setNow] = useState(() => Date.now());
  const duration = currentTrack?.duration;

  useEffect(() => {
    if (!duration) return;
    const interval = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(interval);
  }, [duration]);

  if (!duration) return null;

  const elapsed = (now - currentTrack.startedAt) / 1000;
  const percent = Math.min(100, Math.max(0, (elapsed / duration) * 100));

  return (
    <div className="progress-bar">
      <div
        className="progress-bar__fill"
        style={{ width: `${percent}%`, background: nameToColor(currentTrack.djName) }}
      />
    </div>
  );
}

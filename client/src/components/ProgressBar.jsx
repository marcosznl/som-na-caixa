import { useEffect, useState } from "react";
import { nameToColor } from "../nameColor";

export default function ProgressBar({ currentTrack }) {
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    if (!currentTrack?.duration) {
      setPercent(0);
      return;
    }
    function tick() {
      const elapsed = (Date.now() - currentTrack.startedAt) / 1000;
      setPercent(Math.min(100, (elapsed / currentTrack.duration) * 100));
    }
    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [currentTrack?.videoId, currentTrack?.duration, currentTrack?.startedAt]);

  if (!currentTrack?.duration) return null;

  return (
    <div className="progress-bar">
      <div
        className="progress-bar__fill"
        style={{ width: `${percent}%`, background: nameToColor(currentTrack.djName) }}
      />
    </div>
  );
}

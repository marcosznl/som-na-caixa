import { useEffect, useState } from "react";

let apiPromise = null;

// Carrega o script da YouTube IFrame API uma única vez, não importa quantos
// componentes chamem esse hook.
function loadYoutubeApi() {
  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve(window.YT);
      return;
    }
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT);
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });

  return apiPromise;
}

export function useYoutubeApi() {
  const [YT, setYT] = useState(window.YT?.Player ? window.YT : null);

  useEffect(() => {
    let cancelled = false;
    loadYoutubeApi().then((yt) => {
      if (!cancelled) setYT(yt);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return YT;
}

import { useState } from "react";
import { socket, SERVER_URL } from "../socket";

const URL_RE = /^https?:\/\//i;

export default function SongPicker() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [addedIds, setAddedIds] = useState(() => new Set());

  function submitTrack(payload, videoId) {
    setError("");
    socket.emit("queue:add", payload, (response) => {
      if (response?.error) {
        setError(response.error);
      } else if (videoId) {
        setAddedIds((prev) => new Set(prev).add(videoId));
      }
    });
  }

  async function handleSearch(event) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    // Se parece um link, manda direto pro servidor em vez de buscar.
    if (URL_RE.test(trimmed)) {
      submitTrack({ url: trimmed });
      setQuery("");
      return;
    }

    setLoading(true);
    setError("");
    setResults([]);
    try {
      const res = await fetch(`${SERVER_URL}/api/search?q=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha na busca.");
      setResults(data.results);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handlePick(result) {
    submitTrack({ videoId: result.videoId, title: result.title }, result.videoId);
  }

  return (
    <div className="song-picker">
      <form className="song-picker__form" onSubmit={handleSearch}>
        <input
          placeholder="Buscar música no YouTube ou colar um link…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="submit" className="btn btn--primary" disabled={!query.trim() || loading}>
          {loading ? "Buscando…" : "Buscar"}
        </button>
      </form>

      {error && <p className="song-picker__error">{error}</p>}

      {results.length > 0 && (
        <ul className="song-picker__results">
          {results.map((result) => {
            const added = addedIds.has(result.videoId);
            return (
              <li key={result.videoId}>
                <button
                  className="song-picker__result"
                  onClick={() => handlePick(result)}
                  disabled={added}
                >
                  <img src={result.thumbnail} alt="" width={60} height={45} />
                  <span className="song-picker__result-info">
                    <span className="song-picker__result-title">{result.title}</span>
                    <span className="song-picker__result-channel">{result.channelTitle}</span>
                  </span>
                  <span className="song-picker__result-action">
                    {added ? "✓ Adicionada" : "+ Adicionar"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

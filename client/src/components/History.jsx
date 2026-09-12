import { nameToColor } from "../nameColor";

export default function History({ history }) {
  return (
    <div className="history">
      <h2>Já tocou aqui</h2>
      {history.length === 0 && <p className="history__empty">Ainda não tocou nada.</p>}
      <ol className="history__list">
        {history.map((entry) => (
          <li key={entry.id} className="history__item">
            <img
              className="history__thumb"
              src={`https://i.ytimg.com/vi/${entry.videoId}/default.jpg`}
              alt=""
              width={48}
              height={36}
              loading="lazy"
            />
            <span className="history__info">
              <span className="history__title">{entry.title}</span>
              <span className="history__dj">
                DJ <span style={{ color: nameToColor(entry.djName) }}>{entry.djName}</span>
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

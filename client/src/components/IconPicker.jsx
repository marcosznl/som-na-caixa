import { useEffect, useRef, useState } from "react";
import { socket } from "../socket";
import { AVAILABLE_ICONS, storeIcon, isImageIcon, fileToIconDataUrl } from "../icons";

export default function IconPicker({ currentIcon }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const wrapRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event) {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function pick(icon) {
    socket.emit("user:setIcon", icon);
    storeIcon(icon);
    setError("");
    setOpen(false);
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = ""; // permite escolher o mesmo arquivo de novo depois
    if (!file) return;
    try {
      const dataUrl = await fileToIconDataUrl(file);
      pick(dataUrl);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="icon-picker" ref={wrapRef}>
      <button
        className="icon-picker__trigger"
        onClick={() => setOpen((value) => !value)}
        title="Escolher seu ícone"
        aria-label="Escolher seu ícone"
      >
        {currentIcon ? (
          isImageIcon(currentIcon) ? (
            <img className="icon-picker__trigger-img" src={currentIcon} alt="" />
          ) : (
            currentIcon
          )
        ) : (
          "🙂"
        )}
      </button>
      {open && (
        <div className="icon-picker__panel">
          <label className="icon-picker__upload">
            📷 Enviar uma imagem
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={handleFileChange}
            />
          </label>
          {error && <p className="icon-picker__error">{error}</p>}
          <div className="icon-picker__grid">
            {AVAILABLE_ICONS.map((icon) => (
              <button
                key={icon}
                className={`icon-picker__option${icon === currentIcon ? " is-selected" : ""}`}
                onClick={() => pick(icon)}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

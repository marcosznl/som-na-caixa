import { useEffect, useRef, useState } from "react";
import { socket } from "../socket";
import { AVAILABLE_ICONS, storeIcon } from "../icons";

export default function IconPicker({ currentIcon }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

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
    setOpen(false);
  }

  return (
    <div className="icon-picker" ref={wrapRef}>
      <button
        className="icon-picker__trigger"
        onClick={() => setOpen((value) => !value)}
        title="Escolher seu ícone"
        aria-label="Escolher seu ícone"
      >
        {currentIcon || "🙂"}
      </button>
      {open && (
        <div className="icon-picker__panel">
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

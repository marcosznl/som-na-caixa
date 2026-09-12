import { useEffect, useState } from "react";

const STORAGE_KEY = "plugdj-theme";

function getStoredTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === "dark" || saved === "light" ? saved : null;
}

function systemPrefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path
        fill="#000"
        d="M15.5 3.5a8.5 8.5 0 1 0 5 15.4 9 9 0 0 1 0-16.8 8.5 8.5 0 0 0-5 1.4z"
      />
      <path
        fill="#000"
        d="M19.3 1.8l.6 1.7 1.7.6-1.7.6-.6 1.7-.6-1.7-1.7-.6 1.7-.6z"
      />
      <path
        fill="#000"
        d="M20.6 7.4l.4 1.1 1.1.4-1.1.4-.4 1.1-.4-1.1-1.1-.4 1.1-.4z"
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <circle cx="12" cy="12" r="5" fill="#000" />
      <g stroke="#000" strokeWidth="2" strokeLinecap="round">
        <line x1="12" y1="1.5" x2="12" y2="4.5" />
        <line x1="12" y1="19.5" x2="12" y2="22.5" />
        <line x1="1.5" y1="12" x2="4.5" y2="12" />
        <line x1="19.5" y1="12" x2="22.5" y2="12" />
        <line x1="4.4" y1="4.4" x2="6.5" y2="6.5" />
        <line x1="17.5" y1="17.5" x2="19.6" y2="19.6" />
        <line x1="4.4" y1="19.6" x2="6.5" y2="17.5" />
        <line x1="17.5" y1="6.5" x2="19.6" y2="4.4" />
      </g>
    </svg>
  );
}

export default function ThemeToggle() {
  // null = segue o tema do sistema (ainda não escolheu manualmente)
  const [theme, setTheme] = useState(getStoredTheme);

  useEffect(() => {
    if (theme) {
      document.documentElement.setAttribute("data-theme", theme);
      localStorage.setItem(STORAGE_KEY, theme);
    } else {
      document.documentElement.removeAttribute("data-theme");
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [theme]);

  const isDark = theme === "dark" || (theme === null && systemPrefersDark());

  function toggle() {
    setTheme(isDark ? "light" : "dark");
  }

  return (
    <button
      className={`theme-toggle ${isDark ? "is-dark" : "is-light"}`}
      onClick={toggle}
      role="switch"
      aria-checked={isDark}
      title={isDark ? "Mudar pro tema claro" : "Mudar pro tema escuro"}
      aria-label="Alternar tema claro/escuro"
    >
      <span className="theme-toggle__thumb">{isDark ? <MoonIcon /> : <SunIcon />}</span>
    </button>
  );
}

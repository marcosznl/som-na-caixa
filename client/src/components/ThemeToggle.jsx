import { useEffect, useState } from "react";

const STORAGE_KEY = "plugdj-theme";

function getStoredTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === "dark" || saved === "light" ? saved : null;
}

function systemPrefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
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
      className="theme-toggle"
      onClick={toggle}
      title={isDark ? "Mudar pro tema claro" : "Mudar pro tema escuro"}
      aria-label="Alternar tema claro/escuro"
    >
      {isDark ? "☀️" : "🌙"}
    </button>
  );
}

import { useEffect, useState } from "react";

// Copia o link da sala (a página atual, que já está com ?sala=<id>).
export default function InviteButton() {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timeout);
  }, [copied]);

  async function handleClick() {
    const link = window.location.href;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // Sem acesso à área de transferência (navegador antigo, http sem
      // https, etc.): mostra o link pra copiar na mão.
      window.prompt("Copie o link da sala:", link);
    }
  }

  return (
    <button className="btn btn--small" onClick={handleClick}>
      {copied ? "Link copiado!" : "Copiar convite"}
    </button>
  );
}

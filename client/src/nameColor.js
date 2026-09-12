// Paleta com tons de saturação/luminosidade médias — legíveis tanto no tema
// claro quanto no escuro, sem precisar calcular contraste dinamicamente.
const PALETTE = [
  "#e64980",
  "#f76707",
  "#f08c00",
  "#37b24d",
  "#0ca678",
  "#1098ad",
  "#4263eb",
  "#7048e8",
  "#cc5de8",
  "#e03131",
  "#2f9e44",
  "#1971c2",
];

// Hash simples e determinístico: o mesmo nome sempre cai na mesma cor.
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function nameToColor(name) {
  if (!name) return PALETTE[0];
  return PALETTE[hashString(name) % PALETTE.length];
}

export function initialOf(name) {
  return (name?.trim()[0] || "?").toUpperCase();
}

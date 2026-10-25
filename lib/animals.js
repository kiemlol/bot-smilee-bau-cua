export const ANIMALS = [
  { key: "bau", label: "Bầu", emoji: "🎃" },
  { key: "cua", label: "Cua", emoji: "🦀" },
  { key: "tom", label: "Tôm", emoji: "🦐" },
  { key: "ca", label: "Cá", emoji: "🐟" },
  { key: "ga", label: "Gà", emoji: "🐓" },
  { key: "nai", label: "Nai", emoji: "🦌" },
];
export const AMOUNTS = [10, 50, 100, 200];
export const STARTING_BALANCE = Number(process.env.STARTING_BALANCE || 1000);

export function byKey(key) { return ANIMALS.find((a) => a.key === key); }
export function roll() {
  return [0, 1, 2].map(() => ANIMALS[Math.floor(Math.random() * ANIMALS.length)].key);
}
export function stripAccents(s) {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
export function parseAnimal(text) {
  const t = stripAccents(text);
  if (/^[1-6]$/.test(t)) return ANIMALS[Number(t) - 1].key;
  for (const a of ANIMALS) if (t === stripAccents(a.label) || t.includes(stripAccents(a.label))) return a.key;
  return null;
}
export function animalListText() {
  return ANIMALS.map((a, i) => `${i + 1}. ${a.emoji} ${a.label}`).join("\n");
}

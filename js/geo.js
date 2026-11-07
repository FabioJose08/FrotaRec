// Funções geográficas e de formatação usadas por vários módulos.
// Não dependem do navegador, então também podem ser testadas fora dele.

export const RAIO_TERRA_KM = 6371;

// Dois pontos a menos que isto (em metros) são tratados como o mesmo lugar.
// 3 m evita o clique duplo acidental, mas aceita endereços vizinhos.
export const DISTANCIA_MINIMA_M = 3;

export function coordenadaValida(local) {
  return Boolean(local) &&
    typeof local.lat === "number" && typeof local.lng === "number" &&
    Number.isFinite(local.lat) && Number.isFinite(local.lng) &&
    Math.abs(local.lat) <= 90 && Math.abs(local.lng) <= 180;
}

// Distância em linha reta (fórmula de Haversine), em km.
export function distanciaRetaKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  const seguro = Math.min(1, Math.max(0, h));
  return RAIO_TERRA_KM * 2 * Math.atan2(Math.sqrt(seguro), Math.sqrt(1 - seguro));
}

export function distanciaRetaM(a, b) {
  return distanciaRetaKm(a, b) * 1000;
}

export function mesmoLugar(a, b) {
  return distanciaRetaM(a, b) < DISTANCIA_MINIMA_M;
}

// Converte texto digitado (aceita vírgula decimal) em número; NaN se inválido.
export function lerNumero(texto) {
  if (typeof texto === "number") return texto;
  if (typeof texto !== "string") return NaN;
  const limpo = texto.trim().replace(",", ".");
  if (limpo === "" || !/^[-+]?\d+(\.\d+)?$/.test(limpo)) return NaN;
  return Number(limpo);
}

export function formatarKm(km) {
  return km.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " km";
}

// 95 → "1 h 35 min"; 40 → "40 min"
export function formatarDuracao(minutos) {
  const total = Math.max(0, Math.round(minutos));
  const horas = Math.floor(total / 60);
  const resto = total % 60;
  if (horas === 0) return resto + " min";
  return horas + " h " + String(resto).padStart(2, "0") + " min";
}

// Horário simulado, em minutos desde a meia-noite, no formato 08:05.
export function formatarHorario(minutos) {
  const total = Math.round(minutos);
  const horas = Math.floor(total / 60) % 24;
  const resto = total % 60;
  return String(horas).padStart(2, "0") + ":" + String(resto).padStart(2, "0");
}

// OSRM FALSO para testes: responde Table e Route com geometria artificial (linhas retas com pontos intermediários).
// Tempo = distância em linha reta × 1,4 / 30 km/h, com assimetria leve para simular mãos únicas.
const rad = Math.PI / 180;
function km(a, b) {
  const dLat = (b[1] - a[1]) * rad, dLng = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
const seg = (a, b) => km(a, b) * 1.4 / 30 * 3600 * (a[0] < b[0] ? 1.15 : 1);

export function criarOsrmFalso(config = {}) {
  const estado = { tabelas: 0, rotas: 0, urls: [], modo: config.modo || "ok", atrasoMs: config.atrasoMs || 0 };
  async function tratar(route) {
    const url = new URL(route.request().url());
    estado.urls.push(url.pathname);
    if (estado.atrasoMs) await new Promise((r) => setTimeout(r, estado.atrasoMs));
    if (estado.modo === "queda") return route.abort("failed");
    if (estado.modo === "429") return route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ message: "Too Many Requests" }) });
    if (estado.modo === "lixo") return route.fulfill({ status: 200, contentType: "text/html", body: "<html>erro</html>" });
    if (estado.modo === "toobig") return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ code: "TooBig", message: "Too many table coordinates" }) });
    if (estado.modo === "semrota") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: "Ok", durations: decodeURIComponent(url.pathname.split("/").pop()).split(";").map((_, i, a) => a.map((__, j) => (i === j ? 0 : (j === 1 ? null : 60)))) }) });
    if (estado.modo === "so-rota-falha" && url.pathname.includes("/route/")) return route.abort("failed");
    const partes = url.pathname.split("/");
    const coords = decodeURIComponent(partes[partes.length - 1]).split(";").map((c) => c.split(",").map(Number));
    if (url.pathname.includes("/table/")) {
      estado.tabelas++;
      const d = coords.map((a, i) => coords.map((b, j) => (i === j ? 0 : seg(a, b))));
      const dist = coords.map((a, i) => coords.map((b, j) => (i === j ? 0 : km(a, b) * 1400)));
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: "Ok", durations: d, distances: dist }) });
    }
    estado.rotas++;
    const geometria = [], legs = [];
    let dur = 0, dis = 0;
    for (let i = 0; i < coords.length - 1; i++) {
      const a = coords[i], b = coords[i + 1];
      for (let k = 0; k < 10; k++) geometria.push([a[0] + (b[0] - a[0]) * k / 10, a[1] + (b[1] - a[1]) * k / 10]);
      const dd = km(a, b) * 1400, tt = seg(a, b);
      legs.push({ distance: dd, duration: tt }); dur += tt; dis += dd;
    }
    geometria.push(coords[coords.length - 1]);
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: "Ok", routes: [{ geometry: { type: "LineString", coordinates: geometria }, legs, distance: dis, duration: dur }] }) });
  }
  return { estado, tratar };
}
export { km, seg };

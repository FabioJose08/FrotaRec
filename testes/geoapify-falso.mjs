// GEOAPIFY FALSO para testes: responde ao autocomplete com locais fixos do Recife, no formato real (format=json).
// Serve só para os testes de navegador (o sandbox não tem internet); NÃO faz parte do sistema.
const semAcento = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const LOCAIS = [
  { name: "Shopping Recife", lat: -8.1189, lon: -34.9054, address_line2: "Rua Padre Carapuceiro, 777, Boa Viagem, Recife - PE, 51020-900, Brasil", result_type: "amenity" },
  { name: "Shopping RioMar Recife", lat: -8.0864, lon: -34.8948, address_line2: "Avenida República do Líbano, 251, Pina, Recife - PE, 51110-160, Brasil", result_type: "amenity" },
  { name: "Aeroporto Internacional do Recife/Guararapes - Gilberto Freyre", lat: -8.1265, lon: -34.9233, address_line2: "Praça Ministro Salgado Filho, Imbiribeira, Recife - PE, 51210-010, Brasil", result_type: "amenity" },
  { name: "Marco Zero", lat: -8.063, lon: -34.8711, address_line2: "Praça Rio Branco, Recife Antigo, Recife - PE, 50030-310, Brasil", result_type: "amenity" },
  { name: "Shopping Tacaruna", lat: -8.0344, lon: -34.8734, address_line2: "Avenida Governador Agamenon Magalhães, Santo Amaro, Recife - PE, 50040-000, Brasil", result_type: "amenity" },
  { name: "Shopping Plaza Casa Forte", lat: -8.0377, lon: -34.9181, address_line2: "Avenida Dezessete de Agosto, Casa Forte, Recife - PE, 52061-540, Brasil", result_type: "amenity" },
  { name: "Shopping Center Recife Norte", lat: -8.0121, lon: -34.9, address_line2: "Rua Exemplo, 1, Casa Amarela, Recife - PE, Brasil", result_type: "amenity" },
  { name: "Shopping Guararapes", lat: -8.1672, lon: -34.9202, address_line2: "Avenida Barreto de Menezes, Prazeres, Jaboatão dos Guararapes - PE, Brasil", result_type: "amenity" },
  { name: "Centro de Distribuição e Logística Integrada da Região Metropolitana do Recife Ltda", lat: -8.09, lon: -34.95, address_line2: "Rodovia BR-232, Km 10, Recife - PE, Brasil", result_type: "amenity" },
  { name: "Padaria Pão Quente", lat: -8.0501, lon: -34.9001, address_line2: "Rua A, 10, Boa Vista, Recife - PE, Brasil", result_type: "amenity" },
  { address_line1: "Avenida Boa Viagem", lat: -8.1239, lon: -34.9006, address_line2: "Boa Viagem, Recife - PE, 51011-000, Brasil", result_type: "street" },
  { address_line1: "Rua do Futuro, 100", lat: -8.0476, lon: -34.877, address_line2: "Graças, Recife - PE, 52050-005, Brasil", result_type: "building" }
].map((l, i) => {
  const titulo = l.name || l.address_line1;
  return { place_id: "teste-" + i, country_code: "br", lon: l.lon, lat: l.lat, name: l.name, address_line1: titulo, address_line2: l.address_line2, formatted: (l.name ? l.name + ", " : titulo + ", ") + l.address_line2, result_type: l.result_type };
});

export function criarGeoapifyFalso(config = {}) {
  const estado = { requisicoes: [], modo: config.modo || "ok", atrasoPorTexto: config.atrasoPorTexto || {}, atrasoMs: config.atrasoMs || 0 };

  async function tratar(route) {
    const url = new URL(route.request().url());
    const texto = url.searchParams.get("text") || "";
    estado.requisicoes.push({ texto, url: route.request().url(), params: Object.fromEntries(url.searchParams) });
    const cors = { "access-control-allow-origin": "*" };
    const atraso = estado.atrasoPorTexto[texto] ?? estado.atrasoMs;
    if (atraso) await new Promise((r) => setTimeout(r, atraso));
    if (estado.modo === "queda") return route.abort("failed");
    if (estado.modo === "429") return route.fulfill({ status: 429, headers: { ...cors, "retry-after": "20" }, contentType: "application/json", body: JSON.stringify({ statusCode: 429, message: "Too Many Requests" }) });
    if (estado.modo === "401") return route.fulfill({ status: 401, headers: cors, contentType: "application/json", body: JSON.stringify({ statusCode: 401, message: "Invalid apiKey" }) });
    if (estado.modo === "500") return route.fulfill({ status: 500, headers: cors, contentType: "application/json", body: "{}" });
    if (estado.modo === "lixo") return route.fulfill({ status: 200, headers: cors, contentType: "text/html", body: "<html>erro</html>" });
    const termos = semAcento(texto).split(/\s+/).filter(Boolean);
    const limite = Number(url.searchParams.get("limit")) || 5;
    const achados = LOCAIS.filter((l) => {
      const alvo = semAcento(l.formatted);
      return termos.every((t) => alvo.includes(t));
    }).slice(0, limite);
    return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ results: achados, query: { text: texto } }) });
  }
  return { estado, tratar, LOCAIS };
}

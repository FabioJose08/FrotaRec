// Testes do módulo de pesquisa de locais (js/geocodificacao.js) sem rede: "fetch" é simulado.
// Execute: node testes/geocodificacao.teste.mjs
import {
  buscarLocais, montarUrl, normalizarResultado, chaveValida, limparConsulta, segundosDePausa, reiniciarPausa,
  ErroGeocodificacao, CHAVE_DE_EXEMPLO, MAXIMO_SUGESTOES, MINIMO_CARACTERES
} from "../js/geocodificacao.js";

let total = 0; const falhas = [];
function ok(cond, nome, extra) {
  total++;
  if (cond) console.log("  PASS", nome);
  else { falhas.push(nome); console.log("  FAIL", nome, extra !== undefined ? "→ " + JSON.stringify(extra) : ""); }
}
async function codigoDoErro(promessa) {
  try { await promessa; return "sem-erro"; } catch (e) { return e instanceof ErroGeocodificacao ? e.codigo : "outro:" + e.name; }
}
const resposta = (corpo, status = 200, cab = {}) => ({
  ok: status >= 200 && status < 300, status,
  headers: { get: (n) => cab[n] ?? null },
  json: async () => { if (corpo instanceof Error) throw corpo; return corpo; }
});
const CHAVE = "chave-de-teste-123";
const RECIFE = { lat: -8.05, lng: -34.9 };

// Respostas no formato real do Geoapify (format=json): estabelecimento, rua e endereço residencial.
const SHOPPING = { place_id: "p1", name: "Shopping Recife", lat: -8.1189, lon: -34.9054, formatted: "Shopping Recife, Rua Padre Carapuceiro, 777, Boa Viagem, Recife - PE, 51020-900, Brasil", address_line1: "Shopping Recife", address_line2: "Rua Padre Carapuceiro, 777, Boa Viagem, Recife - PE, 51020-900, Brasil", result_type: "amenity" };
const AVENIDA = { place_id: "p2", lat: -8.1255, lon: -34.9001, formatted: "Avenida Boa Viagem, Boa Viagem, Recife - PE, 51011-000, Brasil", address_line1: "Avenida Boa Viagem", address_line2: "Boa Viagem, Recife - PE, 51011-000, Brasil", result_type: "street" };
const CASA = { place_id: "p3", lat: -8.0476, lon: -34.877, formatted: "Rua do Futuro, 100, Graças, Recife - PE, 52050-005, Brasil", address_line1: "Rua do Futuro, 100", address_line2: "Graças, Recife - PE, 52050-005, Brasil", housenumber: "100", result_type: "building" };

console.log("\n[1] URL da consulta");
{
  const u = new URL(montarUrl("Shopping Recife", CHAVE, RECIFE));
  ok(u.origin + u.pathname === "https://api.geoapify.com/v1/geocode/autocomplete", "endpoint autocomplete");
  ok(u.searchParams.get("text") === "Shopping Recife", "text");
  ok(u.searchParams.get("format") === "json", "format=json");
  ok(u.searchParams.get("lang") === "pt", "lang=pt");
  ok(u.searchParams.get("limit") === "5", "limit=5");
  ok(u.searchParams.get("filter") === "countrycode:br", "filter=countrycode:br");
  ok(u.searchParams.get("bias") === "proximity:-34.9,-8.05", "proximidade com LONGITUDE antes de LATITUDE", u.searchParams.get("bias"));
  ok(u.searchParams.get("apiKey") === CHAVE, "apiKey");
  ok(!u.searchParams.has("type"), "sem restrição de tipo (estabelecimentos, ruas e endereços)");
  ok(!new URL(montarUrl("x y", CHAVE, null)).searchParams.has("bias"), "sem proximidade válida, não envia bias");
  ok(new URL(montarUrl("Av. Dr. José & Cia #1", CHAVE, RECIFE)).searchParams.get("text") === "Av. Dr. José & Cia #1", "caracteres especiais são codificados");
}

console.log("\n[2] Chave e texto mínimo");
{
  let chamadas = 0;
  const f = async () => { chamadas++; return resposta({ results: [] }); };
  ok(!chaveValida("") && !chaveValida("  ") && !chaveValida(CHAVE_DE_EXEMPLO) && !chaveValida(undefined) && chaveValida(CHAVE), "chaveValida");
  ok(await codigoDoErro(buscarLocais("Shopping", { chave: "", fetchImpl: f })) === "sem-chave", "sem chave → erro sem-chave");
  ok(await codigoDoErro(buscarLocais("Shopping", { chave: CHAVE_DE_EXEMPLO, fetchImpl: f })) === "sem-chave", "chave de exemplo → sem-chave");
  ok(chamadas === 0, "sem chave: nenhuma requisição");
  ok((await buscarLocais("ab", { chave: CHAVE, fetchImpl: f })).length === 0 && (await buscarLocais("  ab  ", { chave: CHAVE, fetchImpl: f })).length === 0, "menos de 3 caracteres: [] sem requisição");
  ok(chamadas === 0 && MINIMO_CARACTERES === 3 && MAXIMO_SUGESTOES === 5, "constantes 3 e 5");
  ok(limparConsulta("  Shopping   Recife ") === "Shopping Recife", "limparConsulta");
}

console.log("\n[3] Conversão da resposta");
{
  const l = await buscarLocais("Shopping Recife", { chave: CHAVE, proximidade: RECIFE, fetchImpl: async () => resposta({ results: [SHOPPING, AVENIDA, CASA] }) });
  ok(l.length === 3, "três locais", l.length);
  ok(l[0].nome === "Shopping Recife" && l[0].lat === -8.1189 && l[0].lng === -34.9054, "estabelecimento: nome, lat e lng (lon → lng)");
  ok(l[0].endereco.startsWith("Shopping Recife, Rua Padre Carapuceiro, 777") && l[0].resumo.startsWith("Rua Padre Carapuceiro"), "endereço completo e resumo");
  ok(l[1].nome === "Avenida Boa Viagem", "rua sem 'name': usa address_line1");
  ok(l[2].nome === "Rua do Futuro, 100", "endereço residencial");
  ok(normalizarResultado({ lat: null, lon: -34, name: "x" }) === null, "lat nula descartada (não vira 0)");
  ok(normalizarResultado({ lat: 95, lon: -34, name: "x" }) === null, "coordenada fora do intervalo descartada");
  ok(normalizarResultado({ lat: -8, lon: -34 }) === null, "sem nome/endereço descartado");
  const muitos = Array.from({ length: 9 }, (_, i) => ({ place_id: "q" + i, name: "L" + i, lat: -8 - i / 100, lon: -34.9, formatted: "L" + i }));
  ok((await buscarLocais("loja", { chave: CHAVE, fetchImpl: async () => resposta({ results: muitos }) })).length === 5, "no máximo 5 sugestões");
  ok((await buscarLocais("loja", { chave: CHAVE, fetchImpl: async () => resposta({ results: [SHOPPING, SHOPPING, { ...SHOPPING, place_id: "p1" }] }) })).length === 1, "duplicados removidos");
  ok((await buscarLocais("xyz", { chave: CHAVE, fetchImpl: async () => resposta({ results: [] }) })).length === 0, "nenhum resultado → []");
  let usada = null;
  await buscarLocais("Shopping Recife", { chave: CHAVE, proximidade: RECIFE, fetchImpl: async (url, op) => { usada = { url, op }; return resposta({ results: [] }); } });
  ok(usada.url.includes("bias=proximity:-34.9,-8.05") && usada.op.signal instanceof AbortSignal, "fetch recebe URL e AbortSignal");
}

console.log("\n[4] Erros HTTP e de rede");
{
  reiniciarPausa();
  const com = (status, cab) => buscarLocais("Shopping", { chave: CHAVE, fetchImpl: async () => resposta({}, status, cab) });
  ok(await codigoDoErro(com(401)) === "chave" && await codigoDoErro(com(403)) === "chave", "401/403 → chave recusada");
  ok(await codigoDoErro(com(400)) === "consulta", "400 → consulta");
  ok(await codigoDoErro(com(500)) === "servidor" && await codigoDoErro(com(503)) === "servidor", "5xx → servidor");
  ok(await codigoDoErro(com(404)) === "http", "outros → http");
  ok(await codigoDoErro(buscarLocais("Shopping", { chave: CHAVE, fetchImpl: async () => { throw new TypeError("Failed to fetch"); } })) === "rede", "falha de rede → rede");
  ok(await codigoDoErro(buscarLocais("Shopping", { chave: CHAVE, fetchImpl: async () => resposta(new SyntaxError("json")) })) === "resposta", "JSON inválido → resposta");
  ok(await codigoDoErro(buscarLocais("Shopping", { chave: CHAVE, fetchImpl: async () => resposta({ erro: "x" }) })) === "resposta", "formato inesperado → resposta");
}

console.log("\n[5] Limite de requisições (HTTP 429)");
{
  reiniciarPausa();
  let chamadas = 0;
  const f = async () => { chamadas++; return resposta({}, 429, { "Retry-After": "7" }); };
  ok(await codigoDoErro(buscarLocais("Shopping", { chave: CHAVE, fetchImpl: f })) === "limite", "429 → limite");
  const s = segundosDePausa();
  ok(s >= 6 && s <= 7, "respeita Retry-After (7 s)", s);
  const antes = chamadas;
  ok(await codigoDoErro(buscarLocais("Shopping Recife", { chave: CHAVE, fetchImpl: f })) === "limite" && chamadas === antes, "durante a pausa não faz nova requisição");
  reiniciarPausa();
  const g = async () => resposta({}, 429);
  await codigoDoErro(buscarLocais("Shopping", { chave: CHAVE, fetchImpl: g }));
  ok(segundosDePausa() >= 14 && segundosDePausa() <= 15, "sem Retry-After: pausa padrão de 15 s", segundosDePausa());
  reiniciarPausa();
  ok(segundosDePausa() === 0, "pausa reiniciada");
}

console.log("\n[6] Cancelamento e tempo limite");
{
  reiniciarPausa();
  const pendente = (url, op) => new Promise((_, rej) => op.signal.addEventListener("abort", () => rej(new DOMException("abortado", "AbortError"))));
  const c = new AbortController();
  const p = buscarLocais("Shopping", { chave: CHAVE, signal: c.signal, fetchImpl: pendente }).then(() => "ok", (e) => e);
  c.abort();
  const e1 = await p;
  ok(e1 && e1.name === "AbortError" && !(e1 instanceof ErroGeocodificacao), "cancelamento → AbortError (e não erro de pesquisa)");
  const c2 = new AbortController(); c2.abort();
  const e2 = await buscarLocais("Shopping", { chave: CHAVE, signal: c2.signal, fetchImpl: pendente }).then(() => "ok", (e) => e);
  ok(e2 && e2.name === "AbortError", "sinal já cancelado → AbortError sem consultar");
  ok(await codigoDoErro(buscarLocais("Shopping", { chave: CHAVE, tempoLimiteMs: 30, fetchImpl: pendente })) === "tempo", "tempo esgotado → erro 'tempo'");
}

console.log(falhas.length ? `\n==== ${falhas.length} FALHA(S) de ${total} ====` : `\n==== ${total} verificações passaram ====`);
process.exit(falhas.length ? 1 : 0);

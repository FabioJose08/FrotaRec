// Pesquisa de locais e endereços (Geoapify Address Autocomplete).
//
// Este módulo só fala com o serviço: monta a consulta, trata os erros e converte a resposta
// para { nome, resumo, endereco, lat, lng }. Não mexe na tela nem no planejamento (isso é
// de busca-local.js e principal.js), no mesmo papel que rotas.js tem para o OSRM.
//
// Chave da API: fica em js/config.local.js (ignorado pelo Git; modelo em config.local.example.js).
// O arquivo é carregado só quando a pesquisa é usada pela primeira vez e é opcional: sem ele,
// o resto do sistema (inclusive a marcação no mapa) funciona normalmente.
//
// ATENÇÃO: o sistema não tem backend, então a chave é visível no navegador. Ela NÃO é secreta;
// restrinja as origens autorizadas e acompanhe o consumo no painel da Geoapify.

import { coordenadaValida } from "./geo.js";

export const URL_AUTOCOMPLETE = "https://api.geoapify.com/v1/geocode/autocomplete";
export const MINIMO_CARACTERES = 3;
export const MAXIMO_SUGESTOES = 5;
export const TEMPO_LIMITE_MS = 10000;
const ESPERA_PADRAO_LIMITE_S = 15;   // pausa após HTTP 429 sem Retry-After
const ESPERA_MAXIMA_LIMITE_S = 60;
export const CHAVE_DE_EXEMPLO = "COLE_SUA_CHAVE_AQUI";

/** Erro de pesquisa com mensagem em português. codigo: sem-chave | chave | limite | rede | tempo | servidor | consulta | resposta | http */
export class ErroGeocodificacao extends Error {
  constructor(mensagem, codigo) {
    super(mensagem);
    this.name = "ErroGeocodificacao";
    this.codigo = codigo;
  }
}

export const MENSAGEM_SEM_CHAVE = "A pesquisa de locais não está configurada (falta a chave da Geoapify). Marque o ponto no mapa ou consulte o LEIAME.";

const MENSAGENS = {
  "sem-chave": MENSAGEM_SEM_CHAVE,
  chave: "A Geoapify recusou a chave configurada (inválida ou fora da origem autorizada). Marque o ponto no mapa ou revise a configuração.",
  limite: "Limite de consultas da Geoapify atingido. Aguarde alguns segundos ou marque o ponto no mapa.",
  rede: "Sem conexão com o serviço de pesquisa. Tente novamente ou marque o ponto no mapa.",
  tempo: "O serviço de pesquisa demorou para responder. Tente novamente ou marque o ponto no mapa.",
  servidor: "O serviço de pesquisa da Geoapify está indisponível no momento. Tente novamente em instantes ou marque o ponto no mapa.",
  consulta: "A pesquisa não aceitou este texto. Tente outro nome ou endereço.",
  resposta: "O serviço de pesquisa respondeu algo inesperado. Tente novamente.",
  http: "Não foi possível pesquisar agora. Tente novamente ou marque o ponto no mapa."
};

function erro(codigo) {
  return new ErroGeocodificacao(MENSAGENS[codigo], codigo);
}

function erroDeCancelamento() {
  return new DOMException("Pesquisa cancelada.", "AbortError");
}

// ---------- Chave de API ----------

export function chaveValida(chave) {
  return typeof chave === "string" && chave.trim() !== "" && chave.trim() !== CHAVE_DE_EXEMPLO && !/\s/.test(chave.trim());
}

let promessaChave = null;

/** Lê a chave de js/config.local.js uma única vez. Devolve "" se o arquivo não existir ou estiver vazio. */
export function carregarChave() {
  if (!promessaChave) {
    promessaChave = import("./config.local.js").then(
      (modulo) => (typeof modulo.GEOAPIFY_API_KEY === "string" ? modulo.GEOAPIFY_API_KEY.trim() : ""),
      () => ""   // arquivo ausente (o normal numa instalação nova): pesquisa desativada, mapa continua
    );
  }
  return promessaChave;
}

export async function chaveConfigurada() {
  return chaveValida(await carregarChave());
}

// ---------- Limite de requisições ----------

let bloqueadoAte = 0;

/** Segundos restantes de pausa depois de um HTTP 429 (0 = livre). */
export function segundosDePausa(agora = Date.now()) {
  return Math.max(0, Math.ceil((bloqueadoAte - agora) / 1000));
}

export function reiniciarPausa() {
  bloqueadoAte = 0;
}

function iniciarPausa(resposta) {
  const cabecalho = resposta.headers && typeof resposta.headers.get === "function" ? Number(resposta.headers.get("Retry-After")) : NaN;
  const segundos = Number.isFinite(cabecalho) && cabecalho > 0 ? Math.min(cabecalho, ESPERA_MAXIMA_LIMITE_S) : ESPERA_PADRAO_LIMITE_S;
  bloqueadoAte = Date.now() + segundos * 1000;
}

// ---------- Consulta ----------

/** Texto da pesquisa sem espaços sobrando. */
export function limparConsulta(texto) {
  return typeof texto === "string" ? texto.trim().replace(/\s+/g, " ") : "";
}

/**
 * Monta a URL do autocomplete. A proximidade (bias) recebe LONGITUDE antes de LATITUDE.
 * Sem filtro de tipo: encontra estabelecimentos, ruas, bairros e endereços comuns.
 */
export function montarUrl(consulta, chave, proximidade) {
  let url = URL_AUTOCOMPLETE +
    "?text=" + encodeURIComponent(consulta) +
    "&format=json&lang=pt&limit=" + MAXIMO_SUGESTOES +
    "&filter=countrycode:br";
  if (coordenadaValida(proximidade)) {
    url += "&bias=proximity:" + Number(proximidade.lng.toFixed(5)) + "," + Number(proximidade.lat.toFixed(5));
  }
  return url + "&apiKey=" + encodeURIComponent(chave);
}

function primeiroTexto(...valores) {
  for (const v of valores) if (typeof v === "string" && v.trim() !== "") return v.trim();
  return "";
}

/** Converte um item da resposta (format=json) em local, ou null se não tiver nome/coordenadas válidos. */
export function normalizarResultado(bruto) {
  if (!bruto || typeof bruto !== "object" || typeof bruto.lat !== "number" || typeof bruto.lon !== "number") return null;
  const lat = Number(bruto.lat.toFixed(6));
  const lng = Number(bruto.lon.toFixed(6));
  if (!coordenadaValida({ lat, lng })) return null;
  const nome = primeiroTexto(bruto.name, bruto.address_line1, bruto.formatted);
  if (!nome) return null;
  const endereco = primeiroTexto(bruto.formatted, bruto.address_line2, nome);
  return {
    id: typeof bruto.place_id === "string" ? bruto.place_id : null,
    nome,
    resumo: primeiroTexto(bruto.address_line2, bruto.formatted),
    endereco,
    lat,
    lng
  };
}

function normalizarLista(dados) {
  if (!dados || !Array.isArray(dados.results)) throw erro("resposta");
  const vistos = new Set();
  const locais = [];
  for (const bruto of dados.results) {
    const local = normalizarResultado(bruto);
    if (!local) continue;
    const chave = local.id || local.nome + "|" + local.lat + "|" + local.lng;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    locais.push(local);
    if (locais.length >= MAXIMO_SUGESTOES) break;
  }
  return locais;
}

function erroDeStatus(resposta) {
  if (resposta.status === 401 || resposta.status === 403) return erro("chave");
  if (resposta.status === 429) { iniciarPausa(resposta); return erro("limite"); }
  if (resposta.status === 400) return erro("consulta");
  if (resposta.status >= 500) return erro("servidor");
  return erro("http");
}

/**
 * Pesquisa locais e endereços. Devolve no máximo 5 locais; texto com menos de 3 caracteres devolve [].
 * Lança ErroGeocodificacao (mensagem pronta para exibir) ou AbortError se "signal" for cancelado.
 * @param {string} texto
 * @param {{signal?:AbortSignal, proximidade?:{lat:number,lng:number}, chave?:string, fetchImpl?:Function, tempoLimiteMs?:number}} opcoes
 *   "chave", "fetchImpl" e "tempoLimiteMs" existem para os testes; no sistema a chave vem de config.local.js.
 */
export async function buscarLocais(texto, opcoes = {}) {
  const { signal, proximidade, tempoLimiteMs = TEMPO_LIMITE_MS, fetchImpl = (...args) => fetch(...args) } = opcoes;
  const consulta = limparConsulta(texto);
  if (consulta.length < MINIMO_CARACTERES) return [];

  const chave = opcoes.chave !== undefined ? opcoes.chave : await carregarChave();
  if (!chaveValida(chave)) throw erro("sem-chave");
  if (signal && signal.aborted) throw erroDeCancelamento();
  if (segundosDePausa() > 0) throw erro("limite");   // respeita a pausa depois de HTTP 429: nada de insistir

  // Cancelamento de quem chamou + tempo limite próprio, distinguindo um do outro.
  const controle = new AbortController();
  let motivo = null;
  const aoCancelar = () => { motivo = "cancelado"; controle.abort(); };
  if (signal) signal.addEventListener("abort", aoCancelar, { once: true });
  const temporizador = setTimeout(() => { motivo = "tempo"; controle.abort(); }, tempoLimiteMs);

  try {
    const resposta = await fetchImpl(montarUrl(consulta, chave.trim(), proximidade), {
      signal: controle.signal,
      headers: { Accept: "application/json" }
    });
    if (!resposta.ok) throw erroDeStatus(resposta);
    let dados;
    try {
      dados = await resposta.json();
    } catch (falha) {
      if (motivo || (falha && falha.name === "AbortError")) throw falha;
      throw erro("resposta");
    }
    return normalizarLista(dados);
  } catch (falha) {
    if (falha instanceof ErroGeocodificacao) throw falha;
    if (motivo === "tempo") throw erro("tempo");
    if (motivo === "cancelado" || (falha && falha.name === "AbortError")) throw erroDeCancelamento();
    throw erro("rede");
  } finally {
    clearTimeout(temporizador);
    if (signal) signal.removeEventListener("abort", aoCancelar);
  }
}

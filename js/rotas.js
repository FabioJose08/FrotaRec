// Comunicação com o OSRM (serviço público de rotas do OpenStreetMap).
//
// Duas consultas são usadas:
//   - Table API: matriz de tempos e distâncias entre TODOS os pontos (1 requisição).
//     É a base da otimização da ordem das entregas.
//   - Route API: geometria final pelas ruas, na ordem já escolhida (1 requisição).
//
// Nunca é feita uma requisição por combinação de pontos. Resultados bem-sucedidos
// ficam em cache de memória e requisições idênticas em andamento são compartilhadas.
// Se o serviço falhar, os erros são traduzidos para mensagens claras; a linha reta
// só é usada como aproximação e é sempre marcada como tal (modo "direta"/"aproximada").

import { coordenadaValida, distanciaRetaKm } from "./geo.js";

const URL_BASE = "https://router.project-osrm.org";
const TEMPO_LIMITE_MS = 20000;
const VELOCIDADE_APROXIMADA_KMH = 25; // usada somente quando o OSRM não responde

// O servidor público aceita, por padrão, até 100 coordenadas por consulta.
export const LIMITE_PONTOS_OSRM = 100;

export class ErroRoteamento extends Error {
  constructor(mensagem, codigo) {
    super(mensagem);
    this.name = "ErroRoteamento";
    this.codigo = codigo || "desconhecido";
  }
}

// ---------- Cache e requisições compartilhadas ----------

const cache = new Map();           // chave → resultado pronto
const emAndamento = new Map();     // chave → Promise
const MAX_CACHE = 40;

export function limparCache() {
  cache.clear();
  emAndamento.clear();
}

function chaveDosPontos(tipo, pontos) {
  return tipo + "|" + pontos.map((p) => p.lat.toFixed(6) + "," + p.lng.toFixed(6)).join(";");
}

function guardarNoCache(chave, valor) {
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(chave, valor);
}

// Executa "buscar" uma única vez por chave, mesmo se várias partes da tela pedirem ao mesmo tempo.
// O "signal" só desiste de ESPERAR; a requisição compartilhada continua e abastece o cache.
function comCache(chave, buscar, signal) {
  if (cache.has(chave)) return esperarComCancelamento(Promise.resolve(cache.get(chave)), signal);
  let promessa = emAndamento.get(chave);
  if (!promessa) {
    promessa = buscar()
      .then((valor) => { guardarNoCache(chave, valor); return valor; })
      .finally(() => { emAndamento.delete(chave); });
    emAndamento.set(chave, promessa);
  }
  return esperarComCancelamento(promessa, signal);
}

function esperarComCancelamento(promessa, signal) {
  if (!signal) return promessa;
  return new Promise((resolver, rejeitar) => {
    const cancelar = () => rejeitar(new DOMException("Cancelado", "AbortError"));
    if (signal.aborted) { cancelar(); return; }
    signal.addEventListener("abort", cancelar, { once: true });
    promessa.then(
      (v) => { signal.removeEventListener("abort", cancelar); resolver(v); },
      (e) => { signal.removeEventListener("abort", cancelar); rejeitar(e); }
    );
  });
}

// ---------- Requisição HTTP com tempo limite e erros traduzidos ----------

async function buscarJson(url) {
  const controle = new AbortController();
  const cronometro = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
  let resposta;
  try {
    resposta = await fetch(url, { signal: controle.signal });
  } catch (erro) {
    if (controle.signal.aborted) {
      throw new ErroRoteamento("O serviço de rotas demorou demais para responder.", "tempo");
    }
    throw new ErroRoteamento("Não foi possível falar com o serviço de rotas (sem internet ou serviço fora do ar).", "rede");
  } finally {
    clearTimeout(cronometro);
  }

  let dados = null;
  try {
    dados = await resposta.json();
  } catch (erro) {
    dados = null;
  }

  if (resposta.status === 429) {
    throw new ErroRoteamento("O serviço de rotas recebeu requisições demais. Aguarde alguns segundos e tente novamente.", "limite");
  }
  if (dados && typeof dados === "object" && typeof dados.code === "string" && dados.code !== "Ok") {
    if (dados.code === "TooBig") {
      throw new ErroRoteamento("O serviço público de rotas recusou a consulta por ter pontos demais. Reduza a quantidade de entregas.", "grande");
    }
    if (dados.code === "NoRoute" || dados.code === "NoSegment") {
      throw new ErroRoteamento("Algum ponto marcado não tem ligação por estrada com os demais (ou está longe de qualquer rua).", "sem-rota");
    }
    throw new ErroRoteamento("O serviço de rotas não aceitou a consulta (" + dados.code + ").", "recusado");
  }
  if (!resposta.ok) {
    throw new ErroRoteamento("O serviço de rotas respondeu com erro (HTTP " + resposta.status + ").", "http");
  }
  if (!dados || typeof dados !== "object") {
    throw new ErroRoteamento("O serviço de rotas devolveu uma resposta inválida.", "invalida");
  }
  return dados;
}

function validarPontos(pontos, minimo) {
  if (!Array.isArray(pontos) || pontos.length < minimo || pontos.some((p) => !coordenadaValida(p))) {
    throw new ErroRoteamento("Há pontos com coordenadas inválidas.", "entrada");
  }
  if (pontos.length > LIMITE_PONTOS_OSRM) {
    throw new ErroRoteamento(
      "São " + pontos.length + " pontos, mas o serviço público de rotas aceita no máximo " + LIMITE_PONTOS_OSRM + " por consulta.",
      "grande"
    );
  }
}

function coordenadasNaUrl(pontos) {
  return pontos.map((p) => p.lng.toFixed(6) + "," + p.lat.toFixed(6)).join(";");
}

// ---------- Matriz de tempos (Table API) ----------

/**
 * @returns {Promise<{tempos:number[][], distancias:number[][], modo:"ruas"}>}
 *   tempos em segundos e distâncias em metros, pelas ruas.
 */
export function obterMatriz(pontos, opcoes = {}) {
  validarPontos(pontos, 2);
  const chave = chaveDosPontos("tabela", pontos);
  return comCache(chave, async () => {
    const url = URL_BASE + "/table/v1/driving/" + coordenadasNaUrl(pontos) + "?annotations=duration,distance";
    const dados = await buscarJson(url);
    return lerMatriz(dados, pontos);
  }, opcoes.signal);
}

// Confere o formato da resposta antes de usá-la (exportada para teste).
export function lerMatriz(dados, pontos) {
  const n = pontos.length;
  const quadrada = (m) => Array.isArray(m) && m.length === n && m.every((linha) => Array.isArray(linha) && linha.length === n);
  if (!quadrada(dados.durations)) {
    throw new ErroRoteamento("O serviço de rotas devolveu uma matriz de tempos inválida.", "invalida");
  }
  const distanciasOk = quadrada(dados.distances);

  const isolados = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const t = dados.durations[i][j];
      if (t === null || t === undefined) { isolados.push(i, j); continue; }
      if (typeof t !== "number" || !Number.isFinite(t) || t < 0) {
        throw new ErroRoteamento("O serviço de rotas devolveu tempos inválidos.", "invalida");
      }
    }
  }
  if (isolados.length > 0) {
    const nomes = Array.from(new Set(isolados)).map((i) => pontos[i].nome || ("ponto " + (i + 1))).slice(0, 4);
    throw new ErroRoteamento(
      "Sem ligação por estrada entre alguns pontos (" + nomes.join(", ") + "). Confira se estão em terra firme e próximos de uma rua.",
      "sem-rota"
    );
  }

  const tempos = dados.durations.map((linha, i) => linha.map((v, j) => (i === j ? 0 : v)));
  const distancias = distanciasOk
    ? dados.distances.map((linha, i) => linha.map((v, j) => (i === j ? 0 : (Number.isFinite(v) ? v : 0))))
    : tempos.map((linha) => linha.map(() => 0));
  return { tempos, distancias, modo: "ruas" };
}

/**
 * Alternativa quando o OSRM não responde: tempo estimado pela distância em linha reta
 * a uma velocidade fixa. NÃO representa as ruas nem garante o menor tempo real.
 */
export function matrizAproximada(pontos) {
  const n = pontos.length;
  const tempos = [];
  const distancias = [];
  for (let i = 0; i < n; i++) {
    tempos.push([]);
    distancias.push([]);
    for (let j = 0; j < n; j++) {
      const km = i === j ? 0 : distanciaRetaKm(pontos[i], pontos[j]);
      distancias[i].push(km * 1000);
      tempos[i].push(km / VELOCIDADE_APROXIMADA_KMH * 3600);
    }
  }
  return { tempos, distancias, modo: "aproximada" };
}

// ---------- Rota final pelas ruas (Route API) ----------

function distanciaAcumulada(coordenadas) {
  const acumulada = [0];
  for (let i = 1; i < coordenadas.length; i++) {
    const [lat1, lng1] = coordenadas[i - 1];
    const [lat2, lng2] = coordenadas[i];
    acumulada.push(acumulada[i - 1] + distanciaRetaKm({ lat: lat1, lng: lng1 }, { lat: lat2, lng: lng2 }) * 1000);
  }
  return acumulada;
}

/**
 * Descobre em qual posição da linha desenhada cada ponto de parada está.
 * Usa as distâncias de cada trecho informadas pelo OSRM, então funciona mesmo quando a rota
 * passa duas vezes pela mesma rua (algo que a busca "ponto mais próximo" erraria).
 * Exportada para teste.
 */
export function indicesDosPontos(coordenadas, distanciasTrechosM) {
  const acumulada = distanciaAcumulada(coordenadas);
  const totalLinha = acumulada[acumulada.length - 1];
  const totalOsrm = distanciasTrechosM.reduce((a, b) => a + b, 0);
  const escala = totalOsrm > 0 ? totalLinha / totalOsrm : 0;

  const indices = [0];
  let alvoAcumulado = 0;
  let minimo = 0;
  for (let k = 0; k < distanciasTrechosM.length; k++) {
    alvoAcumulado += distanciasTrechosM[k] * escala;
    const ultimoTrecho = k === distanciasTrechosM.length - 1;
    let indice;
    if (ultimoTrecho) {
      indice = coordenadas.length - 1;
    } else {
      // busca binária pelo primeiro ponto cuja distância acumulada alcança o alvo
      let baixo = minimo, alto = coordenadas.length - 1;
      while (baixo < alto) {
        const meio = (baixo + alto) >> 1;
        if (acumulada[meio] < alvoAcumulado) baixo = meio + 1; else alto = meio;
      }
      indice = baixo;
      if (indice > minimo && Math.abs(acumulada[indice - 1] - alvoAcumulado) < Math.abs(acumulada[indice] - alvoAcumulado)) indice -= 1;
    }
    indice = Math.max(indice, minimo);
    indices.push(indice);
    minimo = indice;
  }
  return indices;
}

/** Linha reta entre os pontos, na ordem recebida. Apenas aproximação, sem ruas. */
export function rotaDireta(pontos) {
  const coordenadas = pontos.map((p) => [p.lat, p.lng]);
  const trechos = [];
  for (let i = 1; i < pontos.length; i++) {
    const km = distanciaRetaKm(pontos[i - 1], pontos[i]);
    trechos.push({ distanciaKm: km, duracaoMin: km / VELOCIDADE_APROXIMADA_KMH * 60 });
  }
  return {
    coordenadas,
    distanciaKm: trechos.reduce((s, t) => s + t.distanciaKm, 0),
    duracaoMin: trechos.reduce((s, t) => s + t.duracaoMin, 0),
    trechos,
    indicesPontos: pontos.map((_, i) => i),
    modo: "direta"
  };
}

/**
 * Rota pelas ruas passando pelos pontos exatamente na ordem recebida.
 * Se o OSRM falhar, devolve a linha reta (modo "direta") com o motivo em "falha".
 */
export async function calcularRota(pontos, opcoes = {}) {
  validarPontos(pontos, 2);
  const chave = chaveDosPontos("rota", pontos);
  try {
    return await comCache(chave, async () => {
      const url = URL_BASE + "/route/v1/driving/" + coordenadasNaUrl(pontos) + "?overview=full&geometries=geojson&steps=false";
      const dados = await buscarJson(url);
      return lerRota(dados, pontos);
    }, opcoes.signal);
  } catch (erro) {
    if (erro && erro.name === "AbortError") throw erro;
    const direta = rotaDireta(pontos);
    direta.falha = erro instanceof ErroRoteamento ? erro.message : "Falha inesperada ao consultar o serviço de rotas.";
    return direta;
  }
}

// Confere o formato da resposta da Route API (exportada para teste).
export function lerRota(dados, pontos) {
  const rota = dados.routes && dados.routes[0];
  const coords = rota && rota.geometry && rota.geometry.coordinates;
  if (!rota || !Array.isArray(coords) || coords.length < 2 || !Array.isArray(rota.legs) || rota.legs.length !== pontos.length - 1 ||
      !Number.isFinite(rota.distance) || !Number.isFinite(rota.duration)) {
    throw new ErroRoteamento("O serviço de rotas devolveu um percurso inválido.", "invalida");
  }
  const coordenadas = coords.map(([lng, lat]) => [lat, lng]);
  if (coordenadas.some(([lat, lng]) => !Number.isFinite(lat) || !Number.isFinite(lng))) {
    throw new ErroRoteamento("O serviço de rotas devolveu coordenadas inválidas.", "invalida");
  }
  const trechos = rota.legs.map((leg) => ({
    distanciaKm: (Number(leg.distance) || 0) / 1000,
    duracaoMin: (Number(leg.duration) || 0) / 60
  }));
  return {
    coordenadas,
    distanciaKm: rota.distance / 1000,
    duracaoMin: rota.duration / 60,
    trechos,
    indicesPontos: indicesDosPontos(coordenadas, rota.legs.map((leg) => Number(leg.distance) || 0)),
    modo: "ruas"
  };
}

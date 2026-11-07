// Simulação do movimento dos veículos.
// A posição fica em memória: o movimento não é salvo a cada passo.
//
// Cada veículo tem um "estado" (um objeto próprio). Ele guarda a rota, a distância
// já percorrida, as paradas (coleta, entregas e, se escolhido, o retorno à base)
// e os dois temporizadores (movimento e parada). Nada é compartilhado entre veículos.
//
// IMPORTANTE sobre o tempo:
//   - Os horários mostrados (08:00, 08:35...) pertencem a um RELÓGIO SIMULADO que parte
//     de HORA_INICIAL_MIN e soma os tempos estimados de cada trecho e de cada atendimento.
//   - A animação é acelerada: ACELERACAO vezes mais rápida que o tempo estimado, limitada
//     a [ANIMACAO_MIN_S, ANIMACAO_MAX_S] segundos de movimento. Cada parada dura
//     ESPERA_PARADA_MS na tela, qualquer que seja o tempo de atendimento simulado.

const INTERVALO_MS = 150;          // de quanto em quanto tempo o veículo anda
const ACELERACAO = 60;             // 1 s de animação = 60 s de viagem estimada
const ANIMACAO_MIN_S = 20;
const ANIMACAO_MAX_S = 240;
const ESPERA_PARADA_MS = 4000;     // tempo real que o veículo fica parado em cada parada
export const HORA_INICIAL_MIN = 8 * 60;   // relógio simulado começa às 08:00

export const PARAMETROS_SIMULACAO = {
  aceleracao: ACELERACAO,
  esperaParadaS: ESPERA_PARADA_MS / 1000,
  horaInicial: HORA_INICIAL_MIN
};

// A tela registra aqui uma função para ser avisada quando o estado muda.
let avisarMudanca = function () {};

export function definirAvisoDeMudanca(funcao) {
  avisarMudanca = funcao;
}

// Aviso opcional, chamado a cada passo do veículo (para barras de progresso). Não altera o movimento.
let avisarProgresso = function () {};

export function definirAvisoDeProgresso(funcao) {
  avisarProgresso = funcao;
}

// ---------- Criação e definição da rota ----------

export function criarEstado(dados, marcador, linhaPercorrida) {
  return {
    dados: dados,
    marcador: marcador,
    linhaPercorrida: linhaPercorrida,

    origem: null,
    rota: null,               // { coordenadas, distanciaKm, duracaoMin, trechos, indicesPontos, modo }
    paradas: [],              // [{ id, papel, local, minutos, indice, distM, chegadaMin }]
    acumulada: null,          // distância (m) desde a origem até cada coordenada da rota
    distTotal: 0,
    distAtual: 0,
    passoM: 1,
    fimPrevistoMin: null,     // horário simulado em que a viagem termina (com atendimentos)
    atendimentoTotalMin: 0,

    status: "sem-rota",       // sem-rota, aguardando, em-movimento, em-parada, pausado, concluida
    carregando: false,

    proximaParada: 0,
    paradaAtual: null,
    chegadas: [],             // horário simulado registrado em cada parada, pelo índice
    pausadoEmParada: false,
    tempoRestanteParada: ESPERA_PARADA_MS,
    inicioParada: null,

    temporizador: null,
    temporizadorParada: null
  };
}

function calcularAcumulada(coordenadas) {
  const acumulada = new Float64Array(coordenadas.length);
  const rad = Math.PI / 180;
  for (let i = 1; i < coordenadas.length; i++) {
    const [lat1, lng1] = coordenadas[i - 1];
    const [lat2, lng2] = coordenadas[i];
    const dLat = (lat2 - lat1) * rad;
    const dLng = (lng2 - lng1) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
    const seguro = Math.min(1, Math.max(0, h));
    acumulada[i] = acumulada[i - 1] + 6371000 * 2 * Math.atan2(Math.sqrt(seguro), Math.sqrt(1 - seguro));
  }
  return acumulada;
}

/**
 * @param {object[]} paradas  na ordem de visita: { id, papel, local, minutos }
 *   rota.indicesPontos tem uma posição a mais que "paradas" (a primeira é a origem).
 */
export function definirRota(estado, rota, origem, paradas) {
  if (rota.indicesPontos.length !== paradas.length + 1 || rota.trechos.length !== paradas.length) {
    throw new Error("Rota incompatível com a lista de paradas.");
  }
  pararTemporizadores(estado);
  estado.rota = rota;
  estado.origem = origem;
  estado.acumulada = calcularAcumulada(rota.coordenadas);
  estado.distTotal = estado.acumulada[estado.acumulada.length - 1];

  // Horário previsto de chegada: soma dos trechos + atendimentos anteriores.
  let decorrido = 0;
  estado.paradas = paradas.map(function (parada, i) {
    decorrido += rota.trechos[i].duracaoMin;
    const indice = rota.indicesPontos[i + 1];
    const completa = {
      id: parada.id,
      papel: parada.papel,
      local: parada.local,
      minutos: parada.minutos,
      indice: indice,
      distM: estado.acumulada[indice],
      chegadaMin: HORA_INICIAL_MIN + decorrido
    };
    decorrido += parada.minutos;
    return completa;
  });
  estado.fimPrevistoMin = HORA_INICIAL_MIN + decorrido;
  estado.atendimentoTotalMin = paradas.reduce(function (soma, p) { return soma + p.minutos; }, 0);

  const segundos = Math.min(ANIMACAO_MAX_S, Math.max(ANIMACAO_MIN_S, rota.duracaoMin * 60 / ACELERACAO));
  estado.passoM = Math.max(0.01, estado.distTotal / (segundos * 1000 / INTERVALO_MS));
  reiniciar(estado);
}

// ---------- Controles ----------

export function iniciar(estado) {
  if (!estado.rota) return;

  if (estado.status === "aguardando") iniciarMovimento(estado);
  else if (estado.status === "pausado") {
    if (estado.pausadoEmParada) esperarNaParada(estado, estado.tempoRestanteParada);
    else iniciarMovimento(estado);
  }
}

export function pausar(estado) {
  if (estado.status !== "em-movimento" && estado.status !== "em-parada") return;

  estado.pausadoEmParada = estado.status === "em-parada";
  if (estado.pausadoEmParada && estado.inicioParada !== null) {
    estado.tempoRestanteParada = Math.max(0, estado.tempoRestanteParada - (Date.now() - estado.inicioParada));
  }
  estado.inicioParada = null;
  pararTemporizadores(estado);
  estado.status = "pausado";
  avisarMudanca(estado);
}

// Remove a rota e devolve o veículo à origem. Invalida qualquer temporizador pendente.
export function limparRota(estado, origem) {
  pararTemporizadores(estado);
  estado.rota = null;
  estado.erro = null;
  estado.origem = origem || null;
  estado.paradas = [];
  estado.acumulada = null;
  estado.distTotal = 0;
  estado.distAtual = 0;
  estado.passoM = 1;
  estado.proximaParada = 0;
  estado.paradaAtual = null;
  estado.chegadas = [];
  estado.fimPrevistoMin = null;
  estado.atendimentoTotalMin = 0;
  estado.pausadoEmParada = false;
  estado.tempoRestanteParada = ESPERA_PARADA_MS;
  estado.inicioParada = null;
  estado.carregando = false;
  estado.status = "sem-rota";
  estado.marcador.setLatLng(origem ? [origem.lat, origem.lng] : estado.marcador.getLatLng());
  estado.linhaPercorrida.setLatLngs([]);
  avisarMudanca(estado);
}

// Volta à origem e aguarda um novo início, mantendo a mesma rota.
export function reiniciar(estado) {
  if (!estado.rota) return;

  pararTemporizadores(estado);
  estado.proximaParada = 0;
  estado.paradaAtual = null;
  estado.chegadas = [];
  estado.pausadoEmParada = false;
  estado.tempoRestanteParada = ESPERA_PARADA_MS;
  estado.inicioParada = null;
  estado.status = "aguardando";
  moverPara(estado, 0);
  avisarMudanca(estado);
}

// Chamado quando o veículo deixa de existir (cadastro excluído): para tudo.
export function destruirEstado(estado) {
  pararTemporizadores(estado);
  estado.removido = true;
}

// ---------- Movimento ----------

// Sempre limpa os temporizadores antes de criar outro,
// assim nunca existem dois ao mesmo tempo para o mesmo veículo.
function pararTemporizadores(estado) {
  if (estado.temporizador !== null) {
    clearInterval(estado.temporizador);
    estado.temporizador = null;
  }
  if (estado.temporizadorParada !== null) {
    clearTimeout(estado.temporizadorParada);
    estado.temporizadorParada = null;
  }
}

function iniciarMovimento(estado) {
  pararTemporizadores(estado);
  estado.inicioParada = null;
  estado.status = "em-movimento";
  estado.pausadoEmParada = false;
  estado.temporizador = setInterval(function () { darPasso(estado); }, INTERVALO_MS);
  avisarMudanca(estado);
}

// Posiciona o veículo a "distancia" metros do início da rota.
function moverPara(estado, distancia) {
  const coords = estado.rota.coordenadas;
  const acum = estado.acumulada;
  const alvo = Math.min(Math.max(distancia, 0), estado.distTotal);

  // Busca binária: último ponto da rota cuja distância acumulada não passa do alvo.
  let baixo = 0;
  let alto = coords.length - 1;
  while (baixo < alto) {
    const meio = (baixo + alto + 1) >> 1;
    if (acum[meio] <= alvo) baixo = meio; else alto = meio - 1;
  }
  const base = baixo;
  const proximo = Math.min(base + 1, coords.length - 1);
  const trecho = acum[proximo] - acum[base];
  const fracao = trecho > 0 ? (alvo - acum[base]) / trecho : 0;
  const posicao = [
    coords[base][0] + (coords[proximo][0] - coords[base][0]) * fracao,
    coords[base][1] + (coords[proximo][1] - coords[base][1]) * fracao
  ];
  const percurso = coords.slice(0, base + 1);
  if (fracao > 0) percurso.push(posicao);

  estado.distAtual = alvo;
  estado.marcador.setLatLng(posicao);
  estado.linhaPercorrida.setLatLngs(percurso);
  avisarProgresso(estado);
}

function darPasso(estado) {
  const parada = estado.paradas[estado.proximaParada];
  if (!parada) { concluir(estado); return; }

  const alvo = Math.min(estado.distAtual + estado.passoM, estado.distTotal);

  // Se o próximo passo alcança a parada, o veículo vai até ela e para. Nenhuma parada é pulada.
  if (alvo >= parada.distM - 1e-6) {
    moverPara(estado, Math.max(estado.distAtual, parada.distM));
    entrarNaParada(estado);
    return;
  }
  moverPara(estado, alvo);
}

// ---------- Paradas e fim da viagem ----------

function entrarNaParada(estado) {
  const parada = estado.paradas[estado.proximaParada];
  estado.paradaAtual = estado.proximaParada;
  estado.chegadas[estado.paradaAtual] = Math.round(parada.chegadaMin);
  if (parada.minutos === 0) {
    // Sem tempo de atendimento (ex.: retorno à base): registra a chegada e segue.
    sairDaParada(estado);
    return;
  }
  esperarNaParada(estado, ESPERA_PARADA_MS);
}

function esperarNaParada(estado, duracao) {
  pararTemporizadores(estado);
  estado.status = "em-parada";
  estado.pausadoEmParada = false;
  estado.tempoRestanteParada = duracao;
  estado.inicioParada = Date.now();
  estado.temporizadorParada = setTimeout(function () { sairDaParada(estado); }, duracao);
  avisarMudanca(estado);
}

function sairDaParada(estado) {
  estado.temporizadorParada = null;
  estado.proximaParada += 1;
  estado.paradaAtual = null;
  estado.tempoRestanteParada = ESPERA_PARADA_MS;
  estado.inicioParada = null;
  if (estado.proximaParada >= estado.paradas.length) concluir(estado);
  else iniciarMovimento(estado);
}

function concluir(estado) {
  pararTemporizadores(estado);
  estado.status = "concluida";
  estado.paradaAtual = null;
  avisarMudanca(estado);
}

// ---------- Textos para a tela ----------

export { formatarHorario } from "./geo.js";

export function textoStatus(estado, curto) {
  if (estado.carregando && !estado.rota) return "Calculando rota…";

  switch (estado.status) {
    case "sem-rota":    return "Aguardando viagem";
    case "aguardando":  return "Aguardando início";
    case "em-movimento":
      if (curto) return "▶ Em movimento";
      return "▶ A caminho de " + estado.paradas[estado.proximaParada].local.nome +
        " (parada " + (estado.proximaParada + 1) + " de " + estado.paradas.length + ")";
    case "em-parada": {
      if (curto) return "■ Parado";
      const parada = estado.paradas[estado.paradaAtual];
      const acao = parada.papel === "Coleta" ? "Coletando em " : "Atendendo em ";
      return "■ " + acao + parada.local.nome;
    }
    case "pausado":     return "‖ Pausado";
    case "concluida":   return curto ? "✓ Concluída" : "✓ Viagem concluída";
    default:            return "! Sem rota";
  }
}

export function classeEtiqueta(estado) {
  if (estado.carregando && !estado.rota) return "etiqueta-neutro";

  switch (estado.status) {
    case "em-movimento": return "etiqueta-movimento";
    case "em-parada":
    case "pausado":      return "etiqueta-parado";
    case "concluida":    return "etiqueta-destino";
    case "sem-rota":
    case "aguardando":   return "etiqueta-neutro";
    default:             return "etiqueta-erro";
  }
}

/**
 * Lista do percurso na ordem de visita, com o que já foi feito e o horário.
 * "horario" é o horário simulado: registrado (feito) ou apenas previsto (pendente).
 */
export function descreverPercurso(estado) {
  const itens = [];
  const jaSaiu = estado.status !== "aguardando" && estado.status !== "sem-rota";

  itens.push({
    papel: "Saída",
    nome: estado.origem.nome,
    feito: jaSaiu,
    atual: false,
    horario: HORA_INICIAL_MIN,
    minutos: 0
  });

  let numeroEntrega = 0;
  estado.paradas.forEach(function (parada, i) {
    if (parada.papel === "Entrega") numeroEntrega += 1;
    const feito = estado.chegadas[i] !== undefined;
    itens.push({
      papel: parada.papel,
      numero: parada.papel === "Entrega" ? numeroEntrega : null,
      nome: parada.local.nome,
      feito: feito,
      atual: estado.paradaAtual === i,
      horario: feito ? estado.chegadas[i] : Math.round(parada.chegadaMin),
      minutos: parada.minutos
    });
  });

  return itens;
}

// Cenários de planejamento: rota NORMAL (ordem cadastrada) e rota TURBO (Caixeiro Viajante).
//
// Módulo puro: recebe a matriz de tempos e distâncias (OSRM ou aproximação) e devolve as duas
// ordens com suas métricas, para comparar sem nenhuma nova consulta ao serviço de rotas.
//
// Índices da matriz: 0 = galpão, 1 = coleta, 2.. = entregas na ordem em que foram cadastradas.
// A coleta é sempre a primeira parada e nunca é reordenada; só as entregas mudam de posição.

import { otimizarEntregas, avaliarOrdem } from "./otimizador.js";

export const CRITERIO_TEMPO = "tempo";
export const CRITERIO_DISTANCIA = "distancia";

const EPS = 1e-9;

function temDistancias(distancias) {
  return Array.isArray(distancias) && distancias.some((linha) => linha.some((v) => v > 0));
}

// Métricas de percorrer inicio → ordem → (fim), sempre medidas na mesma matriz.
function metricas(matriz, inicio, ordem, fim, galpao) {
  const deslocamentoS = avaliarOrdem(matriz.tempos, inicio, ordem, fim);
  const distanciaM = avaliarOrdem(matriz.distancias, inicio, ordem, fim);
  // Trecho galpão → coleta é igual nos dois cenários, mas compõe o total real da viagem.
  const baseColetaS = matriz.tempos[galpao][inicio];
  const baseColetaM = matriz.distancias[galpao][inicio];
  return {
    ordem: ordem.slice(),
    deslocamentoMin: (deslocamentoS + baseColetaS) / 60,
    distanciaKm: (distanciaM + baseColetaM) / 1000
  };
}

/**
 * @param {{tempos:number[][], distancias:number[][], modo:string}} matriz
 * @param {{galpao?:number, inicio?:number, entregas:number[], fim?:(number|null), criterio?:string, limiteMs?:number, limiteExato?:number}} opcoes
 */
export function calcularCenarios(matriz, opcoes) {
  const galpao = opcoes.galpao === undefined ? 0 : opcoes.galpao;
  const inicio = opcoes.inicio === undefined ? 1 : opcoes.inicio;
  const fim = opcoes.fim === undefined ? null : opcoes.fim;
  const informada = opcoes.entregas.slice();

  // Se a matriz não trouxer distâncias (resposta parcial), só dá para otimizar por tempo.
  let criterio = opcoes.criterio === CRITERIO_DISTANCIA ? CRITERIO_DISTANCIA : CRITERIO_TEMPO;
  let criterioAjustado = false;
  if (criterio === CRITERIO_DISTANCIA && !temDistancias(matriz.distancias)) {
    criterio = CRITERIO_TEMPO;
    criterioAjustado = true;
  }
  const matrizCusto = criterio === CRITERIO_DISTANCIA ? matriz.distancias : matriz.tempos;

  const normal = metricas(matriz, inicio, informada, fim, galpao);

  const opcoesOtimizador = { inicio, entregas: informada, fim };
  if (opcoes.limiteMs !== undefined) opcoesOtimizador.limiteMs = opcoes.limiteMs;
  if (opcoes.limiteExato !== undefined) opcoesOtimizador.limiteExato = opcoes.limiteExato;
  const otimizado = otimizarEntregas(matrizCusto, opcoesOtimizador);

  // Salvaguarda: a heurística não garante o ótimo e poderia, em tese, perder para a ordem cadastrada.
  // Nesse caso o Turbo usa a ordem cadastrada (nunca entrega algo pior sob o critério escolhido).
  const custoInformado = avaliarOrdem(matrizCusto, inicio, informada, fim);
  const ordemTurbo = otimizado.custo > custoInformado + EPS ? informada : otimizado.ordem;
  const manteveInformada = ordemTurbo === informada && otimizado.custo > custoInformado + EPS;

  const turbo = {
    ...metricas(matriz, inicio, ordemTurbo, fim, galpao),
    metodo: otimizado.metodo,
    garantiaOtima: otimizado.garantiaOtima && !manteveInformada,
    iteracoes: otimizado.iteracoes,
    tempoCalculoMs: otimizado.tempoMs,
    manteveOrdemInformada: manteveInformada,
    reordenou: ordemTurbo.some((indice, posicao) => indice !== informada[posicao])
  };

  return { criterio, criterioAjustado, origemDados: matriz.modo === "ruas" ? "osrm" : "aproximacao", normal, turbo };
}

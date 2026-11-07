// Otimizador de ordem das entregas (Problema do Caixeiro Viajante com ponto inicial fixo).
//
// Este módulo é independente do navegador, do mapa e do OSRM: recebe uma matriz
// de custos (tempos de deslocamento em segundos, mas serve qualquer unidade) e
// devolve a ordem de visita.
//
// Modelo:
//   - "inicio" é o índice (na matriz) do ponto onde começa a parte otimizável.
//     Na logística do projeto é o LOCAL DE COLETA: base → coleta é um trecho
//     obrigatório e fixo, então a coleta sempre acontece antes de qualquer entrega.
//   - "entregas" é a lista de índices a visitar, cada um exatamente uma vez.
//   - "fim" é o índice onde a viagem termina (a base, se o usuário escolher
//     retornar ao galpão) ou null para terminar na última entrega.
//
// Função objetivo (minimizar):
//   M[inicio][e1] + M[e1][e2] + ... + M[en-1][en] + (fim !== null ? M[en][fim] : 0)
//
// A matriz pode ser assimétrica (ruas de mão única fazem ida ≠ volta).
//
// Estratégia híbrida:
//   - até LIMITE_EXATO entregas: programação dinâmica sobre subconjuntos (Held-Karp),
//     que garante o menor custo para a matriz recebida;
//   - acima disso: vizinho mais próximo com várias partidas + busca local
//     (2-opt e Or-opt) + perturbações aleatórias (busca local iterada, com semente
//     fixa para o resultado ser reproduzível). NÃO garante o ótimo global.

// Calibrado medindo o tempo no Node (veja LEIAME.md): 15 entregas ≈ 0,02 s; 16 ≈ 0,05 s;
// 18 ≈ 0,3 s. O limite 15 mantém a interface fluida mesmo em computadores mais lentos.
export const LIMITE_EXATO = 15;
const LIMITE_MS_PADRAO = 400;
const EPS = 1e-9;

function validarEntrada(matriz, inicio, entregas, fim) {
  const n = matriz.length;
  if (!Array.isArray(matriz) || n === 0) throw new Error("Matriz de tempos vazia.");
  const indiceOk = (i) => Number.isInteger(i) && i >= 0 && i < n;
  if (!indiceOk(inicio)) throw new Error("Ponto inicial inválido para a otimização.");
  if (fim !== null && !indiceOk(fim)) throw new Error("Ponto final inválido para a otimização.");
  const vistos = new Set();
  for (const e of entregas) {
    if (!indiceOk(e) || e === inicio || vistos.has(e)) throw new Error("Lista de entregas inválida para a otimização.");
    vistos.add(e);
  }
  for (let i = 0; i < n; i++) {
    if (!Array.isArray(matriz[i]) || matriz[i].length !== n) throw new Error("A matriz de tempos deve ser quadrada.");
    for (let j = 0; j < n; j++) {
      if (!Number.isFinite(matriz[i][j]) || matriz[i][j] < 0) throw new Error("A matriz de tempos contém valores inválidos.");
    }
  }
}

// Custo de percorrer: inicio → ordem[0] → ... → ordem[n-1] → (fim)
export function avaliarOrdem(matriz, inicio, ordem, fim = null) {
  let custo = 0;
  let atual = inicio;
  for (const e of ordem) {
    custo += matriz[atual][e];
    atual = e;
  }
  if (fim !== null) custo += matriz[atual][fim];
  return custo;
}

// ---------- Algoritmo exato (Held-Karp) ----------

function resolverExato(matriz, inicio, entregas, fim) {
  const n = entregas.length;
  const tamanho = 1 << n;
  const dp = new Float64Array(tamanho * n).fill(Infinity);
  const pai = new Int8Array(tamanho * n).fill(-1);

  for (let j = 0; j < n; j++) dp[(1 << j) * n + j] = matriz[inicio][entregas[j]];

  for (let mascara = 1; mascara < tamanho; mascara++) {
    for (let j = 0; j < n; j++) {
      if (!(mascara & (1 << j))) continue;
      const atual = dp[mascara * n + j];
      if (atual === Infinity) continue;
      for (let k = 0; k < n; k++) {
        if (mascara & (1 << k)) continue;
        const nova = mascara | (1 << k);
        const custo = atual + matriz[entregas[j]][entregas[k]];
        if (custo < dp[nova * n + k]) {
          dp[nova * n + k] = custo;
          pai[nova * n + k] = j;
        }
      }
    }
  }

  const completa = tamanho - 1;
  let melhor = Infinity;
  let ultimo = 0;
  for (let j = 0; j < n; j++) {
    const total = dp[completa * n + j] + (fim !== null ? matriz[entregas[j]][fim] : 0);
    if (total < melhor) { melhor = total; ultimo = j; }
  }

  const ordem = [];
  let mascara = completa;
  let j = ultimo;
  while (j !== -1) {
    ordem.push(entregas[j]);
    const anterior = pai[mascara * n + j];
    mascara &= ~(1 << j);
    j = anterior;
  }
  ordem.reverse();
  return ordem;
}

// ---------- Heurística ----------

// Gerador pseudoaleatório com semente (mulberry32): mesmo problema → mesma resposta.
function criarAleatorio(semente) {
  let a = semente >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Vizinho mais próximo; "primeira" força qual entrega é visitada primeiro (para variar a partida).
function vizinhoMaisProximo(matriz, inicio, entregas, primeira) {
  const restantes = new Set(entregas);
  const ordem = [];
  let atual = inicio;
  if (primeira !== undefined) {
    ordem.push(primeira);
    restantes.delete(primeira);
    atual = primeira;
  }
  while (restantes.size > 0) {
    let melhor = -1;
    let menor = Infinity;
    for (const c of restantes) {
      if (matriz[atual][c] < menor) { menor = matriz[atual][c]; melhor = c; }
    }
    ordem.push(melhor);
    restantes.delete(melhor);
    atual = melhor;
  }
  return ordem;
}

// Melhora uma sequência com 2-opt e Or-opt até não haver ganho.
// "seq" = [inicio, ...entregas, (fim)]; as pontas fixas nunca são movidas.
function buscaLocal(matriz, seq, temFim, prazo) {
  const L = seq.length;
  const ultimoMovel = temFim ? L - 2 : L - 1; // índice da última posição móvel
  let melhorou = true;

  while (melhorou) {
    melhorou = false;
    if (Date.now() > prazo) break;

    // --- 2-opt: inverte o trecho seq[i..j] (custos com somas prefixadas, O(1) por candidato) ---
    const F = new Float64Array(L);  // F[k]: soma das arestas de ida até k
    const R = new Float64Array(L);  // R[k]: soma das arestas invertidas até k
    for (let k = 0; k < L - 1; k++) {
      F[k + 1] = F[k] + matriz[seq[k]][seq[k + 1]];
      R[k + 1] = R[k] + matriz[seq[k + 1]][seq[k]];
    }
    dois_opt:
    for (let i = 1; i < ultimoMovel; i++) {
      for (let j = i + 1; j <= ultimoMovel; j++) {
        const antes = matriz[seq[i - 1]][seq[i]] + (F[j] - F[i]) + (j + 1 < L ? matriz[seq[j]][seq[j + 1]] : 0);
        const depois = matriz[seq[i - 1]][seq[j]] + (R[j] - R[i]) + (j + 1 < L ? matriz[seq[i]][seq[j + 1]] : 0);
        if (depois < antes - EPS) {
          const trecho = seq.slice(i, j + 1).reverse();
          for (let k = 0; k < trecho.length; k++) seq[i + k] = trecho[k];
          melhorou = true;
          break dois_opt;
        }
      }
    }
    if (melhorou) continue;

    // --- Or-opt: move um trecho de 1 a 3 entregas para outra posição (sem inverter) ---
    or_opt:
    for (let tam = 1; tam <= 3; tam++) {
      for (let i = 1; i + tam - 1 <= ultimoMovel; i++) {
        const segmento = seq.slice(i, i + tam);
        const primeiro = segmento[0];
        const ultimo = segmento[tam - 1];
        const a = seq[i - 1];
        const b = i + tam < L ? seq[i + tam] : undefined;
        const ganhoRemocao = matriz[a][primeiro] + (b !== undefined ? matriz[ultimo][b] - matriz[a][b] : 0);
        const resto = seq.slice(0, i).concat(seq.slice(i + tam));
        const ultimaPosicaoResto = temFim ? resto.length - 2 : resto.length - 1;
        for (let k = 0; k <= ultimaPosicaoResto; k++) {
          if (k === i - 1) continue; // mesmo lugar de antes
          const c = resto[k];
          const d = k + 1 < resto.length ? resto[k + 1] : undefined;
          const custoInsercao = matriz[c][primeiro] + (d !== undefined ? matriz[ultimo][d] - matriz[c][d] : 0);
          if (custoInsercao - ganhoRemocao < -EPS) {
            const nova = resto.slice(0, k + 1).concat(segmento, resto.slice(k + 1));
            for (let p = 0; p < L; p++) seq[p] = nova[p];
            melhorou = true;
            break or_opt;
          }
        }
      }
    }
  }
}

function custoSequencia(matriz, seq) {
  let total = 0;
  for (let k = 0; k < seq.length - 1; k++) total += matriz[seq[k]][seq[k + 1]];
  return total;
}

function resolverHeuristica(matriz, inicio, entregas, fim, limiteMs) {
  const inicioTempo = Date.now();
  const prazo = inicioTempo + limiteMs;
  const temFim = fim !== null;
  const n = entregas.length;
  const montar = (ordem) => [inicio, ...ordem, ...(temFim ? [fim] : [])];

  let melhorSeq = null;
  let melhorCusto = Infinity;
  const considerar = (seq) => {
    const custo = custoSequencia(matriz, seq);
    if (custo < melhorCusto - EPS) { melhorCusto = custo; melhorSeq = seq.slice(); }
    return custo;
  };

  // 1) Várias partidas do vizinho mais próximo + busca local.
  const candidatas = entregas.slice().sort((x, y) => matriz[inicio][x] - matriz[inicio][y]).slice(0, Math.min(n, 12));
  const partidas = [undefined, ...candidatas];
  for (const primeira of partidas) {
    const seq = montar(vizinhoMaisProximo(matriz, inicio, entregas, primeira));
    buscaLocal(matriz, seq, temFim, prazo);
    considerar(seq);
  }

  // 2) Busca local iterada: perturba a melhor solução (troca de blocos) e tenta melhorar.
  const aleatorio = criarAleatorio(12345 + n);
  const maxIteracoes = 300 + 40 * n;
  let iteracoes = 0;
  if (n >= 8) {
    let atual = melhorSeq.slice();
    let custoAtual = melhorCusto;
    while (iteracoes < maxIteracoes && Date.now() < prazo) {
      iteracoes++;
      const candidata = atual.slice();
      // Escolhe 3 cortes entre as posições móveis (1..n) e troca dois blocos de lugar.
      const cortes = [];
      while (cortes.length < 3) {
        const c = 1 + Math.floor(aleatorio() * n);
        if (!cortes.includes(c)) cortes.push(c);
      }
      cortes.sort((x, y) => x - y);
      const [c1, c2, c3] = cortes;
      const moveis = candidata.slice(1, 1 + n);
      const blocoA = moveis.slice(0, c1 - 1);
      const blocoB = moveis.slice(c1 - 1, c2 - 1);
      const blocoC = moveis.slice(c2 - 1, c3 - 1);
      const blocoD = moveis.slice(c3 - 1);
      const perturbada = montar([...blocoA, ...blocoC, ...blocoB, ...blocoD]);
      buscaLocal(matriz, perturbada, temFim, prazo);
      const custo = considerar(perturbada);
      if (custo <= custoAtual + EPS) { atual = perturbada; custoAtual = custo; }
    }
  }

  const ordem = melhorSeq.slice(1, 1 + n);
  return { ordem, iteracoes, tempoMs: Date.now() - inicioTempo };
}

// ---------- Interface pública ----------

/**
 * @param {number[][]} matriz  tempos de deslocamento (linha = origem, coluna = destino)
 * @param {{inicio:number, entregas:number[], fim?:(number|null), limiteMs?:number, limiteExato?:number}} opcoes
 * @returns {{ordem:number[], custo:number, metodo:"exato"|"heuristica"|"trivial", garantiaOtima:boolean, iteracoes:number, tempoMs:number}}
 */
export function otimizarEntregas(matriz, opcoes) {
  const inicio = opcoes.inicio;
  const entregas = opcoes.entregas.slice();
  const fim = opcoes.fim === undefined ? null : opcoes.fim;
  const limiteMs = opcoes.limiteMs === undefined ? LIMITE_MS_PADRAO : opcoes.limiteMs;
  const limiteExato = opcoes.limiteExato === undefined ? LIMITE_EXATO : opcoes.limiteExato;
  validarEntrada(matriz, inicio, entregas, fim);

  const t0 = Date.now();
  let ordem;
  let metodo;
  let iteracoes = 0;

  if (entregas.length <= 1) {
    ordem = entregas;
    metodo = "trivial";
  } else if (entregas.length <= limiteExato) {
    ordem = resolverExato(matriz, inicio, entregas, fim);
    metodo = "exato";
  } else {
    const r = resolverHeuristica(matriz, inicio, entregas, fim, limiteMs);
    ordem = r.ordem;
    iteracoes = r.iteracoes;
    metodo = "heuristica";
  }

  // Garantia de integridade: cada entrega aparece exatamente uma vez.
  const conferido = new Set(ordem);
  if (ordem.length !== entregas.length || conferido.size !== entregas.length || entregas.some((e) => !conferido.has(e))) {
    throw new Error("Falha interna: a otimização alterou a lista de entregas.");
  }

  return {
    ordem,
    custo: avaliarOrdem(matriz, inicio, ordem, fim),
    metodo,
    garantiaOtima: metodo !== "heuristica",
    iteracoes,
    tempoMs: Date.now() - t0
  };
}

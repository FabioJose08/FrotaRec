import assert from "node:assert/strict";
import { otimizarEntregas, avaliarOrdem, LIMITE_EXATO } from "../js/otimizador.js";

function rnd(sem) { let a = sem >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// Matriz a partir de pontos aleatórios no plano, com assimetria artificial (mão única).
function matriz(N, sem, assimetria = 0.3) {
  const r = rnd(sem); const p = Array.from({ length: N }, () => [r() * 100, r() * 100]);
  return Array.from({ length: N }, (_, i) => Array.from({ length: N }, (_, j) => i === j ? 0 : Math.hypot(p[i][0]-p[j][0], p[i][1]-p[j][1]) * (1 + (i < j ? assimetria * r() : 0)) * 60));
}
function permutacoes(a) { if (a.length <= 1) return [a]; return a.flatMap((x, i) => permutacoes([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])); }

// 1) Exato == força bruta (n de 0 a 7, com e sem retorno, matrizes assimétricas)
let casos = 0;
for (let n = 0; n <= 7; n++) for (const volta of [false, true]) for (let s = 1; s <= 6; s++) {
  const M = matriz(n + 2, s * 100 + n);
  const entregas = Array.from({ length: n }, (_, i) => i + 2);
  const fim = volta ? 0 : null;
  const r = otimizarEntregas(M, { inicio: 1, entregas, fim });
  const melhor = Math.min(...permutacoes(entregas).map((p) => avaliarOrdem(M, 1, p, fim)));
  assert.ok(Math.abs(r.custo - melhor) < 1e-6, `n=${n} volta=${volta}: ${r.custo} != ${melhor}`);
  assert.deepEqual([...r.ordem].sort(), [...entregas].sort());
  casos++;
}
console.log(`OK exato == força bruta em ${casos} casos`);

// 2) Heurística forçada vs exato (n=10..13): diferença percentual
let pior = 0, soma = 0, c = 0;
for (const n of [10, 12, 13]) for (let s = 1; s <= 8; s++) {
  const M = matriz(n + 2, s * 7 + n); const entregas = Array.from({ length: n }, (_, i) => i + 2);
  const ex = otimizarEntregas(M, { inicio: 1, entregas, fim: 0 });
  const he = otimizarEntregas(M, { inicio: 1, entregas, fim: 0, limiteExato: 0 });
  assert.equal(he.metodo, "heuristica"); assert.equal(ex.metodo, "exato");
  assert.ok(he.custo >= ex.custo - 1e-6, "heurística não pode ser melhor que o ótimo");
  const gap = (he.custo - ex.custo) / ex.custo * 100; pior = Math.max(pior, gap); soma += gap; c++;
}
console.log(`Heurística vs ótimo (n=10-13, ${c} casos): gap médio ${(soma/c).toFixed(3)}%, pior ${pior.toFixed(3)}%`);

// 3) Tempo do exato por tamanho
for (const n of [10, 12, 14, 15, 16, 17, 18]) {
  const M = matriz(n + 2, 99 + n); const entregas = Array.from({ length: n }, (_, i) => i + 2);
  const t = performance.now(); const r = otimizarEntregas(M, { inicio: 1, entregas, fim: 0, limiteExato: 30 });
  console.log(`exato n=${n}: ${(performance.now() - t).toFixed(0)} ms (${r.metodo})`);
}

// 4) Heurística em tamanhos maiores: tempo, integridade e melhoria sobre a ordem de entrada
for (const n of [16, 20, 30, 50, 97]) {
  const M = matriz(n + 2, 5 + n); const entregas = Array.from({ length: n }, (_, i) => i + 2);
  const t = performance.now(); const r = otimizarEntregas(M, { inicio: 1, entregas, fim: null });
  const dt = performance.now() - t;
  assert.equal(new Set(r.ordem).size, n); assert.equal(r.metodo, "heuristica");
  const entrada = avaliarOrdem(M, 1, entregas, null);
  console.log(`heurística n=${n}: ${dt.toFixed(0)} ms, ${r.iteracoes} iter, custo ${(r.custo/60).toFixed(0)} min vs ordem de entrada ${(entrada/60).toFixed(0)} min (-${((1-r.custo/entrada)*100).toFixed(1)}%)`);
  // determinismo
  const r2 = otimizarEntregas(M, { inicio: 1, entregas, fim: null, limiteMs: 5000 });
  const r3 = otimizarEntregas(M, { inicio: 1, entregas, fim: null, limiteMs: 5000 });
  assert.deepEqual(r2.ordem, r3.ordem);
}

// 5) Entradas inválidas
assert.throws(() => otimizarEntregas([[0, 1], [1, 0]], { inicio: 0, entregas: [1, 1] }));
assert.throws(() => otimizarEntregas([[0, NaN], [1, 0]], { inicio: 0, entregas: [1] }));
assert.throws(() => otimizarEntregas([[0, 1], [1, 0]], { inicio: 0, entregas: [0] }));
console.log("OK entradas inválidas rejeitadas; LIMITE_EXATO =", LIMITE_EXATO);

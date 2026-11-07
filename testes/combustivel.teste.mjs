// Testes de combustível, cenários Normal × Turbo, histórico, dashboard, backup e compatibilidade de dados.
import assert from "node:assert/strict";

// localStorage mínimo para rodar os módulos fora do navegador
function novoStorage() {
  const d = new Map();
  return { getItem: (k) => (d.has(k) ? d.get(k) : null), setItem: (k, v) => { d.set(k, String(v)); }, removeItem: (k) => { d.delete(k); }, _d: d };
}
globalThis.localStorage = novoStorage();
const reiniciar = () => { globalThis.localStorage = novoStorage(); };

const comb = await import("../js/combustivel.js");
const { calcularCenarios } = await import("../js/cenarios.js");
const { avaliarOrdem } = await import("../js/otimizador.js");
const hist = await import("../js/historico.js");
const { calcularIndicadores } = await import("../js/dashboard.js");
const rel = await import("../js/relatorios.js");
const dados = await import("../js/dados.js");
const viagem = await import("../js/viagem.js");
const conf = await import("../js/configuracoes.js");

let n = 0;
const ok = (nome, f) => { f(); n++; console.log("  PASS", nome); };
const perto = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);

console.log("[8-10] Litros, custo e economia (exemplo do enunciado: 8 km/L, R$ 6,00/L, 80 km × 60 km)");
ok("litros = distância / consumo", () => { perto(comb.calcularLitros(80, 8), 10); perto(comb.calcularLitros(60, 8), 7.5); });
ok("custo = litros × preço", () => { perto(comb.calcularCusto(10, 6), 60); perto(comb.calcularCusto(7.5, 6), 45); });
ok("economia: 2,5 L, R$ 15,00 e 25%", () => {
  const c = comb.compararRotas({ distanciaKm: 80, deslocamentoMin: 100 }, { distanciaKm: 60, deslocamentoMin: 80 }, 8, 6);
  perto(c.economiaLitros, 2.5); perto(c.economiaReais, 15); perto(c.percentualDistancia, 25); perto(c.percentualCusto, 25); perto(c.percentualCombustivel, 25);
  assert.ok(c.reduziuCombustivel && c.reduziuCusto && c.reduziuDistancia && c.reduziuTempo);
});
ok("sem arredondamento intermediário (valores não inteiros)", () => {
  const l = comb.calcularLitros(10, 3); perto(l, 10 / 3, 1e-12); perto(comb.calcularCusto(l, 6.29), (10 / 3) * 6.29, 1e-12);
});

console.log("[11] Veículo sem consumo / sem preço");
ok("sem consumo: nenhum número inventado", () => {
  for (const v of [null, undefined, 0, -5, NaN, "8", 1000]) assert.equal(comb.calcularLitros(50, v), null);
  const c = comb.compararRotas({ distanciaKm: 80, deslocamentoMin: 1 }, { distanciaKm: 60, deslocamentoMin: 1 }, null, 6);
  assert.equal(c.economiaLitros, null); assert.equal(c.economiaReais, null); assert.equal(c.consumoDisponivel, false);
  assert.ok(c.reduziuDistancia, "distância continua comparável");
});
ok("sem preço: litros sim, custo não", () => {
  const c = comb.compararRotas({ distanciaKm: 80, deslocamentoMin: 1 }, { distanciaKm: 60, deslocamentoMin: 1 }, 8, null);
  perto(c.economiaLitros, 2.5); assert.equal(c.economiaReais, null); assert.equal(c.custoNormal, null); assert.equal(c.precoDisponivel, false);
});
ok("Turbo que não economiza não gera economia falsa", () => {
  const c = comb.compararRotas({ distanciaKm: 50, deslocamentoMin: 40 }, { distanciaKm: 50, deslocamentoMin: 40 }, 8, 6);
  assert.equal(c.reduziuDistancia, false); assert.equal(c.reduziuCombustivel, false); assert.equal(c.reduziuCusto, false);
  const pior = comb.compararRotas({ distanciaKm: 50, deslocamentoMin: 40 }, { distanciaKm: 55, deslocamentoMin: 35 }, 8, 6);
  assert.equal(pior.reduziuDistancia, false); assert.ok(pior.economiaKm < 0); assert.equal(pior.reduziuCusto, false); assert.equal(pior.reduziuTempo, true);
});

// ---------- Cenários ----------
function rnd(sem) { let a = sem >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// Matriz assimétrica: tempos e distâncias (m) com ruas de mão única.
function matriz(N, sem) {
  const r = rnd(sem); const p = Array.from({ length: N }, () => [r() * 20, r() * 20]);
  const dist = Array.from({ length: N }, (_, i) => Array.from({ length: N }, (_, j) => i === j ? 0 : Math.hypot(p[i][0] - p[j][0], p[i][1] - p[j][1]) * 1000 * (1 + (i < j ? 0.35 * r() : 0))));
  const tempos = dist.map((l, i) => l.map((v, j) => i === j ? 0 : v / 8 * (1 + 0.2 * ((i * 7 + j * 3) % 5) / 5)));
  return { tempos, distancias: dist, modo: "ruas" };
}
const perm = (a) => a.length <= 1 ? [a] : a.flatMap((x, i) => perm([...a.slice(0, i), ...a.slice(i + 1)]).map((q) => [x, ...q]));

console.log("[1-3,6-7] Cenários Normal × Turbo");
ok("Normal respeita exatamente a ordem cadastrada", () => {
  const M = matriz(8, 11); const ent = [2, 3, 4, 5, 6, 7];
  const c = calcularCenarios(M, { entregas: ent, fim: 0 });
  assert.deepEqual(c.normal.ordem, ent);
});
ok("Turbo reorganiza e é ótimo (Held-Karp == força bruta), com matriz assimétrica, com e sem retorno, nos dois critérios", () => {
  for (const fim of [null, 0]) for (const criterio of ["tempo", "distancia"]) for (let s = 1; s <= 5; s++) {
    const M = matriz(8, s * 13); const ent = [2, 3, 4, 5, 6, 7];
    const c = calcularCenarios(M, { entregas: ent, fim, criterio });
    const alvo = criterio === "tempo" ? M.tempos : M.distancias;
    const melhor = Math.min(...perm(ent).map((p) => avaliarOrdem(alvo, 1, p, fim)));
    perto(avaliarOrdem(alvo, 1, c.turbo.ordem, fim), melhor, 1e-6);
    assert.equal(c.turbo.metodo, "exato"); assert.equal(c.turbo.garantiaOtima, true);
    assert.deepEqual([...c.turbo.ordem].sort(), [...ent].sort());
  }
});
ok("Turbo nunca é pior que Normal no critério escolhido", () => {
  for (let s = 1; s <= 20; s++) {
    const M = matriz(12, s * 5); const ent = Array.from({ length: 10 }, (_, i) => i + 2);
    const c = calcularCenarios(M, { entregas: ent, fim: 0, criterio: "tempo" });
    assert.ok(c.turbo.deslocamentoMin <= c.normal.deslocamentoMin + 1e-9);
  }
});
ok("a assimetria importa: A→B ≠ B→A é respeitado", () => {
  const M = { tempos: [[0, 10, 10, 10], [10, 0, 1, 100], [10, 100, 0, 1], [10, 1, 100, 0]], distancias: [[0, 1000, 1000, 1000], [1000, 0, 100, 10000], [1000, 10000, 0, 100], [1000, 100, 10000, 0]], modo: "ruas" };
  const c = calcularCenarios(M, { entregas: [2, 3], fim: null });
  assert.deepEqual(c.turbo.ordem, [2, 3]);
  // Cadastrada na ordem inversa, o Turbo ainda acha 2→3 (custo 2) e o Normal paga o sentido caro (3→2 = 200).
  const c2 = calcularCenarios(M, { entregas: [3, 2], fim: null });
  assert.deepEqual(c2.turbo.ordem, [2, 3]); assert.equal(c2.turbo.reordenou, true);
  assert.ok(c2.normal.deslocamentoMin > c2.turbo.deslocamentoMin * 10);
});
ok("coleta nunca entra nas entregas reordenadas e o retorno é opcional", () => {
  const M = matriz(7, 3); const ent = [2, 3, 4, 5, 6];
  const a = calcularCenarios(M, { entregas: ent, fim: null }); const b = calcularCenarios(M, { entregas: ent, fim: 0 });
  assert.ok(!a.turbo.ordem.includes(1) && !b.turbo.ordem.includes(1));
  assert.ok(b.normal.deslocamentoMin > a.normal.deslocamentoMin, "com retorno o total é maior");
  assert.ok(b.normal.distanciaKm > a.normal.distanciaKm);
});
ok("heurística para muitas entregas: usa heurística, não promete ótimo e não perde para a ordem informada", () => {
  const M = matriz(40, 77); const ent = Array.from({ length: 38 }, (_, i) => i + 2);
  const c = calcularCenarios(M, { entregas: ent, fim: 0 });
  assert.equal(c.turbo.metodo, "heuristica"); assert.equal(c.turbo.garantiaOtima, false);
  assert.equal(new Set(c.turbo.ordem).size, ent.length);
  assert.ok(c.turbo.deslocamentoMin <= c.normal.deslocamentoMin + 1e-9);
});
ok("ordem já ótima: Turbo igual ao Normal, sem 'economia'", () => {
  const M = { tempos: [[0, 1, 1, 9], [1, 0, 1, 9], [1, 1, 0, 1], [1, 9, 1, 0]], distancias: [[0, 1, 1, 9], [1, 0, 1, 9], [1, 1, 0, 1], [1, 9, 1, 0]].map((l) => l.map((v) => v * 1000)), modo: "ruas" };
  const c = calcularCenarios(M, { entregas: [2, 3], fim: null });
  assert.equal(c.turbo.reordenou, false);
  const comp = comb.compararRotas(c.normal, c.turbo, 8, 6); assert.equal(comp.reduziuDistancia, false);
});
ok("distâncias ausentes: critério cai para tempo e informa o ajuste", () => {
  const M = matriz(6, 9); M.distancias = M.distancias.map((l) => l.map(() => 0));
  const c = calcularCenarios(M, { entregas: [2, 3, 4, 5], fim: null, criterio: "distancia" });
  assert.equal(c.criterio, "tempo"); assert.equal(c.criterioAjustado, true);
});
ok("matriz aproximada é marcada como aproximação", () => {
  const M = matriz(5, 2); M.modo = "aproximada";
  assert.equal(calcularCenarios(M, { entregas: [2, 3, 4], fim: null }).origemDados, "aproximacao");
});

// ---------- Histórico ----------
console.log("[12-13] Persistência do histórico e ausência de duplicados");
const baseRegistro = () => hist.montarRegistroViagem({
  id: "v-1", veiculo: { id: "a", codigo: "SIM-001", tipo: "Van", consumoKmL: 8 }, modo: "turbo", criterio: "tempo", entregas: 4, retornouGalpao: true,
  metricas: { distanciaKm: 60, deslocamentoMin: 80 }, atendimentoMin: 30, normal: { distanciaKm: 80, deslocamentoMin: 100 }, precoLitro: 6,
  metodo: "exato", origem: "osrm", paradas: [{ papel: "Coleta", nome: "Fábrica", horario: "08:10" }]
});
ok("registro calcula litros, custo e economia pelas fórmulas", () => {
  const r = baseRegistro(); perto(r.litros, 7.5); perto(r.custo, 45); perto(r.comparacao.economiaLitros, 2.5); perto(r.comparacao.economiaReais, 15); perto(r.comparacao.percentual, 25);
});
ok("sem consumo: litros/custo/economia ficam null (nada inventado)", () => {
  const r = hist.montarRegistroViagem({ ...{ id: "x", veiculo: { id: "a", codigo: "S", tipo: "", consumoKmL: null }, modo: "turbo", criterio: "tempo", entregas: 2, retornouGalpao: false, metricas: { distanciaKm: 10, deslocamentoMin: 20 }, atendimentoMin: 5, normal: { distanciaKm: 12, deslocamentoMin: 25 }, precoLitro: 6, metodo: "exato", origem: "osrm", paradas: [] } });
  assert.equal(r.litros, null); assert.equal(r.custo, null); assert.equal(r.comparacao.economiaLitros, null); assert.equal(r.comparacao.economiaReais, null); assert.ok(r.comparacao.economiaKm > 0);
});
ok("modo Normal não tem comparação", () => {
  const r = hist.montarRegistroViagem({ id: "n", veiculo: { id: "a", codigo: "S", tipo: "", consumoKmL: 8 }, modo: "normal", criterio: "tempo", entregas: 3, retornouGalpao: false, metricas: { distanciaKm: 10, deslocamentoMin: 20 }, atendimentoMin: 5, normal: { distanciaKm: 10, deslocamentoMin: 20 }, precoLitro: 6, metodo: "manual", origem: "osrm", paradas: [] });
  assert.equal(r.comparacao, null); assert.equal(r.criterio, null);
});
ok("histórico sobrevive a 'recarregar' (nova leitura do storage)", () => {
  reiniciar(); assert.ok(hist.registrarViagem(baseRegistro()).ok);
  const lido = hist.carregarHistorico(); assert.equal(lido.viagens.length, 1); assert.equal(lido.viagens[0].veiculoCodigo, "SIM-001");
  assert.equal(JSON.parse(localStorage.getItem("frota-recife-historico")).versao, 1);
});
ok("mesmo id não duplica, mesmo registrando várias vezes", () => {
  reiniciar(); for (let i = 0; i < 5; i++) hist.registrarViagem(baseRegistro());
  assert.equal(hist.carregarHistorico().viagens.length, 1);
  assert.equal(hist.registrarViagem(baseRegistro()).duplicado, true);
  hist.registrarViagem({ ...baseRegistro(), id: "v-2" }); assert.equal(hist.carregarHistorico().viagens.length, 2);
});
ok("excluir e limpar", () => { hist.excluirViagem("v-2"); assert.equal(hist.carregarHistorico().viagens.length, 1); assert.throws(() => hist.excluirViagem("nao-existe")); hist.limparHistorico(); assert.equal(hist.carregarHistorico().viagens.length, 0); });
ok("histórico corrompido: erro claro, cópia guardada, sem quebrar", () => {
  reiniciar(); localStorage.setItem("frota-recife-historico", "{lixo"); const r = hist.carregarHistorico();
  assert.ok(r.erro && r.viagens.length === 0); assert.equal(localStorage.getItem("frota-recife-historico-backup"), "{lixo");
  assert.equal(hist.registrarViagem(baseRegistro()).ok, false, "não sobrescreve dado ilegível silenciosamente");
});
ok("falha de armazenamento é informada", () => {
  reiniciar(); const orig = localStorage.setItem; localStorage.setItem = () => { throw new Error("cheio"); };
  const r = hist.registrarViagem(baseRegistro()); localStorage.setItem = orig; assert.equal(r.ok, false); assert.ok(r.erro);
});

// ---------- Compatibilidade ----------
console.log("[14] Compatibilidade com dados antigos");
{
  reiniciar();
  localStorage.setItem("frota-recife-veiculos", JSON.stringify([{ id: "v1", codigo: "SIM-001", tipo: "Van", responsavel: "", transportadora: "", situacao: "Ativo" }]));
  const v = await dados.listarVeiculos();
  ok("veículo antigo (sem consumo) é lido com consumo null", () => { assert.equal(v[0].consumoKmL, null); assert.equal(v[0].codigo, "SIM-001"); });
  await dados.salvarVeiculo({ id: "v1", codigo: "SIM-001", tipo: "Van", situacao: "Ativo", consumoKmL: "8,5" });
  ok("consumo aceita vírgula e é salvo", () => assert.equal(JSON.parse(localStorage.getItem("frota-recife-veiculos"))[0].consumoKmL, 8.5));
  for (const ruim of ["abc", "0", "-3", "500"]) {
    let erro = null; try { await dados.salvarVeiculo({ id: "v1", codigo: "SIM-001", tipo: "Van", situacao: "Ativo", consumoKmL: ruim }); } catch (e) { erro = e; }
    ok("consumo inválido recusado: " + ruim, () => assert.ok(erro && /consumo/.test(erro.message)));
  }
  await dados.salvarVeiculo({ id: "v1", codigo: "SIM-001", tipo: "Van", situacao: "Ativo", consumoKmL: "" });
  ok("consumo em branco volta a null", () => assert.equal(JSON.parse(localStorage.getItem("frota-recife-veiculos"))[0].consumoKmL, null));
}
ok("plano antigo (sem criterio) mantém os dados e assume tempo/Turbo", () => {
  reiniciar();
  localStorage.setItem("frota-recife-viagens", JSON.stringify({ versao: 1, viagens: { v1: { coleta: { id: "c", nome: "Fábrica", lat: -8.05, lng: -34.9, minutos: 10 }, entregas: [{ id: "e1", nome: "A", lat: -8.04, lng: -34.89, minutos: 5 }], retornarBase: true, otimizar: true } } }));
  const { planos, erro } = viagem.carregarViagens(); assert.equal(erro, null);
  const p = planos.v1; assert.equal(p.criterio, "tempo"); assert.equal(p.otimizar, true); assert.equal(p.entregas.length, 1); assert.equal(p.retornarBase, true);
});
ok("plano antigo com otimizar=false continua sendo modo Normal", () => {
  localStorage.setItem("frota-recife-viagens", JSON.stringify({ versao: 1, viagens: { v1: { coleta: null, entregas: [], retornarBase: false, otimizar: false } } }));
  assert.equal(viagem.carregarViagens().planos.v1.otimizar, false);
});
ok("salvar preserva criterio e demais campos", () => {
  const { planos } = viagem.carregarViagens(); planos.v1.criterio = "distancia"; viagem.salvarViagens(planos);
  assert.equal(viagem.carregarViagens().planos.v1.criterio, "distancia");
});
ok("chaves antigas continuam as mesmas", () => {
  assert.equal(dados.CHAVE_VEICULOS, "frota-recife-veiculos"); assert.equal(dados.CHAVE_QUEBRAS, "frota-recife-quebras");
  assert.equal(viagem.CHAVE_GALPAO, "frota-recife-galpao"); assert.equal(viagem.CHAVE_VIAGENS, "frota-recife-viagens");
});
ok("configurações: preço válido/ inválido / vírgula / vazio", () => {
  reiniciar(); assert.equal(conf.lerConfiguracoes().precoCombustivel, null);
  assert.equal(conf.interpretarPreco("6,29"), 6.29); assert.equal(conf.interpretarPreco(""), null);
  for (const r of ["abc", "0", "-1", "1000"]) assert.throws(() => conf.interpretarPreco(r));
  conf.salvarPrecoCombustivel(6.29); assert.equal(conf.lerConfiguracoes().precoCombustivel, 6.29);
  localStorage.setItem("frota-recife-config", "xx"); assert.ok(conf.lerConfiguracoes().erro);
});

// ---------- Dashboard ----------
console.log("Dashboard só com dados reais");
ok("sem registros: zeros e 'indisponível' (nada fictício)", () => {
  const i = calcularIndicadores([], []); assert.equal(i.viagensConcluidas, 0); assert.equal(i.kmPercorridos, 0); assert.equal(i.litrosEstimados, null); assert.equal(i.economiaReais, null);
});
ok("soma real dos registros e contagem de frota", () => {
  const v = [{ situacao: "Ativo", consumoKmL: 8 }, { situacao: "Em manutenção", consumoKmL: null }, { situacao: "Inativo", consumoKmL: null }];
  const r1 = hist.sanearRegistro(baseRegistro()); const r2 = hist.sanearRegistro({ ...baseRegistro(), id: "v-2" });
  const i = calcularIndicadores(v, [r1, r2]);
  assert.equal(i.ativos, 1); assert.equal(i.emManutencao, 1); assert.equal(i.inativos, 1); assert.equal(i.veiculosSemConsumo, 2);
  perto(i.kmPercorridos, 120); perto(i.litrosEstimados, 15); perto(i.economiaLitros, 5); perto(i.economiaReais, 30);
});

// ---------- CSV e backup ----------
console.log("Exportação e backup");
ok("CSV: BOM, separador ';', decimal com vírgula e proteção contra fórmula", () => {
  const csv = rel.csvViagens([hist.sanearRegistro(baseRegistro())]); assert.ok(csv.startsWith("\uFEFF")); assert.ok(csv.includes(";60;")); assert.ok(csv.includes("7,5"));
  const v = rel.csvVeiculos([{ codigo: "=CMD()", tipo: 'a"b', responsavel: "", transportadora: "", situacao: "Ativo", consumoKmL: null }]); assert.ok(v.includes("'=CMD()")); assert.ok(v.includes('"a""b"'));
});
{
  reiniciar();
  localStorage.setItem("frota-recife-veiculos", JSON.stringify([{ id: "v1", codigo: "A", tipo: "T", responsavel: "", transportadora: "", situacao: "Ativo", consumoKmL: 9 }]));
  localStorage.setItem("frota-recife-galpao", JSON.stringify({ nome: "G", lat: -8, lng: -34 }));
  hist.registrarViagem(baseRegistro()); conf.salvarPrecoCombustivel(6.1);
  const texto = JSON.stringify(rel.montarBackup());
  const antes = { v: localStorage.getItem("frota-recife-veiculos"), h: hist.carregarHistorico().viagens.length };
  const val = rel.validarBackup(texto);
  ok("backup válido é aceito e resumido", () => { assert.ok(val.ok); assert.equal(val.resumo.veiculos, 1); assert.equal(val.resumo.viagensConcluidas, 1); });
  reiniciar(); rel.aplicarBackup(val.dados);
  ok("importação restaura tudo", () => { assert.equal(JSON.parse(localStorage.getItem("frota-recife-veiculos"))[0].consumoKmL, 9); assert.equal(hist.carregarHistorico().viagens.length, antes.h); assert.equal(conf.lerConfiguracoes().precoCombustivel, 6.1); assert.equal(JSON.parse(localStorage.getItem("frota-recife-galpao")).nome, "G"); });
  ok("importação guarda cópia do estado anterior", () => assert.ok(localStorage.getItem("frota-recife-backup-anterior")));
}
ok("backup inválido é recusado sem tocar nos dados", () => {
  reiniciar(); localStorage.setItem("frota-recife-veiculos", "[]");
  for (const lixo of ["não é json", "{}", '{"app":"outro"}', JSON.stringify({ app: "frota-recife-backup", versao: 99, dados: {} }), JSON.stringify({ app: "frota-recife-backup", versao: 1, dados: { veiculos: "x" } }),
    JSON.stringify({ app: "frota-recife-backup", versao: 1, dados: { veiculos: [{ id: 1 }] } }), JSON.stringify({ app: "frota-recife-backup", versao: 1, dados: { galpao: { nome: "x", lat: 999, lng: 0 } } }),
    JSON.stringify({ app: "frota-recife-backup", versao: 1, dados: { historico: { viagens: [{ lixo: true }] } } })]) {
    assert.equal(rel.validarBackup(lixo).ok, false, lixo);
  }
  assert.equal(localStorage.getItem("frota-recife-veiculos"), "[]");
});

console.log(`\n==== ${n} verificações passaram ====`);

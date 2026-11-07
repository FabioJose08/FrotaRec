// Testes de ponta a ponta no Chromium (Playwright) com Leaflet e OSRM simulados.
import { abrir, esperar } from "./ajuda.mjs";
import { seg } from "./osrm-falso.mjs";

let total = 0; const falhas = [];
function ok(cond, nome, extra) {
  total++;
  if (cond) console.log("  PASS", nome);
  else { falhas.push(nome); console.log("  FAIL", nome, extra !== undefined ? "→ " + JSON.stringify(extra) : ""); }
}
const BASE = [-8.0500, -34.9000], COLETA = [-8.0520, -34.9020];
function ponto(k) { return [Number((-8.05 + 0.025 * Math.sin(k * 2.4 + 0.3)).toFixed(6)), Number((-34.90 + 0.04 * Math.cos(k * 1.7 + 0.1)).toFixed(6))]; }

const clicar = (t, sel) => t.pagina.click(sel);
const mapClick = (t, lat, lng) => t.pagina.evaluate(([a, b]) => window.__mapa.fire("click", { latlng: { lat: a, lng: b } }), [lat, lng]);
const texto = (t, sel) => t.pagina.textContent(sel);
const lerLista = (t) => t.pagina.$$eval("#lista-entregas .texto-entrega strong", (e) => e.map((x) => x.textContent));
const lerPercurso = (t) => t.pagina.$$eval("#lista-percurso li", (e) => e.map((x) => x.innerText.replace(/\n/g, " | ")));

async function prepararBase(t, { coleta = true } = {}) {
  await t.pagina.goto(t.url + "/planejamento.html");
  await t.pagina.waitForSelector(".item-veiculo");
  await clicar(t, "#btn-mapa-galpao"); t.dialogos.fila.push("Galpão Central"); await mapClick(t, ...BASE);
  if (coleta) { await clicar(t, "#btn-mapa-coleta"); t.dialogos.fila.push("Fábrica Norte"); await mapClick(t, ...COLETA); }
}
async function addForm(t, nome, lat, lng, minutos) {
  await clicar(t, "#btn-nova-entrega");
  await t.pagina.fill("#entrega-nome", nome); await t.pagina.fill("#entrega-lat", String(lat)); await t.pagina.fill("#entrega-lng", String(lng));
  if (minutos !== undefined) await t.pagina.fill("#entrega-minutos", String(minutos));
  await t.pagina.evaluate(() => document.getElementById("entrega-nome").removeAttribute("maxlength")); // testa a validação do código, não o atributo HTML
  if (nome.length > 60) await t.pagina.fill("#entrega-nome", nome);
  await clicar(t, "#btn-salvar-entrega");
  const erroVisivel = await t.pagina.isVisible("#erro-editor");
  if (erroVisivel) { const e = await texto(t, "#erro-editor"); await clicar(t, "#btn-cancelar-entrega"); return e; }
  return null;
}
async function otimizar(t) {
  await clicar(t, "#btn-calcular");
  await t.pagina.waitForFunction(() => !document.querySelector("#btn-calcular").disabled && !document.querySelector("#mensagem-rota").textContent.startsWith("Calculando"), null, { timeout: 30000 });
}
async function rodarSimulacao(t, maxSegundos = 600) {
  const vistos = [];
  for (let s = 0; s < maxSegundos; s++) {
    await t.pagina.clock.runFor(1000);
    const m = await texto(t, "#dado-movimento");
    if (m.startsWith("■") && vistos[vistos.length - 1] !== m) vistos.push(m);
    if (m.includes("concluída")) return { vistos, segundos: s + 1 };
  }
  return { vistos, segundos: -1 };
}
function melhorOrdemForca(coletaPt, base, pts, retorno) {
  const perm = (a) => a.length <= 1 ? [a] : a.flatMap((x, i) => perm([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p]));
  let melhor = Infinity;
  for (const p of perm(pts)) {
    let c = 0, at = coletaPt; for (const q of p) { c += seg([at[1], at[0]], [q[1], q[0]]); at = q; }
    if (retorno) c += seg([at[1], at[0]], [base[1], base[0]]);
    melhor = Math.min(melhor, c);
  }
  return melhor;
}
function custoOrdem(coletaPt, base, pts, retorno) {
  let c = 0, at = coletaPt; for (const q of pts) { c += seg([at[1], at[0]], [q[1], q[0]]); at = q; }
  if (retorno) c += seg([at[1], at[0]], [base[1], base[0]]);
  return c;
}

// ===================================================================
console.log("\n[1-4] Uma, duas, cinco e dez entregas — planejamento, otimização e simulação completa");
for (const n of [1, 2, 5, 10]) {
  const t = await abrir();
  await t.pagina.clock.install();
  await prepararBase(t);
  const nomes = [];
  for (let k = 0; k < n; k++) { const [la, ln] = ponto(k); nomes.push("Cliente " + (k + 1)); const e = await addForm(t, nomes[k], la, ln, 5); if (e) ok(false, "n=" + n + " adicionar " + k, e); }
  ok((await lerLista(t)).length === n, `n=${n}: lista tem ${n} entregas`);
  ok(await texto(t, "#contador-entregas") === String(n), `n=${n}: contador`);
  await otimizar(t);
  const percurso = await lerPercurso(t);
  ok(percurso.length === n + 2, `n=${n}: percurso = saída + coleta + ${n} entregas`, percurso.length);
  ok(percurso[1].includes("Coleta"), `n=${n}: coleta é a primeira parada`);
  const ordemLista = await lerLista(t);
  ok(new Set(ordemLista).size === n && nomes.every((x) => ordemLista.includes(x)), `n=${n}: cada entrega aparece exatamente uma vez após otimizar`);
  const ordemPercurso = percurso.slice(2).map((l) => l.split(":")[1].split("|")[0].trim());
  ok(JSON.stringify(ordemPercurso) === JSON.stringify(ordemLista), `n=${n}: lista de entregas e percurso na mesma ordem`);
  ok(t.osrm.estado.tabelas === (n > 1 ? 1 : 0) && t.osrm.estado.rotas === 1, `n=${n}: requisições OSRM (tabela=${n > 1 ? 1 : 0}, rota=1)`, [t.osrm.estado.tabelas, t.osrm.estado.rotas]);
  const resumo = await texto(t, "#resumo-numeros");
  ok(/Distância pelas ruas/.test(resumo) && /Total/.test(resumo), `n=${n}: resumo com distância, deslocamento e total`, resumo);
  if (n > 1 && n <= 10) {
    const m = await texto(t, "#resumo-otimizacao");
    ok(/exata/.test(m), `n=${n}: informado como solução exata`, m);
  }
  await clicar(t, "#btn-iniciar");
  const r = await rodarSimulacao(t);
  ok(r.segundos > 0, `n=${n}: simulação concluiu (${r.segundos}s simulados na tela)`);
  const atendimentos = r.vistos.map((v) => v.replace(/^■ (Coletando|Atendendo) em /, ""));
  const esperado = ["Fábrica Norte", ...ordemLista];
  ok(JSON.stringify(atendimentos) === JSON.stringify(esperado), `n=${n}: veículo parou em todas as paradas, na ordem planejada, sem pular`, { atendimentos, esperado });
  const final = await lerPercurso(t);
  ok(final.every((l) => l.startsWith("✓")), `n=${n}: todos os itens do percurso marcados como feitos`);
  ok((await texto(t, "#mensagem-rota")).includes("concluída"), `n=${n}: mensagem de viagem concluída`);
  ok(await t.pagina.isDisabled("#btn-iniciar"), `n=${n}: Iniciar desabilitado após concluir`);
  ok(t.erros.length === 0, `n=${n}: sem erros no console`, t.erros);
  await t.fechar();
}

// ===================================================================
console.log("\n[5] Quantidade maior de entregas (heurística), desempenho e limite do serviço");
{
  const t = await abrir();
  await prepararBase(t);
  for (const n of [40]) {
    for (let k = 0; k < n; k++) { const [la, ln] = ponto(k + 100 * 0); const e = await addForm(t, "E" + (k + 1), (la + k * 0.0002).toFixed(6), (ln + k * 0.0003).toFixed(6), 3); if (e) { ok(false, "add " + k, e); break; } }
    const t0 = Date.now();
    await otimizar(t);
    const dt = Date.now() - t0;
    const m = await texto(t, "#resumo-otimizacao");
    ok(/heurística/.test(m) && !/exata/.test(m), "40 entregas: informa heurística (sem alegar ótimo global)", m);
    ok((await lerLista(t)).length === 40 && new Set(await lerLista(t)).size === 40, "40 entregas: nenhuma perdida ou duplicada");
    ok(dt < 4000, `40 entregas: otimização respondeu em ${dt} ms`, dt);
    ok(/economia/.test(m), "40 entregas: informa economia sobre a ordem informada", m);
  }
  ok(t.osrm.estado.tabelas === 1 && t.osrm.estado.rotas === 1, "40 entregas: apenas 1 tabela e 1 rota");
  await t.fechar();

  const t2 = await abrir();
  await prepararBase(t2);
  // Preenche o plano direto no armazenamento (97 válidas) e recarrega, para testar o limite sem 100 envios de formulário
  await t2.pagina.evaluate(() => {
    const ids = JSON.parse(localStorage.getItem("frota-recife-veiculos")).map((v) => v.id);
    const entregas = Array.from({ length: 97 }, (_, i) => ({ id: "x" + i, nome: "P" + (i + 1), lat: -8.05 + 0.0004 * (i % 10) + 0.011 * Math.floor(i / 10) * 0.2, lng: -34.9 + 0.0007 * i, minutos: 2 }));
    localStorage.setItem("frota-recife-viagens", JSON.stringify({ versao: 1, viagens: { [ids[0]]: { coleta: { id: "c", nome: "Fábrica Norte", lat: -8.052, lng: -34.902, minutos: 10 }, entregas, retornarBase: true, otimizar: true } } }));
  });
  await t2.pagina.reload(); await t2.pagina.waitForSelector(".item-veiculo");
  ok(await texto(t2, "#contador-entregas") === "97", "97 entregas restauradas do armazenamento");
  const e98 = await addForm(t2, "P98", -8.2, -34.8, 1);
  ok(e98 && /Limite de 97/.test(e98), "98ª entrega é recusada com mensagem clara", e98);
  const t0 = Date.now();
  await otimizar(t2);
  const dt = Date.now() - t0;
  ok(/heurística/.test(await texto(t2, "#resumo-otimizacao")), "97 entregas + retorno ao galpão: rota calculada por heurística");
  ok(dt < 5000, `97 entregas: resposta em ${dt} ms (UI não travou)`);
  const perc = await lerPercurso(t2);
  ok(perc.length === 97 + 3 && perc[perc.length - 1].includes("Retorno ao galpão"), "97 entregas: percurso termina com retorno ao galpão", perc.length);
  ok(t2.osrm.estado.urls.some((u) => u.includes("/route/")), "97 entregas: rota solicitada (100 coordenadas no limite do serviço)");
  ok(t2.erros.length === 0, "97 entregas: sem erros no console", t2.erros);
  await t2.fechar();
}

// ===================================================================
console.log("\n[6] Destinos em ordem ruim: a otimização acha ordem melhor e confere com força bruta");
{
  const t = await abrir();
  await prepararBase(t);
  // Pontos ao longo de uma linha leste→oeste, inseridos embaralhados
  const pts = [[-8.0525, -34.8700], [-8.0522, -34.9400], [-8.0521, -34.8900], [-8.0523, -34.9250], [-8.0524, -34.9100], [-8.0526, -34.8800], [-8.0520, -34.9500]];
  for (let k = 0; k < pts.length; k++) await addForm(t, "L" + (k + 1), pts[k][0], pts[k][1], 5);
  await clicar(t, "#opt-retorno");
  await otimizar(t);
  const ordem = await lerLista(t);
  const ptsOrd = ordem.map((nome) => pts[Number(nome.slice(1)) - 1]);
  const custoOtim = custoOrdem(COLETA, BASE, ptsOrd, true);
  const custoInf = custoOrdem(COLETA, BASE, pts, true);
  const otimoReal = melhorOrdemForca(COLETA, BASE, pts, true);
  ok(Math.abs(custoOtim - otimoReal) < 1, `ordem do sistema = ótimo por força bruta (${(custoOtim / 60).toFixed(1)} min vs ${(otimoReal / 60).toFixed(1)} min)`);
  ok(custoOtim < custoInf, `melhor que a ordem informada (${(custoInf / 60).toFixed(1)} min → ${(custoOtim / 60).toFixed(1)} min)`);
  ok(/economia de/.test(await texto(t, "#resumo-otimizacao")), "interface mostra a economia", await texto(t, "#resumo-otimizacao"));
  const perc = await lerPercurso(t);
  ok(perc[0].includes("Saída") && perc[1].includes("Coleta") && perc[perc.length - 1].includes("Retorno"), "origem primeiro, coleta antes das entregas, retorno por último");
  // Sem retorno ao galpão: custo diferente e termina na última entrega
  await clicar(t, "#opt-retorno");
  await otimizar(t);
  const ord2 = await lerLista(t);
  const c2 = custoOrdem(COLETA, BASE, ord2.map((n) => pts[Number(n.slice(1)) - 1]), false);
  ok(Math.abs(c2 - melhorOrdemForca(COLETA, BASE, pts, false)) < 1, "sem retorno: também é o ótimo por força bruta");
  const perc2 = await lerPercurso(t);
  ok(!perc2.some((l) => l.includes("Retorno")), "sem retorno: percurso termina na última entrega");
  // Otimização desligada mantém a ordem informada
  await clicar(t, "#opt-otimizar");
  await otimizar(t);
  ok(JSON.stringify(await lerLista(t)) === JSON.stringify(pts.map((_, i) => "L" + (i + 1))), "otimização desligada: mantém a ordem informada");
  ok(/informada/.test(await texto(t, "#resumo-otimizacao")), "otimização desligada: informa que manteve a ordem");
  ok(t.erros.length === 0, "sem erros no console", t.erros);
  await t.fechar();
}

// ===================================================================
console.log("\n[7] Coordenadas inválidas, repetidas e nomes inválidos");
{
  const t = await abrir();
  await prepararBase(t);
  ok(await addForm(t, "Ok 1", -8.04, -34.89, 5) === null, "entrega válida é aceita");
  const casos = [
    ["latitude texto", ["A", "abc", -34.9, 5], /números/],
    ["latitude 95", ["A", 95, -34.9, 5], /fora do intervalo/],
    ["longitude -181", ["A", -8, -181, 5], /fora do intervalo/],
    ["vazio", ["A", "", "", 5], /números/],
    ["nome vazio", ["   ", -8.1, -34.9, 5], /nome/],
    ["nome duplicado", ["ok 1", -8.1, -34.9, 5], /Já existe uma entrega/],
    ["mesmo ponto", ["B", -8.04, -34.89, 5], /já está na lista/],
    ["~1 m de distância", ["B", -8.040001, -34.89, 5], /já está na lista/],
    ["mesmo da coleta", ["B", COLETA[0], COLETA[1], 5], /local de coleta/],
    ["mesmo do galpão", ["B", BASE[0], BASE[1], 5], /galpão/],
    ["minutos negativos", ["B", -8.2, -34.9, -3], /inteiro de 0 a 240/],
    ["minutos texto", ["B", -8.2, -34.9, "xx"], /inteiro de 0 a 240/],
    ["minutos 999", ["B", -8.2, -34.9, 999], /inteiro de 0 a 240/],
    ["nome 61 chars", ["N".repeat(61), -8.2, -34.9, 5], /no máximo 60/]
  ];
  for (const [nome, args, regex] of casos) { const e = await addForm(t, ...args); ok(e && regex.test(e), "recusa: " + nome, e); }
  ok((await lerLista(t)).length === 1, "lista continua com apenas a entrega válida");
  ok(await addForm(t, "Vizinha", -8.0401, -34.89, 5) === null, "destino a ~11 m (legítimo e diferente) é aceito");
  ok(await addForm(t, "Vírgula", "-8,10", "-34,95", 5) === null, "aceita vírgula decimal");
  // Duplo clique no mapa
  await clicar(t, "#btn-mapa-entrega"); t.dialogos.fila.push("Mapa 1", "Mapa 1 repetido");
  await mapClick(t, -8.07, -34.88); await mapClick(t, -8.07, -34.88);
  ok((await lerLista(t)).filter((n) => n.startsWith("Mapa")).length === 1, "clique repetido no mesmo ponto do mapa não cria entrega duplicada");
  ok(await t.pagina.evaluate(() => window.__mapa.doubleClickZoom._on === false), "zoom por duplo clique desativado durante a escolha");
  await t.pagina.keyboard.press("Escape");
  ok(await t.pagina.evaluate(() => window.__mapa.doubleClickZoom._on === true), "Esc encerra a escolha e reativa o zoom");
  // Editar com validação
  await t.pagina.click("text=Editar >> nth=0");
  await t.pagina.fill("#entrega-nome", "Vizinha");
  await clicar(t, "#btn-salvar-entrega");
  ok(/Já existe/.test(await texto(t, "#erro-editor")), "editar para nome já existente é recusado");
  await t.pagina.fill("#entrega-nome", "Renomeada"); await clicar(t, "#btn-salvar-entrega");
  ok((await lerLista(t)).includes("Renomeada") && !(await lerLista(t)).includes("Ok 1"), "editar entrega altera nome mantendo uma só entrega");
  // Remover
  const antes = (await lerLista(t)).length;
  await t.pagina.click("button[aria-label='Remover Renomeada']");
  ok((await lerLista(t)).length === antes - 1 && !(await lerLista(t)).includes("Renomeada"), "remover entrega");
  // Otimizar sem coleta / sem entregas
  ok(t.erros.length === 0, "sem erros no console", t.erros);
  await t.fechar();
  const t2 = await abrir(); await prepararBase(t2, { coleta: false });
  ok(await t2.pagina.isDisabled("#btn-calcular"), "sem coleta e sem entregas: botão Otimizar desabilitado");
  await t2.fechar();
}

// ===================================================================
console.log("\n[8] Falhas e demora do OSRM");
for (const [modo, regex, rotuloEsperado] of [
  ["queda", /Não foi possível falar com o serviço/, "queda de rede"],
  ["429", /requisições demais/, "HTTP 429"],
  ["lixo", /resposta inválida|erro/, "resposta inválida"],
  ["toobig", /pontos demais/, "TooBig"],
  ["semrota", /Sem ligação por estrada/, "sem ligação"],
  ["so-rota-falha", /linha reta|não respondeu/, "tabela ok e rota falha"]
]) {
  const t = await abrir({ osrm: { modo } });
  await prepararBase(t);
  await addForm(t, "A", -8.04, -34.89, 5); await addForm(t, "B", -8.06, -34.91, 5); await addForm(t, "C", -8.03, -34.92, 5);
  await otimizar(t);
  const msg = await texto(t, "#mensagem-rota");
  ok(regex.test(msg), `OSRM ${rotuloEsperado}: mensagem clara`, msg);
  ok(await t.pagina.isVisible("#btn-tentar"), `OSRM ${rotuloEsperado}: botão "Tentar novamente" disponível`);
  if (modo === "queda" || modo === "lixo" || modo === "429") {
    const nota = await t.pagina.isVisible("#resumo-rota") ? await texto(t, "#resumo-nota") : "";
    ok(/linha reta|aproxim/i.test(msg + nota), `OSRM ${rotuloEsperado}: aproximação rotulada como tal (não como rota pelas ruas)`, msg);
    const resumo = await texto(t, "#resumo-numeros");
    ok(/linha reta \(aproximação\)/.test(resumo) && !/pelas ruas/.test(resumo), `OSRM ${rotuloEsperado}: distância rotulada como linha reta`, resumo);
    // Recuperação
    t.osrm.estado.modo = "ok";
    await clicar(t, "#btn-tentar");
    await t.pagina.waitForFunction(() => !document.querySelector("#btn-calcular").disabled && document.querySelector("#mensagem-rota").textContent.includes("otimizada"), null, { timeout: 10000 });
    ok(/pelas ruas/.test(await texto(t, "#resumo-numeros")), `OSRM ${rotuloEsperado}: novo cálculo após o serviço voltar usa as ruas (falha não ficou em cache)`);
  }
  if (modo === "toobig" || modo === "semrota") ok(await t.pagina.isDisabled("#btn-iniciar"), `OSRM ${rotuloEsperado}: não permite iniciar sem rota`);
  ok(t.erros.filter((e) => !/Failed to load resource|net::ERR/.test(e)).length === 0, `OSRM ${rotuloEsperado}: sem exceções no JavaScript`, t.erros);
  await t.fechar();
}
{
  console.log("  (demora: serviço que não responde; aguardando o tempo limite de 20 s…)");
  const t = await abrir({ osrm: { atrasoMs: 25000 } });
  await prepararBase(t);
  await addForm(t, "A", -8.04, -34.89, 5); await addForm(t, "B", -8.06, -34.91, 5);
  const t0 = Date.now();
  await t.pagina.click("#btn-calcular");
  ok(/Calculando/.test(await texto(t, "#mensagem-rota")), "durante a espera: mostra 'Calculando'");
  ok(await t.pagina.isDisabled("#btn-calcular"), "durante a espera: botão desabilitado (sem requisições repetidas)");
  await t.pagina.waitForFunction(() => !document.querySelector("#btn-calcular").disabled, null, { timeout: 40000 });
  const dt = Date.now() - t0;
  ok(dt >= 19000 && dt < 26000, `tempo limite respeitado (~20 s; medido ${(dt / 1000).toFixed(1)} s)`, dt);
  ok(/demorou demais|aproxim|linha reta/.test(await texto(t, "#mensagem-rota")), "demora: mensagem de tempo esgotado", await texto(t, "#mensagem-rota"));
  ok(t.osrm.estado.urls.length <= 1, "demora na tabela não dispara segunda espera de 20 s na rota (rota direta imediata)", t.osrm.estado.urls);
  await t.fechar();
}
{
  console.log("  (requisição antiga invalidada por mudança no plano)");
  const t = await abrir({ osrm: { atrasoMs: 1500 } });
  await prepararBase(t);
  await addForm(t, "A", -8.04, -34.89, 5); await addForm(t, "B", -8.06, -34.91, 5);
  await t.pagina.click("#btn-calcular");
  await addForm(t, "C", -8.03, -34.92, 5);  // botão de adicionar está bloqueado durante cálculo? testar abaixo
  await esperar(4500);
  const lista = await lerLista(t);
  const percurso = await lerPercurso(t);
  ok(!(await t.pagina.isVisible("#resumo-rota")) || percurso.length === lista.length + 2, "resposta antiga não gera rota incoerente com a lista", { lista, percurso });
  ok(t.erros.length === 0, "sem erros", t.erros);
  await t.fechar();
}

// ===================================================================
console.log("\n[9-10] Veículos ativo / manutenção / inativo e CRUD de veículos integrado ao mapa");
{
  const t = await abrir();
  await t.pagina.goto(t.url + "/veiculos.html");
  await t.pagina.waitForSelector("#corpo-veiculos tr");
  ok((await t.pagina.$$("#corpo-veiculos tr")).length === 4, "cadastro inicial mostra 4 veículos");
  // Cadastro: validação de obrigatórios
  await t.pagina.click("#btn-salvar");
  ok(/placa ou o código/.test(await texto(t, "#mensagem-form")), "cadastro sem código é recusado");
  await t.pagina.fill("#codigo", "TST-100"); await t.pagina.click("#btn-salvar");
  ok(/tipo/.test(await texto(t, "#mensagem-form")), "cadastro sem tipo é recusado");
  await t.pagina.fill("#tipo", "Van refrigerada"); await t.pagina.selectOption("#situacao", "Ativo"); await t.pagina.click("#btn-salvar");
  ok(/cadastrado/.test(await texto(t, "#mensagem-form")), "veículo cadastrado");
  await t.pagina.fill("#codigo", "tst-100"); await t.pagina.fill("#tipo", "X"); await t.pagina.click("#btn-salvar");
  ok(/Já existe um veículo com esse código/.test(await texto(t, "#mensagem-form")), "código duplicado (ignorando maiúsculas) é recusado");
  await t.pagina.click("#btn-cancelar").catch(() => {});
  // Veículo em manutenção e outro inativo
  await t.pagina.fill("#codigo", "TST-200"); await t.pagina.fill("#tipo", "Truck"); await t.pagina.selectOption("#situacao", "Em manutenção"); await t.pagina.click("#btn-salvar");
  await t.pagina.fill("#codigo", "TST-300"); await t.pagina.fill("#tipo", "Utilitário"); await t.pagina.selectOption("#situacao", "Inativo"); await t.pagina.click("#btn-salvar");
  ok((await t.pagina.$$("#corpo-veiculos tr")).length === 7, "7 veículos após cadastros");
  // Mapa
  await t.pagina.goto(t.url + "/planejamento.html"); await t.pagina.waitForSelector(".item-veiculo");
  const itens = await t.pagina.$$eval(".item-veiculo", (b) => b.map((x) => ({ t: x.innerText.replace(/\n/g, " | "), d: x.disabled })));
  ok(itens.length === 7, "mapa lista os 7 veículos cadastrados (sem editar dados-demo.js)", itens.length);
  ok(itens.find((i) => i.t.startsWith("TST-100")) && !itens.find((i) => i.t.startsWith("TST-100")).d, "TST-100 (Ativo) selecionável");
  ok(itens.find((i) => i.t.startsWith("TST-200")).d && /Em manutenção/.test(itens.find((i) => i.t.startsWith("TST-200")).t), "TST-200 (Em manutenção) bloqueado e identificado");
  ok(itens.find((i) => i.t.startsWith("TST-300")).d && /Inativo/.test(itens.find((i) => i.t.startsWith("TST-300")).t), "TST-300 (Inativo) bloqueado e identificado");
  ok((await t.pagina.$$eval(".marcador-veiculo", (m) => m.length)) === 7, "7 marcadores no mapa (sem duplicatas)");
  ok(await t.pagina.$$eval(".marcador-veiculo.inativo", (m) => m.length) === 2, "2 marcadores marcados como indisponíveis");
  // Clicar em marcador de veículo indisponível
  await t.pagina.click(".marcador-veiculo.inativo >> nth=0");
  ok(/não pode receber viagens/.test(await texto(t, "#mensagem-rota")), "clique no marcador de veículo indisponível explica o motivo");
  ok((await texto(t, "#dado-codigo")) !== "TST-200" && (await texto(t, "#dado-codigo")) !== "TST-300", "veículo indisponível não foi selecionado");
  // Sincronização com o cadastro sem recarregar: abre o cadastro em outra aba, altera e volta
  const outra = await t.contexto.newPage();
  outra.on("dialog", (d) => d.accept());
  await outra.goto(t.url + "/veiculos.html"); await outra.waitForSelector("#corpo-veiculos tr");
  await outra.click("button[aria-label='Editar TST-200']");
  await outra.selectOption("#situacao", "Ativo"); await outra.fill("#codigo", "TST-200B"); await outra.click("#btn-salvar");
  await t.pagina.waitForFunction(() => [...document.querySelectorAll(".item-veiculo")].some((b) => b.innerText.startsWith("TST-200B") && !b.disabled), null, { timeout: 5000 });
  ok(true, "edição em outra aba: veículo vira Ativo e muda de código no mapa sem recarregar (evento storage)");
  ok((await t.pagina.$$eval(".marcador-veiculo", (m) => m.length)) === 7 && (await t.pagina.$$eval(".marcador-veiculo", (m) => m.some((x) => x.textContent === "TST-200B"))), "marcador atualizado, sem duplicar");
  // Excluir veículo em outra aba: some do mapa
  await outra.click("button[aria-label='Excluir TST-300']"); // confirm aceito pelo handler
  await t.pagina.waitForFunction(() => document.querySelectorAll(".item-veiculo").length === 6, null, { timeout: 5000 });
  ok((await t.pagina.$$eval(".marcador-veiculo", (m) => m.length)) === 6, "exclusão no cadastro remove o veículo e o marcador do mapa");
  // Veículo selecionado fica em manutenção durante a viagem → pausa e seleciona outro
  await t.pagina.click(".item-veiculo >> nth=0");
  const codSel = await texto(t, "#dado-codigo");
  await outra.click(`button[aria-label='Editar ${codSel}']`); await outra.selectOption("#situacao", "Em manutenção"); await outra.click("#btn-salvar");
  await t.pagina.waitForFunction((c) => document.getElementById("dado-codigo").textContent !== c, codSel, { timeout: 5000 });
  ok(true, "veículo selecionado que entra em manutenção deixa de estar selecionado");
  ok(/ficou “Em manutenção”/.test(await texto(t, "#mensagem-rota")), "mensagem informa que o veículo não pode mais receber viagens", await texto(t, "#mensagem-rota"));
  // Todos indisponíveis: mensagem + link para cadastro
  await outra.reload(); await outra.waitForSelector("#corpo-veiculos tr");
  const codigos = await outra.$$eval("#corpo-veiculos tr td:first-child", (c) => c.map((x) => x.textContent));
  for (const c of codigos) { await outra.click(`button[aria-label='Editar ${c}']`); await outra.selectOption("#situacao", "Inativo"); await outra.click("#btn-salvar"); }
  await t.pagina.waitForFunction(() => !document.getElementById("aviso-sem-veiculos").hidden, null, { timeout: 5000 });
  ok(await t.pagina.isVisible("#aviso-sem-veiculos a[href='veiculos.html']"), "sem veículos ativos: mensagem clara com link para o cadastro");
  ok(await t.pagina.isDisabled("#btn-calcular") && await t.pagina.isDisabled("#btn-mapa-coleta") && await t.pagina.isDisabled("#btn-nova-entrega"), "sem veículos ativos: controles de viagem desabilitados");
  ok(t.erros.length === 0 && true, "sem erros no console", t.erros);
  await t.fechar();
}

// ===================================================================
console.log("\n[11] Ocorrências (quebras): cadastro, edição, exclusão, filtro e vínculo com veículos");
{
  const t = await abrir();
  await t.pagina.goto(t.url + "/quebras.html"); await t.pagina.waitForSelector("#veiculo option:nth-child(2)", { state: "attached" });
  const opcoes = await t.pagina.$$eval("#veiculo option", (o) => o.map((x) => ({ v: x.value, t: x.textContent })));
  ok(opcoes.length === 5, "seletor de veículo lista os veículos cadastrados");
  await t.pagina.click("#btn-salvar");
  ok(/veículo cadastrado/.test(await texto(t, "#mensagem-form")), "sem veículo: recusado");
  await t.pagina.selectOption("#veiculo", opcoes[1].v);
  ok(/Tipo:/.test(await texto(t, "#info-veiculo")), "info do veículo exibida");
  await t.pagina.click("#btn-salvar");
  ok(/motivo/.test(await texto(t, "#mensagem-form")), "sem motivo: recusado");
  await t.pagina.fill("#motivo", "Pneu furado");
  await t.pagina.evaluate(() => { const d = document.getElementById("data"); d.removeAttribute("max"); });
  await t.pagina.fill("#data", "2099-01-01"); await t.pagina.click("#btn-salvar");
  ok(/futura/.test(await texto(t, "#mensagem-form")), "data futura recusada");
  await t.pagina.fill("#data", "2026-10-01"); await t.pagina.click("#btn-salvar");
  ok(/registrada/.test(await texto(t, "#mensagem-form")), "ocorrência registrada");
  await t.pagina.selectOption("#veiculo", opcoes[2].v); await t.pagina.fill("#motivo", "Motor"); await t.pagina.fill("#data", "2026-10-05"); await t.pagina.click("#btn-salvar");
  ok((await t.pagina.$$("#corpo-quebras tr")).length === 2, "duas ocorrências no histórico");
  ok((await t.pagina.$$eval("#corpo-quebras tr td:first-child", (c) => c.map((x) => x.textContent)))[0] === "05/10/2026", "ordenado da mais recente e data formatada");
  await t.pagina.selectOption("#filtro-veiculo", opcoes[1].v);
  ok((await t.pagina.$$("#corpo-quebras tr")).length === 1, "filtro por veículo");
  await t.pagina.click("button[aria-label^='Editar quebra']"); await t.pagina.fill("#motivo", "Pneu furado (editado)"); await t.pagina.click("#btn-salvar");
  ok((await t.pagina.$$eval("#corpo-quebras td:nth-child(3)", (c) => c.map((x) => x.textContent))).includes("Pneu furado (editado)"), "edição de ocorrência");
  // veículo vinculado não pode ser excluído
  await t.pagina.goto(t.url + "/veiculos.html"); await t.pagina.waitForSelector("#corpo-veiculos tr");
  const cod = await t.pagina.$$eval("#corpo-veiculos tr td:first-child", (c) => c.map((x) => x.textContent));
  const vinculado = opcoes[1].t.split(" ")[0];
  await t.pagina.click(`button[aria-label='Excluir ${vinculado}']`);
  ok(/tem quebras registradas/.test(await texto(t, "#mensagem-lista")), "exclusão de veículo com ocorrências é impedida");
  ok((await t.pagina.$$("#corpo-veiculos tr")).length === cod.length, "veículo vinculado continua cadastrado");
  // excluir ocorrência e depois o veículo
  await t.pagina.goto(t.url + "/quebras.html"); await t.pagina.waitForSelector("#corpo-quebras tr");
  await t.pagina.selectOption("#filtro-veiculo", opcoes[1].v);
  await t.pagina.click("button[aria-label^='Excluir quebra']");
  ok((await t.pagina.$$("#corpo-quebras tr")).length === 0, "ocorrência excluída");
  await t.pagina.goto(t.url + "/veiculos.html"); await t.pagina.waitForSelector("#corpo-veiculos tr");
  await t.pagina.click(`button[aria-label='Excluir ${vinculado}']`);
  ok(/excluído/.test(await texto(t, "#mensagem-lista")), "sem ocorrências, o veículo pode ser excluído");
  ok(t.erros.length === 0, "sem erros no console", t.erros);
  await t.fechar();
}

// ===================================================================
console.log("\n[12] Dois veículos com percursos diferentes: isolamento e simulações independentes");
{
  const t = await abrir();
  await t.pagina.clock.install();
  await prepararBase(t);
  const cod1 = await texto(t, "#dado-codigo");
  await addForm(t, "A1", -8.04, -34.89, 5); await addForm(t, "A2", -8.03, -34.88, 5); await addForm(t, "A3", -8.02, -34.87, 5);
  await otimizar(t);
  const listaA = await lerLista(t);
  // segundo veículo
  await t.pagina.click(".item-veiculo >> nth=1");
  const cod2 = await texto(t, "#dado-codigo");
  ok(cod2 !== cod1, "segundo veículo selecionado");
  ok((await lerLista(t)).length === 0 && await t.pagina.inputValue("#input-coleta") === "", "veículo 2 começa sem coleta nem entregas (nada vazou do veículo 1)");
  ok(!(await t.pagina.isVisible("#resumo-rota")), "veículo 2 sem resumo de rota");
  await clicar(t, "#btn-mapa-coleta"); t.dialogos.fila.push("Coleta B"); await mapClick(t, -8.07, -34.93);
  await addForm(t, "B1", -8.08, -34.95, 4); await addForm(t, "B2", -8.09, -34.96, 4);
  await otimizar(t);
  const listaB = await lerLista(t);
  ok(listaB.every((n) => n.startsWith("B")) && listaB.length === 2, "veículo 2 só tem suas próprias entregas", listaB);
  // volta ao 1
  await t.pagina.click(".item-veiculo >> nth=0");
  ok(JSON.stringify(await lerLista(t)) === JSON.stringify(listaA), "ao voltar, o veículo 1 mantém a rota e a ordem dele");
  ok((await t.pagina.inputValue("#input-coleta")) === "Fábrica Norte", "veículo 1 mantém a coleta");
  // inicia o 1, troca para o 2, inicia o 2
  await clicar(t, "#btn-iniciar");
  await t.pagina.clock.runFor(3000);
  await t.pagina.click(".item-veiculo >> nth=1");
  ok(/Aguardando início/.test(await texto(t, "#dado-movimento")), "veículo 2 aguardando (independente do 1)");
  await clicar(t, "#btn-iniciar");
  await t.pagina.clock.runFor(3000);
  const rotulos = await t.pagina.$$eval(".item-veiculo", (b) => b.map((x) => x.querySelector(".etiqueta").textContent));
  ok(rotulos[0].includes("Em movimento") && rotulos[1].includes("Em movimento"), "os dois veículos se movem ao mesmo tempo", rotulos);
  // pausar o 2 não pausa o 1
  await clicar(t, "#btn-pausar");
  await t.pagina.clock.runFor(2000);
  const r2 = await t.pagina.$$eval(".item-veiculo", (b) => b.map((x) => x.querySelector(".etiqueta").textContent));
  ok(r2[0].includes("Em movimento") && r2[1].includes("Pausado"), "pausar o veículo 2 não afeta o 1", r2);
  // Resetar o 1 não afeta o 2
  await t.pagina.click(".item-veiculo >> nth=0"); await clicar(t, "#btn-limpar-rota");
  ok((await lerLista(t)).length === 0, "reset do veículo 1 limpa só o plano dele");
  await t.pagina.click(".item-veiculo >> nth=1");
  ok(JSON.stringify(await lerLista(t)) === JSON.stringify(listaB) && /Pausado/.test(await texto(t, "#dado-movimento")), "veículo 2 permanece com plano e pausa");
  ok(t.erros.length === 0, "sem erros no console", t.erros);
  await t.fechar();
}

// ===================================================================
console.log("\n[13-15] Pausa/continuação em deslocamento e em parada; reinício; reset");
{
  const t = await abrir();
  await t.pagina.clock.install();
  await prepararBase(t);
  await addForm(t, "P1", -8.04, -34.89, 10); await addForm(t, "P2", -8.03, -34.87, 10);
  await otimizar(t);
  const posicao = () => t.pagina.evaluate(() => { const m = window.__camadas.find((c) => c._el && c._el.classList.contains("marcador-veiculo") && c._el.classList.contains("selecionado")); return m ? m._pos.slice() : null; });
  const base = await posicao();
  ok(Math.abs(base[0] - (BASE[0])) < 0.001, "antes de iniciar: veículo está na base", base);
  await clicar(t, "#btn-iniciar");
  await t.pagina.clock.runFor(1500);
  const p1 = await posicao();
  ok(p1[0] !== base[0] || p1[1] !== base[1], "veículo se movimenta");
  await clicar(t, "#btn-pausar");
  const pPausa = await posicao();
  await t.pagina.clock.runFor(5000);
  const pDepois = await posicao();
  ok(JSON.stringify(pPausa) === JSON.stringify(pDepois), "pausado em deslocamento: a posição não muda");
  ok(await texto(t, "#btn-iniciar") === "Continuar", "botão vira 'Continuar'");
  await clicar(t, "#btn-iniciar");
  await t.pagina.clock.runFor(300);
  const pRetomada = await posicao();
  const distInicio = Math.hypot(pRetomada[0] - base[0], pRetomada[1] - base[1]);
  const distPausa = Math.hypot(pPausa[0] - base[0], pPausa[1] - base[1]);
  ok(distInicio >= distPausa - 1e-9, "continuar retoma de onde parou (não recomeça da base)", { distInicio, distPausa });
  // Avançar até a primeira parada (coleta)
  let achou = false;
  for (let i = 0; i < 400 && !achou; i++) { await t.pagina.clock.runFor(500); achou = (await texto(t, "#dado-movimento")).startsWith("■"); }
  ok(achou && /Coletando em Fábrica Norte/.test(await texto(t, "#dado-movimento")), "para na coleta primeiro", await texto(t, "#dado-movimento"));
  ok((await lerPercurso(t))[1].startsWith("▶"), "item atual do percurso destacado");
  // Pausa em parada → tempo restante
  await t.pagina.clock.runFor(1500);
  await clicar(t, "#btn-pausar");
  ok(/Pausado/.test(await texto(t, "#dado-movimento")), "pausa durante a parada");
  await t.pagina.clock.runFor(10000);
  ok(/Pausado/.test(await texto(t, "#dado-movimento")), "permanece pausado (não sai da parada sozinho)");
  await clicar(t, "#btn-iniciar");
  ok(/Coletando em/.test(await texto(t, "#dado-movimento")), "continuar após pausa na parada: volta a atender na mesma parada", await texto(t, "#dado-movimento"));
  await t.pagina.clock.runFor(1200);
  ok(/Coletando em/.test(await texto(t, "#dado-movimento")), "ainda no tempo restante da parada (~2,5 s), sem reiniciar do zero nem sair antes");
  await t.pagina.clock.runFor(2000);
  ok(/A caminho de/.test(await texto(t, "#dado-movimento")), "terminada a parada, retoma o movimento rumo à próxima", await texto(t, "#dado-movimento"));
  // Reiniciar durante uma parada seguinte
  for (let i = 0; i < 600 && !(await texto(t, "#dado-movimento")).startsWith("■"); i++) await t.pagina.clock.runFor(500);
  ok(/Atendendo em/.test(await texto(t, "#dado-movimento")), "parou na primeira entrega");
  await clicar(t, "#btn-reiniciar");
  ok(/Aguardando início/.test(await texto(t, "#dado-movimento")), "reiniciar: volta a aguardar início");
  const pReinicio = await posicao();
  ok(Math.hypot(pReinicio[0] - base[0], pReinicio[1] - base[1]) < 1e-6, "reiniciar: veículo volta à base");
  ok((await lerPercurso(t)).slice(1).every((l) => l.startsWith("○")), "reiniciar: todas as paradas voltam a pendentes");
  await t.pagina.clock.runFor(10000);
  ok(/Aguardando início/.test(await texto(t, "#dado-movimento")), "nenhum temporizador antigo continua rodando após reiniciar");
  // Pausar durante a parada e reiniciar
  await clicar(t, "#btn-iniciar");
  for (let i = 0; i < 400 && !(await texto(t, "#dado-movimento")).startsWith("■"); i++) await t.pagina.clock.runFor(500);
  await clicar(t, "#btn-pausar"); await clicar(t, "#btn-reiniciar");
  ok(/Aguardando início/.test(await texto(t, "#dado-movimento")), "pausa em parada + reiniciar: aguardando início");
  await clicar(t, "#btn-iniciar");
  const r = await rodarSimulacao(t);
  ok(r.segundos > 0 && r.vistos.length === 3, "após reiniciar, a viagem completa passa por coleta + 2 entregas", r.vistos);
  // Reset (cancelar e confirmar)
  t.dialogos.fila.push(false);
  await clicar(t, "#btn-limpar-rota");
  ok((await lerLista(t)).length === 2, "reset cancelado na confirmação: nada é apagado");
  await clicar(t, "#btn-limpar-rota");
  ok((await lerLista(t)).length === 0 && (await t.pagina.inputValue("#input-coleta")) === "", "reset confirmado: coleta e entregas limpas");
  ok((await texto(t, "#dado-movimento")).includes("Aguardando viagem"), "reset: estado volta a 'aguardando viagem'");
  ok(await t.pagina.isDisabled("#btn-iniciar") && await t.pagina.isDisabled("#btn-pausar") && await t.pagina.isDisabled("#btn-reiniciar"), "reset: controles de simulação desabilitados");
  ok(!(await t.pagina.isVisible("#resumo-rota")), "reset: resumo escondido");
  const pReset = await posicao();
  ok(Math.hypot(pReset[0] - base[0], pReset[1] - base[1]) < 1e-6, "reset: veículo na base");
  // Novo planejamento
  await clicar(t, "#btn-mapa-coleta"); t.dialogos.fila.push("Nova coleta"); await mapClick(t, -8.055, -34.905);
  await addForm(t, "Nova 1", -8.06, -34.92, 5);
  await otimizar(t);
  ok((await lerPercurso(t)).length === 3, "novo planejamento após o reset funciona");
  const r2 = await rodarSimulacao(t) ; await clicar(t, "#btn-iniciar").catch(() => {});
  ok(t.erros.length === 0, "sem erros no console", t.erros);
  await t.fechar();
}

// ===================================================================
console.log("\n[16] Recarregar a página: recuperação dos dados persistidos");
{
  const t = await abrir();
  await prepararBase(t);
  await addForm(t, "Persistida 1", -8.04, -34.89, 7); await addForm(t, "Persistida 2", -8.03, -34.87, 3);
  await clicar(t, "#opt-retorno");
  await otimizar(t);
  const ordem1 = await lerLista(t);
  await t.pagina.click(".item-veiculo >> nth=1");
  await clicar(t, "#btn-mapa-coleta"); t.dialogos.fila.push("Coleta do 2"); await mapClick(t, -8.07, -34.93);
  await addForm(t, "Outro 1", -8.08, -34.95, 2);
  await t.pagina.reload(); await t.pagina.waitForSelector(".item-veiculo");
  ok((await t.pagina.inputValue("#input-galpao")) === "Galpão Central", "galpão restaurado");
  ok((await t.pagina.$$eval(".marcador-veiculo", (m) => m.length)) === 4, "veículos restaurados sem duplicar marcadores");
  ok((await t.pagina.inputValue("#input-coleta")) === "Fábrica Norte", "coleta do veículo 1 restaurada");
  ok(JSON.stringify((await lerLista(t)).slice().sort()) === JSON.stringify(ordem1.slice().sort()), "entregas do veículo 1 restauradas");
  ok(await t.pagina.isChecked("#opt-retorno"), "opção 'retornar ao galpão' restaurada");
  ok(/Plano salvo restaurado/.test(await texto(t, "#mensagem-rota")), "mensagem explica que é preciso recalcular", await texto(t, "#mensagem-rota"));
  ok(!(await t.pagina.isVisible("#resumo-rota")) && await t.pagina.isDisabled("#btn-iniciar"), "rota não é falsamente tratada como pronta: precisa otimizar de novo");
  await otimizar(t);
  ok(JSON.stringify(await lerLista(t)) === JSON.stringify(ordem1), "reotimizar após recarregar gera a mesma ordem");
  await t.pagina.click(".item-veiculo >> nth=1");
  ok((await t.pagina.inputValue("#input-coleta")) === "Coleta do 2" && JSON.stringify(await lerLista(t)) === JSON.stringify(["Outro 1"]), "plano do veículo 2 restaurado separadamente");
  // Dados antigos preservados
  const chaves = await t.pagina.evaluate(() => Object.keys(localStorage).sort());
  ok(chaves.includes("frota-recife-galpao") && chaves.includes("frota-recife-veiculos"), "chaves antigas preservadas", chaves);
  ok(t.erros.length === 0, "sem erros no console", t.erros);
  await t.fechar();
}

// ===================================================================
console.log("\n[extra] Segurança, dados corrompidos e armazenamento indisponível");
{
  const t = await abrir();
  await prepararBase(t);
  await t.pagina.click("#btn-nova-entrega");
  await t.pagina.fill("#entrega-nome", "<img src=x onerror=window.__xss=1>"); await t.pagina.fill("#entrega-lat", "-8.04"); await t.pagina.fill("#entrega-lng", "-34.89");
  await t.pagina.click("#btn-salvar-entrega");
  await clicar(t, "#btn-mapa-coleta"); t.dialogos.fila.push("<b onclick=window.__xss=2>Coleta</b>"); await mapClick(t, -8.07, -34.93);
  await t.pagina.goto(t.url + "/veiculos.html"); await t.pagina.waitForSelector("#corpo-veiculos tr");
  await t.pagina.fill("#codigo", "<i>X</i>"); await t.pagina.fill("#tipo", "<script>window.__xss=3</script>"); await t.pagina.click("#btn-salvar");
  await t.pagina.goto(t.url + "/planejamento.html"); await t.pagina.waitForSelector(".item-veiculo");
  await t.pagina.click(".item-veiculo:has-text('SIM-001')");
  await esperar(300);
  ok(await t.pagina.evaluate(() => window.__xss === undefined), "textos digitados (entrega, coleta, veículo) não executam HTML/JS");
  ok((await lerLista(t)).includes("<img src=x onerror=window.__xss=1>"), "nome da entrega exibido literalmente como texto");
  ok(await t.pagina.$$eval(".marcador-veiculo", (m) => m.some((x) => x.textContent === "<i>X</i>")), "código do veículo exibido como texto no marcador");
  await t.fechar();

  const c = await abrir();
  await c.pagina.addInitScript(() => { if (!localStorage.getItem("seed")) { localStorage.setItem("seed", "1"); localStorage.setItem("frota-recife-viagens", "{{{quebrado"); localStorage.setItem("frota-recife-galpao", "[1,2"); } });
  await c.pagina.goto(c.url + "/planejamento.html"); await c.pagina.waitForSelector(".item-veiculo");
  const m = await texto(c, "#mensagem-rota");
  ok(/corrompidos|galpão salvo/.test(m), "dados de viagem/galpão corrompidos: mensagem clara, página funciona", m);
  ok((await c.pagina.$$(".item-veiculo")).length === 4, "veículos continuam carregando");
  ok(await c.pagina.evaluate(() => localStorage.getItem("frota-recife-viagens-backup") === "{{{quebrado"), "conteúdo ilegível foi preservado em cópia antes de ser sobrescrito");
  await c.fechar();

  const v = await abrir();
  await v.pagina.addInitScript(() => { if (!localStorage.getItem("seed")) { localStorage.setItem("seed", "1"); localStorage.setItem("frota-recife-veiculos", "não é json"); } });
  await v.pagina.goto(v.url + "/planejamento.html"); await v.pagina.waitForSelector("#lista-veiculos li");
  ok(/corrompidos|Não foi possível ler/.test(await texto(v, "#lista-veiculos")), "cadastro de veículos corrompido: mensagem em vez de tela quebrada", await texto(v, "#lista-veiculos"));
  await v.pagina.goto(v.url + "/veiculos.html"); await v.pagina.waitForSelector("#mensagem-lista:not([hidden])");
  ok(/Não foi possível ler/.test(await texto(v, "#mensagem-lista")), "página de veículos também trata o erro");
  await v.fechar();

  const s = await abrir();
  await s.pagina.addInitScript(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function (k, val) { if (window.__bloquear && k === "frota-recife-viagens") throw new DOMException("cheio", "QuotaExceededError"); return original.call(this, k, val); }; });
  await prepararBase(s);
  await s.pagina.evaluate(() => { window.__bloquear = true; });
  await addForm(s, "Sem espaço", -8.04, -34.89, 5);
  ok(/não pôde ser salvo|não foi possível salvar/i.test(await texto(s, "#mensagem-rota")), "falha de gravação: aviso claro; entrega continua na tela", await texto(s, "#mensagem-rota"));
  ok((await lerLista(s)).includes("Sem espaço"), "entrega permanece na lista apesar da falha de gravação");
  await s.fechar();
}

// ===================================================================
console.log("\n[layout] Tela pequena (celular)");
{
  const t = await abrir({ viewport: { width: 390, height: 800 } });
  await prepararBase(t);
  await addForm(t, "Cel 1", -8.04, -34.89, 5);
  const sobra = await t.pagina.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(sobra <= 1, "sem rolagem horizontal em 390 px de largura", sobra);
  await t.pagina.screenshot({ path: "/home/claude/captura-celular.png", fullPage: false });
  await t.fechar();
  const d = await abrir();
  await prepararBase(d);
  for (let k = 0; k < 4; k++) await addForm(d, "Entrega " + (k + 1), ponto(k)[0], ponto(k)[1], 5);
  await otimizar(d);
  await d.pagina.screenshot({ path: "/home/claude/captura-desktop.png" });
  await d.fechar();
}

console.log(`\n==== ${total - falhas.length}/${total} verificações passaram ====`);
if (falhas.length) { console.log("FALHARAM:\n - " + falhas.join("\n - ")); process.exit(1); }

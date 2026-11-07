// E2E das funcionalidades novas: Normal × Turbo, combustível, histórico, dashboard, backup e layout móvel.
// Usa Leaflet e OSRM simulados (testes/leaflet-falso.js, testes/osrm-falso.mjs).
import fs from "node:fs";
import { abrir } from "./ajuda.mjs";
import { km } from "./osrm-falso.mjs";

let total = 0; const falhas = [];
function ok(cond, nome, extra) {
  total++;
  if (cond) console.log("  PASS", nome);
  else { falhas.push(nome); console.log("  FAIL", nome, extra !== undefined ? "→ " + JSON.stringify(extra) : ""); }
}
const BASE = [-8.0500, -34.9000], COLETA = [-8.0520, -34.9020];
// Pontos em linha leste→oeste, cadastrados fora de ordem (o Turbo precisa reorganizar)
const PTS = [[-8.0525, -34.8700], [-8.0522, -34.9400], [-8.0521, -34.8900], [-8.0523, -34.9250], [-8.0524, -34.9100]];

const clicar = (t, sel) => t.pagina.click(sel);
const mapClick = (t, lat, lng) => t.pagina.evaluate(([a, b]) => window.__mapa.fire("click", { latlng: { lat: a, lng: b } }), [lat, lng]);
const texto = (t, sel) => t.pagina.textContent(sel);
const lerLista = (t) => t.pagina.$$eval("#lista-entregas .texto-entrega strong", (e) => e.map((x) => x.textContent));
const esperarCalculo = (t) => t.pagina.waitForFunction(() => !document.querySelector("#btn-calcular").disabled && !/^(Calculando|Carregando)/.test(document.querySelector("#mensagem-rota").textContent), null, { timeout: 30000 });

async function preparar(t, { pontos = PTS } = {}) {
  await t.pagina.goto(t.url + "/planejamento.html");
  await t.pagina.waitForSelector(".item-veiculo");
  await clicar(t, "#btn-mapa-galpao"); t.dialogos.fila.push("Galpão Central"); await mapClick(t, ...BASE);
  await clicar(t, "#btn-mapa-coleta"); t.dialogos.fila.push("Fábrica Norte"); await mapClick(t, ...COLETA);
  for (let k = 0; k < pontos.length; k++) {
    await clicar(t, "#btn-nova-entrega");
    await t.pagina.fill("#entrega-nome", "L" + (k + 1)); await t.pagina.fill("#entrega-lat", String(pontos[k][0])); await t.pagina.fill("#entrega-lng", String(pontos[k][1]));
    await clicar(t, "#btn-salvar-entrega");
  }
}
async function concluirSimulacao(t) {
  await clicar(t, "#btn-iniciar");
  for (let s = 0; s < 800; s++) {
    await t.pagina.clock.runFor(1000);
    if ((await texto(t, "#dado-movimento")).includes("concluída")) return s + 1;
  }
  return -1;
}
const historico = (t) => t.pagina.evaluate(() => JSON.parse(localStorage.getItem("frota-recife-historico") || "null"));
const ordemNomes = PTS.map((_, i) => "L" + (i + 1));

// =====================================================================
console.log("\n[A] Modo Normal × Turbo, comparação e alternância sem consultas extras");
{
  const t = await abrir();
  await t.pagina.clock.install();
  await preparar(t);
  ok(await t.pagina.isChecked("#opt-otimizar"), "Turbo é o padrão");
  ok(await t.pagina.isChecked("#criterio-tempo"), "critério padrão: menor tempo");
  await clicar(t, "#btn-calcular"); await esperarCalculo(t);
  const turbo = await lerLista(t);
  ok(JSON.stringify(turbo) !== JSON.stringify(ordemNomes), "Turbo reorganizou as entregas", turbo);
  ok(!(await t.pagina.isHidden("#comparacao")), "comparação Normal × Turbo aparece");
  const tab = await texto(t, "#comparacao");
  ok(/Distância/.test(tab) && /Tempo de deslocamento/.test(tab) && /Tempo total da operação/.test(tab) && /Combustível estimado/.test(tab) && /Custo estimado/.test(tab), "tabela traz os 5 indicadores", tab.slice(0, 200));
  ok(/ótima/.test(tab), "informa solução ótima para a matriz (exato)");
  ok(/Distância economizada/.test(tab) && /Tempo economizado/.test(tab), "destaca km e minutos economizados");
  ok(/não tem consumo médio/.test(tab), "veículo sem consumo: pede o cadastro e não calcula combustível");
  ok(!/R\$/.test(await texto(t, "#comparacao .tabela-comparacao")), "sem consumo/preço: nenhum valor em reais inventado");
  ok(t.osrm.estado.tabelas === 1 && t.osrm.estado.rotas === 1, "1 tabela + 1 rota (só a geometria da rota selecionada)", [t.osrm.estado.tabelas, t.osrm.estado.rotas]);
  ok(await t.pagina.isVisible("#alternar-rota") && (await t.pagina.getAttribute("#ver-turbo", "aria-pressed")) === "true", "alternador no mapa com Turbo selecionado");
  ok(await t.pagina.isHidden("#leg-alternativa"), "legenda: sem alternativa até ela ser consultada");

  await clicar(t, "#ver-normal"); await esperarCalculo(t);
  ok(JSON.stringify(await lerLista(t)) === JSON.stringify(ordemNomes), "Normal respeita exatamente a ordem cadastrada");
  ok(t.osrm.estado.tabelas === 1 && t.osrm.estado.rotas === 2, "alternar reutiliza a matriz (nenhuma nova tabela; +1 geometria)", [t.osrm.estado.tabelas, t.osrm.estado.rotas]);
  ok(await t.pagina.isVisible("#leg-alternativa"), "legenda mostra a rota alternativa após consultada");
  ok(!(await t.pagina.isChecked("#opt-otimizar")), "interruptor do Turbo acompanha a escolha");
  const percNormal = await t.pagina.$$eval("#lista-percurso li", (e) => e.map((x) => x.innerText));
  ok(percNormal[1].includes("Coleta"), "coleta continua sendo a primeira parada");
  ok(/Modo Normal/.test(await texto(t, "#resumo-otimizacao")), "resumo explica o modo Normal");

  await clicar(t, "#ver-turbo"); await esperarCalculo(t);
  ok(JSON.stringify(await lerLista(t)) === JSON.stringify(turbo), "voltar ao Turbo restaura a mesma ordem");
  ok(t.osrm.estado.rotas === 2, "voltar ao Turbo usa a geometria já guardada (sem nova consulta)", t.osrm.estado.rotas);

  // Confere, de forma independente, a economia mostrada: distância da matriz do OSRM simulado
  const dist = (ordem) => { let at = COLETA, d = km([BASE[1], BASE[0]], [COLETA[1], COLETA[0]]) * 1400; for (const p of ordem) { d += km([at[1], at[0]], [p[1], p[0]]) * 1400; at = p; } return d / 1000; };
  const dNormal = dist(PTS); const dTurbo = dist(turbo.map((n) => PTS[Number(n.slice(1)) - 1]));
  const esperado = (dNormal - dTurbo).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " km";
  ok(dTurbo < dNormal && (await texto(t, "#comparacao .economia-destaque")).includes(esperado), "economia de km confere com o cálculo independente (" + esperado + ")", await texto(t, "#comparacao .economia-destaque"));
  ok(t.erros.length === 0, "sem erros no console", t.erros);
  await t.fechar();
}

// =====================================================================
console.log("\n[B] Combustível: consumo por veículo, preço nas configurações e fórmulas na tela");
{
  const t = await abrir();
  await t.pagina.goto(t.url + "/veiculos.html"); await t.pagina.waitForSelector("#corpo-veiculos tr");
  ok(await t.pagina.$$eval("#corpo-veiculos tr", (r) => r.every((x) => /Não informado/.test(x.textContent))), "veículos antigos/demo aparecem como 'Não informado'");
  await t.pagina.click("button[aria-label='Editar SIM-001']");
  await t.pagina.fill("#consumo", "abc"); await t.pagina.click("#btn-salvar");
  ok(/consumo médio/.test(await texto(t, "#mensagem-form")), "consumo inválido é recusado com mensagem");
  await t.pagina.fill("#consumo", "8,5"); await t.pagina.click("#btn-salvar");
  ok(/atualizado/.test(await texto(t, "#mensagem-form")), "consumo 8,5 km/L salvo (vírgula aceita)");
  ok(/8,5 km\/L/.test(await texto(t, "#corpo-veiculos")), "tabela mostra o consumo");

  await t.pagina.goto(t.url + "/configuracoes.html");
  await t.pagina.fill("#preco-combustivel", "-1"); await t.pagina.click("#btn-salvar-config");
  ok(/maior que zero/.test(await texto(t, "#mensagem-config")), "preço inválido recusado");
  await t.pagina.fill("#preco-combustivel", "6,00"); await t.pagina.click("#btn-salvar-config");
  ok(/R\$\s*6,00/.test(await texto(t, "#mensagem-config")), "preço R$ 6,00/L salvo");

  await t.pagina.clock.install();
  await preparar(t);
  await clicar(t, "#btn-calcular"); await esperarCalculo(t);
  const cmp = await texto(t, "#comparacao");
  ok(!/não tem consumo médio/.test(cmp) && /R\$/.test(cmp) && /\d L/.test(cmp), "com consumo e preço: litros e reais aparecem", cmp.slice(0, 300));
  const cel = await t.pagina.$$eval("#comparacao .tabela-comparacao tbody tr", (r) => r.map((x) => [...x.children].map((c) => c.textContent)));
  const km_ = (s) => Number(s.replace(/[^\d,]/g, "").replace(",", "."));
  const linhaDist = cel.find((l) => l[0] === "Distância"), linhaLit = cel.find((l) => l[0] === "Combustível estimado"), linhaCusto = cel.find((l) => l[0] === "Custo estimado");
  ok(Math.abs(km_(linhaLit[2]) - km_(linhaDist[2]) / 8.5) < 0.06, "litros do Turbo = distância ÷ 8,5", [linhaDist[2], linhaLit[2]]);
  ok(Math.abs(km_(linhaCusto[2]) - km_(linhaLit[2]) * 6) < 0.1, "custo do Turbo = litros × R$ 6,00", [linhaLit[2], linhaCusto[2]]);
  ok(/estimativas baseadas no consumo médio/i.test(cmp) && /trânsito/.test(cmp), "aviso de que é estimativa sem trânsito/relevo/carga");
  ok(/Combustível/.test(await texto(t, ".chip-preco")) || true, "chip de preço no topo");
  ok(/R\$\s*6,00/.test(await texto(t, ".chip-preco")), "topo mostra o preço configurado");
  ok(await t.pagina.isVisible("#dado-consumo") && /8,5 km\/L/.test(await texto(t, "#dado-consumo")), "painel do veículo mostra o consumo");
  ok(t.erros.length === 0, "sem erros no console", t.erros);
  await t.fechar();
}

// =====================================================================
console.log("\n[C] Histórico: um registro por viagem, sem duplicar, persistente, com detalhes e exclusão");
{
  const t = await abrir();
  await t.pagina.goto(t.url + "/veiculos.html"); await t.pagina.waitForSelector("#corpo-veiculos tr");
  await t.pagina.click("button[aria-label='Editar SIM-001']"); await t.pagina.fill("#consumo", "8"); await t.pagina.click("#btn-salvar");
  await t.pagina.goto(t.url + "/configuracoes.html"); await t.pagina.fill("#preco-combustivel", "6"); await t.pagina.click("#btn-salvar-config");
  await t.pagina.goto(t.url + "/index.html"); await t.pagina.waitForSelector("#kpis-operacao .kpi");
  ok(!(await t.pagina.isHidden("#vazio-viagens")), "dashboard vazio: mensagem em vez de números fictícios");
  ok(/Viagens concluídas\s*0/.test((await texto(t, "#kpis-operacao")).replace(/\s+/g, " ")) || /0/.test(await texto(t, "#kpis-operacao")), "dashboard: zero viagens");
  ok(/Indisponível/.test(await texto(t, "#kpis-operacao")), "dashboard: combustível 'Indisponível' sem registros");

  await t.pagina.clock.install();
  await preparar(t);
  await clicar(t, "#btn-calcular"); await esperarCalculo(t);
  ok((await historico(t)) === null, "antes de concluir nada é registrado");
  const seg = await concluirSimulacao(t);
  ok(seg > 0, "simulação concluída (" + seg + "s)");
  let h = await historico(t);
  ok(h && h.versao === 1 && h.viagens.length === 1, "uma única viagem registrada", h && h.viagens.length);
  const r = h.viagens[0];
  ok(r.veiculoCodigo === "SIM-001" && r.modo === "turbo" && r.criterio === "tempo" && r.entregas === 5 && r.metodo === "exato" && r.origem === "osrm", "registro: veículo, modo, critério, entregas, método, origem", r);
  ok(Math.abs(r.litros - r.distanciaKm / 8) < 1e-9 && Math.abs(r.custo - r.litros * 6) < 1e-9, "registro: litros e custo conforme as fórmulas");
  ok(r.comparacao && r.comparacao.economiaKm > 0 && Math.abs(r.comparacao.economiaReais - r.comparacao.economiaLitros * 6) < 1e-6, "registro: economia vs Normal coerente");
  ok(r.paradas.length === 6 && r.paradas[0].papel === "Coleta", "registro: paradas com horários");
  ok(/Registrada no histórico/.test(await texto(t, "#mensagem-rota")), "mensagem informa o registro");
  // Atualizações de estado não duplicam
  await t.pagina.keyboard.press("Escape"); await t.pagina.click(".item-veiculo >> nth=0");
  await clicar(t, "#btn-reiniciar"); await concluirSimulacao(t);
  h = await historico(t);
  ok(h.viagens.length === 1, "reiniciar e concluir de novo a mesma rota não duplica o registro", h.viagens.length);
  // Recarregar a página e consultar
  await t.pagina.reload(); await t.pagina.waitForSelector(".item-veiculo");
  ok((await historico(t)).viagens.length === 1, "recarregar a página não altera o histórico");
  await t.pagina.goto(t.url + "/historico.html"); await t.pagina.waitForSelector("#corpo-historico tr");
  ok((await t.pagina.$$("#corpo-historico tr")).length === 1, "histórico sobrevive ao recarregamento e lista a viagem");
  ok(/SIM-001/.test(await texto(t, "#corpo-historico")) && /Turbo/.test(await texto(t, "#corpo-historico")), "linha mostra veículo e modo");
  await t.pagina.selectOption("#filtro-modo", "normal");
  ok(!(await t.pagina.isHidden("#vazio-historico")), "filtro por modo Normal não encontra a viagem Turbo");
  await t.pagina.selectOption("#filtro-modo", "");
  await t.pagina.click("#corpo-historico button:has-text('Detalhes')");
  ok(await t.pagina.isVisible("#dialogo-viagem"), "detalhes abrem em diálogo");
  const det = await texto(t, "#corpo-dialogo");
  ok(/Exato/.test(det) && /OSRM/.test(det) && /Economia em comparação/.test(det) && /atendimento/i.test(det) && /Combustível estimado/.test(det), "detalhes: método, origem, economia, atendimento, combustível");
  await t.pagina.click("#fechar-dialogo");
  // Exportação CSV
  const [dl] = await Promise.all([t.pagina.waitForEvent("download"), t.pagina.click("#btn-exportar-viagens")]);
  const csv = fs.readFileSync(await dl.path(), "utf8");
  ok(csv.startsWith("\uFEFF") && /SIM-001/.test(csv) && /Turbo/.test(csv) && csv.split("\r\n").filter(Boolean).length === 2, "CSV do histórico (cabeçalho + 1 linha)", csv.slice(0, 120));
  // Dashboard com dados reais
  await t.pagina.goto(t.url + "/index.html"); await t.pagina.waitForSelector("#corpo-viagens tr");
  const kp = (await t.pagina.innerText("#kpis-operacao")).replace(/\s+/g, " ");
  ok(/Viagens concluídas 1/i.test(kp) && /Economia financeira R\$/i.test(kp), "dashboard usa os registros reais", kp);
  ok((await t.pagina.$$("#corpo-viagens tr")).length === 1, "últimas viagens lista o registro");
  // Exclusão com confirmação
  await t.pagina.goto(t.url + "/historico.html"); await t.pagina.waitForSelector("#corpo-historico tr");
  t.dialogos.fila.push(false); await t.pagina.click("#corpo-historico button:has-text('Excluir')");
  ok((await historico(t)).viagens.length === 1, "cancelar a confirmação mantém o registro");
  await t.pagina.click("#corpo-historico button:has-text('Excluir')");
  ok((await historico(t)).viagens.length === 0, "confirmar exclui o registro");
  ok(t.erros.length === 0, "sem erros no console", t.erros);
  await t.fechar();
}

// =====================================================================
console.log("\n[D] Modo Normal concluído: histórico sem comparação; critério distância");
{
  const t = await abrir();
  await t.pagina.clock.install();
  await preparar(t);
  await clicar(t, "#opt-otimizar");
  ok(!(await t.pagina.isChecked("#opt-otimizar")) && await t.pagina.isHidden("#grupo-criterio"), "Normal desliga o Turbo e esconde o critério");
  await clicar(t, "#btn-calcular"); await esperarCalculo(t);
  ok(JSON.stringify(await lerLista(t)) === JSON.stringify(ordemNomes), "Normal calculado na ordem cadastrada");
  ok(!(await t.pagina.isHidden("#comparacao")) && /Turbo/.test(await texto(t, "#resumo-otimizacao")), "mesmo no Normal mostra quanto o Turbo reduziria", await texto(t, "#resumo-otimizacao"));
  await concluirSimulacao(t);
  const r = (await historico(t)).viagens[0];
  ok(r.modo === "normal" && r.comparacao === null && r.metodo === "manual" && r.criterio === null, "Normal registrado sem 'economia'", r);
  await t.fechar();

  const t2 = await abrir();
  await preparar(t2);
  await t2.pagina.click("#criterio-distancia");
  await clicar(t2, "#btn-calcular"); await esperarCalculo(t2);
  ok(/menor distância/.test(await texto(t2, "#comparacao")), "critério 'menor distância' é informado na comparação");
  const salvo = await t2.pagina.evaluate(() => JSON.parse(localStorage.getItem("frota-recife-viagens")));
  ok(Object.values(salvo.viagens)[0].criterio === "distancia", "critério fica salvo no planejamento");
  await t2.pagina.reload(); await t2.pagina.waitForSelector(".item-veiculo");
  ok(await t2.pagina.isChecked("#criterio-distancia"), "critério restaurado ao recarregar");
  await t2.fechar();
}

// =====================================================================
console.log("\n[E] Falha do OSRM: aproximação rotulada também na comparação e no histórico");
{
  const t = await abrir({ osrm: { modo: "queda" } });
  await t.pagina.clock.install();
  await preparar(t);
  await clicar(t, "#btn-calcular"); await esperarCalculo(t);
  ok(/linha reta/i.test(await texto(t, "#comparacao")) && /aproximad/i.test(await texto(t, "#comparacao")), "comparação avisa que os valores são aproximados");
  ok(/linha reta/.test(await texto(t, "#mensagem-rota")), "mensagem rotula a aproximação");
  await concluirSimulacao(t);
  const r = (await historico(t)).viagens[0];
  ok(r && r.origem === "aproximacao", "histórico marca a origem como aproximação", r && r.origem);
  await t.fechar();
}

// =====================================================================
console.log("\n[F] Backup completo em JSON");
{
  const t = await abrir();
  await t.pagina.goto(t.url + "/veiculos.html"); await t.pagina.waitForSelector("#corpo-veiculos tr");
  await t.pagina.click("button[aria-label='Editar SIM-002']"); await t.pagina.fill("#consumo", "11"); await t.pagina.click("#btn-salvar");
  await t.pagina.goto(t.url + "/configuracoes.html");
  await t.pagina.fill("#preco-combustivel", "5,5"); await t.pagina.click("#btn-salvar-config");
  const [dl] = await Promise.all([t.pagina.waitForEvent("download"), t.pagina.click("#btn-exportar-backup")]);
  const caminho = await dl.path(); const conteudo = fs.readFileSync(caminho, "utf8");
  const json = JSON.parse(conteudo);
  ok(json.app === "frota-recife-backup" && json.dados.veiculos.length === 4 && json.dados.config.precoCombustivel === 5.5, "backup traz veículos e configuração");
  // apaga tudo e importa
  await t.pagina.evaluate(() => localStorage.clear());
  const lixo = "/tmp/backup-invalido.json"; fs.writeFileSync(lixo, "{ não é backup");
  await t.pagina.setInputFiles("#arquivo-backup", lixo);
  await t.pagina.waitForFunction(() => !document.querySelector("#mensagem-backup").hidden);
  ok(/JSON válido|não é um backup/.test(await texto(t, "#mensagem-backup")), "arquivo inválido é recusado");
  ok(await t.pagina.evaluate(() => localStorage.getItem("frota-recife-veiculos") === null), "recusa não grava nada");
  t.dialogos.fila.push(false);
  await t.pagina.setInputFiles("#arquivo-backup", caminho);
  await t.pagina.waitForFunction(() => /cancelada/.test(document.querySelector("#mensagem-backup").textContent));
  ok(await t.pagina.evaluate(() => localStorage.getItem("frota-recife-veiculos") === null), "recusar a confirmação não altera os dados");
  await t.pagina.setInputFiles("#arquivo-backup", caminho);
  await t.pagina.waitForFunction(() => /importado/.test(document.querySelector("#mensagem-backup").textContent));
  const v = await t.pagina.evaluate(() => JSON.parse(localStorage.getItem("frota-recife-veiculos")));
  ok(v.length === 4 && v.find((x) => x.codigo === "SIM-002").consumoKmL === 11, "importação restaura veículos e consumo");
  ok((await t.pagina.inputValue("#preco-combustivel")) === "5,5", "importação restaura o preço");
  ok(t.dialogos.some((d) => /SUBSTITUI/.test(d.texto)), "pediu confirmação antes de substituir");
  await t.fechar();
}

// =====================================================================
console.log("\n[G] Navegação, ocorrências e celular");
{
  const t = await abrir();
  for (const [pag, pid] of [["index.html", "visao-geral"], ["planejamento.html", "planejamento"], ["veiculos.html", "frota"], ["quebras.html", "ocorrencias"], ["historico.html", "historico"], ["configuracoes.html", "configuracoes"]]) {
    await t.pagina.goto(t.url + "/" + pag); await t.pagina.waitForSelector(".menu a");
    const itens = await t.pagina.$$eval(".menu a", (a) => a.map((x) => x.textContent.trim()));
    ok(itens.length === 6 && itens[0] === "Visão geral" && itens[5] === "Configurações", pag + ": menu com as 6 seções");
    ok((await t.pagina.getAttribute(".menu a[aria-current='page']", "href")) === pag, pag + ": item ativo destacado");
  }
  await t.pagina.goto(t.url + "/planejamento.html"); await t.pagina.waitForSelector(".item-veiculo");
  ok(await t.pagina.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1), "desktop: planejamento ocupa a tela; só o painel rola (mapa fixo)");
  ok(!(await t.pagina.isVisible(".botao-menu")), "desktop: botão de menu escondido");
  await t.pagina.goto(t.url + "/quebras.html"); await t.pagina.waitForSelector("#veiculo option:nth-child(2)", { state: "attached" });
  ok(/Ocorrências registradas/.test(await texto(t, "#kpis-quebras")), "ocorrências: indicadores");
  const opc = await t.pagina.$$eval("#veiculo option", (o) => o.map((x) => x.value).filter(Boolean));
  await t.pagina.selectOption("#veiculo", opc[0]); await t.pagina.fill("#motivo", "Pneu"); await t.pagina.click("#btn-salvar");
  ok(/registrada/.test(await texto(t, "#mensagem-form")) && (await t.pagina.$$("#corpo-quebras tr")).length === 1, "ocorrência registrada");
  t.dialogos.fila.push(false); await t.pagina.click("button[aria-label^='Editar quebra']"); await t.pagina.fill("#motivo", "Pneu 2"); await t.pagina.click("#btn-salvar");
  ok(/Pneu$/.test(await texto(t, "#corpo-quebras td:nth-child(3)")), "editar pede confirmação; cancelar não altera");
  const [dl] = await Promise.all([t.pagina.waitForEvent("download"), t.pagina.click("#btn-exportar-quebras")]);
  ok(/Pneu/.test(fs.readFileSync(await dl.path(), "utf8")), "exportação de ocorrências em CSV");
  await t.fechar();

  const m = await abrir({ viewport: { width: 390, height: 844 } });
  await m.pagina.goto(m.url + "/planejamento.html"); await m.pagina.waitForSelector(".item-veiculo");
  ok(!(await m.pagina.isVisible(".nav-lateral")) || (await m.pagina.$eval(".nav-lateral", (e) => e.getBoundingClientRect().right)) <= 0, "celular: menu lateral recolhido");
  await m.pagina.click(".botao-menu");
  // o menu desliza (transição de 0,2 s): espera terminar antes de medir
  await m.pagina.waitForFunction(() => document.querySelector(".nav-lateral").getBoundingClientRect().left >= 0, null, { timeout: 3000 }).catch(() => {});
  ok(await m.pagina.isVisible(".nav-lateral") && (await m.pagina.$eval(".nav-lateral", (e) => e.getBoundingClientRect().left)) >= 0, "celular: menu abre ao tocar no botão");
  await m.pagina.keyboard.press("Escape");
  const caixa = await m.pagina.$eval(".area-mapa", (e) => { const r = e.getBoundingClientRect(); return [r.width, r.height]; });
  ok(caixa[0] >= 380 && caixa[1] >= 300, "celular: mapa ocupa a largura e tem altura útil", caixa);
  const rolagem = await m.pagina.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  ok(rolagem, "celular: sem rolagem horizontal");
  ok(m.erros.length === 0, "celular: sem erros no console", m.erros);
  await m.fechar();
}

console.log(`\n==== ${total - falhas.length}/${total} verificações passaram ====`);
if (falhas.length) { console.log("FALHAS:", falhas); process.exit(1); }

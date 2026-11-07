// Testes de ponta a ponta da pesquisa de locais (Geoapify) no Chromium, com Geoapify, OSRM e Leaflet SIMULADOS.
// Não substituem um teste manual com a chave real. Execute: node testes/pesquisa.mjs
import { abrir, esperar } from "./ajuda.mjs";
import { criarGeoapifyFalso } from "./geoapify-falso.mjs";

let total = 0; const falhas = [];
function ok(cond, nome, extra) {
  total++;
  if (cond) console.log("  PASS", nome);
  else { falhas.push(nome); console.log("  FAIL", nome, extra !== undefined ? "→ " + JSON.stringify(extra) : ""); }
}

const CHAVE_TESTE = "chave-de-teste";
const BASE = [-8.05, -34.9];

// Abre o planejamento com Geoapify falso. opcoes.chave: texto | null (arquivo config.local.js inexistente).
async function iniciar({ chave = CHAVE_TESTE, modo = "ok", atrasoPorTexto, relogio = false, osrm } = {}) {
  const t = await abrir({ osrm });
  t.geo = criarGeoapifyFalso({ modo, atrasoPorTexto });
  t.relogio = relogio;
  await t.contexto.route("**/api.geoapify.com/**", t.geo.tratar);
  await t.contexto.route("**/js/config.local.js", (r) => (chave === null
    ? r.fulfill({ status: 404, contentType: "text/plain", body: "não encontrado" })
    : r.fulfill({ contentType: "text/javascript", body: `export const GEOAPIFY_API_KEY = ${JSON.stringify(chave)};` })));
  if (relogio) await t.pagina.clock.install();
  await t.pagina.goto(t.url + "/planejamento.html");
  await t.pagina.waitForSelector(".item-veiculo");
  return t;
}

const lista = (id) => `#${id} ~ .busca-lista`;
const status = (id) => `#${id} ~ .busca-status`;
const opcoes = (t, id) => t.pagina.$$eval(`${lista(id)} .busca-opcao`, (e) => e.map((x) => ({ titulo: x.querySelector(".busca-titulo").textContent, endereco: (x.querySelector(".busca-endereco") || {}).textContent || "" })));
const listaAberta = (t, id) => t.pagina.isVisible(lista(id));
const textoStatus = async (t, id) => (await t.pagina.isVisible(status(id))) ? (await t.pagina.textContent(status(id))).trim() : "";

// Digita tecla a tecla (como uma pessoa) e espera a lista de sugestões (ou o estado final).
async function pesquisar(t, id, texto, { esperarLista = true } = {}) {
  await t.pagina.click("#" + id);
  await t.pagina.fill("#" + id, "");
  await t.pagina.type("#" + id, texto, { delay: 25 });
  if (t.relogio) await t.pagina.clock.runFor(450);
  if (esperarLista) await t.pagina.waitForSelector(`${lista(id)}:not([hidden]) .busca-opcao`, { timeout: 5000 });
}
const escolherPorClique = async (t, id, indice = 0) => { await t.pagina.click(`${lista(id)} .busca-opcao >> nth=${indice}`); };

const mapClick = (t, lat, lng) => t.pagina.evaluate(([a, b]) => window.__mapa.fire("click", { latlng: { lat: a, lng: b } }), [lat, lng]);
const lerStorage = (t, chave) => t.pagina.evaluate((c) => JSON.parse(localStorage.getItem(c)), chave);
const visao = (t) => t.pagina.evaluate(() => window.__mapa._ultimaVisao);
const entregasLista = (t) => t.pagina.$$eval("#lista-entregas .texto-entrega", (e) => e.map((x) => ({ nome: x.querySelector("strong").textContent, det: x.querySelector("small").textContent })));
// Pontos hoje desenhados no mapa (grupos ligados ao mapa): círculos (galpão/coleta) e numerados (entregas).
const pontosNoMapa = (t) => t.pagina.evaluate(() => {
  const grupos = [...window.__mapa._camadas].filter((c) => c.tipo === "grupo");
  return grupos.flatMap((g) => g._itens).map((p) => ({
    tipo: p.tipo === "circulo" ? "circulo" : "numerado",
    pos: p._pos.slice(),
    rotulo: p.tipo === "circulo" ? p._tip.conteudo.textContent : p.options.title
  }));
});
const habilitado = (t, id) => t.pagina.isEnabled("#" + id);

async function definirGalpaoPorMapa(t, nome = "Galpão Central") {
  await t.pagina.click("#btn-mapa-galpao"); t.dialogos.fila.push(nome); await mapClick(t, ...BASE);
}
async function definirGalpaoPorPesquisa(t, texto, indice = 0) {
  await pesquisar(t, "busca-galpao", texto); await escolherPorClique(t, "busca-galpao", indice);
}

// ===================================================================
console.log("\n[Teste 1] Pesquisa de estabelecimento: \"Shopping Recife\"");
{
  const t = await iniciar();
  ok(!(await habilitado(t, "busca-coleta")) && !(await habilitado(t, "busca-entrega")), "antes do galpão: pesquisa de coleta e entrega desabilitadas (mesma regra dos botões do mapa)");
  ok(await habilitado(t, "busca-galpao"), "pesquisa do galpão disponível desde o início");
  await t.pagina.click("#busca-galpao");
  ok(/pelo menos 3 caracteres/.test(await textoStatus(t, "busca-galpao")), "estado campo vazio: dica de 3 caracteres");
  await t.pagina.type("#busca-galpao", "Sh", { delay: 20 });
  await esperar(600);
  ok(t.geo.estado.requisicoes.length === 0, "com 2 caracteres não há requisição");
  await t.pagina.fill("#busca-galpao", "");
  await t.pagina.type("#busca-galpao", "Shopping Recife", { delay: 25 });
  await t.pagina.waitForSelector(`${lista("busca-galpao")}:not([hidden]) .busca-opcao`);
  ok(t.geo.estado.requisicoes.length === 1, "digitar 15 teclas gera UMA requisição (debounce)", t.geo.estado.requisicoes.length);
  const r = t.geo.estado.requisicoes[0];
  ok(r.texto === "Shopping Recife", "texto enviado", r.texto);
  ok(r.params.format === "json" && r.params.lang === "pt" && r.params.limit === "5" && r.params.filter === "countrycode:br", "parâmetros format, lang, limit e filter");
  ok(r.params.apiKey === CHAVE_TESTE, "usa a chave de config.local.js");
  ok(r.params.bias === "proximity:-34.9,-8.05", "sem galpão: proximidade no centro de Recife (longitude antes de latitude)", r.params.bias);
  const ops = await opcoes(t, "busca-galpao");
  ok(ops.length === 5, "no máximo 5 sugestões (havia mais locais compatíveis)", ops.length);
  ok(ops[0].titulo === "Shopping Recife" && ops[0].endereco.startsWith("Rua Padre Carapuceiro, 777"), "cada resultado mostra nome e endereço", ops[0]);
  ok(await t.pagina.getAttribute("#busca-galpao", "aria-expanded") === "true" && await t.pagina.getAttribute("#busca-galpao", "role") === "combobox", "ARIA: combobox expandido");
  ok(await t.pagina.$eval(lista("busca-galpao"), (e) => e.getAttribute("role")) === "listbox", "ARIA: listbox");
  ok(t.erros.length === 0, "sem erros no console", t.erros);
  await t.fechar();
}

console.log("\n[Teste 2] Seleção de estabelecimento → marcador e mapa (galpão)");
{
  const t = await iniciar();
  await definirGalpaoPorPesquisa(t, "Shopping Recife");
  ok(!(await listaAberta(t, "busca-galpao")), "lista fechada depois da seleção");
  ok(await t.pagina.inputValue("#busca-galpao") === "Shopping Recife", "o campo recebe o nome do local escolhido");
  ok(await t.pagina.inputValue("#input-galpao") === "Shopping Recife", "campo do galpão do sistema atualizado");
  const g = await lerStorage(t, "frota-recife-galpao");
  ok(g && g.nome === "Shopping Recife" && g.lat === -8.1189 && g.lng === -34.9054, "galpão salvo no formato antigo { nome, lat, lng }", g);
  ok(Object.keys(g).sort().join() === "lat,lng,nome", "formato do LocalStorage do galpão não mudou");
  const pts = await pontosNoMapa(t);
  const marcador = pts.find((p) => p.tipo === "circulo" && p.rotulo.includes("Shopping Recife"));
  ok(marcador && marcador.pos[0] === -8.1189 && marcador.pos[1] === -34.9054, "marcador do galpão na posição do estabelecimento", marcador);
  const v = await visao(t);
  ok(v && v.tipo === "view" && v.c[0] === -8.1189 && v.c[1] === -34.9054, "mapa centralizado no local", v);
  ok(/Selecionado: Shopping Recife, Rua Padre Carapuceiro/.test(await textoStatus(t, "busca-galpao")), "endereço completo mostrado como confirmação");
  ok(await habilitado(t, "busca-coleta") && await habilitado(t, "busca-entrega"), "galpão definido: coleta e entrega liberadas");
  ok(t.erros.length === 0, "sem erros no console", t.erros);
  await t.fechar();
}

console.log("\n[Teste 3] Endereço comum (avenida e endereço residencial)");
{
  const t = await iniciar();
  await definirGalpaoPorMapa(t);
  await pesquisar(t, "busca-entrega", "Avenida Boa Viagem");
  const ops = await opcoes(t, "busca-entrega");
  ok(ops.length === 1 && ops[0].titulo === "Avenida Boa Viagem", "avenida encontrada", ops);
  const r = t.geo.estado.requisicoes[0];
  ok(r.params.bias === "proximity:-34.9,-8.05", "com galpão definido, a proximidade usa o galpão", r.params.bias);
  await escolherPorClique(t, "busca-entrega");
  let e = await entregasLista(t);
  ok(e.length === 1 && e[0].nome === "Avenida Boa Viagem" && e[0].det.startsWith("-8.12390, -34.90060"), "coordenadas da avenida recuperadas", e);
  await pesquisar(t, "busca-entrega", "Rua do Futuro 100");
  await escolherPorClique(t, "busca-entrega");
  e = await entregasLista(t);
  ok(e.length === 2 && e[1].nome === "Rua do Futuro, 100" && e[1].det.startsWith("-8.04760, -34.87700"), "endereço residencial recuperado", e);
  await t.fechar();
}

console.log("\n[Teste 4] Três tipos de localização: galpão, coleta e entrega");
{
  const t = await iniciar();
  await definirGalpaoPorPesquisa(t, "Shopping Recife");
  await pesquisar(t, "busca-coleta", "Padaria Pão Quente");
  await escolherPorClique(t, "busca-coleta");
  ok(await t.pagina.inputValue("#input-coleta") === "Padaria Pão Quente", "coleta definida pela pesquisa");
  await pesquisar(t, "busca-entrega", "Marco Zero");
  await escolherPorClique(t, "busca-entrega");
  const viagens = await lerStorage(t, "frota-recife-viagens");
  const plano = Object.values(viagens.viagens)[0];
  ok(viagens.versao === 1 && plano.coleta && plano.coleta.nome === "Padaria Pão Quente" && plano.coleta.lat === -8.0501 && plano.coleta.minutos === 10, "coleta salva com tempo padrão de coleta", plano.coleta);
  ok(plano.entregas.length === 1 && plano.entregas[0].nome === "Marco Zero" && plano.entregas[0].minutos === 5, "entrega salva com tempo padrão de atendimento", plano.entregas);
  ok(Object.keys(plano.coleta).sort().join() === "id,lat,lng,minutos,nome" && Object.keys(plano.entregas[0]).sort().join() === "id,lat,lng,minutos,nome", "formato dos pontos no LocalStorage não mudou");
  const g = await lerStorage(t, "frota-recife-galpao");
  ok(g.nome === "Shopping Recife", "a pesquisa da coleta/entrega não alterou o galpão", g);
  const pts = await pontosNoMapa(t);
  ok(pts.some((p) => p.tipo === "circulo" && p.rotulo === "Coleta: Padaria Pão Quente"), "marcador da coleta no mapa");
  ok(pts.some((p) => p.tipo === "numerado" && p.rotulo === "1. Marco Zero"), "marcador da entrega no mapa");
  ok(/Entrega adicionada: Marco Zero \(1 na lista\)/.test(await t.pagina.textContent("#mensagem-rota")), "mensagem do fluxo existente reaproveitada");
  await t.fechar();
}

console.log("\n[Teste 5] Várias entregas: cada marcador fica ligado ao seu ponto; os outros não mudam");
{
  const t = await iniciar();
  await definirGalpaoPorMapa(t);
  const alvos = [["Shopping RioMar", "Shopping RioMar Recife", -8.0864, -34.8948], ["Aeroporto Internacional", "Aeroporto Internacional do Recife/Guararapes - Gilberto Freyre", -8.1265, -34.9233], ["Marco Zero", "Marco Zero", -8.063, -34.8711], ["Shopping Tacaruna", "Shopping Tacaruna", -8.0344, -34.8734]];
  const antes = [];
  for (const [busca, nome, lat, lng] of alvos) {
    await pesquisar(t, "busca-entrega", busca);
    await escolherPorClique(t, "busca-entrega");
    const atual = await entregasLista(t);
    ok(antes.every((a, i) => atual[i].nome === a.nome && atual[i].det === a.det), `adicionar "${nome.slice(0, 22)}…" não altera as entregas anteriores`);
    antes.splice(0, antes.length, ...atual);
    ok(atual[atual.length - 1].nome === nome.slice(0, 60) || atual[atual.length - 1].nome.startsWith(nome.slice(0, 20)), "nova entrega no fim da lista", atual[atual.length - 1].nome);
  }
  const pts = (await pontosNoMapa(t)).filter((p) => p.tipo === "numerado");
  ok(pts.length === 4, "4 marcadores numerados", pts.length);
  alvos.forEach(([, nome, lat, lng], i) => {
    const m = pts.find((p) => p.pos[0] === lat && p.pos[1] === lng);
    ok(m && m.rotulo.startsWith((i + 1) + ". "), `marcador ${i + 1} está nas coordenadas de ${nome.slice(0, 25)}`, m);
  });
  const nomes = (await entregasLista(t)).map((e) => e.nome);
  ok(nomes[1].length <= 60 && nomes[1].endsWith("…"), "nome longo é abreviado para o limite de 60 caracteres do sistema", nomes[1]);
  await t.fechar();
}

console.log("\n[Teste 5b] Regras existentes continuam valendo para locais pesquisados");
{
  const t = await iniciar();
  await definirGalpaoPorMapa(t);
  await pesquisar(t, "busca-entrega", "Marco Zero"); await escolherPorClique(t, "busca-entrega");
  await pesquisar(t, "busca-entrega", "Marco Zero"); await escolherPorClique(t, "busca-entrega");
  ok(/Já existe uma entrega chamada “Marco Zero”/.test(await textoStatus(t, "busca-entrega")), "duplicada: erro de validação mostrado junto ao campo", await textoStatus(t, "busca-entrega"));
  ok((await entregasLista(t)).length === 1, "duplicada não é adicionada");
  // Enter duas vezes seguidas após escolher não duplica
  await pesquisar(t, "busca-entrega", "Padaria");
  await t.pagina.keyboard.press("ArrowDown"); await t.pagina.keyboard.press("Enter"); await t.pagina.keyboard.press("Enter");
  await esperar(300);
  ok((await entregasLista(t)).length === 2, "Enter repetido não adiciona duas vezes", (await entregasLista(t)).length);
  await t.fechar();
}

console.log("\n[Teste 6] Otimização com pontos pesquisados (Normal e Turbo)");
{
  const t = await iniciar();
  await definirGalpaoPorPesquisa(t, "Shopping Recife");
  await pesquisar(t, "busca-coleta", "Padaria Pão Quente"); await escolherPorClique(t, "busca-coleta");
  for (const b of ["Shopping RioMar", "Aeroporto Internacional", "Marco Zero", "Shopping Tacaruna", "Avenida Boa Viagem"]) {
    await pesquisar(t, "busca-entrega", b); await escolherPorClique(t, "busca-entrega");
  }
  ok(await t.pagina.isEnabled("#btn-calcular"), "Otimizar rota habilitado");
  await t.pagina.click("#btn-calcular");
  await t.pagina.waitForFunction(() => !document.querySelector("#btn-calcular").disabled && !document.querySelector("#mensagem-rota").textContent.startsWith("Calculando"), null, { timeout: 30000 });
  ok(await t.pagina.isVisible("#comparacao"), "comparação Normal × Turbo exibida");
  ok(t.osrm.estado.tabelas === 1, "uma única consulta de matriz ao OSRM", t.osrm.estado.tabelas);
  const percurso = await t.pagina.$$eval("#lista-percurso li", (e) => e.length);
  ok(percurso === 5 + 2, "percurso: saída + coleta + 5 entregas", percurso);
  const turbo = await t.pagina.textContent("#mensagem-rota");
  ok(/Turbo otimizada/.test(turbo), "Turbo otimiza (solução exata para ≤ 15)", turbo);
  await t.pagina.click("#ver-normal");
  await t.pagina.waitForFunction(() => document.querySelector("#ver-normal").getAttribute("aria-pressed") === "true");
  ok(await t.pagina.isVisible("#comparacao"), "alternar para Normal funciona");
  ok(t.erros.length === 0, "sem erros no console", t.erros);
  await t.fechar();
}

console.log("\n[Teste 7] Simulação com pontos pesquisados");
{
  const t = await iniciar({ relogio: true });
  await definirGalpaoPorPesquisa(t, "Shopping Recife");
  await pesquisar(t, "busca-coleta", "Padaria Pão Quente"); await escolherPorClique(t, "busca-coleta");
  for (const b of ["Marco Zero", "Shopping Tacaruna"]) { await pesquisar(t, "busca-entrega", b); await escolherPorClique(t, "busca-entrega"); }
  await t.pagina.click("#btn-calcular");
  await t.pagina.waitForFunction(() => !document.querySelector("#btn-calcular").disabled && !document.querySelector("#mensagem-rota").textContent.startsWith("Calculando"), null, { timeout: 30000 });
  await t.pagina.click("#btn-iniciar");
  let concluida = false;
  for (let s = 0; s < 900 && !concluida; s++) {
    await t.pagina.clock.runFor(1000);
    concluida = (await t.pagina.textContent("#dado-movimento")).includes("concluída");
  }
  ok(concluida, "simulação percorre todos os pontos pesquisados e conclui");
  const hist = await lerStorage(t, "frota-recife-historico");
  ok(hist && hist.viagens.length === 1 && hist.viagens[0].entregas === 2, "viagem registrada no histórico", hist && hist.viagens.length);
  const nomes = hist.viagens[0].paradas.map((p) => p.nome);
  ok(nomes.includes("Padaria Pão Quente") && nomes.includes("Marco Zero") && nomes.includes("Shopping Tacaruna"), "histórico guarda os nomes dos locais pesquisados", nomes);
  await t.fechar();
}

console.log("\n[Teste 8] Sem chave / falha de conexão: marcar no mapa continua funcionando");
{
  // 8a — arquivo config.local.js inexistente
  const t = await iniciar({ chave: null });
  await definirGalpaoPorMapa(t);
  ok(await t.pagina.inputValue("#input-galpao") === "Galpão Central", "sem chave: galpão pelo mapa funciona");
  await t.pagina.click("#busca-entrega");
  await t.pagina.waitForFunction(() => /não está configurada/.test((document.querySelector("#busca-entrega ~ .busca-status") || {}).textContent || ""));
  ok(/não está configurada \(falta a chave da Geoapify\)/.test(await textoStatus(t, "busca-entrega")), "estado: chave de API não configurada");
  await t.pagina.type("#busca-entrega", "Marco Zero", { delay: 20 });
  await esperar(700);
  ok(t.geo.estado.requisicoes.length === 0, "sem chave: nenhuma requisição à Geoapify");
  ok(/não está configurada/.test(await textoStatus(t, "busca-entrega")), "aviso permanece enquanto digita");
  await t.pagina.click("#btn-mapa-entrega"); t.dialogos.fila.push("Cliente Mapa"); await mapClick(t, -8.06, -34.89);
  ok((await entregasLista(t)).some((e) => e.nome === "Cliente Mapa"), "sem chave: entrega pelo mapa continua funcionando");
  await t.pagina.click("#btn-nova-entrega");
  await t.pagina.fill("#entrega-nome", "Cliente Form"); await t.pagina.fill("#entrega-lat", "-8,07"); await t.pagina.fill("#entrega-lng", "-34,88");
  await t.pagina.click("#btn-salvar-entrega");
  ok((await entregasLista(t)).length === 2, "sem chave: entrega por coordenadas continua funcionando");
  await t.pagina.click("#btn-mapa-coleta"); t.dialogos.fila.push("Coleta Mapa"); await mapClick(t, -8.052, -34.902);
  ok(await t.pagina.inputValue("#input-coleta") === "Coleta Mapa", "sem chave: coleta pelo mapa continua funcionando");
  await t.pagina.click("#btn-calcular");
  await t.pagina.waitForFunction(() => !document.querySelector("#btn-calcular").disabled && !document.querySelector("#mensagem-rota").textContent.startsWith("Calculando"), null, { timeout: 30000 });
  ok(await t.pagina.isVisible("#comparacao"), "sem chave: otimização continua funcionando");
  ok(t.erros.filter((e) => !/Failed to load resource|404/.test(e)).length === 0, "sem exceções de JavaScript (o 404 do arquivo opcional é esperado)", t.erros);
  await t.fechar();
}
{
  // 8b — modelo de chave não preenchido
  const t = await iniciar({ chave: "COLE_SUA_CHAVE_AQUI" });
  await t.pagina.click("#busca-galpao");
  await t.pagina.waitForFunction(() => /não está configurada/.test((document.querySelector("#busca-galpao ~ .busca-status") || {}).textContent || ""));
  ok(true, "chave de exemplo não preenchida também é tratada como não configurada");
  await t.fechar();
}
{
  // 8c — queda de conexão
  const t = await iniciar({ modo: "queda" });
  await definirGalpaoPorMapa(t);
  await pesquisar(t, "busca-entrega", "Marco Zero", { esperarLista: false });
  await t.pagina.waitForSelector(`${status("busca-entrega")} button`);
  ok(/Sem conexão/.test(await textoStatus(t, "busca-entrega")), "estado: erro de conexão", await textoStatus(t, "busca-entrega"));
  ok(!(await listaAberta(t, "busca-entrega")), "erro: lista fechada");
  t.geo.estado.modo = "ok";
  await t.pagina.click(`${status("busca-entrega")} button`);
  await t.pagina.waitForSelector(`${lista("busca-entrega")}:not([hidden]) .busca-opcao`);
  ok((await opcoes(t, "busca-entrega"))[0].titulo === "Marco Zero", "'Tentar novamente' refaz a consulta e funciona");
  await t.pagina.keyboard.press("Escape");
  await t.pagina.click("#btn-mapa-entrega"); t.dialogos.fila.push("Cliente Mapa"); await mapClick(t, -8.06, -34.89);
  ok((await entregasLista(t)).length === 1, "após falha de conexão, o mapa continua funcionando");
  await t.fechar();
}
{
  // 8d — limite excedido (429) e chave recusada (401), resposta inválida, nenhum resultado
  const t = await iniciar({ modo: "429" });
  await definirGalpaoPorMapa(t);
  await pesquisar(t, "busca-entrega", "Marco Zero", { esperarLista: false });
  await t.pagina.waitForFunction(() => /Limite de consultas/.test((document.querySelector("#busca-entrega ~ .busca-status") || {}).textContent || ""));
  ok(true, "estado: limite de requisições excedido (HTTP 429)");
  const n = t.geo.estado.requisicoes.length;
  await pesquisar(t, "busca-entrega", "Marco Zero 2", { esperarLista: false });
  await esperar(700);
  ok(t.geo.estado.requisicoes.length === n, "durante a pausa do 429 não há novas requisições", t.geo.estado.requisicoes.length - n);
  await t.fechar();
  const t2 = await iniciar({ modo: "401" });
  await t2.pagina.click("#btn-mapa-galpao");
  await pesquisar(t2, "busca-galpao", "Marco Zero", { esperarLista: false });
  await t2.pagina.waitForFunction(() => /recusou a chave/.test((document.querySelector("#busca-galpao ~ .busca-status") || {}).textContent || ""));
  ok(true, "estado: chave recusada (HTTP 401)");
  await t2.fechar();
  const t3 = await iniciar({ modo: "lixo" });
  await pesquisar(t3, "busca-galpao", "Marco Zero", { esperarLista: false });
  await t3.pagina.waitForFunction(() => /inesperado/.test((document.querySelector("#busca-galpao ~ .busca-status") || {}).textContent || ""));
  ok(true, "resposta inválida tratada sem quebrar");
  ok(t3.erros.filter((e) => !/Failed to load resource/.test(e)).length === 0, "sem exceções de JavaScript", t3.erros);
  await t3.fechar();
  const t4 = await iniciar();
  await pesquisar(t4, "busca-galpao", "zzzzqq", { esperarLista: false });
  await t4.pagina.waitForFunction(() => /Nenhum local encontrado/.test((document.querySelector("#busca-galpao ~ .busca-status") || {}).textContent || ""));
  ok(!(await listaAberta(t4, "busca-galpao")), "estado: nenhum resultado (sem lista aberta)");
  await t4.fechar();
}

console.log("\n[Teste 9] Persistência após recarregar");
{
  const t = await iniciar();
  await definirGalpaoPorPesquisa(t, "Shopping Recife");
  await pesquisar(t, "busca-coleta", "Padaria Pão Quente"); await escolherPorClique(t, "busca-coleta");
  for (const b of ["Marco Zero", "Shopping RioMar"]) { await pesquisar(t, "busca-entrega", b); await escolherPorClique(t, "busca-entrega"); }
  const antes = await entregasLista(t);
  await t.pagina.reload();
  await t.pagina.waitForSelector(".item-veiculo");
  ok(await t.pagina.inputValue("#input-galpao") === "Shopping Recife", "galpão pesquisado persiste");
  ok(await t.pagina.inputValue("#input-coleta") === "Padaria Pão Quente", "coleta pesquisada persiste");
  const depois = await entregasLista(t);
  ok(JSON.stringify(depois) === JSON.stringify(antes) && depois.length === 2, "entregas pesquisadas persistem com as mesmas coordenadas", depois);
  const pts = await pontosNoMapa(t);
  ok(pts.filter((p) => p.tipo === "numerado").length === 2, "marcadores restaurados");
  ok(await t.pagina.inputValue("#busca-entrega") === "", "campos de pesquisa começam vazios depois de recarregar");
  await t.fechar();
}
{
  // Compatibilidade: dados gravados ANTES da pesquisa continuam lidos
  const t = await iniciar();
  await t.pagina.evaluate(() => {
    localStorage.setItem("frota-recife-galpao", JSON.stringify({ nome: "Galpão Antigo", lat: -8.05, lng: -34.9 }));
    localStorage.setItem("frota-recife-viagens", JSON.stringify({ versao: 1, viagens: { v1: { coleta: { id: "c1", nome: "Coleta Antiga", lat: -8.052, lng: -34.902, minutos: 10 }, entregas: [{ id: "e1", nome: "Entrega Antiga", lat: -8.06, lng: -34.89, minutos: 5 }], retornarBase: false, otimizar: true } } }));
  });
  await t.pagina.reload(); await t.pagina.waitForSelector(".item-veiculo");
  ok(await t.pagina.inputValue("#input-galpao") === "Galpão Antigo" && (await entregasLista(t)).length === 1, "planejamento criado antes da pesquisa continua reconhecido");
  await pesquisar(t, "busca-entrega", "Marco Zero"); await escolherPorClique(t, "busca-entrega");
  const nomes = (await entregasLista(t)).map((e) => e.nome);
  ok(nomes.join() === "Entrega Antiga,Marco Zero", "entrega pesquisada soma-se à antiga sem alterá-la", nomes);
  await t.fechar();
}

console.log("\n[Teclado e acessibilidade]");
{
  const t = await iniciar();
  await definirGalpaoPorMapa(t);
  await pesquisar(t, "busca-entrega", "Shopping");
  await t.pagina.keyboard.press("ArrowDown");
  const ativoId = await t.pagina.getAttribute("#busca-entrega", "aria-activedescendant");
  ok(ativoId && await t.pagina.getAttribute("#" + ativoId, "aria-selected") === "true", "ArrowDown destaca a primeira opção (aria-activedescendant)");
  await t.pagina.keyboard.press("ArrowDown");
  await t.pagina.keyboard.press("ArrowUp");
  ok(await t.pagina.getAttribute("#busca-entrega", "aria-activedescendant") === ativoId, "ArrowUp volta à opção anterior");
  await t.pagina.keyboard.press("ArrowUp");
  ok((await t.pagina.getAttribute("#busca-entrega", "aria-activedescendant")) !== ativoId, "ArrowUp na primeira dá a volta para a última");
  await t.pagina.keyboard.press("Escape");
  ok(!(await listaAberta(t, "busca-entrega")), "Esc fecha a lista");
  ok(await t.pagina.getAttribute("#busca-entrega", "aria-expanded") === "false", "aria-expanded volta a false");
  await t.pagina.keyboard.press("ArrowDown");
  ok(await listaAberta(t, "busca-entrega"), "ArrowDown reabre a lista (sem nova requisição)");
  ok(t.geo.estado.requisicoes.length === 1, "reabrir não repete a consulta", t.geo.estado.requisicoes.length);
  await t.pagina.keyboard.press("ArrowDown");
  await t.pagina.keyboard.press("Enter");
  ok(!(await listaAberta(t, "busca-entrega")) && (await entregasLista(t)).length === 1, "Enter escolhe a opção destacada e fecha a lista");
  await pesquisar(t, "busca-entrega", "Marco");
  await t.pagina.keyboard.press("Tab");
  ok(!(await listaAberta(t, "busca-entrega")), "Tab fecha a lista");
  ok(await t.pagina.getAttribute("#busca-entrega", "aria-autocomplete") === "list" && !!(await t.pagina.getAttribute("#busca-entrega", "aria-controls")), "ARIA: aria-autocomplete e aria-controls");
  ok(await t.pagina.$eval("label[for=busca-entrega]", (l) => l.textContent.length > 0), "campo tem rótulo associado");
  ok(await t.pagina.$eval("#busca-entrega ~ .busca-status", (e) => e.getAttribute("role") === "status"), "mensagens em região role=status");
  // Mouse: clicar numa opção com o foco no campo
  await pesquisar(t, "busca-entrega", "Padaria");
  await escolherPorClique(t, "busca-entrega");
  ok((await entregasLista(t)).length === 2, "clique do mouse escolhe a opção");
  ok(t.erros.length === 0, "sem erros no console", t.erros);
  await t.fechar();
}

console.log("\n[Esc na pesquisa não cancela a escolha no mapa; Esc sem lista continua cancelando]");
{
  const t = await iniciar();
  await definirGalpaoPorMapa(t);
  await t.pagina.click("#btn-mapa-entrega");
  await pesquisar(t, "busca-entrega", "Marco");
  await t.pagina.keyboard.press("Escape");
  ok(await t.pagina.evaluate(() => window.__mapa.doubleClickZoom._on === false), "Esc com lista aberta fecha só a lista (modo mapa continua)");
  await t.pagina.keyboard.press("Escape");
  ok(await t.pagina.evaluate(() => window.__mapa.doubleClickZoom._on === true), "Esc sem lista cancela o modo mapa (comportamento antigo)");
  await t.fechar();
}

console.log("\n[Respostas antigas e consultas canceladas]");
{
  const t = await iniciar({ atrasoPorTexto: { "Shopping Tacaruna": 1200 } });
  await t.pagina.click("#busca-galpao");
  await t.pagina.type("#busca-galpao", "Shopping Tacaruna", { delay: 20 });
  await esperar(550);   // a consulta lenta já saiu
  await t.pagina.fill("#busca-galpao", "");
  await t.pagina.type("#busca-galpao", "Marco Zero", { delay: 20 });
  await t.pagina.waitForSelector(`${lista("busca-galpao")}:not([hidden]) .busca-opcao`);
  await esperar(1500);   // tempo para a resposta antiga chegar
  const ops = await opcoes(t, "busca-galpao");
  ok(ops.length === 1 && ops[0].titulo === "Marco Zero", "resposta antiga (mais lenta) não sobrescreve a consulta nova", ops);
  ok(t.geo.estado.requisicoes.length === 2, "duas consultas no total", t.geo.estado.requisicoes.length);
  await t.fechar();
}
{
  // Mesma consulta no mesmo lugar: usa a lista já obtida
  const t = await iniciar();
  await pesquisar(t, "busca-galpao", "Marco Zero");
  await t.pagina.keyboard.press("Escape");
  await t.pagina.click("#busca-coleta", { force: true }).catch(() => {});
  await t.pagina.click("#busca-galpao");
  await t.pagina.keyboard.press("End");
  await t.pagina.type("#busca-galpao", " ", { delay: 10 }); await t.pagina.keyboard.press("Backspace");
  await esperar(700);
  ok(t.geo.estado.requisicoes.length === 1, "mesmo texto e região não geram requisição repetida", t.geo.estado.requisicoes.length);
  await t.fechar();
}

console.log("\n[Editor de entrega: pesquisa preenche o formulário e o salvamento segue o fluxo normal]");
{
  const t = await iniciar();
  await definirGalpaoPorMapa(t);
  await t.pagina.click("#btn-nova-entrega");
  await pesquisar(t, "busca-editor", "Marco Zero");
  await t.pagina.keyboard.press("ArrowDown");
  await t.pagina.keyboard.press("Enter");
  ok(await t.pagina.inputValue("#entrega-nome") === "Marco Zero" && await t.pagina.inputValue("#entrega-lat") === "-8.063000" && await t.pagina.inputValue("#entrega-lng") === "-34.871100", "nome e coordenadas preenchidos sem digitar");
  ok(await t.pagina.isVisible("#form-entrega"), "Enter na pesquisa não salvou nem fechou o formulário");
  ok((await entregasLista(t)).length === 0, "nada foi adicionado antes de salvar");
  await t.pagina.click("#btn-salvar-entrega");
  ok((await entregasLista(t)).map((e) => e.nome).join() === "Marco Zero", "Salvar entrega usa o fluxo de validação existente");
  // Editar uma entrega existente trocando o local por pesquisa
  await t.pagina.click("text=Editar >> nth=0");
  ok(await t.pagina.inputValue("#busca-editor") === "", "campo de pesquisa do editor abre limpo");
  await pesquisar(t, "busca-editor", "Shopping Tacaruna");
  await escolherPorClique(t, "busca-editor");
  await t.pagina.click("#btn-salvar-entrega");
  const e = await entregasLista(t);
  ok(e.length === 1 && e[0].nome === "Shopping Tacaruna" && e[0].det.startsWith("-8.03440, -34.87340"), "edição de entrega trocando o local por pesquisa", e);
  await t.fechar();
}

console.log("\n[Galpão: confirmação existente quando há rotas calculadas]");
{
  const t = await iniciar();
  await definirGalpaoPorMapa(t);
  await pesquisar(t, "busca-coleta", "Padaria"); await escolherPorClique(t, "busca-coleta");
  await pesquisar(t, "busca-entrega", "Marco Zero"); await escolherPorClique(t, "busca-entrega");
  await t.pagina.click("#btn-calcular");
  await t.pagina.waitForFunction(() => !document.querySelector("#btn-calcular").disabled && !document.querySelector("#mensagem-rota").textContent.startsWith("Calculando"), null, { timeout: 30000 });
  t.dialogos.fila.push(false);
  await pesquisar(t, "busca-galpao", "Shopping Recife"); await escolherPorClique(t, "busca-galpao");
  ok(t.dialogos.some((d) => d.tipo === "confirm" && /Mudar o galpão cancela as rotas/.test(d.texto)), "a confirmação de troca de galpão é exibida");
  ok((await lerStorage(t, "frota-recife-galpao")).nome === "Galpão Central", "recusando a confirmação, o galpão não muda");
  ok(await t.pagina.isVisible("#resumo-rota"), "rota calculada preservada (resumo continua visível)");
  t.dialogos.fila.push(true);
  await pesquisar(t, "busca-galpao", "Shopping Recife"); await escolherPorClique(t, "busca-galpao");
  ok((await lerStorage(t, "frota-recife-galpao")).nome === "Shopping Recife", "aceitando, o galpão é trocado pelo local pesquisado");
  const plano = Object.values((await lerStorage(t, "frota-recife-viagens")).viagens)[0];
  ok(plano.entregas.length === 1 && plano.coleta.nome === "Padaria Pão Quente", "entregas e coleta mantidas ao trocar o galpão");
  await t.fechar();
}

console.log("\n[Trocar de veículo e resetar viagem limpam os campos de pesquisa de coleta/entrega]");
{
  const t = await iniciar();
  await definirGalpaoPorMapa(t);
  await pesquisar(t, "busca-entrega", "Marco Zero"); await escolherPorClique(t, "busca-entrega");
  ok(await t.pagina.inputValue("#busca-entrega") === "Marco Zero", "campo mantém o nome após adicionar");
  t.dialogos.fila.push(true);
  await t.pagina.click("#btn-limpar-rota");
  ok(await t.pagina.inputValue("#busca-entrega") === "" && (await entregasLista(t)).length === 0, "resetar viagem limpa o campo e as entregas");
  await t.fechar();
}

console.log("\n[Celular (390 px)]");
{
  const t = await abrir({ viewport: { width: 390, height: 800 } });
  t.geo = criarGeoapifyFalso();
  await t.contexto.route("**/api.geoapify.com/**", t.geo.tratar);
  await t.contexto.route("**/js/config.local.js", (r) => r.fulfill({ contentType: "text/javascript", body: `export const GEOAPIFY_API_KEY = "x";` }));
  await t.pagina.goto(t.url + "/planejamento.html"); await t.pagina.waitForSelector(".item-veiculo");
  await pesquisar(t, "busca-galpao", "Shopping");
  const caixa = await t.pagina.$eval(lista("busca-galpao"), (e) => { const r = e.getBoundingClientRect(); return { esq: r.left, dir: r.right, larg: window.innerWidth }; });
  ok(caixa.esq >= 0 && caixa.dir <= caixa.larg, "lista de sugestões cabe na largura da tela", caixa);
  ok(await t.pagina.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "sem rolagem horizontal");
  await t.fechar();
}

console.log(falhas.length ? `\n==== ${falhas.length} FALHA(S) de ${total} ====\n- ${falhas.join("\n- ")}` : `\n==== ${total}/${total} verificações passaram ====`);
process.exit(falhas.length ? 1 : 0);

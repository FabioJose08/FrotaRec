// Visão geral: indicadores calculados com os registros reais (veículos e histórico).

import { listarVeiculos, listarQuebras } from "./dados.js";
import { carregarHistorico } from "./historico.js";
import { lerConfiguracoes } from "./configuracoes.js";
import { calcularIndicadores } from "./dashboard.js";
import { formatarKm } from "./geo.js";
import { formatarLitros, formatarReais } from "./combustivel.js";
import { pegar, mostrarMensagem, criarElemento, criarKpi, textoDataHora, textoEconomiaViagem, textoDuracaoViagem } from "./ui.js";

function desenharKpis(ind) {
  const frota = pegar("kpis-frota");
  frota.append(
    criarKpi("Veículos cadastrados", String(ind.totalVeiculos), "na frota"),
    criarKpi("Ativos", String(ind.ativos), "disponíveis para viagens"),
    criarKpi("Em manutenção", String(ind.emManutencao), "bloqueados no planejamento"),
    criarKpi("Inativos", String(ind.inativos), "fora de operação")
  );

  const op = pegar("kpis-operacao");
  op.append(
    criarKpi("Viagens concluídas", String(ind.viagensConcluidas), ind.viagensConcluidas ? "simulações finalizadas" : "nenhuma ainda"),
    criarKpi("Distância percorrida", formatarKm(ind.kmPercorridos), "soma das viagens concluídas")
  );
  op.append(ind.litrosEstimados === null
    ? criarKpi("Combustível estimado", "Indisponível", "cadastre o consumo médio dos veículos", "indisponivel")
    : criarKpi("Combustível estimado", formatarLitros(ind.litrosEstimados), ind.viagensSemCombustivel ? ind.viagensSemCombustivel + " viagem(ns) sem consumo cadastrado ficaram de fora" : "estimativa pelo consumo médio"));
  op.append(ind.economiaLitros === null
    ? criarKpi("Economia de combustível", "Sem dados", "requer viagem Turbo e consumo cadastrado", "indisponivel")
    : criarKpi("Economia de combustível", formatarLitros(ind.economiaLitros), "Turbo em relação ao Normal", ind.economiaLitros > 0 ? "economia" : undefined));
  op.append(ind.economiaReais === null
    ? criarKpi("Economia financeira", "Sem dados", "requer consumo e preço do litro", "indisponivel")
    : criarKpi("Economia financeira", formatarReais(ind.economiaReais), "estimada com o preço da época", ind.economiaReais > 0 ? "economia" : undefined));
}

function desenharFrota(ind) {
  const barra = pegar("barra-frota");
  const legenda = pegar("legenda-frota");
  const total = ind.totalVeiculos;
  const partes = [["seg-ativo", ind.ativos, "Ativos", "#059669"], ["seg-manutencao", ind.emManutencao, "Em manutenção", "#F59E0B"], ["seg-inativo", ind.inativos, "Inativos", "#94A3B8"]];
  partes.forEach(([classe, n, rotulo, cor]) => {
    if (total > 0 && n > 0) { const s = criarElemento("span", classe); s.style.width = (n / total * 100) + "%"; barra.appendChild(s); }
    const item = criarElemento("span", undefined, rotulo + ": " + n);
    item.style.setProperty("--c", cor);
    legenda.appendChild(item);
  });
}

function desenharAlertas(ind, preco, quebras) {
  const lista = pegar("lista-alertas");
  const itens = [];
  const link = (texto, href, linkTexto) => { const li = criarElemento("li", "mensagem mensagem-aviso"); li.append(texto + " "); const a = criarElemento("a", undefined, linkTexto); a.href = href; li.appendChild(a); return li; };
  if (ind.totalVeiculos === 0) itens.push(link("Nenhum veículo cadastrado.", "veiculos.html", "Cadastrar veículo"));
  if (ind.veiculosSemConsumo > 0) itens.push(link(ind.veiculosSemConsumo + " veículo(s) sem consumo médio (km/L): combustível e economia não podem ser calculados.", "veiculos.html", "Informar consumo"));
  if (preco === null) itens.push(link("Preço do combustível não configurado: o custo em reais não é calculado.", "configuracoes.html", "Configurar preço"));
  if (ind.emManutencao > 0) itens.push(link(ind.emManutencao + " veículo(s) em manutenção.", "quebras.html", "Ver ocorrências"));
  if (quebras > 0 && itens.length === 0) itens.push(link(quebras + " ocorrência(s) registrada(s).", "quebras.html", "Ver ocorrências"));
  if (itens.length === 0) { const li = criarElemento("li", "mensagem mensagem-ok", "Nenhum alerta no momento."); itens.push(li); }
  itens.forEach((i) => lista.appendChild(i));
}

function desenharUltimas(viagens) {
  const vazio = pegar("vazio-viagens");
  const tabela = pegar("tabela-viagens");
  vazio.hidden = viagens.length > 0;
  tabela.hidden = viagens.length === 0;
  const corpo = pegar("corpo-viagens");
  viagens.slice(0, 5).forEach((v) => {
    const tr = criarElemento("tr");
    const cod = criarElemento("td"); cod.append(v.veiculoCodigo + " ");
    cod.appendChild(criarElemento("span", "etiqueta " + (v.modo === "turbo" ? "etiqueta-turbo" : "etiqueta-normal"), v.modo === "turbo" ? "Turbo" : "Normal"));
    tr.appendChild(cod);
    tr.appendChild(criarElemento("td", undefined, textoDataHora(v.concluidaEm)));
    [String(v.entregas), formatarKm(v.distanciaKm), textoDuracaoViagem(v), v.litros === null ? "—" : formatarLitros(v.litros), textoEconomiaViagem(v)].forEach((t) => tr.appendChild(criarElemento("td", "numero", t)));
    corpo.appendChild(tr);
  });
}

async function iniciar() {
  const msg = pegar("mensagem-painel");
  let veiculos = [];
  let quebras = [];
  try {
    veiculos = await listarVeiculos();
    quebras = await listarQuebras();
  } catch (erro) {
    mostrarMensagem(msg, erro.message, "erro");
  }
  const historico = carregarHistorico();
  if (historico.erro) mostrarMensagem(msg, historico.erro, "erro");
  const config = lerConfiguracoes();
  const ind = calcularIndicadores(veiculos, historico.viagens);
  desenharKpis(ind);
  desenharFrota(ind);
  desenharAlertas(ind, config.precoCombustivel, quebras.length);
  desenharUltimas(historico.viagens);
}

iniciar();

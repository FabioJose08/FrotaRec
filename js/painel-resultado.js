// Desenha, no painel do planejamento, a comparação Normal × Turbo e a estimativa de combustível.
// Apenas apresentação: todos os números vêm de cenarios.js e combustivel.js.
// Todo texto entra por textContent (nunca HTML).

import { compararRotas, estimarCombustivel, formatarLitros, formatarReais, formatarPercentual } from "./combustivel.js";
import { formatarKm, formatarDuracao } from "./geo.js";
import { icone } from "./icones.js";

function el(tag, classe, texto) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

const ND = "—";

function itemEconomia(titulo, valorTexto, positivo, detalhe) {
  const d = el("div", "economia-item" + (positivo ? "" : " neutra"));
  d.append(el("span", undefined, titulo), el("strong", undefined, valorTexto));
  if (detalhe) d.appendChild(el("small", undefined, detalhe));
  return d;
}

function avisoConsumo(c) {
  if (!c.consumoDisponivel) {
    const p = el("p", "mensagem mensagem-info");
    p.append("O veículo " + c.codigoVeiculo + " não tem consumo médio (km/L) cadastrado, então não é possível calcular combustível nem economia. ");
    const a = el("a", undefined, "Cadastrar o consumo na Frota");
    a.href = "veiculos.html";
    p.append(a, ".");
    return p;
  }
  if (!c.precoDisponivel) {
    const p = el("p", "mensagem mensagem-info");
    p.append("O preço do combustível não está configurado: os litros são estimados, mas o custo em reais não é calculado. ");
    const a = el("a", undefined, "Configurar o preço");
    a.href = "configuracoes.html";
    p.append(a, ".");
    return p;
  }
  return null;
}

/**
 * @param {HTMLElement} alvo
 * @param {{cenarios:object, consumoKmL:(number|null), precoLitro:(number|null), codigoVeiculo:string, atendimentoMin:number, selecionado:string, aproximado:boolean}} dados
 */
export function renderizarComparacao(alvo, dados) {
  alvo.innerHTML = "";
  const { cenarios } = dados;
  const normal = cenarios.normal;
  const turbo = cenarios.turbo;
  const comp = compararRotas(normal, turbo, dados.consumoKmL, dados.precoLitro);
  comp.codigoVeiculo = dados.codigoVeiculo;

  const cab = el("div", "comparacao-cabecalho");
  cab.append(icone("raio"), "Comparação: rota Normal × rota Turbo");
  alvo.appendChild(cab);

  if (dados.aproximado) {
    alvo.appendChild(el("p", "mensagem mensagem-aviso",
      "Valores aproximados por distância em linha reta (o serviço de rotas não respondeu). Não representam as ruas reais e não devem ser tratados como resultado exato."));
  }

  const algumaReducao = comp.reduziuDistancia || comp.reduziuTempo;
  if (!algumaReducao) {
    alvo.appendChild(el("p", "mensagem mensagem-info",
      "A solução Turbo não apresentou redução em comparação com a ordem normal: a ordem cadastrada já era equivalente à melhor encontrada."));
  }

  // Destaques de economia: só mostram valor positivo quando houve redução real.
  const destaques = el("div", "economia-destaque");
  destaques.appendChild(comp.reduziuDistancia
    ? itemEconomia("Distância economizada", formatarKm(comp.economiaKm), true, comp.percentualDistancia !== null ? formatarPercentual(comp.percentualDistancia) + " a menos" : "")
    : itemEconomia("Distância economizada", "Sem redução", false));
  destaques.appendChild(comp.reduziuTempo
    ? itemEconomia("Tempo economizado", formatarDuracao(comp.economiaMin), true, comp.percentualTempo !== null ? formatarPercentual(comp.percentualTempo) + " a menos" : "")
    : itemEconomia("Tempo economizado", "Sem redução", false));
  if (comp.economiaLitros === null) destaques.appendChild(itemEconomia("Combustível economizado", "Indisponível", false, "falta o consumo do veículo"));
  else if (comp.reduziuCombustivel) destaques.appendChild(itemEconomia("Combustível economizado", formatarLitros(comp.economiaLitros), true, comp.percentualCombustivel !== null ? formatarPercentual(comp.percentualCombustivel) + " a menos" : ""));
  else destaques.appendChild(itemEconomia("Combustível economizado", "Sem redução", false));
  if (comp.economiaReais === null) destaques.appendChild(itemEconomia("Economia financeira", "Indisponível", false, comp.consumoDisponivel ? "falta o preço do litro" : "falta consumo e preço"));
  else if (comp.reduziuCusto) destaques.appendChild(itemEconomia("Economia financeira", formatarReais(comp.economiaReais), true, comp.percentualCusto !== null ? formatarPercentual(comp.percentualCusto) + " de redução" : ""));
  else destaques.appendChild(itemEconomia("Economia financeira", "Sem redução", false));
  alvo.appendChild(destaques);

  // Tabela comparativa
  const tabela = el("table", "tabela-comparacao");
  tabela.appendChild(el("caption", "so-leitor", "Comparação entre as rotas Normal e Turbo"));
  const cabecalho = el("tr");
  ["Indicador", "Normal", "Turbo"].forEach((t, i) => { const th = el("th", i === 2 ? "col-turbo" : undefined, t); th.scope = "col"; cabecalho.appendChild(th); });
  tabela.appendChild(el("thead")).appendChild(cabecalho);
  const corpo = el("tbody");
  const linha = (rotulo, a, b) => {
    const tr = el("tr");
    tr.appendChild(el("td", undefined, rotulo));
    tr.appendChild(el("td", undefined, a));
    tr.appendChild(el("td", "col-turbo", b));
    corpo.appendChild(tr);
  };
  linha("Distância", formatarKm(normal.distanciaKm), formatarKm(turbo.distanciaKm));
  linha("Tempo de deslocamento", formatarDuracao(normal.deslocamentoMin), formatarDuracao(turbo.deslocamentoMin));
  linha("Tempo total da operação", formatarDuracao(normal.deslocamentoMin + dados.atendimentoMin), formatarDuracao(turbo.deslocamentoMin + dados.atendimentoMin));
  linha("Combustível estimado", comp.litrosNormal === null ? ND : formatarLitros(comp.litrosNormal), comp.litrosTurbo === null ? ND : formatarLitros(comp.litrosTurbo));
  linha("Custo estimado", comp.custoNormal === null ? ND : formatarReais(comp.custoNormal), comp.custoTurbo === null ? ND : formatarReais(comp.custoTurbo));
  tabela.appendChild(corpo);
  alvo.appendChild(tabela);

  const aviso = avisoConsumo(comp);
  if (aviso) alvo.appendChild(aviso);

  const notas = el("div", "comparacao-notas");
  const criterioTxt = cenarios.criterio === "distancia" ? "menor distância" : "menor tempo de deslocamento";
  if (cenarios.turbo.manteveOrdemInformada) {
    notas.appendChild(el("p", undefined, "A heurística não encontrou ordem melhor que a cadastrada; o Turbo manteve a ordem informada. Sem garantia de ótimo global."));
  } else if (turbo.metodo === "exato") {
    notas.appendChild(el("p", undefined, "Turbo: solução ótima para a matriz de custos recebida (critério: " + criterioTxt + "), calculada por programação dinâmica exata."));
  } else if (turbo.metodo === "heuristica") {
    notas.appendChild(el("p", undefined, "Turbo: boa solução encontrada por heurística (critério: " + criterioTxt + "), sem garantia de ser a melhor de todas as ordens possíveis."));
  }
  if (cenarios.criterioAjustado) notas.appendChild(el("p", undefined, "As distâncias não vieram do serviço de rotas; a otimização usou o tempo de deslocamento."));
  notas.appendChild(el("p", undefined, "Combustível e custo são estimativas baseadas no consumo médio informado, sem considerar trânsito em tempo real, relevo, carga, condições do motor ou estilo de condução. Distâncias e tempos vêm da matriz de percursos do OSRM."));
  alvo.appendChild(notas);
  alvo.hidden = false;
}

/** Estimativa simples para a rota selecionada (usada quando não há o que comparar). */
export function renderizarCombustivel(alvo, dados) {
  alvo.innerHTML = "";
  const est = estimarCombustivel(dados.distanciaKm, dados.consumoKmL, dados.precoLitro);
  if (!est.consumoDisponivel) {
    alvo.append("Combustível: o veículo " + dados.codigoVeiculo + " não tem consumo médio cadastrado, então a estimativa não pode ser calculada. ");
    const a = el("a", undefined, "Cadastrar consumo");
    a.href = "veiculos.html";
    alvo.appendChild(a);
  } else {
    alvo.append("Combustível estimado: ");
    alvo.appendChild(el("strong", undefined, formatarLitros(est.litros)));
    if (est.custo !== null) { alvo.append(" · custo estimado: "); alvo.appendChild(el("strong", undefined, formatarReais(est.custo))); }
    else { alvo.append(" · custo indisponível (preço do litro não configurado). "); const a = el("a", undefined, "Configurar"); a.href = "configuracoes.html"; alvo.appendChild(a); }
    alvo.appendChild(el("br"));
    alvo.appendChild(el("small", undefined, "Estimativa pelo consumo médio informado; sem trânsito, relevo, carga ou estilo de condução." + (dados.aproximado ? " Distância aproximada em linha reta." : "")));
  }
  alvo.hidden = false;
}

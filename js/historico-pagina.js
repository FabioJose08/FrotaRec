// Tela do histórico de viagens: consulta, detalhes, exportação e impressão.

import { carregarHistorico, excluirViagem, limparHistorico } from "./historico.js";
import { lerConfiguracoes } from "./configuracoes.js";
import { calcularIndicadores } from "./dashboard.js";
import { csvViagens, construirRelatorio, baixarArquivo, nomeComData } from "./relatorios.js";
import { formatarKm, formatarDuracao } from "./geo.js";
import { formatarLitros, formatarReais, formatarPercentual } from "./combustivel.js";
import { pegar, mostrarMensagem, limparMensagem, criarElemento, criarKpi, textoDataHora, textoEconomiaViagem, textoDuracaoViagem, etiquetaModo } from "./ui.js";

const filtroVeiculo = pegar("filtro-veiculo-h");
const filtroModo = pegar("filtro-modo");
const corpo = pegar("corpo-historico");
const mensagem = pegar("mensagem-historico");
const dialogo = pegar("dialogo-viagem");

let viagens = [];

const METODOS = {
  exato: "Exato (Held-Karp): ótimo para a matriz de custos recebida",
  heuristica: "Heurística: boa solução, sem garantia de ótimo global",
  trivial: "Trivial (uma entrega: nada a reordenar)",
  manual: "Ordem cadastrada (modo Normal)"
};

function filtradas() {
  return viagens.filter((v) => (filtroVeiculo.value === "" || v.veiculoId === filtroVeiculo.value) && (filtroModo.value === "" || v.modo === filtroModo.value));
}

function preencherFiltro() {
  const atual = filtroVeiculo.value;
  filtroVeiculo.innerHTML = "";
  filtroVeiculo.appendChild(new Option("Todos os veículos", ""));
  const vistos = new Map();
  viagens.forEach((v) => { if (!vistos.has(v.veiculoId)) vistos.set(v.veiculoId, v.veiculoCodigo); });
  vistos.forEach((codigo, id) => filtroVeiculo.appendChild(new Option(codigo, id)));
  filtroVeiculo.value = vistos.has(atual) ? atual : "";
}

function desenharKpis(lista) {
  const ind = calcularIndicadores([], lista);
  const p = pegar("kpis-historico");
  p.innerHTML = "";
  p.append(
    criarKpi("Viagens", String(ind.viagensConcluidas), "no filtro atual"),
    criarKpi("Distância", formatarKm(ind.kmPercorridos), "somada"),
    ind.litrosEstimados === null ? criarKpi("Combustível", "Indisponível", "sem consumo cadastrado", "indisponivel") : criarKpi("Combustível", formatarLitros(ind.litrosEstimados), "estimado"),
    ind.economiaLitros === null ? criarKpi("Economia de combustível", "Sem dados", "Turbo × Normal", "indisponivel") : criarKpi("Economia de combustível", formatarLitros(ind.economiaLitros), "Turbo × Normal", ind.economiaLitros > 0 ? "economia" : undefined),
    ind.economiaReais === null ? criarKpi("Economia financeira", "Sem dados", "requer consumo e preço", "indisponivel") : criarKpi("Economia financeira", formatarReais(ind.economiaReais), "estimada", ind.economiaReais > 0 ? "economia" : undefined)
  );
}

function desenhar() {
  const lista = filtradas();
  desenharKpis(lista);
  corpo.innerHTML = "";
  const vazio = pegar("vazio-historico");
  vazio.hidden = lista.length > 0;
  vazio.textContent = viagens.length === 0 ? "Nenhuma viagem concluída ainda. Conclua uma simulação em Planejamento de rotas para registrar a primeira." : "Nenhuma viagem para os filtros escolhidos.";
  pegar("tabela-historico").hidden = lista.length === 0;
  pegar("btn-limpar-historico").disabled = viagens.length === 0;

  lista.forEach((v) => {
    const tr = criarElemento("tr");
    tr.appendChild(criarElemento("td", undefined, textoDataHora(v.concluidaEm)));
    tr.appendChild(criarElemento("td", undefined, v.veiculoCodigo || "—"));
    const modo = criarElemento("td"); modo.appendChild(etiquetaModo(v.modo)); tr.appendChild(modo);
    [String(v.entregas), formatarKm(v.distanciaKm), textoDuracaoViagem(v), v.litros === null ? "—" : formatarLitros(v.litros), textoEconomiaViagem(v)]
      .forEach((t) => tr.appendChild(criarElemento("td", "numero", t)));
    const acoes = criarElemento("td", "acoes");
    const ver = criarElemento("button", "botao botao-secundario botao-pequeno", "Detalhes");
    ver.type = "button";
    ver.setAttribute("aria-label", "Detalhes da viagem de " + v.veiculoCodigo + " em " + textoDataHora(v.concluidaEm));
    ver.addEventListener("click", () => abrirDetalhes(v));
    const excluir = criarElemento("button", "botao botao-perigo botao-pequeno", "Excluir");
    excluir.type = "button";
    excluir.setAttribute("aria-label", "Excluir a viagem de " + v.veiculoCodigo + " em " + textoDataHora(v.concluidaEm));
    excluir.addEventListener("click", () => confirmarExclusao(v));
    acoes.append(ver, excluir);
    tr.appendChild(acoes);
    corpo.appendChild(tr);
  });
}

function par(lista, rotulo, valor) {
  lista.append(criarElemento("dt", undefined, rotulo), criarElemento("dd", undefined, valor));
}

function abrirDetalhes(v) {
  const alvo = pegar("corpo-dialogo");
  alvo.innerHTML = "";
  const dl = criarElemento("dl", "lista-detalhes");
  par(dl, "Veículo", v.veiculoCodigo + (v.veiculoTipo ? " (" + v.veiculoTipo + ")" : ""));
  par(dl, "Concluída em", textoDataHora(v.concluidaEm));
  par(dl, "Modo", v.modo === "turbo" ? "Turbo" : "Normal");
  par(dl, "Critério de otimização", v.criterio === "distancia" ? "Menor distância" : v.criterio === "tempo" ? "Menor tempo" : "— (ordem cadastrada)");
  par(dl, "Entregas", String(v.entregas));
  par(dl, "Retorno ao galpão", v.retornouGalpao ? "Sim" : "Não");
  par(dl, "Distância", formatarKm(v.distanciaKm));
  par(dl, "Tempo de deslocamento", formatarDuracao(v.deslocamentoMin));
  par(dl, "Tempo de atendimento", formatarDuracao(v.atendimentoMin));
  par(dl, "Duração total", textoDuracaoViagem(v));
  par(dl, "Consumo médio", v.consumoKmL === null ? "Não cadastrado" : v.consumoKmL.toLocaleString("pt-BR") + " km/L");
  par(dl, "Combustível estimado", v.litros === null ? "Indisponível" : formatarLitros(v.litros));
  par(dl, "Preço do litro", v.precoLitro === null ? "Não configurado" : formatarReais(v.precoLitro));
  par(dl, "Custo estimado", v.custo === null ? "Indisponível" : formatarReais(v.custo));
  par(dl, "Método do algoritmo", METODOS[v.metodo]);
  par(dl, "Origem dos dados", v.origem === "osrm" ? "OSRM (percursos pelas ruas)" : "Aproximação em linha reta (não representa as ruas)");
  alvo.appendChild(dl);

  if (v.comparacao) {
    const c = v.comparacao;
    alvo.appendChild(criarElemento("h3", undefined, "Economia em comparação com a rota Normal"));
    const d2 = criarElemento("dl", "lista-detalhes");
    par(d2, "Distância na rota Normal", c.distanciaNormalKm === null ? "—" : formatarKm(c.distanciaNormalKm));
    par(d2, "Deslocamento na rota Normal", c.deslocamentoNormalMin === null ? "—" : formatarDuracao(c.deslocamentoNormalMin));
    par(d2, "Distância economizada", c.economiaKm === null ? "—" : (c.economiaKm > 1e-9 ? formatarKm(c.economiaKm) : "Sem redução"));
    par(d2, "Tempo economizado", c.economiaMin === null ? "—" : (c.economiaMin > 1e-9 ? formatarDuracao(c.economiaMin) : "Sem redução"));
    par(d2, "Combustível economizado", c.economiaLitros === null ? "Indisponível" : (c.economiaLitros > 1e-9 ? formatarLitros(c.economiaLitros) : "Sem redução"));
    par(d2, "Economia financeira", c.economiaReais === null ? "Indisponível" : (c.economiaReais > 1e-9 ? formatarReais(c.economiaReais) : "Sem redução"));
    if (c.percentual !== null) par(d2, "Percentual de redução", c.percentual > 1e-9 ? formatarPercentual(c.percentual) : "Sem redução");
    alvo.appendChild(d2);
  }

  if (v.paradas.length) {
    alvo.appendChild(criarElemento("h3", undefined, "Paradas (horário simulado)"));
    const ol = criarElemento("ol", "lista-percurso");
    v.paradas.forEach((p) => {
      const li = criarElemento("li");
      li.appendChild(criarElemento("span", "percurso-titulo", p.papel + ": " + p.nome));
      li.appendChild(criarElemento("span", "percurso-detalhe", "chegada às " + p.horario));
      ol.appendChild(li);
    });
    alvo.appendChild(ol);
  }
  alvo.appendChild(criarElemento("p", "ajuda", "Combustível e custo são estimativas pelo consumo médio informado, sem trânsito em tempo real, relevo, carga ou estilo de condução."));
  dialogo.showModal();
}

function confirmarExclusao(v) {
  if (!window.confirm("Excluir esta viagem do histórico (" + v.veiculoCodigo + ", " + textoDataHora(v.concluidaEm) + ")? Esta ação não pode ser desfeita.")) return;
  try {
    excluirViagem(v.id);
    recarregar();
    mostrarMensagem(mensagem, "Viagem excluída do histórico.", "ok");
  } catch (erro) {
    mostrarMensagem(mensagem, erro.message, "erro");
  }
}

function recarregar() {
  const h = carregarHistorico();
  viagens = h.viagens;
  if (h.erro) mostrarMensagem(mensagem, h.erro, "erro"); else limparMensagem(mensagem);
  preencherFiltro();
  desenhar();
}

pegar("fechar-dialogo").addEventListener("click", () => dialogo.close());
dialogo.addEventListener("click", (e) => { if (e.target === dialogo) dialogo.close(); });
filtroVeiculo.addEventListener("change", desenhar);
filtroModo.addEventListener("change", desenhar);

pegar("btn-exportar-viagens").addEventListener("click", () => {
  const lista = filtradas();
  if (lista.length === 0) { mostrarMensagem(mensagem, "Não há viagens para exportar.", "info"); return; }
  baixarArquivo(nomeComData("frota-viagens", "csv"), csvViagens(lista), "text/csv;charset=utf-8");
});

pegar("btn-imprimir").addEventListener("click", () => {
  const lista = filtradas();
  construirRelatorio(pegar("relatorio-impressao"), calcularIndicadores([], lista), lista, lerConfiguracoes().precoCombustivel);
  window.print();
});

pegar("btn-limpar-historico").addEventListener("click", () => {
  if (viagens.length === 0) return;
  if (!window.confirm("Apagar TODO o histórico de viagens (" + viagens.length + " registro(s))? Esta ação não pode ser desfeita. Considere exportar um backup antes.")) return;
  try {
    limparHistorico();
    recarregar();
    mostrarMensagem(mensagem, "Histórico limpo.", "ok");
  } catch (erro) {
    mostrarMensagem(mensagem, erro.message, "erro");
  }
});

recarregar();

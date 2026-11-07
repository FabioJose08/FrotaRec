// Tela de registro de quebras e histórico de ocorrências.

import { listarVeiculos, listarQuebras, salvarQuebra, excluirQuebra, dataDeHoje } from "./dados.js";
import { pegar, mostrarMensagem, limparMensagem, criarCelula, criarKpi } from "./ui.js";
import { csvQuebras, baixarArquivo, nomeComData } from "./relatorios.js";

const formulario = pegar("form-quebra");
const campoId = pegar("campo-id");
const campoVeiculo = pegar("veiculo");
const infoVeiculo = pegar("info-veiculo");
const campoData = pegar("data");
const campoMotivo = pegar("motivo");
const campoResponsavel = pegar("registrado-por");
const campoObservacoes = pegar("observacoes");
const tituloFormulario = pegar("titulo-formulario");
const botaoSalvar = pegar("btn-salvar");
const botaoCancelar = pegar("btn-cancelar");
const mensagemForm = pegar("mensagem-form");
const mensagemLista = pegar("mensagem-lista");
const filtroVeiculo = pegar("filtro-veiculo");
const corpoTabela = pegar("corpo-quebras");
const tabelaRolagem = pegar("tabela-rolagem");
const vazio = pegar("vazio-quebras");
const semVeiculos = pegar("sem-veiculos");

let veiculos = [];
let quebras = [];

// ---------- Auxiliares ----------

function buscarVeiculo(id) {
  return veiculos.find(function (v) { return v.id === id; });
}

// "2026-10-09" vira "09/10/2026" (sem usar Date, para evitar erro de fuso).
function formatarData(texto) {
  return texto.split("-").reverse().join("/");
}

// ---------- Carregamento ----------

async function carregarTudo() {
  try {
    veiculos = await listarVeiculos();
    quebras = await listarQuebras();
    limparMensagem(mensagemLista);
    preencherVeiculos();
    desenharTabela();
  } catch (erro) {
    mostrarMensagem(mensagemLista, erro.message, "erro");
    tabelaRolagem.hidden = true;
    vazio.hidden = true;
  }
}

function preencherVeiculos() {
  const escolhidoNoForm = campoVeiculo.value;
  const escolhidoNoFiltro = filtroVeiculo.value;

  campoVeiculo.innerHTML = "";
  campoVeiculo.appendChild(new Option("Escolha um veículo", ""));
  filtroVeiculo.innerHTML = "";
  filtroVeiculo.appendChild(new Option("Todos os veículos", ""));

  veiculos.forEach(function (veiculo) {
    campoVeiculo.appendChild(new Option(veiculo.codigo + " (" + veiculo.tipo + ")", veiculo.id));
    filtroVeiculo.appendChild(new Option(veiculo.codigo, veiculo.id));
  });

  campoVeiculo.value = escolhidoNoForm;
  filtroVeiculo.value = escolhidoNoFiltro;

  // Sem veículos cadastrados não dá para registrar quebra.
  const nenhum = veiculos.length === 0;
  semVeiculos.hidden = !nenhum;
  formulario.hidden = nenhum;

  mostrarInfoDoVeiculo();
}

// Preenche automaticamente o que já se sabe sobre o veículo escolhido.
function mostrarInfoDoVeiculo() {
  const veiculo = buscarVeiculo(campoVeiculo.value);
  if (!veiculo) {
    infoVeiculo.textContent = "Escolha o veículo para ver o tipo e a transportadora.";
    return;
  }
  const transportadora = veiculo.transportadora === "" ? "não informada" : veiculo.transportadora;
  const responsavel = veiculo.responsavel === "" ? "não informado" : veiculo.responsavel;
  infoVeiculo.textContent =
    "Tipo: " + veiculo.tipo + ". Transportadora: " + transportadora +
    ". Responsável: " + responsavel + ". Situação: " + veiculo.situacao + ".";
}

// ---------- Histórico ----------

function desenharKpis() {
  const painel = pegar("kpis-quebras");
  painel.innerHTML = "";
  const limite = new Date();
  limite.setDate(limite.getDate() - 30);
  const iso = limite.getFullYear() + "-" + String(limite.getMonth() + 1).padStart(2, "0") + "-" + String(limite.getDate()).padStart(2, "0");
  const recentes = quebras.filter(function (q) { return q.data >= iso; }).length;
  const vinculados = new Set(quebras.map(function (q) { return q.veiculoId; })).size;
  const maisRecente = quebras.length ? formatarData(quebras[0].data) : "—";
  const contagem = {};
  quebras.forEach(function (q) { contagem[q.veiculoId] = (contagem[q.veiculoId] || 0) + 1; });
  const topoId = Object.keys(contagem).sort(function (a, b) { return contagem[b] - contagem[a]; })[0];
  const topo = topoId ? buscarVeiculo(topoId) : null;
  painel.append(
    criarKpi("Ocorrências registradas", String(quebras.length), "no histórico"),
    criarKpi("Últimos 30 dias", String(recentes), "ocorrências recentes"),
    criarKpi("Veículos afetados", String(vinculados), "com ao menos uma ocorrência"),
    criarKpi("Mais recente", maisRecente, topo ? "mais ocorrências: " + topo.codigo + " (" + contagem[topoId] + ")" : "nenhuma ocorrência")
  );
}

function desenharTabela() {
  corpoTabela.innerHTML = "";
  desenharKpis();

  const filtro = filtroVeiculo.value;
  const visiveis = quebras.filter(function (q) { return filtro === "" || q.veiculoId === filtro; });

  vazio.hidden = visiveis.length > 0;
  tabelaRolagem.hidden = visiveis.length === 0;
  vazio.textContent = quebras.length === 0
    ? "Nenhuma quebra registrada ainda."
    : "Nenhuma quebra registrada para este veículo.";

  visiveis.forEach(function (quebra) {
    const veiculo = buscarVeiculo(quebra.veiculoId);
    const linha = document.createElement("tr");

    linha.appendChild(criarCelula(formatarData(quebra.data)));
    linha.appendChild(criarCelula(veiculo ? veiculo.codigo : "Veículo removido"));
    linha.appendChild(criarCelula(quebra.motivo));
    linha.appendChild(criarCelula(quebra.registradoPor));
    linha.appendChild(criarCelula(quebra.observacoes));

    const celulaAcoes = document.createElement("td");
    celulaAcoes.className = "acoes";

    const botaoEditar = document.createElement("button");
    botaoEditar.type = "button";
    botaoEditar.className = "botao botao-secundario botao-pequeno";
    botaoEditar.textContent = "Editar";
    botaoEditar.setAttribute("aria-label", "Editar quebra de " + formatarData(quebra.data));
    botaoEditar.addEventListener("click", function () { prepararEdicao(quebra); });

    const botaoExcluir = document.createElement("button");
    botaoExcluir.type = "button";
    botaoExcluir.className = "botao botao-perigo botao-pequeno";
    botaoExcluir.textContent = "Excluir";
    botaoExcluir.setAttribute("aria-label", "Excluir quebra de " + formatarData(quebra.data));
    botaoExcluir.addEventListener("click", function () { confirmarExclusao(quebra); });

    celulaAcoes.appendChild(botaoEditar);
    celulaAcoes.appendChild(botaoExcluir);
    linha.appendChild(celulaAcoes);

    corpoTabela.appendChild(linha);
  });
}

// ---------- Formulário ----------

function limparFormulario() {
  formulario.reset();
  campoId.value = "";
  campoData.value = dataDeHoje();
  campoResponsavel.value = "Usuário local";
  tituloFormulario.textContent = "Nova ocorrência";
  botaoCancelar.hidden = true;
  mostrarInfoDoVeiculo();
}

function prepararEdicao(quebra) {
  campoId.value = quebra.id;
  campoVeiculo.value = quebra.veiculoId;
  campoData.value = quebra.data;
  campoMotivo.value = quebra.motivo;
  campoResponsavel.value = quebra.registradoPor;
  campoObservacoes.value = quebra.observacoes;
  tituloFormulario.textContent = "Editar ocorrência";
  botaoCancelar.hidden = false;
  limparMensagem(mensagemForm);
  mostrarInfoDoVeiculo();
  campoVeiculo.focus();
}

async function aoEnviarFormulario(evento) {
  evento.preventDefault();
  botaoSalvar.disabled = true;

  const editando = campoId.value !== "";

  if (editando && !window.confirm("Salvar as alterações desta ocorrência?")) {
    botaoSalvar.disabled = false;
    return;
  }

  try {
    await salvarQuebra({
      id: campoId.value || undefined,
      veiculoId: campoVeiculo.value,
      data: campoData.value,
      motivo: campoMotivo.value,
      registradoPor: campoResponsavel.value,
      observacoes: campoObservacoes.value
    });
    limparFormulario();
    mostrarMensagem(mensagemForm, editando ? "Ocorrência atualizada." : "Ocorrência registrada.", "ok");
    quebras = await listarQuebras();
    desenharTabela();
  } catch (erro) {
    mostrarMensagem(mensagemForm, erro.message, "erro");
  } finally {
    botaoSalvar.disabled = false;
  }
}

async function confirmarExclusao(quebra) {
  const confirmou = window.confirm("Excluir esta ocorrência de " + formatarData(quebra.data) + "? Esta ação não pode ser desfeita.");
  if (!confirmou) return;

  try {
    await excluirQuebra(quebra.id);
    if (campoId.value === quebra.id) limparFormulario();
    mostrarMensagem(mensagemLista, "Ocorrência excluída.", "ok");
    quebras = await listarQuebras();
    desenharTabela();
  } catch (erro) {
    mostrarMensagem(mensagemLista, erro.message, "erro");
  }
}

// ---------- Início ----------

campoData.max = dataDeHoje();
formulario.addEventListener("submit", aoEnviarFormulario);
campoVeiculo.addEventListener("change", mostrarInfoDoVeiculo);
filtroVeiculo.addEventListener("change", desenharTabela);
botaoCancelar.addEventListener("click", function () {
  limparFormulario();
  limparMensagem(mensagemForm);
});

limparFormulario();
carregarTudo();

pegar("btn-exportar-quebras").addEventListener("click", function () {
  baixarArquivo(nomeComData("frota-ocorrencias", "csv"), csvQuebras(quebras, veiculos), "text/csv;charset=utf-8");
});

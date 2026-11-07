// Tela de cadastro de veículos.

import { SITUACOES, listarVeiculos, salvarVeiculo, excluirVeiculo } from "./dados.js";
import { pegar, mostrarMensagem, limparMensagem, criarCelula, criarElemento, criarKpi } from "./ui.js";
import { csvVeiculos, baixarArquivo, nomeComData } from "./relatorios.js";

const formulario = pegar("form-veiculo");
const campoId = pegar("campo-id");
const campoCodigo = pegar("codigo");
const campoTipo = pegar("tipo");
const campoResponsavel = pegar("responsavel");
const campoTransportadora = pegar("transportadora");
const campoSituacao = pegar("situacao");
const campoConsumo = pegar("consumo");
const painelKpis = pegar("kpis-frota");
const tituloFormulario = pegar("titulo-formulario");
const botaoSalvar = pegar("btn-salvar");
const botaoCancelar = pegar("btn-cancelar");
const mensagemForm = pegar("mensagem-form");
const mensagemLista = pegar("mensagem-lista");
const corpoTabela = pegar("corpo-veiculos");
const tabelaRolagem = pegar("tabela-rolagem");
const vazio = pegar("vazio-veiculos");

let veiculos = [];

// ---------- Lista ----------

async function carregarLista() {
  try {
    veiculos = await listarVeiculos();
    limparMensagem(mensagemLista);
    desenharTabela();
  } catch (erro) {
    mostrarMensagem(mensagemLista, erro.message, "erro");
    tabelaRolagem.hidden = true;
    vazio.hidden = true;
  }
}

function classeDaSituacao(situacao) {
  if (situacao === "Ativo") return "etiqueta-movimento";
  if (situacao === "Em manutenção") return "etiqueta-parado";
  return "etiqueta-neutro";
}

function desenharKpis() {
  painelKpis.innerHTML = "";
  const n = (s) => veiculos.filter((v) => v.situacao === s).length;
  const semConsumo = veiculos.filter((v) => v.consumoKmL === null).length;
  painelKpis.append(
    criarKpi("Total", String(veiculos.length), "veículos cadastrados"),
    criarKpi("Ativos", String(n("Ativo")), "recebem viagens"),
    criarKpi("Em manutenção", String(n("Em manutenção")), "bloqueados"),
    criarKpi("Inativos", String(n("Inativo")), "fora de operação"),
    criarKpi("Sem consumo", String(semConsumo), semConsumo ? "informe o km/L para estimar combustível" : "todos com consumo", semConsumo ? "indisponivel" : undefined)
  );
}

function desenharTabela() {
  corpoTabela.innerHTML = "";
  desenharKpis();

  const semVeiculos = veiculos.length === 0;
  vazio.hidden = !semVeiculos;
  tabelaRolagem.hidden = semVeiculos;

  veiculos.forEach(function (veiculo) {
    const linha = document.createElement("tr");

    linha.appendChild(criarCelula(veiculo.codigo));
    linha.appendChild(criarCelula(veiculo.tipo));
    linha.appendChild(criarCelula(veiculo.responsavel));
    linha.appendChild(criarCelula(veiculo.transportadora));

    const celulaConsumo = document.createElement("td");
    if (veiculo.consumoKmL === null) celulaConsumo.appendChild(criarElemento("span", "etiqueta etiqueta-parado", "Não informado"));
    else celulaConsumo.textContent = veiculo.consumoKmL.toLocaleString("pt-BR") + " km/L";
    linha.appendChild(celulaConsumo);

    const celulaSituacao = document.createElement("td");
    const etiqueta = document.createElement("span");
    etiqueta.className = "etiqueta " + classeDaSituacao(veiculo.situacao);
    etiqueta.textContent = veiculo.situacao;
    celulaSituacao.appendChild(etiqueta);
    linha.appendChild(celulaSituacao);

    const celulaAcoes = document.createElement("td");
    celulaAcoes.className = "acoes";

    const botaoEditar = document.createElement("button");
    botaoEditar.type = "button";
    botaoEditar.className = "botao botao-secundario botao-pequeno";
    botaoEditar.textContent = "Editar";
    botaoEditar.setAttribute("aria-label", "Editar " + veiculo.codigo);
    botaoEditar.addEventListener("click", function () { prepararEdicao(veiculo); });

    const botaoExcluir = document.createElement("button");
    botaoExcluir.type = "button";
    botaoExcluir.className = "botao botao-perigo botao-pequeno";
    botaoExcluir.textContent = "Excluir";
    botaoExcluir.setAttribute("aria-label", "Excluir " + veiculo.codigo);
    botaoExcluir.addEventListener("click", function () { confirmarExclusao(veiculo); });

    celulaAcoes.appendChild(botaoEditar);
    celulaAcoes.appendChild(botaoExcluir);
    linha.appendChild(celulaAcoes);

    corpoTabela.appendChild(linha);
  });
}

// ---------- Formulário ----------

function preencherSituacoes() {
  SITUACOES.forEach(function (situacao) {
    campoSituacao.appendChild(new Option(situacao, situacao));
  });
}

function limparFormulario() {
  formulario.reset();
  campoId.value = "";
  campoSituacao.value = "Ativo";
  campoConsumo.value = "";
  tituloFormulario.textContent = "Novo veículo";
  botaoCancelar.hidden = true;
}

function prepararEdicao(veiculo) {
  campoId.value = veiculo.id;
  campoCodigo.value = veiculo.codigo;
  campoTipo.value = veiculo.tipo;
  campoResponsavel.value = veiculo.responsavel;
  campoTransportadora.value = veiculo.transportadora;
  campoSituacao.value = veiculo.situacao;
  campoConsumo.value = veiculo.consumoKmL === null ? "" : String(veiculo.consumoKmL).replace(".", ",");
  tituloFormulario.textContent = "Editar veículo " + veiculo.codigo;
  botaoCancelar.hidden = false;
  limparMensagem(mensagemForm);
  campoCodigo.focus();
}

async function aoEnviarFormulario(evento) {
  evento.preventDefault();
  botaoSalvar.disabled = true;

  const editando = campoId.value !== "";

  if (editando && !window.confirm("Salvar as alterações deste veículo?")) {
    botaoSalvar.disabled = false;
    return;
  }

  try {
    await salvarVeiculo({
      id: campoId.value || undefined,
      codigo: campoCodigo.value,
      tipo: campoTipo.value,
      responsavel: campoResponsavel.value,
      transportadora: campoTransportadora.value,
      situacao: campoSituacao.value,
      consumoKmL: campoConsumo.value
    });
    limparFormulario();
    mostrarMensagem(mensagemForm, editando ? "Veículo atualizado." : "Veículo cadastrado.", "ok");
    await carregarLista();
  } catch (erro) {
    mostrarMensagem(mensagemForm, erro.message, "erro");
  } finally {
    botaoSalvar.disabled = false;
  }
}

async function confirmarExclusao(veiculo) {
  const confirmou = window.confirm("Excluir o veículo " + veiculo.codigo + "? Esta ação não pode ser desfeita.");
  if (!confirmou) return;

  try {
    await excluirVeiculo(veiculo.id);
    if (campoId.value === veiculo.id) limparFormulario();
    mostrarMensagem(mensagemLista, "Veículo " + veiculo.codigo + " excluído.", "ok");
    veiculos = await listarVeiculos();
    desenharTabela();
  } catch (erro) {
    mostrarMensagem(mensagemLista, erro.message, "erro");
  }
}

// ---------- Início ----------

preencherSituacoes();
limparFormulario();
formulario.addEventListener("submit", aoEnviarFormulario);
botaoCancelar.addEventListener("click", function () {
  limparFormulario();
  limparMensagem(mensagemForm);
});
carregarLista();

pegar("btn-exportar-veiculos").addEventListener("click", function () {
  baixarArquivo(nomeComData("frota-veiculos", "csv"), csvVeiculos(veiculos), "text/csv;charset=utf-8");
});

// Tela principal: veículos cadastrados, galpão, coleta, várias entregas, otimização e simulação.
//
// Cada veículo cadastrado tem o seu próprio "estado" (marcador, linhas, plano de viagem,
// rota e simulação). Trocar de veículo apenas troca qual estado está na tela; nenhum dado
// de viagem é compartilhado entre veículos.

import { CENTRO_RECIFE } from "./dados-demo.js";
import { listarVeiculos, CHAVE_VEICULOS } from "./dados.js";
import { obterMatriz, matrizAproximada, calcularRota, rotaDireta, ErroRoteamento } from "./rotas.js";
import { calcularCenarios } from "./cenarios.js";
import { lerConfiguracoes } from "./configuracoes.js";
import { registrarViagem, montarRegistroViagem } from "./historico.js";
import { renderizarComparacao, renderizarCombustivel } from "./painel-resultado.js";
import {
  criarPlanoVazio, lerGalpao, salvarGalpao, carregarViagens, salvarViagens,
  adicionarEntrega, editarEntrega, removerEntrega, validarColeta, sugerirNomeEntrega,
  novoIdLocal, MINUTOS_COLETA, MAX_NOME
} from "./viagem.js";
import { formatarKm, formatarDuracao, formatarHorario } from "./geo.js";
import {
  iniciarMapa, criarMarcadorVeiculo, atualizarMarcadorVeiculo, criarLinha, criarGrupo,
  criarPontoRota, criarPontoNumerado, ajustarVisao, centralizarEm
} from "./mapa.js";
import {
  criarEstado, definirRota, definirAvisoDeMudanca, definirAvisoDeProgresso, iniciar, pausar, reiniciar, limparRota,
  destruirEstado, textoStatus, classeEtiqueta, descreverPercurso, PARAMETROS_SIMULACAO
} from "./simulacao.js";
import { criarPainelEntregas } from "./painel-entregas.js";
import { criarBuscaLocal } from "./busca-local.js";

const COR_NORMAL = "#475569", COR_TURBO = "#059669", COR_PERCORRIDO = "#2563EB";
const ESTILO_OUTRA = { color: "#8393AB", weight: 3, opacity: 0.8, dashArray: null };
const NAVY = "#0A1A33", AMARELO = "#F59E0B", AZUL_PONTO = "#1D4ED8", CINZA_PONTO = "#8393AB";
const ROTULOS_FIXOS_ATE = 12;   // acima disso os nomes aparecem só ao passar o mouse

let mapa = null;
let selecionado = null;
let alvoMapa = null;            // { tipo: "galpao" | "coleta" | "entrega" | "editor" } enquanto espera um clique
let galpao = null;
let galpaoDefinido = false;
let planos = {};                // planos salvos, por id do veículo
let gravacaoFalhou = false;     // última tentativa de salvar o planejamento falhou?
const estados = new Map();      // id do veículo → estado
let ordemDaLista = [];          // ids na ordem do cadastro

const pegar = (id) => document.getElementById(id);
const listaVeiculos = pegar("lista-veiculos");
const avisoSemVeiculos = pegar("aviso-sem-veiculos");
const semSelecao = pegar("sem-selecao");
const dadosVeiculo = pegar("dados-veiculo");
const inputGalpao = pegar("input-galpao");
const inputColeta = pegar("input-coleta");
const btnGalpao = pegar("btn-mapa-galpao");
const btnColeta = pegar("btn-mapa-coleta");
const btnEntregaMapa = pegar("btn-mapa-entrega");
const btnNovaEntrega = pegar("btn-nova-entrega");
const optOtimizar = pegar("opt-otimizar");
const optRetorno = pegar("opt-retorno");
const btnLimparRota = pegar("btn-limpar-rota");
const mensagemRota = pegar("mensagem-rota");
const resumoRota = pegar("resumo-rota");
const resumoNumeros = pegar("resumo-numeros");
const resumoOtimizacao = pegar("resumo-otimizacao");
const resumoNota = pegar("resumo-nota");
const listaPercurso = pegar("lista-percurso");
const botaoCalcular = pegar("btn-calcular");
const botaoTentar = pegar("btn-tentar");
const botaoIniciar = pegar("btn-iniciar");
const botaoPausar = pegar("btn-pausar");
const botaoReiniciar = pegar("btn-reiniciar");
const botaoCentralizar = pegar("btn-centralizar");
const notaSimulacao = pegar("nota-simulacao");
const blocoComparacao = pegar("comparacao");
const blocoCombustivel = pegar("bloco-combustivel");
const alternador = pegar("alternar-rota");
const btnVerNormal = pegar("ver-normal");
const btnVerTurbo = pegar("ver-turbo");
const criterioTempo = pegar("criterio-tempo");
const criterioDistancia = pegar("criterio-distancia");
const grupoCriterio = pegar("grupo-criterio");
const rotuloModo = pegar("rotulo-modo");
const descModo = pegar("desc-modo");
const cartaoModo = pegar("cartao-modo");
const barraProgresso = pegar("barra-progresso");
const barraPreench = pegar("barra-progresso-preench");
const infoParada = pegar("info-parada");
const infoProgresso = pegar("info-progresso");
const legAlternativa = pegar("leg-alternativa");
const legAlternativaTexto = pegar("leg-alternativa-texto");
const legSelecionadaTexto = pegar("leg-selecionada-texto");
const dadoConsumo = pegar("dado-consumo");

let grupoGalpao;
let painel;
let buscaGalpao, buscaColeta, buscaEntrega, buscaEditor;   // campos de pesquisa de locais (opcionais)

// ---------- Galpão e vagas ----------

function galpaoProvisorio() {
  return { id: "galpao-provisorio", nome: "Galpão provisório (defina no mapa)", lat: CENTRO_RECIFE[0], lng: CENTRO_RECIFE[1] };
}

// Cada veículo fica numa vaga ligeiramente diferente, para os marcadores não se sobreporem.
function emVaga(base, vaga) {
  return { ...base, lat: base.lat + Math.floor(vaga / 5) * 0.00018, lng: base.lng + (vaga % 5) * 0.00018 };
}

function proximaVagaLivre() {
  const usadas = new Set(Array.from(estados.values()).map((e) => e.vaga));
  let vaga = 0;
  while (usadas.has(vaga)) vaga += 1;
  return vaga;
}

function definirCampo(input, local) {
  input.value = local ? local.nome : "";
}

// ---------- Inicialização ----------

async function iniciarPagina() {
  if (typeof L === "undefined") {
    mostrarMensagem("O mapa não carregou. Verifique a internet e recarregue a página.", "erro", false, null);
    return;
  }

  const lido = lerGalpao();
  galpaoDefinido = Boolean(lido.galpao);
  galpao = lido.galpao || galpaoProvisorio();
  const viagens = carregarViagens();
  planos = viagens.planos;

  mapa = iniciarMapa("mapa");
  grupoGalpao = criarGrupo().addTo(mapa);
  atualizarMarcadorGalpao();
  mapa.on("click", aoClicarMapa);

  painel = criarPainelEntregas({
    aoLocalizar: (entrega) => mapa.setView([entrega.lat, entrega.lng], 16),
    aoEditar: (entrega) => abrirEditor(entrega),
    aoRemover: (entrega) => removerDoPlano(entrega),
    aoSalvar: salvarEditor,
    aoEscolherNoMapa: () => entrarModoMapa("editor"),
    aoCancelar: cancelarEditor
  });

  iniciarBuscas();
  ligarBotoes();
  definirAvisoDeMudanca(aoMudarEstado);
  definirAvisoDeProgresso(atualizarProgresso);
  notaSimulacao.textContent =
    "Animação acelerada: cerca de 1 s na tela = 1 min de viagem. Cada parada dura " + PARAMETROS_SIMULACAO.esperaParadaS +
    " s na tela, mas o relógio simulado (parte de " + formatarHorario(PARAMETROS_SIMULACAO.horaInicial) +
    ") soma o tempo de atendimento informado em cada parada.";

  await sincronizarVeiculos();
  selecionarPrimeiroDisponivel();

  if (lido.erro) mostrarMensagem(lido.erro, "erro", false, null);
  else if (viagens.erro) mostrarMensagem(viagens.erro, "erro", false, null);
  else if (!galpaoDefinido) mostrarMensagem("Defina o galpão onde os veículos ficam estacionados. Essa localização será salva neste navegador.", "info", false, null);
}

// ---------- Veículos cadastrados ↔ mapa ----------

let filaDeSincronizacao = Promise.resolve();

// Várias chamadas seguidas viram uma fila: nunca duas sincronizações ao mesmo tempo (evita marcadores duplicados).
function agendarSincronizacao() {
  filaDeSincronizacao = filaDeSincronizacao.then(sincronizarVeiculos).catch(() => {});
  return filaDeSincronizacao;
}

async function sincronizarVeiculos() {
  let cadastro;
  try {
    cadastro = await listarVeiculos();
  } catch (erro) {
    listaVeiculos.innerHTML = "";
    const item = document.createElement("li");
    item.className = "estado-vazio";
    item.textContent = erro.message;
    listaVeiculos.appendChild(item);
    return;
  }

  const idsCadastrados = new Set(cadastro.map((v) => v.id));
  estados.forEach((estado, id) => { if (!idsCadastrados.has(id)) removerVeiculoDoMapa(estado); });

  ordemDaLista = cadastro.map((v) => v.id);
  cadastro.forEach((dados) => {
    const existente = estados.get(dados.id);
    if (existente) atualizarVeiculoNoMapa(existente, dados);
    else criarVeiculoNoMapa(dados);
  });

  // Planos de veículos que não existem mais no cadastro não têm utilidade.
  Object.keys(planos).forEach((id) => { if (!idsCadastrados.has(id)) delete planos[id]; });

  desenharLista();

  const selecionadoValido = selecionado && estados.get(selecionado.dados.id) === selecionado && selecionado.dados.situacao === "Ativo";
  if (!selecionadoValido) {
    const ficouIndisponivel = selecionado && estados.get(selecionado.dados.id) === selecionado && selecionado.dados.situacao !== "Ativo";
    const aviso = ficouIndisponivel
      ? "O veículo " + selecionado.dados.codigo + " ficou “" + selecionado.dados.situacao + "” e não pode mais receber viagens. O planejamento dele foi mantido."
      : null;
    selecionado = null;
    selecionarPrimeiroDisponivel();
    if (aviso) mostrarMensagem(aviso, "info", false, null);
  } else {
    atualizarDetalhes(selecionado);
    atualizarBotoes();
  }
}

function selecionarPrimeiroDisponivel() {
  const primeiro = ordemDaLista.map((id) => estados.get(id)).find((e) => e && e.dados.situacao === "Ativo");
  if (primeiro) selecionarVeiculo(primeiro);
  else mostrarSemVeiculo();
}

function criarVeiculoNoMapa(dados) {
  const vaga = proximaVagaLivre();
  const base = emVaga(galpao, vaga);
  const linhaAlternativa = criarLinha([], { color: COR_NORMAL, weight: 4, opacity: 0.55, dashArray: "6 8" }).addTo(mapa);
  const linhaCompleta = criarLinha([], ESTILO_OUTRA).addTo(mapa);
  const linhaPercorrida = criarLinha([], { color: COR_PERCORRIDO, weight: 6, opacity: 1 }).addTo(mapa);
  const marcador = criarMarcadorVeiculo([base.lat, base.lng], dados.codigo).addTo(mapa);
  const estado = criarEstado(dados, marcador, linhaPercorrida);
  if (!planos[dados.id]) planos[dados.id] = criarPlanoVazio();
  Object.assign(estado, {
    vaga, localGalpao: base, plano: planos[dados.id],
    linhaCompleta, linhaAlternativa, pontos: criarGrupo(),
    requisicaoRota: 0, controle: null, erro: null, mensagem: null,
    resultado: null, ordemIds: null, versaoPlano: 0, rotaVersao: -1, ultimoStatus: "sem-rota",
    cenarios: null, cenarioAtivo: null, rotasCenario: {}, idViagem: null, registrado: false,
    parametros: null, metricas: null, aproximado: false, falhaServico: null, corRota: COR_TURBO
  });
  estado.origem = base;
  marcador.on("click", () => {
    if (estado.dados.situacao === "Ativo") selecionarVeiculo(estado);
    else mostrarMensagem("O veículo " + estado.dados.codigo + " está “" + estado.dados.situacao + "” e não pode receber viagens.", "info", false, null);
  });
  estados.set(dados.id, estado);
  aplicarEstiloMarcador(estado);
  if (estado.plano.coleta || estado.plano.entregas.length) estado.mensagem = {
    texto: "Plano salvo restaurado (" + estado.plano.entregas.length + " entrega(s)). Clique em “Otimizar rota” para calcular o percurso.",
    tipo: "info", tentar: false
  };
}

function atualizarVeiculoNoMapa(estado, dados) {
  const codigoMudou = estado.dados.codigo !== dados.codigo;
  const deixouDeEstarAtivo = estado.dados.situacao === "Ativo" && dados.situacao !== "Ativo";
  estado.dados = dados;
  if (codigoMudou) atualizarMarcadorVeiculo(estado.marcador, dados.codigo);
  if (deixouDeEstarAtivo && (estado.status === "em-movimento" || estado.status === "em-parada")) pausar(estado);
  aplicarEstiloMarcador(estado);
}

function removerVeiculoDoMapa(estado) {
  estado.requisicaoRota += 1;
  if (estado.controle) estado.controle.abort();
  destruirEstado(estado);
  [estado.marcador, estado.linhaAlternativa, estado.linhaCompleta, estado.linhaPercorrida, estado.pontos].forEach((camada) => mapa.removeLayer(camada));
  estados.delete(estado.dados.id);
  delete planos[estado.dados.id];
  if (selecionado === estado) selecionado = null;
}

function aplicarEstiloMarcador(estado) {
  const elemento = estado.marcador.getElement();
  if (!elemento) return;
  elemento.classList.toggle("selecionado", estado === selecionado);
  elemento.classList.toggle("inativo", estado.dados.situacao !== "Ativo");
  estado.marcador.setZIndexOffset(estado === selecionado ? 1000 : 0);
}

function persistirPlanos() {
  gravacaoFalhou = !salvarViagens(planos);
  if (gravacaoFalhou && selecionado) {
    mostrarMensagem("Não foi possível salvar o planejamento neste navegador.", "erro", false, selecionado);
  }
}

// ---------- Galpão ----------

function atualizarMarcadorGalpao() {
  grupoGalpao.clearLayers();
  if (!galpaoDefinido) return;
  criarPontoRota(galpao, "Galpão: " + galpao.nome, NAVY, true).addTo(grupoGalpao);
}

function emViagem(estado) {
  return estado.status === "em-movimento" || estado.status === "em-parada" || estado.status === "pausado";
}

// Descarta a rota do veículo: invalida requisições antigas, para temporizadores e limpa o mapa.
function invalidarRota(estado) {
  estado.requisicaoRota += 1;
  if (estado.controle) { estado.controle.abort(); estado.controle = null; }
  estado.carregando = false;
  estado.erro = null;
  estado.resultado = null;
  estado.ordemIds = null;
  estado.versaoPlano += 1;
  estado.cenarios = null;
  estado.cenarioAtivo = null;
  estado.rotasCenario = {};
  estado.idViagem = null;
  estado.registrado = false;
  estado.metricas = null;
  estado.falhaServico = null;
  limparRota(estado, estado.localGalpao);
  estado.linhaCompleta.setLatLngs([]);
  estado.linhaAlternativa.setLatLngs([]);
}

function definirGalpao(local) {
  const haRotas = Array.from(estados.values()).some((e) => e.rota);
  if (haRotas && !window.confirm("Mudar o galpão cancela as rotas calculadas e leva os veículos à nova base. As entregas planejadas são mantidas. Continuar?")) {
    mostrarMensagem("Galpão mantido.", "info", false, null);
    return false;
  }
  galpao = { ...local, id: "galpao-principal" };
  galpaoDefinido = true;
  const salvo = salvarGalpao(galpao);
  estados.forEach((estado) => {
    estado.localGalpao = emVaga(galpao, estado.vaga);
    invalidarRota(estado);
    estado.mensagem = null;
  });
  atualizarMarcadorGalpao();
  if (selecionado) selecionarVeiculo(selecionado);
  centralizarEm(mapa, [galpao.lat, galpao.lng]);
  mostrarMensagem(
    salvo ? "Galpão salvo: " + galpao.nome + ". Os veículos estão na base; marque a coleta e adicione as entregas."
      : "Galpão definido nesta sessão, mas não pôde ser salvo para a próxima visita.",
    salvo ? "ok" : "erro", false, null
  );
  return true;
}

// ---------- Otimização e rota ----------

function pontoDaBase(estado) {
  return { ...estado.localGalpao, nome: galpao.nome };
}

async function otimizarRotaSelecionada() {
  const estado = selecionado;
  if (!estado) return;
  const plano = estado.plano;
  if (estado.dados.situacao !== "Ativo") { mostrarMensagem("Este veículo não está ativo.", "erro", false, estado); return; }
  if (!galpaoDefinido) { mostrarMensagem("Defina primeiro o galpão onde os veículos ficam estacionados.", "erro", false, estado); return; }
  if (!plano.coleta) { mostrarMensagem("Marque o local de coleta do produto.", "erro", false, estado); return; }
  if (plano.entregas.length === 0) { mostrarMensagem("Adicione pelo menos uma entrega.", "erro", false, estado); return; }
  if (emViagem(estado)) pausar(estado);

  // Nova requisição: qualquer resposta de uma consulta anterior será ignorada.
  if (estado.controle) estado.controle.abort();
  const controle = new AbortController();
  estado.controle = controle;
  const requisicao = estado.requisicaoRota + 1;
  estado.requisicaoRota = requisicao;
  const versao = estado.versaoPlano;
  const atual = () => requisicao === estado.requisicaoRota && versao === estado.versaoPlano;

  estado.carregando = true;
  estado.erro = null;
  estado.mensagem = null;
  atualizarEtiqueta(estado);
  mostrarMensagem("Calculando tempos entre os pontos e a melhor ordem de entrega…", "info", false, estado);
  atualizarBotoes();

  try {
    const base = pontoDaBase(estado);
    const entregas = plano.entregas.slice();
    const comRetorno = plano.retornarBase;

    // Pontos da matriz: 0 = base, 1 = coleta, 2.. = entregas (na ordem em que o usuário as adicionou).
    const pontosMatriz = [base, plano.coleta, ...entregas];
    const informada = entregas.map((_, i) => i + 2);
    let falhaServico = null;
    let cenarios = null;

    // Uma única consulta de matriz abastece os DOIS cenários (Normal e Turbo): nada de consultas por rota.
    if (entregas.length > 1) {
      let matriz;
      try {
        matriz = await obterMatriz(pontosMatriz, { signal: controle.signal });
      } catch (erro) {
        if (erro && erro.name === "AbortError") return;
        if (erro instanceof ErroRoteamento && (erro.codigo === "grande" || erro.codigo === "entrada" || erro.codigo === "sem-rota")) throw erro;
        falhaServico = erro instanceof ErroRoteamento ? erro : new ErroRoteamento("Falha ao consultar o serviço de rotas.", "desconhecido");
        matriz = matrizAproximada(pontosMatriz);
      }
      if (!atual()) return;
      cenarios = { ...calcularCenarios(matriz, { galpao: 0, inicio: 1, entregas: informada, fim: comRetorno ? 0 : null, criterio: plano.criterio }), modoTempos: matriz.modo };
    }

    estado.cenarios = cenarios;
    estado.rotasCenario = {};
    estado.falhaServico = falhaServico;
    // Consumo e preço usados neste cálculo ficam guardados para o histórico ser coerente com a tela.
    estado.parametros = { consumoKmL: estado.dados.consumoKmL === undefined ? null : estado.dados.consumoKmL, precoLitro: lerConfiguracoes().precoCombustivel };

    await aplicarCenario(estado, plano.otimizar ? "turbo" : "normal", atual, controle.signal);
  } catch (erro) {
    if (erro && erro.name === "AbortError") return;
    if (!atual()) return;
    estado.carregando = false;
    estado.controle = null;
    estado.erro = erro;
    const texto = erro instanceof ErroRoteamento ? erro.message : "Não foi possível calcular a rota: " + (erro && erro.message ? erro.message : "erro inesperado.");
    mostrarMensagem(texto, "erro", true, estado);
  } finally {
    if (atual()) {
      estado.carregando = false;
      atualizarEtiqueta(estado);
      if (estado === selecionado) { atualizarBotoes(); atualizarOverlayMapa(estado); }
    }
  }
}

/**
 * Coloca na tela (e na simulação) a rota Normal ou Turbo. A geometria pelas ruas só é pedida ao
 * serviço para o cenário escolhido, e fica guardada: alternar de volta não consulta de novo.
 * @returns {Promise<boolean>} true se aplicou (false se a requisição ficou obsoleta)
 */
async function aplicarCenario(estado, chave, atual, signal) {
  const plano = estado.plano;
  const base = pontoDaBase(estado);
  const coleta = plano.coleta;
  const entregas = plano.entregas;
  const comRetorno = plano.retornarBase;
  const cenarios = estado.cenarios;

  const ordemIndices = cenarios ? cenarios[chave].ordem : entregas.map((_, i) => i + 2);
  const entregasOrdenadas = ordemIndices.map((indice) => entregas[indice - 2]);
  const pontosFinais = [base, coleta, ...entregasOrdenadas, ...(comRetorno ? [base] : [])];

  let rota = estado.rotasCenario[chave];
  if (!rota) {
    const falha = estado.falhaServico;
    if (falha && (falha.codigo === "tempo" || falha.codigo === "rede")) {
      rota = rotaDireta(pontosFinais);   // o serviço já falhou: não insiste por mais 20 s
      rota.falha = falha.message;
    } else {
      rota = await calcularRota(pontosFinais, { signal });
    }
    if (!atual()) return false;
    estado.rotasCenario[chave] = rota;
  }

  const resultado = {
    chave,
    metodo: chave === "normal" ? (entregas.length > 1 ? "manual" : "unica") : (cenarios ? cenarios.turbo.metodo : "unica"),
    modoTempos: cenarios ? cenarios.modoTempos : "ruas",
    aviso: null
  };
  if (rota.modo === "direta") {
    resultado.aviso = rota.falha || (estado.falhaServico && estado.falhaServico.message) || "O serviço de rotas não respondeu.";
  }

  const paradas = [
    { id: coleta.id, papel: "Coleta", local: coleta, minutos: coleta.minutos },
    ...entregasOrdenadas.map((e) => ({ id: e.id, papel: "Entrega", local: e, minutos: e.minutos })),
    ...(comRetorno ? [{ id: "retorno-base", papel: "Retorno", local: base, minutos: 0 }] : [])
  ];

  estado.carregando = false;
  estado.controle = null;
  estado.ordemIds = entregasOrdenadas.map((e) => e.id);
  estado.resultado = resultado;
  estado.cenarioAtivo = chave;
  estado.corRota = chave === "turbo" ? COR_TURBO : COR_NORMAL;
  estado.metricas = cenarios
    ? { distanciaKm: cenarios[chave].distanciaKm, deslocamentoMin: cenarios[chave].deslocamentoMin }
    : { distanciaKm: rota.distanciaKm, deslocamentoMin: rota.duracaoMin };
  estado.aproximado = (cenarios ? cenarios.origemDados === "aproximacao" : false) || rota.modo === "direta";
  estado.rotaVersao = estado.versaoPlano;
  estado.idViagem = novoIdLocal("viagem");   // cada rota calculada vale no máximo um registro no histórico
  estado.registrado = false;
  definirRota(estado, rota, estado.localGalpao, paradas);
  desenharRota(estado);
  estado.mensagem = mensagemDeSucesso(estado);
  mostrarMensagem(estado.mensagem.texto, estado.mensagem.tipo, estado.mensagem.tentar, estado);
  renderizarPlano(estado);
  centralizar(estado);
  return true;
}

// Alterna entre Normal e Turbo reaproveitando a matriz já calculada (sem recalcular a ordem).
async function escolherCenario(chave) {
  const estado = selecionado;
  if (!estado || !estado.cenarios || !rotaValida(estado) || estado.carregando || estado.cenarioAtivo === chave) {
    if (estado) renderizarPlano(estado);
    return;
  }
  if (emViagem(estado) && !window.confirm("Trocar a rota cancela a viagem em andamento e o veículo volta ao galpão. Continuar?")) {
    renderizarPlano(estado);
    return;
  }
  estado.plano.otimizar = chave === "turbo";
  persistirPlanos();

  if (estado.controle) estado.controle.abort();
  const controle = new AbortController();
  estado.controle = controle;
  const requisicao = estado.requisicaoRota + 1;
  estado.requisicaoRota = requisicao;
  const versao = estado.versaoPlano;
  const atual = () => requisicao === estado.requisicaoRota && versao === estado.versaoPlano;

  estado.carregando = true;
  mostrarMensagem("Carregando o percurso da rota " + (chave === "turbo" ? "Turbo" : "Normal") + "…", "info", false, estado);
  atualizarBotoes();
  atualizarOverlayMapa(estado);
  try {
    await aplicarCenario(estado, chave, atual, controle.signal);
  } catch (erro) {
    if (erro && erro.name === "AbortError") return;
    if (!atual()) return;
    estado.controle = null;
    mostrarMensagem(erro instanceof ErroRoteamento ? erro.message : "Não foi possível carregar a rota: " + (erro && erro.message ? erro.message : "erro inesperado."), "erro", false, estado);
  } finally {
    if (atual()) {
      estado.carregando = false;
      atualizarEtiqueta(estado);
      if (estado === selecionado) { renderizarPlano(estado); }
    }
  }
}

function mensagemDeSucesso(estado) {
  const r = estado.resultado;
  const turbo = r.chave === "turbo";
  if (estado.rota.modo === "direta") {
    return {
      texto: "O serviço de rotas não respondeu (" + r.aviso + ") A linha reta é só uma aproximação: não segue as ruas e a ordem não garante o menor tempo real. Tente novamente.",
      tipo: "erro", tentar: true
    };
  }
  if (r.modoTempos === "aproximada") {
    return {
      texto: turbo
        ? "A ordem foi escolhida por distância em linha reta (os tempos pelas ruas não puderam ser obtidos), então não garante o menor tempo real. Tente novamente para otimizar pelos tempos reais."
        : "Os tempos pelas ruas não puderam ser obtidos; a comparação com o Turbo usa linha reta e é apenas aproximada. Tente novamente.",
      tipo: "erro", tentar: true
    };
  }
  if (r.metodo === "exato") return { texto: "Rota Turbo otimizada: solução exata (ótima) para os tempos estimados pelas ruas.", tipo: "ok", tentar: false };
  if (r.metodo === "heuristica") return { texto: "Rota Turbo otimizada estimada (heurística): boa solução, sem garantia de ser a melhor possível.", tipo: "ok", tentar: false };
  if (r.metodo === "manual") return { texto: "Rota Normal calculada na ordem em que as entregas foram adicionadas.", tipo: "ok", tentar: false };
  return { texto: "Percurso pronto.", tipo: "ok", tentar: false };
}

function rotaValida(estado) {
  return Boolean(estado && estado.rota && estado.rotaVersao === estado.versaoPlano);
}

// Estilo da rota principal: cor do cenário (Normal/Turbo); tracejada se for só linha reta aproximada.
function estiloDaLinha(estado, escolhido) {
  if (!escolhido) return ESTILO_OUTRA;
  const direta = estado.rota && estado.rota.modo === "direta";
  return { color: estado.corRota || COR_TURBO, weight: direta ? 4 : 6, opacity: 0.95, dashArray: direta ? "8 8" : null };
}

// A outra opção (se já tiver sido consultada) aparece discreta, para comparar os percursos.
function desenharAlternativa(estado) {
  const outra = estado.cenarioAtivo === "turbo" ? "normal" : "turbo";
  const rotaOutra = estado === selecionado && rotaValida(estado) ? estado.rotasCenario[outra] : null;
  if (rotaOutra) {
    estado.linhaAlternativa.setLatLngs(rotaOutra.coordenadas);
    estado.linhaAlternativa.setStyle({ color: outra === "turbo" ? COR_TURBO : COR_NORMAL, weight: 4, opacity: 0.55, dashArray: "6 8" });
  } else {
    estado.linhaAlternativa.setLatLngs([]);
  }
}

function desenharRota(estado) {
  estado.linhaCompleta.setLatLngs(estado.rota.coordenadas);
  estado.linhaCompleta.setStyle(estiloDaLinha(estado, estado === selecionado));
  desenharAlternativa(estado);
  if (estado === selecionado) {
    estado.linhaCompleta.bringToFront();
    estado.linhaPercorrida.bringToFront();
  }
}

// Alternador Normal/Turbo e legenda sobre o mapa.
function atualizarOverlayMapa(estado) {
  const comparavel = Boolean(estado && rotaValida(estado) && estado.cenarios);
  alternador.hidden = !comparavel;
  if (comparavel) {
    btnVerNormal.setAttribute("aria-pressed", estado.cenarioAtivo === "normal" ? "true" : "false");
    btnVerTurbo.setAttribute("aria-pressed", estado.cenarioAtivo === "turbo" ? "true" : "false");
    btnVerNormal.disabled = btnVerTurbo.disabled = Boolean(estado.carregando);
  }
  const ativa = estado && rotaValida(estado) ? estado.cenarioAtivo : null;
  const rotulo = (c) => (c === "turbo" ? "Rota Turbo" : "Rota Normal");
  legSelecionadaTexto.textContent = ativa ? rotulo(ativa) + " (selecionada)" : "Rota selecionada";
  legSelecionadaTexto.previousElementSibling.style.setProperty("--c", ativa === "normal" ? COR_NORMAL : COR_TURBO);
  const outra = ativa === "turbo" ? "normal" : "turbo";
  const temOutra = Boolean(ativa && estado.rotasCenario[outra]);
  legAlternativa.hidden = !temOutra;
  if (temOutra) {
    legAlternativaTexto.textContent = rotulo(outra) + " (alternativa)";
    legAlternativaTexto.previousElementSibling.style.setProperty("--c", outra === "turbo" ? COR_TURBO : COR_NORMAL);
  }
}

// Etapas do planejamento: concluída, atual ou pendente.
function atualizarEtapas(estado) {
  const plano = estado ? estado.plano : null;
  const feitas = [
    Boolean(estado),
    Boolean(estado && galpaoDefinido && plano.coleta && plano.entregas.length > 0),
    Boolean(estado && rotaValida(estado)),
    Boolean(estado && rotaValida(estado) && estado.status === "concluida")
  ];
  // A etapa 3 (modo) tem valor padrão: considera-se feita quando a rota foi calculada.
  const atual = feitas.findIndex((f) => !f);
  for (let i = 0; i < 4; i++) {
    const li = pegar("etapa-" + (i + 1));
    li.className = feitas[i] ? "feita" : (i === atual ? "atual" : "");
    const a = li.querySelector("a");
    if (i === atual) a.setAttribute("aria-current", "step"); else a.removeAttribute("aria-current");
  }
}

// Barra de progresso da simulação (só do veículo selecionado).
function atualizarProgresso(estado) {
  if (estado !== selecionado) return;
  const tem = Boolean(estado && estado.rota && rotaValida(estado));
  const pct = tem && estado.distTotal > 0 ? Math.min(100, Math.round(estado.distAtual / estado.distTotal * 100)) : 0;
  const final = tem && estado.status === "concluida" ? 100 : pct;
  barraPreench.style.width = final + "%";
  barraProgresso.setAttribute("aria-valuenow", String(final));
  infoProgresso.textContent = final + "%";
  infoParada.textContent = tem ? textoStatus(estado, false) : "—";
}

// Comparação Normal × Turbo (ou estimativa simples quando há uma só entrega).
function mostrarResultadoExtra(estado) {
  if (!rotaValida(estado)) { blocoComparacao.hidden = true; blocoCombustivel.hidden = true; return; }
  const p = estado.parametros || { consumoKmL: null, precoLitro: null };
  if (estado.cenarios) {
    blocoCombustivel.hidden = true;
    renderizarComparacao(blocoComparacao, {
      cenarios: estado.cenarios, consumoKmL: p.consumoKmL, precoLitro: p.precoLitro,
      codigoVeiculo: estado.dados.codigo, atendimentoMin: estado.atendimentoTotalMin,
      selecionado: estado.cenarioAtivo, aproximado: estado.aproximado
    });
  } else {
    blocoComparacao.hidden = true;
    renderizarCombustivel(blocoCombustivel, {
      distanciaKm: estado.metricas.distanciaKm, consumoKmL: p.consumoKmL, precoLitro: p.precoLitro,
      codigoVeiculo: estado.dados.codigo, aproximado: estado.aproximado
    });
  }
}

// Grava UMA vez no histórico a viagem que acabou de ser concluída.
function registrarConclusao(estado) {
  if (estado.registrado || !estado.idViagem || !estado.metricas || !estado.parametros) return null;
  estado.registrado = true;
  const cen = estado.cenarios;
  const chave = estado.cenarioAtivo;
  const n = estado.plano.entregas.length;
  const metodo = chave === "normal" ? (n > 1 ? "manual" : "trivial")
    : (cen ? (cen.turbo.manteveOrdemInformada ? "heuristica" : cen.turbo.metodo) : "trivial");
  const registro = montarRegistroViagem({
    id: estado.idViagem,
    veiculo: { id: estado.dados.id, codigo: estado.dados.codigo, tipo: estado.dados.tipo, consumoKmL: estado.parametros.consumoKmL },
    modo: chave,
    criterio: cen ? cen.criterio : estado.plano.criterio,
    entregas: n,
    retornouGalpao: estado.plano.retornarBase,
    metricas: estado.metricas,
    atendimentoMin: estado.atendimentoTotalMin,
    normal: cen ? { distanciaKm: cen.normal.distanciaKm, deslocamentoMin: cen.normal.deslocamentoMin } : null,
    precoLitro: estado.parametros.precoLitro,
    metodo,
    origem: estado.aproximado ? "aproximacao" : "osrm",
    paradas: estado.paradas.map((parada, i) => ({ papel: parada.papel, nome: parada.local.nome, horario: formatarHorario(estado.chegadas[i] !== undefined ? estado.chegadas[i] : parada.chegadaMin) }))
  });
  return registrarViagem(registro);
}

// Pontos de coleta e entrega do veículo selecionado (numerados pela ordem de visita quando há rota).
function desenharPontos(estado) {
  estado.pontos.clearLayers();
  const plano = estado.plano;
  if (plano.coleta) criarPontoRota(plano.coleta, "Coleta: " + plano.coleta.nome, AMARELO, true).addTo(estado.pontos);

  const comRota = rotaValida(estado) && estado.ordemIds;
  const lista = comRota
    ? estado.ordemIds.map((id) => plano.entregas.find((e) => e.id === id)).filter(Boolean)
    : plano.entregas;
  const fixo = plano.entregas.length <= ROTULOS_FIXOS_ATE;
  lista.forEach((entrega, i) => {
    criarPontoNumerado(entrega, i + 1, (i + 1) + ". " + entrega.nome, comRota ? AZUL_PONTO : CINZA_PONTO, fixo).addTo(estado.pontos);
  });
}

function posicoesDeVisita(estado) {
  if (!rotaValida(estado) || !estado.ordemIds) return null;
  const posicoes = {};
  estado.ordemIds.forEach((id, i) => { posicoes[id] = i + 1; });
  return posicoes;
}

// ---------- Seleção de veículo ----------

function selecionarVeiculo(estado) {
  if (!estado) return;
  if (estado.dados.situacao !== "Ativo") {
    mostrarMensagem("O veículo " + estado.dados.codigo + " está “" + estado.dados.situacao + "” e não pode receber viagens.", "info", false, null);
    return;
  }
  cancelarModoMapa();
  painel.fecharEditor();
  limparBuscasDoVeiculo();
  selecionado = estado;

  estados.forEach((e) => {
    const escolhido = e === estado;
    aplicarEstiloMarcador(e);
    e.linhaCompleta.setStyle(estiloDaLinha(e, escolhido));
    if (escolhido) e.pontos.addTo(mapa); else mapa.removeLayer(e.pontos);
    if (e.elBotao) e.elBotao.setAttribute("aria-pressed", escolhido ? "true" : "false");
  });

  estados.forEach((e) => desenharAlternativa(e));
  estado.linhaCompleta.bringToFront();
  estado.linhaPercorrida.bringToFront();
  renderizarPlano(estado);
  mostrarMensagemPadrao(estado);
  centralizar(estado);
}

function mostrarSemVeiculo() {
  selecionado = null;
  cancelarModoMapa();
  painel.fecharEditor();
  limparBuscasDoVeiculo();
  estados.forEach((e) => { mapa.removeLayer(e.pontos); aplicarEstiloMarcador(e); });
  semSelecao.hidden = false;
  semSelecao.textContent = estados.size === 0
    ? "Nenhum veículo cadastrado."
    : "Nenhum veículo ativo. Veículos em manutenção ou inativos não recebem viagens.";
  dadosVeiculo.hidden = true;
  definirCampo(inputGalpao, galpaoDefinido ? galpao : null);
  definirCampo(inputColeta, null);
  painel.desenhar({ entregas: [], posicoes: null, bloqueado: true });
  resumoRota.hidden = true;
  blocoComparacao.hidden = true;
  blocoCombustivel.hidden = true;
  desenharPercurso(null);
  atualizarBotoes();
  atualizarOverlayMapa(null);
  atualizarEtapas(null);
  atualizarProgresso(null);
}

function mostrarMensagemPadrao(estado) {
  const dica = (() => {
    if (!galpaoDefinido) return "Defina o galpão no mapa antes de montar uma viagem.";
    if (!estado.plano.coleta) return "Marque o local de coleta do produto. O veículo sai do galpão.";
    if (estado.plano.entregas.length === 0) return "Adicione uma ou mais entregas.";
    if (!rotaValida(estado)) return "Planejamento pronto. Clique em “Otimizar rota” para calcular o percurso.";
    return null;
  })();

  if (estado.carregando) mostrarMensagem("Calculando rota…", "info", false, estado);
  else if (estado.mensagem) mostrarMensagem(estado.mensagem.texto, estado.mensagem.tipo, estado.mensagem.tentar, estado);
  else if (estado.erro) mostrarMensagem(estado.erro.message, "erro", true, estado);
  else if (dica) mostrarMensagem(dica, "info", false, null);
  else limparMensagem();
}

function centralizar(estado) {
  if (rotaValida(estado)) { ajustarVisao(mapa, estado.linhaCompleta.getBounds()); return; }
  const pontos = [[estado.localGalpao.lat, estado.localGalpao.lng]];
  if (estado.plano.coleta) pontos.push([estado.plano.coleta.lat, estado.plano.coleta.lng]);
  estado.plano.entregas.forEach((e) => pontos.push([e.lat, e.lng]));
  if (pontos.length > 1) ajustarVisao(mapa, L.latLngBounds(pontos));
  else centralizarEm(mapa, pontos[0]);
}

// ---------- Painel ----------

function desenharLista() {
  listaVeiculos.innerHTML = "";
  let haAtivo = false;
  ordemDaLista.forEach((id) => {
    const estado = estados.get(id);
    if (!estado) return;
    const ativo = estado.dados.situacao === "Ativo";
    if (ativo) haAtivo = true;
    const item = document.createElement("li");
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "item-veiculo";
    botao.setAttribute("aria-pressed", estado === selecionado ? "true" : "false");
    botao.disabled = !ativo;
    if (!ativo) botao.title = "Veículo " + estado.dados.situacao.toLowerCase() + ": não recebe novas viagens";
    const codigo = document.createElement("span");
    codigo.className = "item-codigo";
    codigo.textContent = estado.dados.codigo;
    const tipo = document.createElement("span");
    tipo.className = "item-tipo";
    tipo.textContent = estado.dados.tipo;
    const etiqueta = document.createElement("span");
    botao.append(codigo, tipo, etiqueta);
    botao.addEventListener("click", () => selecionarVeiculo(estado));
    item.appendChild(botao);
    listaVeiculos.appendChild(item);
    estado.elBotao = botao;
    estado.elEtiqueta = etiqueta;
    atualizarEtiqueta(estado);
  });
  if (ordemDaLista.length === 0) {
    const vazio = document.createElement("li");
    vazio.className = "estado-vazio";
    vazio.textContent = "Nenhum veículo cadastrado.";
    listaVeiculos.appendChild(vazio);
  }
  avisoSemVeiculos.hidden = haAtivo;
}

function atualizarEtiqueta(estado) {
  if (!estado.elEtiqueta) return;
  if (estado.dados.situacao !== "Ativo") {
    estado.elEtiqueta.textContent = estado.dados.situacao;
    estado.elEtiqueta.className = "etiqueta etiqueta-parado";
    return;
  }
  estado.elEtiqueta.textContent = textoStatus(estado, true);
  estado.elEtiqueta.className = "etiqueta " + classeEtiqueta(estado);
}

function atualizarDetalhes(estado) {
  semSelecao.hidden = true;
  dadosVeiculo.hidden = false;
  pegar("dado-codigo").textContent = estado.dados.codigo;
  pegar("dado-tipo").textContent = estado.dados.tipo;
  pegar("dado-situacao").textContent = estado.dados.situacao;
  dadoConsumo.textContent = Number.isFinite(estado.dados.consumoKmL) ? estado.dados.consumoKmL.toLocaleString("pt-BR") + " km/L" : "Não cadastrado";
  pegar("dado-movimento").textContent = textoStatus(estado, false);
}

// Redesenha tudo o que depende do plano do veículo selecionado.
function renderizarPlano(estado) {
  if (estado !== selecionado) return;
  definirCampo(inputGalpao, galpaoDefinido ? galpao : null);
  definirCampo(inputColeta, estado.plano.coleta);
  optOtimizar.checked = estado.plano.otimizar;
  optRetorno.checked = estado.plano.retornarBase;
  criterioTempo.checked = estado.plano.criterio !== "distancia";
  criterioDistancia.checked = estado.plano.criterio === "distancia";
  rotuloModo.textContent = estado.plano.otimizar ? "Modo Turbo" : "Modo Normal";
  descModo.textContent = estado.plano.otimizar
    ? "Reordena as entregas pelo Problema do Caixeiro Viajante para reduzir o deslocamento."
    : "Mantém exatamente a ordem em que você cadastrou as entregas. Ligue o Turbo para reordená-las.";
  cartaoModo.classList.toggle("turbo-ativo", estado.plano.otimizar);
  grupoCriterio.hidden = !estado.plano.otimizar;
  painel.desenhar({
    entregas: estado.plano.entregas,
    posicoes: posicoesDeVisita(estado),
    bloqueado: estado.carregando
  });
  desenharPontos(estado);
  atualizarDetalhes(estado);
  mostrarResumo(estado);
  mostrarResultadoExtra(estado);
  desenharPercurso(estado);
  atualizarBotoes();
  atualizarOverlayMapa(estado);
  atualizarEtapas(estado);
  atualizarProgresso(estado);
}

function mostrarResumo(estado) {
  if (!rotaValida(estado)) { resumoRota.hidden = true; return; }
  const r = estado.rota;
  const res = estado.resultado;
  const direta = r.modo === "direta";
  const total = estado.fimPrevistoMin - PARAMETROS_SIMULACAO.horaInicial;

  resumoNumeros.textContent =
    (direta ? "Distância em linha reta (aproximação): " : "Distância pelas ruas: ") + formatarKm(r.distanciaKm) +
    ". Deslocamento: " + formatarDuracao(r.duracaoMin) +
    ". Atendimentos: " + formatarDuracao(estado.atendimentoTotalMin) +
    ". Total: " + formatarDuracao(total) + " (término simulado às " + formatarHorario(estado.fimPrevistoMin) + ").";

  let texto = "";
  const cen = estado.cenarios;
  const turbo = res.chave !== "normal";
  const reducao = (cen && res.modoTempos === "ruas") ? {
    min: cen.normal.deslocamentoMin - cen.turbo.deslocamentoMin,
    km: cen.normal.distanciaKm - cen.turbo.distanciaKm,
    pctMin: cen.normal.deslocamentoMin > 0 ? (1 - cen.turbo.deslocamentoMin / cen.normal.deslocamentoMin) * 100 : 0
  } : null;
  const detalheReducao = () => {
    const partes = [];
    if (reducao.min >= 0.5) partes.push(formatarDuracao(reducao.min) + " (" + Math.round(reducao.pctMin) + "%)");
    if (reducao.km >= 0.05) partes.push(formatarKm(reducao.km));
    return partes.join(" e ");
  };
  if (!turbo) {
    texto = "Modo Normal: ordem mantida como informada.";
    if (reducao) {
      const d = detalheReducao();
      texto += d ? " O modo Turbo reduziria o deslocamento em " + d + "." : " O modo Turbo não encontrou ordem melhor que a informada.";
    }
  } else {
    if (res.modoTempos === "aproximada") texto = "Ordem escolhida por distância em linha reta; não garante o menor tempo real.";
    else if (res.metodo === "exato") texto = "Ordem otimizada: solução exata (ótima) para os tempos estimados.";
    else if (res.metodo === "heuristica") texto = "Ordem otimizada estimada (heurística): sem garantia de ser a melhor possível.";
    if (reducao) {
      const d = detalheReducao();
      if (d) texto += " Deslocamento na ordem informada: " + formatarDuracao(cen.normal.deslocamentoMin) + "; na ordem otimizada: " + formatarDuracao(cen.turbo.deslocamentoMin) + " (economia de " + d + ").";
      else texto += " A ordem informada já era equivalente à melhor encontrada.";
    }
  }
  resumoOtimizacao.textContent = texto;
  resumoOtimizacao.hidden = texto === "";
  resumoNota.textContent = direta
    ? "Linha reta aproximada a 25 km/h; não acompanha as ruas. O serviço de rotas não respondeu."
    : "Tempos e rota pelas ruas via OSRM, sem trânsito em tempo real.";
  resumoRota.hidden = false;
}

function desenharPercurso(estado) {
  listaPercurso.innerHTML = "";
  if (!rotaValida(estado)) {
    const vazio = document.createElement("li");
    vazio.className = "estado-vazio";
    vazio.textContent = estado
      ? "Defina o galpão, a coleta e as entregas e clique em “Otimizar rota” para ver o percurso."
      : "Escolha um veículo.";
    listaPercurso.appendChild(vazio);
    return;
  }
  descreverPercurso(estado).forEach((item) => {
    const li = document.createElement("li");
    li.className = item.atual ? "percurso-atual" : (item.feito ? "percurso-feito" : "percurso-pendente");
    const titulo = document.createElement("span");
    titulo.className = "percurso-titulo";
    const rotulo = item.papel === "Entrega" ? "Entrega " + item.numero
      : item.papel === "Retorno" ? "Retorno ao galpão" : item.papel;
    titulo.textContent = (item.atual ? "▶ " : item.feito ? "✓ " : "○ ") + rotulo + ": " + item.nome;
    const detalhe = document.createElement("span");
    detalhe.className = "percurso-detalhe";
    if (item.papel === "Saída") detalhe.textContent = (item.feito ? "saiu" : "saída") + " às " + formatarHorario(item.horario) + " (horário simulado)";
    else if (item.feito) detalhe.textContent = "chegada às " + formatarHorario(item.horario) + " (horário simulado)" + (item.minutos ? " · atendimento " + item.minutos + " min" : "");
    else detalhe.textContent = "previsto para " + formatarHorario(item.horario) + " (estimativa)" + (item.minutos ? " · atendimento " + item.minutos + " min" : "");
    li.append(titulo, detalhe);
    listaPercurso.appendChild(li);
  });
}

function aoMudarEstado(estado) {
  atualizarEtiqueta(estado);
  const acabouDeConcluir = estado.status === "concluida" && estado.ultimoStatus !== "concluida";
  estado.ultimoStatus = estado.status;
  if (acabouDeConcluir) {
    estado.mensagem = {
      texto: "Viagem concluída: todas as " + estado.plano.entregas.length + " entrega(s) foram realizadas (término simulado às " + formatarHorario(estado.fimPrevistoMin) + ").",
      tipo: "ok", tentar: false
    };
    const gravado = registrarConclusao(estado);
    if (gravado && gravado.ok && !gravado.duplicado) estado.mensagem.texto += " Registrada no histórico de viagens.";
    else if (gravado && !gravado.ok) estado.mensagem = { texto: estado.mensagem.texto + " Atenção: não foi possível registrar no histórico (" + gravado.erro + ")", tipo: "erro", tentar: false };
    if (estado === selecionado) mostrarMensagem(estado.mensagem.texto, estado.mensagem.tipo, false, estado);
  }
  if (estado === selecionado) {
    atualizarDetalhes(estado);
    desenharPercurso(estado);
    atualizarBotoes();
    atualizarEtapas(estado);
    atualizarProgresso(estado);
  }
}

// ---------- Mensagens ----------

// "alvo" = veículo ao qual a mensagem pertence (null = mensagem geral, não guardada).
function mostrarMensagem(texto, tipo, comBotaoTentar, alvo) {
  if (gravacaoFalhou && tipo === "ok") {
    texto += " Atenção: o planejamento não pôde ser salvo neste navegador e será perdido ao recarregar a página.";
    tipo = "erro";
  }
  if (alvo) alvo.mensagem = { texto, tipo, tentar: comBotaoTentar };
  if (alvo && alvo !== selecionado) return;
  mensagemRota.textContent = texto;
  mensagemRota.className = "mensagem mensagem-" + tipo;
  mensagemRota.hidden = false;
  botaoTentar.hidden = !comBotaoTentar;
}

function limparMensagem() {
  mensagemRota.hidden = true;
  botaoTentar.hidden = true;
}

// ---------- Plano: coleta, entregas e opções ----------

function contextoDeValidacao(estado) {
  return { galpao: galpaoDefinido ? galpao : null, vaga: estado.localGalpao };
}

/**
 * Aplica uma alteração no plano do veículo selecionado. Se houver viagem em andamento,
 * pede confirmação. Qualquer alteração descarta a rota (ela precisa ser recalculada).
 * @returns {boolean} true se a alteração foi aplicada
 */
function alterarPlano(mutacao, aoFalhar) {
  const estado = selecionado;
  if (!estado) return false;
  if (emViagem(estado) && !window.confirm("Alterar o planejamento cancela a viagem em andamento e o veículo volta ao galpão. Continuar?")) return false;
  const copia = JSON.parse(JSON.stringify(estado.plano));
  try {
    mutacao(estado.plano);
  } catch (erro) {
    Object.assign(estado.plano, copia);   // desfaz qualquer alteração parcial
    if (aoFalhar) aoFalhar(erro.message);
    else mostrarMensagem(erro.message, "erro", false, estado);
    return false;
  }
  estado.mensagem = null;
  invalidarRota(estado);
  persistirPlanos();
  renderizarPlano(estado);
  return true;
}

// aoFalhar (opcional): recebe a mensagem de erro de validação em vez de ela ir para a mensagem geral.
function definirColeta(local, aoFalhar) {
  const ok = alterarPlano((plano) => {
    plano.coleta = validarColeta(plano, { ...local, minutos: MINUTOS_COLETA }, contextoDeValidacao(selecionado));
  }, aoFalhar);
  if (ok) mostrarMensagem("Coleta marcada: " + local.nome + ".", "ok", false, selecionado);
  return ok;
}

const ORIENTACAO_ENTREGA_MAPA = " Clique em outro ponto ou pressione Esc para terminar.";

// Caminho único para adicionar uma entrega por clique no mapa ou por pesquisa de local.
function adicionarEntregaDireta(dados, orientacao, aoFalhar) {
  let adicionada = null;
  const ok = alterarPlano((plano) => { adicionada = adicionarEntrega(plano, dados, contextoDeValidacao(selecionado)); }, aoFalhar);
  if (ok) {
    mostrarMensagem("Entrega adicionada: " + adicionada.nome + " (" + selecionado.plano.entregas.length + " na lista)." + orientacao, "ok", false, selecionado);
  }
  return ok;
}

function removerDoPlano(entrega) {
  const ok = alterarPlano((plano) => { removerEntrega(plano, entrega.id); });
  if (ok) {
    if (painel.idEmEdicao() === entrega.id) painel.fecharEditor();
    mostrarMensagem("Entrega removida: " + entrega.nome + ".", "ok", false, selecionado);
  }
}

function abrirEditor(entrega) {
  if (!selecionado) return;
  cancelarModoMapa();
  if (buscaEditor) buscaEditor.limpar();
  painel.abrirEditor(entrega, entrega ? null : sugerirNomeEntrega(selecionado.plano));
  renderizarPlano(selecionado);
}

function cancelarEditor() {
  cancelarModoMapa();
  painel.fecharEditor();
  if (selecionado) renderizarPlano(selecionado);
}

function salvarEditor(idEmEdicao, dados) {
  const ok = alterarPlano((plano) => {
    if (idEmEdicao) editarEntrega(plano, idEmEdicao, dados, contextoDeValidacao(selecionado));
    else adicionarEntrega(plano, dados, contextoDeValidacao(selecionado));
  }, (mensagem) => painel.mostrarErro(mensagem));
  if (ok) {
    cancelarModoMapa();
    painel.fecharEditor();
    renderizarPlano(selecionado);
    mostrarMensagem(idEmEdicao ? "Entrega atualizada." : "Entrega adicionada.", "ok", false, selecionado);
  }
}

function resetarViagem() {
  const estado = selecionado;
  if (!estado) return;
  const temDados = estado.plano.coleta || estado.plano.entregas.length > 0;
  if (temDados && !window.confirm("Resetar a viagem apaga a coleta e todas as entregas deste veículo e o leva de volta ao galpão. Continuar?")) return;
  estado.plano.coleta = null;
  estado.plano.entregas = [];
  estado.mensagem = null;
  invalidarRota(estado);
  persistirPlanos();
  painel.fecharEditor();
  cancelarModoMapa();
  limparBuscasDoVeiculo();
  renderizarPlano(estado);
  centralizar(estado);
  mostrarMensagem("Viagem resetada. O veículo voltou ao galpão. Marque a coleta e adicione as entregas.", "ok", false, estado);
}

// ---------- Pesquisa de locais (Geoapify) ----------
//
// A pesquisa não tem fluxo próprio: o local escolhido entra pelas MESMAS funções do clique no mapa
// (definirGalpao, definirColeta, adicionarEntregaDireta), com as mesmas validações, o mesmo
// marcador, a mesma persistência e a mesma invalidação de rota.

function limitarNome(nome) {
  const limpo = nome.replace(/\s+/g, " ").trim();
  return limpo.length <= MAX_NOME ? limpo : limpo.slice(0, MAX_NOME - 1).trimEnd() + "…";
}

// Resultado da pesquisa → mesmo formato dos pontos marcados no mapa (o endereço completo só aparece na tela).
function localDaPesquisa(resultado) {
  return { nome: limitarNome(resultado.nome), lat: resultado.lat, lng: resultado.lng };
}

function irParaLocal(local) {
  mapa.setView([local.lat, local.lng], 16);
}

// Aplica a mutação e traduz o resultado para o campo de pesquisa: true | mensagem de erro | false (sem aviso).
function resultadoParaBusca(aplicar) {
  let mensagem = null;
  const ok = aplicar((texto) => { mensagem = texto; });
  return ok ? true : (mensagem || false);
}

function escolherGalpaoPesquisado(resultado) {
  return definirGalpao({ id: "galpao-principal", ...localDaPesquisa(resultado) });
}

function escolherColetaPesquisada(resultado) {
  if (!selecionado || !galpaoDefinido) return "Defina primeiro o galpão da frota.";
  const local = localDaPesquisa(resultado);
  const retorno = resultadoParaBusca((aoFalhar) => definirColeta({ id: novoIdLocal("coleta"), ...local }, aoFalhar));
  if (retorno === true) irParaLocal(local);
  return retorno;
}

function escolherEntregaPesquisada(resultado) {
  if (!selecionado || !galpaoDefinido) return "Defina primeiro o galpão da frota.";
  const local = localDaPesquisa(resultado);
  const retorno = resultadoParaBusca((aoFalhar) => adicionarEntregaDireta(local, " Pesquise outro local para adicionar mais.", aoFalhar));
  if (retorno === true) irParaLocal(local);
  return retorno;
}

// No editor, a pesquisa só preenche o formulário; quem salva é o botão "Salvar entrega" (fluxo normal).
function escolherLocalNoEditor(resultado) {
  const local = localDaPesquisa(resultado);
  painel.preencherLocal(local);
  irParaLocal(local);
  return true;
}

function limparBuscasDoVeiculo() {
  if (buscaColeta) buscaColeta.limpar();
  if (buscaEntrega) buscaEntrega.limpar();
}

function iniciarBuscas() {
  // Prioriza a região do galpão; sem galpão definido, o centro de Recife.
  const proximidade = () => (galpaoDefinido ? { lat: galpao.lat, lng: galpao.lng } : { lat: CENTRO_RECIFE[0], lng: CENTRO_RECIFE[1] });
  const criar = (id, aoEscolher) => criarBuscaLocal({ input: pegar(id), aoEscolher, obterProximidade: proximidade });
  try {
    buscaGalpao = criar("busca-galpao", escolherGalpaoPesquisado);
    buscaColeta = criar("busca-coleta", escolherColetaPesquisada);
    buscaEntrega = criar("busca-entrega", escolherEntregaPesquisada);
    buscaEditor = criar("busca-editor", escolherLocalNoEditor);
  } catch (erro) {
    // A pesquisa é um complemento: se não puder iniciar, marcar os pontos no mapa continua funcionando.
    console.error("Pesquisa de locais indisponível:", erro);
  }
}

// ---------- Escolha de locais no mapa ----------

function entrarModoMapa(tipo) {
  if (alvoMapa && alvoMapa.tipo === tipo) { cancelarModoMapa(true); return; }
  alvoMapa = { tipo };
  mapa.getContainer().classList.add("mapa-escolhendo-local");
  mapa.doubleClickZoom.disable();   // um clique duplo não deve contar como dois pontos
  btnEntregaMapa.setAttribute("aria-pressed", tipo === "entrega" ? "true" : "false");
  btnEntregaMapa.textContent = tipo === "entrega" ? "Terminar de adicionar" : "Adicionar entrega no mapa";
  const instrucoes = {
    galpao: "Clique no mapa onde fica o galpão dos veículos.",
    coleta: "Clique no local onde o veículo vai pegar o produto.",
    entrega: "Clique no mapa para cada endereço de entrega. Você pode adicionar quantos quiser.",
    editor: "Clique no mapa para preencher a latitude e a longitude da entrega."
  };
  mostrarMensagem(instrucoes[tipo] + " Pressione Esc para cancelar.", "info", false, null);
}

function cancelarModoMapa(comAviso) {
  if (!alvoMapa) return;
  alvoMapa = null;
  if (mapa) {
    mapa.getContainer().classList.remove("mapa-escolhendo-local");
    mapa.doubleClickZoom.enable();
  }
  btnEntregaMapa.setAttribute("aria-pressed", "false");
  btnEntregaMapa.textContent = "Adicionar entrega no mapa";
  if (comAviso) {
    if (selecionado) { selecionado.mensagem = null; mostrarMensagemPadrao(selecionado); } else limparMensagem();
  }
}

function aoClicarMapa(evento) {
  if (!alvoMapa) return;
  const tipo = alvoMapa.tipo;
  const lat = Number(evento.latlng.lat.toFixed(6));
  const lng = Number(evento.latlng.lng.toFixed(6));

  if (tipo === "editor") {
    cancelarModoMapa(true);
    painel.preencherCoordenadas(lat, lng);
    return;
  }

  const sugestoes = {
    galpao: "Galpão da Frota",
    coleta: "Ponto de coleta",
    entrega: selecionado ? sugerirNomeEntrega(selecionado.plano) : "Entrega 1"
  };
  const informado = window.prompt("Digite um nome para este local. Esse nome aparece no mapa:", sugestoes[tipo]);
  if (informado === null) {
    if (tipo !== "entrega") cancelarModoMapa();
    mostrarMensagem(tipo === "entrega" ? "Entrega não adicionada. Clique em outro ponto ou pressione Esc para terminar." : "Seleção cancelada.", "info", false, null);
    return;
  }
  const nome = informado.trim() || sugestoes[tipo];

  if (tipo === "entrega") {
    // Continua no modo de adição para o próximo clique.
    if (!selecionado || !galpaoDefinido) { cancelarModoMapa(); mostrarMensagem("Defina primeiro o galpão da frota.", "erro", false, null); return; }
    adicionarEntregaDireta({ nome, lat, lng }, ORIENTACAO_ENTREGA_MAPA);
    return;
  }

  cancelarModoMapa();
  if (tipo === "galpao") {
    definirGalpao({ id: "galpao-principal", nome, lat, lng });
    return;
  }
  if (!selecionado || !galpaoDefinido) { mostrarMensagem("Defina primeiro o galpão da frota.", "erro", false, null); return; }
  definirColeta({ id: novoIdLocal("coleta"), nome, lat, lng });
}

document.addEventListener("keydown", (evento) => {
  if (evento.key === "Escape" && alvoMapa) {
    cancelarModoMapa(true);
  }
});

// ---------- Botões ----------

function atualizarBotoes() {
  const e = selecionado;
  const temVeiculo = Boolean(e);
  const ativo = temVeiculo && e.dados.situacao === "Ativo";
  const livre = ativo && !e.carregando;
  const plano = temVeiculo ? e.plano : null;
  const valida = rotaValida(e);

  btnGalpao.disabled = !mapa;
  btnColeta.disabled = !(livre && galpaoDefinido);
  btnEntregaMapa.disabled = !(livre && galpaoDefinido);
  btnNovaEntrega.disabled = !(livre && galpaoDefinido);
  if (buscaGalpao) buscaGalpao.desabilitar(!mapa);
  if (buscaColeta) buscaColeta.desabilitar(!(livre && galpaoDefinido));
  if (buscaEntrega) buscaEntrega.desabilitar(!(livre && galpaoDefinido));
  optOtimizar.disabled = !livre;
  optRetorno.disabled = !livre;
  criterioTempo.disabled = criterioDistancia.disabled = !livre;
  botaoCalcular.setAttribute("aria-busy", temVeiculo && e.carregando ? "true" : "false");
  if (temVeiculo) {
    botaoCalcular.textContent = plano.otimizar && plano.entregas.length > 1 ? "Otimizar rota" : "Calcular rota";
  }
  botaoCalcular.disabled = !(livre && galpaoDefinido && plano.coleta && plano.entregas.length > 0);
  botaoCentralizar.disabled = !temVeiculo;
  botaoIniciar.disabled = !(ativo && valida && (e.status === "aguardando" || e.status === "pausado"));
  botaoIniciar.textContent = temVeiculo && e.status === "pausado" ? "Continuar" : "Iniciar";
  botaoPausar.disabled = !(temVeiculo && (e.status === "em-movimento" || e.status === "em-parada"));
  botaoReiniciar.disabled = !(valida && e.status !== "aguardando");
  btnLimparRota.disabled = !livre || (!plano.coleta && plano.entregas.length === 0 && !e.rota);
}

function ligarBotoes() {
  botaoIniciar.addEventListener("click", () => { if (selecionado && rotaValida(selecionado)) iniciar(selecionado); });
  botaoPausar.addEventListener("click", () => { if (selecionado) pausar(selecionado); });
  botaoReiniciar.addEventListener("click", () => { if (selecionado && rotaValida(selecionado)) reiniciar(selecionado); });
  botaoCentralizar.addEventListener("click", () => { if (selecionado) centralizar(selecionado); });
  btnGalpao.addEventListener("click", () => entrarModoMapa("galpao"));
  btnColeta.addEventListener("click", () => entrarModoMapa("coleta"));
  btnEntregaMapa.addEventListener("click", () => entrarModoMapa("entrega"));
  btnNovaEntrega.addEventListener("click", () => abrirEditor(null));
  btnLimparRota.addEventListener("click", resetarViagem);
  botaoCalcular.addEventListener("click", otimizarRotaSelecionada);
  botaoTentar.addEventListener("click", otimizarRotaSelecionada);
  btnVerNormal.addEventListener("click", () => escolherCenario("normal"));
  btnVerTurbo.addEventListener("click", () => escolherCenario("turbo"));
  [criterioTempo, criterioDistancia].forEach((radio) => radio.addEventListener("change", () => {
    const valor = criterioDistancia.checked ? "distancia" : "tempo";
    if (!alterarPlano((plano) => { plano.criterio = valor; })) renderizarPlano(selecionado);
    else mostrarMensagem("Prioridade alterada. Clique em “Otimizar rota” para recalcular.", "info", false, selecionado);
  }));
  optOtimizar.addEventListener("change", () => {
    const valor = optOtimizar.checked;
    // Com a comparação já calculada, alterna sem recalcular a ordem.
    if (selecionado && selecionado.cenarios && rotaValida(selecionado) && !selecionado.carregando) { escolherCenario(valor ? "turbo" : "normal"); return; }
    if (!alterarPlano((plano) => { plano.otimizar = valor; })) optOtimizar.checked = selecionado ? selecionado.plano.otimizar : true;
  });
  optRetorno.addEventListener("change", () => {
    const valor = optRetorno.checked;
    if (!alterarPlano((plano) => { plano.retornarBase = valor; })) optRetorno.checked = selecionado ? selecionado.plano.retornarBase : false;
  });

  // Mantém o mapa em dia com o cadastro: outra aba alterou os veículos, ou o usuário voltou a esta aba.
  window.addEventListener("storage", (evento) => {
    if (evento.key === CHAVE_VEICULOS || evento.key === null) agendarSincronizacao();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") agendarSincronizacao();
  });
  window.addEventListener("pageshow", (evento) => { if (evento.persisted) agendarSincronizacao(); });
}

iniciarPagina();

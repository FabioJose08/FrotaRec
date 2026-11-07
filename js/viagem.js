// Modelo do planejamento de viagem: base (galpão), coleta e lista de entregas.
// Aqui ficam as regras de validação e a gravação no localStorage. Nada deste
// arquivo mexe na tela, para ser simples de entender e de testar.
//
// Chaves usadas (as antigas foram preservadas):
//   frota-recife-galpao   → { nome, lat, lng }                      (já existia)
//   frota-recife-viagens  → { versao, viagens: { [idDoVeiculo]: plano } }   (nova)
//
// Cada "plano" é: { coleta, entregas[], retornarBase, otimizar, criterio }
//   otimizar = true → modo Turbo; false → modo Normal (ordem cadastrada).
//   criterio ("tempo" | "distancia") é opcional: planos antigos, sem ele, usam "tempo".
// Cada local é:   { id, nome, lat, lng, minutos }

import { coordenadaValida, distanciaRetaM, DISTANCIA_MINIMA_M, lerNumero } from "./geo.js";
import { LIMITE_PONTOS_OSRM } from "./rotas.js";

export const CHAVE_GALPAO = "frota-recife-galpao";
export const CHAVE_VIAGENS = "frota-recife-viagens";
const CHAVE_VIAGENS_BACKUP = "frota-recife-viagens-backup";
const VERSAO = 1;

// Base + coleta + retorno à base ocupam 3 das coordenadas aceitas pelo serviço de rotas.
export const MAX_ENTREGAS = LIMITE_PONTOS_OSRM - 3;
export const MINUTOS_COLETA = 10;
export const MINUTOS_ENTREGA = 5;
const MAX_MINUTOS_ATENDIMENTO = 240;
export const MAX_NOME = 60;

let contadorIds = 0;
export function novoIdLocal(prefixo) {
  contadorIds += 1;
  return prefixo + "-" + Date.now().toString(36) + "-" + contadorIds + "-" + Math.floor(Math.random() * 1e6).toString(36);
}

export function criarPlanoVazio() {
  return { coleta: null, entregas: [], retornarBase: false, otimizar: true, criterio: "tempo" };
}

// ---------- Galpão ----------

/** @returns {{galpao: (object|null), erro: (string|null)}} */
export function lerGalpao() {
  try {
    const bruto = localStorage.getItem(CHAVE_GALPAO);
    if (bruto === null) return { galpao: null, erro: null };
    const salvo = JSON.parse(bruto);
    if (salvo && typeof salvo.nome === "string" && coordenadaValida(salvo)) {
      return { galpao: { id: "galpao-principal", nome: salvo.nome, lat: salvo.lat, lng: salvo.lng }, erro: null };
    }
    return { galpao: null, erro: "O galpão salvo neste navegador está num formato inválido. Defina-o novamente." };
  } catch (erro) {
    return { galpao: null, erro: "Não foi possível ler o galpão salvo neste navegador. Defina-o novamente." };
  }
}

export function salvarGalpao(galpao) {
  try {
    localStorage.setItem(CHAVE_GALPAO, JSON.stringify({ nome: galpao.nome, lat: galpao.lat, lng: galpao.lng }));
    return true;
  } catch (erro) {
    return false;
  }
}

// ---------- Validação de locais ----------

function validarNome(valor) {
  if (typeof valor !== "string" || valor.trim() === "") throw new Error("Informe um nome para o local.");
  const nome = valor.trim().replace(/\s+/g, " ");
  if (nome.length > MAX_NOME) throw new Error("O nome deve ter no máximo " + MAX_NOME + " caracteres.");
  return nome;
}

function validarCoordenadas(lat, lng) {
  const latitude = lerNumero(lat);
  const longitude = lerNumero(lng);
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) throw new Error("Informe latitude e longitude como números (ex.: -8,0476 e -34,8770).");
  if (!coordenadaValida({ lat: latitude, lng: longitude })) throw new Error("Coordenadas fora do intervalo válido (latitude de -90 a 90; longitude de -180 a 180).");
  return { lat: Number(latitude.toFixed(6)), lng: Number(longitude.toFixed(6)) };
}

function validarMinutos(valor, padrao) {
  if (valor === undefined || valor === null || valor === "") return padrao;
  const numero = lerNumero(String(valor));
  if (!Number.isInteger(numero) || numero < 0 || numero > MAX_MINUTOS_ATENDIMENTO) {
    throw new Error("O tempo de atendimento deve ser um número inteiro de 0 a " + MAX_MINUTOS_ATENDIMENTO + " minutos.");
  }
  return numero;
}

// Procura outro ponto praticamente no mesmo lugar (menos de DISTANCIA_MINIMA_M).
function acharConflito(local, outros) {
  return outros.find((o) => o && o.id !== local.id && distanciaRetaM(local, o) < DISTANCIA_MINIMA_M);
}

/**
 * Valida os dados de uma entrega (nova ou editada) e devolve o local normalizado.
 * @param {object} contexto { galpao, vaga (ponto da vaga do veículo), idIgnorado }
 */
export function validarEntrega(plano, dados, contexto = {}) {
  const nome = validarNome(dados.nome);
  const { lat, lng } = validarCoordenadas(dados.lat, dados.lng);
  const minutos = validarMinutos(dados.minutos, MINUTOS_ENTREGA);
  const id = dados.id || novoIdLocal("ent");

  const outras = plano.entregas.filter((e) => e.id !== contexto.idIgnorado);
  if (!contexto.idIgnorado && plano.entregas.length >= MAX_ENTREGAS) {
    throw new Error("Limite de " + MAX_ENTREGAS + " entregas por viagem (restrição do serviço público de rotas).");
  }
  if (outras.some((e) => e.nome.toLocaleLowerCase("pt-BR") === nome.toLocaleLowerCase("pt-BR"))) {
    throw new Error("Já existe uma entrega chamada “" + nome + "”. Use um nome diferente.");
  }

  const local = { id, nome, lat, lng, minutos };
  const repetida = acharConflito(local, outras);
  if (repetida) throw new Error("Este ponto já está na lista como “" + repetida.nome + "”.");
  if (plano.coleta && distanciaRetaM(local, plano.coleta) < DISTANCIA_MINIMA_M) throw new Error("Este ponto é o mesmo local de coleta.");
  [contexto.galpao, contexto.vaga].forEach((base) => {
    if (base && distanciaRetaM(local, base) < DISTANCIA_MINIMA_M) throw new Error("Este ponto é o mesmo do galpão.");
  });
  return local;
}

/** Valida o local de coleta. */
export function validarColeta(plano, dados, contexto = {}) {
  const nome = validarNome(dados.nome);
  const { lat, lng } = validarCoordenadas(dados.lat, dados.lng);
  const local = { id: dados.id || novoIdLocal("coleta"), nome, lat, lng, minutos: validarMinutos(dados.minutos, MINUTOS_COLETA) };
  const conflito = acharConflito(local, plano.entregas);
  if (conflito) throw new Error("Este ponto já é a entrega “" + conflito.nome + "”.");
  [contexto.galpao, contexto.vaga].forEach((base) => {
    if (base && distanciaRetaM(local, base) < DISTANCIA_MINIMA_M) throw new Error("A coleta não pode ficar no mesmo ponto do galpão.");
  });
  return local;
}

export function sugerirNomeEntrega(plano) {
  const usados = new Set(plano.entregas.map((e) => e.nome.toLocaleLowerCase("pt-BR")));
  let numero = plano.entregas.length + 1;
  while (usados.has(("Entrega " + numero).toLocaleLowerCase("pt-BR"))) numero += 1;
  return "Entrega " + numero;
}

export function adicionarEntrega(plano, dados, contexto) {
  const local = validarEntrega(plano, dados, contexto);
  plano.entregas.push(local);
  return local;
}

export function editarEntrega(plano, id, dados, contexto = {}) {
  const indice = plano.entregas.findIndex((e) => e.id === id);
  if (indice < 0) throw new Error("Entrega não encontrada.");
  const local = validarEntrega(plano, { ...dados, id }, { ...contexto, idIgnorado: id });
  plano.entregas[indice] = local;
  return local;
}

export function removerEntrega(plano, id) {
  const indice = plano.entregas.findIndex((e) => e.id === id);
  if (indice < 0) throw new Error("Entrega não encontrada.");
  return plano.entregas.splice(indice, 1)[0];
}

// ---------- Persistência ----------

// Reconstrói um plano a partir de dados lidos do disco, descartando o que for inválido.
function sanear(bruto) {
  const plano = criarPlanoVazio();
  if (!bruto || typeof bruto !== "object") return plano;

  const localOk = (l) => l && typeof l === "object" && typeof l.nome === "string" && l.nome.trim() !== "" && coordenadaValida(l);
  const normalizar = (l, prefixo, minutosPadrao) => ({
    id: typeof l.id === "string" && l.id ? l.id : novoIdLocal(prefixo),
    nome: l.nome.trim().slice(0, MAX_NOME),
    lat: l.lat,
    lng: l.lng,
    minutos: Number.isInteger(l.minutos) && l.minutos >= 0 && l.minutos <= MAX_MINUTOS_ATENDIMENTO ? l.minutos : minutosPadrao
  });

  if (localOk(bruto.coleta)) plano.coleta = normalizar(bruto.coleta, "coleta", MINUTOS_COLETA);
  if (Array.isArray(bruto.entregas)) {
    const ids = new Set();
    for (const item of bruto.entregas) {
      if (!localOk(item) || plano.entregas.length >= MAX_ENTREGAS) continue;
      const entrega = normalizar(item, "ent", MINUTOS_ENTREGA);
      if (ids.has(entrega.id)) entrega.id = novoIdLocal("ent");
      ids.add(entrega.id);
      plano.entregas.push(entrega);
    }
  }
  plano.retornarBase = bruto.retornarBase === true;
  plano.otimizar = bruto.otimizar !== false;
  plano.criterio = bruto.criterio === "distancia" ? "distancia" : "tempo";
  return plano;
}

/** @returns {{planos: object, erro: (string|null)}} planos indexados pelo id do veículo */
export function carregarViagens() {
  let bruto = null;
  try {
    bruto = localStorage.getItem(CHAVE_VIAGENS);
  } catch (erro) {
    return { planos: {}, erro: "O armazenamento local do navegador está indisponível. As entregas não serão salvas." };
  }
  if (bruto === null) return { planos: {}, erro: null };

  try {
    const dados = JSON.parse(bruto);
    if (!dados || typeof dados !== "object" || typeof dados.viagens !== "object" || dados.viagens === null) throw new Error("formato");
    const planos = {};
    Object.keys(dados.viagens).forEach((idVeiculo) => { planos[idVeiculo] = sanear(dados.viagens[idVeiculo]); });
    return { planos, erro: null };
  } catch (erro) {
    // Guarda uma cópia do conteúdo ilegível antes de qualquer nova gravação sobrescrevê-lo.
    try { if (localStorage.getItem(CHAVE_VIAGENS_BACKUP) === null) localStorage.setItem(CHAVE_VIAGENS_BACKUP, bruto); } catch (e) { /* sem espaço: segue */ }
    return { planos: {}, erro: "Os dados das viagens salvas estavam corrompidos e não puderam ser lidos. Uma cópia foi guardada e você pode planejar novamente." };
  }
}

/** Grava todos os planos. Devolve false se o navegador recusar a gravação. */
export function salvarViagens(planos) {
  const viagens = {};
  Object.keys(planos).forEach((idVeiculo) => {
    const p = planos[idVeiculo];
    // Planos vazios não precisam ocupar espaço.
    if (p.coleta || p.entregas.length > 0 || p.retornarBase || !p.otimizar || p.criterio === "distancia") {
      viagens[idVeiculo] = { coleta: p.coleta, entregas: p.entregas, retornarBase: p.retornarBase, otimizar: p.otimizar, criterio: p.criterio === "distancia" ? "distancia" : "tempo" };
    }
  });
  try {
    localStorage.setItem(CHAVE_VIAGENS, JSON.stringify({ versao: VERSAO, viagens }));
    return true;
  } catch (erro) {
    return false;
  }
}

/** Apaga o plano salvo de um veículo (por exemplo, quando o cadastro dele é excluído). */
export function descartarPlano(idVeiculo) {
  const { planos, erro } = carregarViagens();
  if (erro || !(idVeiculo in planos)) return;
  delete planos[idVeiculo];
  salvarViagens(planos);
}

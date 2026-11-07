// Histórico de viagens concluídas. Chave nova, com versão:
//   frota-recife-historico → { versao, viagens: [registro] }
//
// Cada viagem concluída gera NO MÁXIMO um registro: o "id" identifica a rota calculada
// e registrarViagem recusa ids repetidos (sem duplicar por atualizações de tela).
// O registro guarda uma cópia do código do veículo, então sobrevive à exclusão do cadastro.

import { estimarCombustivel, compararRotas } from "./combustivel.js";

export const CHAVE_HISTORICO = "frota-recife-historico";
const CHAVE_BACKUP = "frota-recife-historico-backup";
export const VERSAO_HISTORICO = 1;
const MAX_REGISTROS = 2000;

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const txt = (v, max = 80) => (typeof v === "string" ? v.slice(0, max) : "");

// Reconstrói um registro lido do disco; devolve null se estiver irrecuperável.
export function sanearRegistro(r) {
  if (!r || typeof r !== "object" || typeof r.id !== "string" || r.id === "") return null;
  const concluidaEm = typeof r.concluidaEm === "string" && !Number.isNaN(Date.parse(r.concluidaEm)) ? r.concluidaEm : null;
  if (!concluidaEm || num(r.distanciaKm) === null) return null;
  const c = r.comparacao && typeof r.comparacao === "object" ? r.comparacao : null;
  return {
    id: r.id,
    veiculoId: txt(r.veiculoId, 80),
    veiculoCodigo: txt(r.veiculoCodigo, 20),
    veiculoTipo: txt(r.veiculoTipo, 40),
    concluidaEm,
    modo: r.modo === "turbo" ? "turbo" : "normal",
    criterio: r.criterio === "distancia" ? "distancia" : (r.criterio === "tempo" ? "tempo" : null),
    entregas: Number.isInteger(r.entregas) && r.entregas >= 0 ? r.entregas : 0,
    retornouGalpao: r.retornouGalpao === true,
    distanciaKm: r.distanciaKm,
    deslocamentoMin: num(r.deslocamentoMin) ?? 0,
    atendimentoMin: num(r.atendimentoMin) ?? 0,
    consumoKmL: num(r.consumoKmL),
    precoLitro: num(r.precoLitro),
    litros: num(r.litros),
    custo: num(r.custo),
    metodo: ["exato", "heuristica", "trivial", "manual"].includes(r.metodo) ? r.metodo : "manual",
    origem: r.origem === "aproximacao" ? "aproximacao" : "osrm",
    comparacao: c ? {
      distanciaNormalKm: num(c.distanciaNormalKm), deslocamentoNormalMin: num(c.deslocamentoNormalMin),
      litrosNormal: num(c.litrosNormal), custoNormal: num(c.custoNormal),
      economiaKm: num(c.economiaKm), economiaMin: num(c.economiaMin),
      economiaLitros: num(c.economiaLitros), economiaReais: num(c.economiaReais), percentual: num(c.percentual)
    } : null,
    paradas: Array.isArray(r.paradas)
      ? r.paradas.slice(0, 120).map((p) => ({ papel: txt(p && p.papel, 20), nome: txt(p && p.nome, 60), horario: txt(p && p.horario, 5) }))
      : []
  };
}

/** @returns {{viagens:object[], erro:(string|null)}} da mais recente para a mais antiga */
export function carregarHistorico() {
  let bruto;
  try {
    bruto = localStorage.getItem(CHAVE_HISTORICO);
  } catch (erro) {
    return { viagens: [], erro: "O armazenamento local do navegador está indisponível. O histórico não pode ser lido." };
  }
  if (bruto === null) return { viagens: [], erro: null };
  try {
    const dados = JSON.parse(bruto);
    if (!dados || typeof dados !== "object" || !Array.isArray(dados.viagens)) throw new Error("formato");
    const viagens = dados.viagens.map(sanearRegistro).filter(Boolean);
    viagens.sort((a, b) => b.concluidaEm.localeCompare(a.concluidaEm));
    return { viagens, erro: null };
  } catch (erro) {
    try { if (localStorage.getItem(CHAVE_BACKUP) === null) localStorage.setItem(CHAVE_BACKUP, bruto); } catch (e) { /* sem espaço */ }
    return { viagens: [], erro: "O histórico salvo estava corrompido e não pôde ser lido. Uma cópia foi guardada." };
  }
}

function gravar(viagens) {
  try {
    localStorage.setItem(CHAVE_HISTORICO, JSON.stringify({ versao: VERSAO_HISTORICO, viagens }));
    return true;
  } catch (erro) {
    return false;
  }
}

/** Registra uma viagem concluída. @returns {{ok:boolean, duplicado:boolean, erro?:string}} */
export function registrarViagem(registro) {
  const novo = sanearRegistro(registro);
  if (!novo) return { ok: false, duplicado: false, erro: "Registro da viagem incompleto." };
  const atual = carregarHistorico();
  if (atual.erro) return { ok: false, duplicado: false, erro: atual.erro };
  if (atual.viagens.some((v) => v.id === novo.id)) return { ok: true, duplicado: true };
  const todas = [novo, ...atual.viagens].slice(0, MAX_REGISTROS);
  if (!gravar(todas)) return { ok: false, duplicado: false, erro: "Não foi possível gravar o histórico (armazenamento cheio ou bloqueado)." };
  return { ok: true, duplicado: false };
}

export function excluirViagem(id) {
  const atual = carregarHistorico();
  if (atual.erro) throw new Error(atual.erro);
  const restantes = atual.viagens.filter((v) => v.id !== id);
  if (restantes.length === atual.viagens.length) throw new Error("Viagem não encontrada.");
  if (!gravar(restantes)) throw new Error("Não foi possível salvar a alteração no histórico.");
}

export function limparHistorico() {
  if (!gravar([])) throw new Error("Não foi possível limpar o histórico.");
}

// ---------- Montagem do registro (pura, testável) ----------


/**
 * Monta o registro de uma viagem concluída. Combustível, custo e economia só existem quando
 * há consumo cadastrado (e preço, para os valores em reais); caso contrário ficam null.
 * @param {object} d { id, veiculo:{id,codigo,tipo,consumoKmL}, modo, criterio, entregas, retornouGalpao,
 *   metricas:{distanciaKm,deslocamentoMin}, atendimentoMin, normal:({distanciaKm,deslocamentoMin}|null),
 *   precoLitro, metodo, origem, paradas, concluidaEm }
 */
export function montarRegistroViagem(d) {
  const consumo = d.veiculo.consumoKmL === undefined ? null : d.veiculo.consumoKmL;
  const preco = d.precoLitro === undefined ? null : d.precoLitro;
  const est = estimarCombustivel(d.metricas.distanciaKm, consumo, preco);

  let comparacao = null;
  if (d.modo === "turbo" && d.normal) {
    const c = compararRotas(d.normal, d.metricas, consumo, preco);
    comparacao = {
      distanciaNormalKm: d.normal.distanciaKm,
      deslocamentoNormalMin: d.normal.deslocamentoMin,
      litrosNormal: c.litrosNormal,
      custoNormal: c.custoNormal,
      economiaKm: c.economiaKm,
      economiaMin: c.economiaMin,
      economiaLitros: c.economiaLitros,
      economiaReais: c.economiaReais,
      percentual: c.percentualCusto !== null ? c.percentualCusto : (c.percentualCombustivel !== null ? c.percentualCombustivel : c.percentualDistancia)
    };
  }

  return {
    id: d.id,
    veiculoId: d.veiculo.id,
    veiculoCodigo: d.veiculo.codigo,
    veiculoTipo: d.veiculo.tipo,
    concluidaEm: d.concluidaEm || new Date().toISOString(),
    modo: d.modo,
    criterio: d.modo === "turbo" ? d.criterio : null,
    entregas: d.entregas,
    retornouGalpao: d.retornouGalpao,
    distanciaKm: d.metricas.distanciaKm,
    deslocamentoMin: d.metricas.deslocamentoMin,
    atendimentoMin: d.atendimentoMin,
    consumoKmL: consumo,
    precoLitro: est.custo !== null ? preco : null,
    litros: est.litros,
    custo: est.custo,
    metodo: d.metodo,
    origem: d.origem,
    comparacao,
    paradas: d.paradas
  };
}

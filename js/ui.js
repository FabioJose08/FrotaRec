// Funções simples compartilhadas pelas telas.

import { formatarKm, formatarDuracao } from "./geo.js";
import { formatarReais } from "./combustivel.js";

export function pegar(id) {
  return document.getElementById(id);
}

export function mostrarMensagem(elemento, texto, tipo) {
  elemento.textContent = texto;
  elemento.className = "mensagem mensagem-" + tipo;
  elemento.hidden = false;
}

export function limparMensagem(elemento) {
  elemento.hidden = true;
}

export function criarCelula(texto) {
  const celula = document.createElement("td");
  celula.textContent = texto === "" ? "—" : texto;
  return celula;
}

// ---------- Componentes compartilhados (apresentação) ----------


export function criarElemento(tag, classe, texto) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

/** Cartão de indicador. tipo: "economia" (verde) ou "indisponivel" (valor ainda sem dados). */
export function criarKpi(titulo, valor, detalhe, tipo) {
  const k = criarElemento("div", "kpi" + (tipo ? " " + tipo : ""));
  k.append(criarElemento("span", "kpi-titulo", titulo), criarElemento("span", "kpi-valor", valor));
  if (detalhe) k.appendChild(criarElemento("span", "kpi-detalhe", detalhe));
  return k;
}

export function textoDataHora(iso) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** Economia da viagem em relação à rota Normal, ou "—" quando não há comparação. */
export function textoEconomiaViagem(v) {
  const c = v.comparacao;
  if (!c) return "—";
  if (c.economiaReais !== null) return c.economiaReais > 1e-9 ? formatarReais(c.economiaReais) : "Sem redução";
  if (c.economiaKm !== null) return c.economiaKm > 1e-9 ? formatarKm(c.economiaKm) : "Sem redução";
  return "—";
}

export function textoDuracaoViagem(v) {
  return formatarDuracao(v.deslocamentoMin + v.atendimentoMin);
}

export function etiquetaModo(modo) {
  return criarElemento("span", "etiqueta " + (modo === "turbo" ? "etiqueta-turbo" : "etiqueta-normal"), modo === "turbo" ? "Turbo" : "Normal");
}

// Configurações gerais (hoje: preço do combustível). Chave nova, com versão.
//   frota-recife-config → { versao, precoCombustivel: number|null }

import { lerNumero } from "./geo.js";
import { precoValido, PRECO_MAXIMO_R_L } from "./combustivel.js";

export const CHAVE_CONFIG = "frota-recife-config";
const VERSAO = 1;

/** @returns {{precoCombustivel:(number|null), erro:(string|null)}} */
export function lerConfiguracoes() {
  let bruto;
  try {
    bruto = localStorage.getItem(CHAVE_CONFIG);
  } catch (erro) {
    return { precoCombustivel: null, erro: "O armazenamento local do navegador está indisponível." };
  }
  if (bruto === null) return { precoCombustivel: null, erro: null };
  try {
    const dados = JSON.parse(bruto);
    if (!dados || typeof dados !== "object") throw new Error("formato");
    // versao 1 é a atual; versões futuras desconhecidas são lidas de forma conservadora.
    return { precoCombustivel: precoValido(dados.precoCombustivel) ? dados.precoCombustivel : null, erro: null };
  } catch (erro) {
    return { precoCombustivel: null, erro: "As configurações salvas estavam ilegíveis e foram ignoradas. Informe o preço novamente." };
  }
}

/** Converte o texto digitado. Vazio = remover o preço. Lança Error com mensagem em português. */
export function interpretarPreco(texto) {
  if (typeof texto !== "string" || texto.trim() === "") return null;
  const numero = lerNumero(texto);
  if (Number.isNaN(numero) || !precoValido(numero)) {
    throw new Error("Informe um preço maior que zero e até R$ " + PRECO_MAXIMO_R_L + " por litro (ex.: 6,29).");
  }
  return Number(numero.toFixed(4));
}

export function salvarPrecoCombustivel(preco) {
  if (preco !== null && !precoValido(preco)) throw new Error("Preço inválido.");
  try {
    localStorage.setItem(CHAVE_CONFIG, JSON.stringify({ versao: VERSAO, precoCombustivel: preco }));
  } catch (erro) {
    throw new Error("Não foi possível salvar as configurações neste navegador (armazenamento cheio ou bloqueado).");
  }
}

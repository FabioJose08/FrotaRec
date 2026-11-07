// Cálculos de consumo, custo e economia de combustível. Módulo puro (sem navegador).
//
// Fórmulas (nenhum arredondamento aqui; arredonde só ao exibir):
//   litros   = distância (km) / consumo médio (km/L)
//   custo    = litros × preço do litro (R$/L)
//   economia = valor da rota Normal − valor da rota Turbo
//   percentual = economia / valor da rota Normal × 100
//
// Nada é inventado: sem consumo cadastrado não há litros; sem preço não há custo.

export const CONSUMO_MAXIMO_KM_L = 100;
export const PRECO_MAXIMO_R_L = 100;

export function consumoValido(valor) {
  return typeof valor === "number" && Number.isFinite(valor) && valor > 0 && valor <= CONSUMO_MAXIMO_KM_L;
}

export function precoValido(valor) {
  return typeof valor === "number" && Number.isFinite(valor) && valor > 0 && valor <= PRECO_MAXIMO_R_L;
}

/** Litros consumidos, ou null se a distância ou o consumo não forem utilizáveis. */
export function calcularLitros(distanciaKm, consumoKmL) {
  if (!Number.isFinite(distanciaKm) || distanciaKm < 0 || !consumoValido(consumoKmL)) return null;
  return distanciaKm / consumoKmL;
}

/** Custo em reais, ou null se não houver litros ou preço configurado. */
export function calcularCusto(litros, precoLitro) {
  if (litros === null || !Number.isFinite(litros) || !precoValido(precoLitro)) return null;
  return litros * precoLitro;
}

/** Percentual de redução de "base" para "valor" (positivo = reduziu). null se a base for 0 ou inválida. */
export function percentualReducao(base, valor) {
  if (!Number.isFinite(base) || !Number.isFinite(valor) || base <= 0) return null;
  return (base - valor) / base * 100;
}

/** Estimativa de uma rota isolada. */
export function estimarCombustivel(distanciaKm, consumoKmL, precoLitro) {
  const litros = calcularLitros(distanciaKm, consumoKmL);
  return {
    consumoDisponivel: consumoValido(consumoKmL),
    precoDisponivel: precoValido(precoLitro),
    litros,
    custo: calcularCusto(litros, precoLitro)
  };
}

/**
 * Compara as rotas Normal e Turbo.
 * @param {{distanciaKm:number, deslocamentoMin:number}} normal
 * @param {{distanciaKm:number, deslocamentoMin:number}} turbo
 * @returns economia de distância/tempo (sempre calculável) e de combustível/dinheiro (quando há dados).
 *   "reduziu*" é true somente se o Turbo realmente gastou menos que o Normal; nunca se mostra economia falsa.
 */
export function compararRotas(normal, turbo, consumoKmL, precoLitro) {
  const eN = estimarCombustivel(normal.distanciaKm, consumoKmL, precoLitro);
  const eT = estimarCombustivel(turbo.distanciaKm, consumoKmL, precoLitro);
  const economiaKm = normal.distanciaKm - turbo.distanciaKm;
  const economiaMin = normal.deslocamentoMin - turbo.deslocamentoMin;
  const economiaLitros = eN.litros !== null && eT.litros !== null ? eN.litros - eT.litros : null;
  const economiaReais = eN.custo !== null && eT.custo !== null ? eN.custo - eT.custo : null;
  return {
    consumoDisponivel: eN.consumoDisponivel,
    precoDisponivel: eN.precoDisponivel,
    litrosNormal: eN.litros,
    litrosTurbo: eT.litros,
    custoNormal: eN.custo,
    custoTurbo: eT.custo,
    economiaKm,
    economiaMin,
    economiaLitros,
    economiaReais,
    percentualDistancia: percentualReducao(normal.distanciaKm, turbo.distanciaKm),
    percentualTempo: percentualReducao(normal.deslocamentoMin, turbo.deslocamentoMin),
    percentualCombustivel: economiaLitros !== null ? percentualReducao(eN.litros, eT.litros) : null,
    percentualCusto: economiaReais !== null ? percentualReducao(eN.custo, eT.custo) : null,
    reduziuDistancia: economiaKm > 1e-9,
    reduziuTempo: economiaMin > 1e-9,
    reduziuCombustivel: economiaLitros !== null && economiaLitros > 1e-9,
    reduziuCusto: economiaReais !== null && economiaReais > 1e-9
  };
}

// ---------- Formatação (apenas apresentação) ----------

export function formatarLitros(litros) {
  return litros.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " L";
}

export function formatarReais(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatarPercentual(valor) {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
}

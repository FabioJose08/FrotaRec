// Indicadores gerenciais calculados SOMENTE a partir dos registros reais (veículos e histórico).
// Sem registros, os valores são zero ou "indisponível"; nunca números de exemplo.

/**
 * @param {object[]} veiculos
 * @param {object[]} viagens  registros do histórico
 */
export function calcularIndicadores(veiculos, viagens) {
  const por = (s) => veiculos.filter((v) => v.situacao === s).length;
  let km = 0, litros = 0, viagensComLitros = 0, economiaKm = 0, economiaMin = 0;
  let economiaLitros = 0, economiaReais = 0, comEconomiaLitros = 0, comEconomiaReais = 0, comparadas = 0;

  viagens.forEach((v) => {
    km += v.distanciaKm;
    if (v.litros !== null) { litros += v.litros; viagensComLitros += 1; }
    if (v.comparacao) {
      comparadas += 1;
      if (v.comparacao.economiaKm !== null) economiaKm += v.comparacao.economiaKm;
      if (v.comparacao.economiaMin !== null) economiaMin += v.comparacao.economiaMin;
      if (v.comparacao.economiaLitros !== null) { economiaLitros += v.comparacao.economiaLitros; comEconomiaLitros += 1; }
      if (v.comparacao.economiaReais !== null) { economiaReais += v.comparacao.economiaReais; comEconomiaReais += 1; }
    }
  });

  return {
    totalVeiculos: veiculos.length,
    ativos: por("Ativo"),
    emManutencao: por("Em manutenção"),
    inativos: por("Inativo"),
    veiculosSemConsumo: veiculos.filter((v) => v.consumoKmL === null).length,
    viagensConcluidas: viagens.length,
    kmPercorridos: km,
    litrosEstimados: viagensComLitros > 0 ? litros : null,
    viagensSemCombustivel: viagens.length - viagensComLitros,
    viagensComparadas: comparadas,
    economiaKm: comparadas > 0 ? economiaKm : null,
    economiaMin: comparadas > 0 ? economiaMin : null,
    economiaLitros: comEconomiaLitros > 0 ? economiaLitros : null,
    economiaReais: comEconomiaReais > 0 ? economiaReais : null
  };
}

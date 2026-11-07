// Exportações (CSV), backup completo (JSON) e relatório operacional para impressão.
// Sem dependências externas. A parte de CSV/validação é pura; só baixarArquivo e
// construirRelatorio usam o navegador.

import { CHAVE_VEICULOS, CHAVE_QUEBRAS, normalizarVeiculo, normalizarQuebra } from "./dados.js";
import { CHAVE_GALPAO, CHAVE_VIAGENS } from "./viagem.js";
import { CHAVE_HISTORICO, sanearRegistro } from "./historico.js";
import { CHAVE_CONFIG } from "./configuracoes.js";
import { coordenadaValida, formatarKm, formatarDuracao } from "./geo.js";
import { formatarLitros, formatarReais, formatarPercentual } from "./combustivel.js";

export const MARCA_BACKUP = "frota-recife-backup";
export const VERSAO_BACKUP = 1;
export const CHAVE_BACKUP_ANTERIOR = "frota-recife-backup-anterior";

// ---------- CSV (compatível com Excel em pt-BR: ponto e vírgula, vírgula decimal, UTF-8 com BOM) ----------

function celula(valor) {
  if (valor === null || valor === undefined) return "";
  let texto = typeof valor === "number" ? String(valor).replace(".", ",") : String(valor);
  // Evita que o Excel execute texto digitado pelo usuário como fórmula.
  if (typeof valor === "string" && /^[=+\-@\t\r]/.test(texto)) texto = "'" + texto;
  return /[;"\n\r]/.test(texto) ? '"' + texto.replace(/"/g, '""') + '"' : texto;
}

export function paraCsv(colunas, linhas) {
  const cabecalho = colunas.map((c) => celula(c.titulo)).join(";");
  const corpo = linhas.map((l) => colunas.map((c) => celula(c.valor(l))).join(";"));
  return "\uFEFF" + [cabecalho, ...corpo].join("\r\n") + "\r\n";
}

const arred = (v, casas) => (v === null || v === undefined ? null : Number(v.toFixed(casas)));
const dataHora = (iso) => { const d = new Date(iso); return d.toLocaleString("pt-BR"); };

export function csvViagens(viagens) {
  return paraCsv([
    { titulo: "Data e hora", valor: (v) => dataHora(v.concluidaEm) },
    { titulo: "Veículo", valor: (v) => v.veiculoCodigo },
    { titulo: "Modo", valor: (v) => (v.modo === "turbo" ? "Turbo" : "Normal") },
    { titulo: "Critério", valor: (v) => (v.criterio === "distancia" ? "Distância" : v.criterio === "tempo" ? "Tempo" : "") },
    { titulo: "Entregas", valor: (v) => v.entregas },
    { titulo: "Retorno ao galpão", valor: (v) => (v.retornouGalpao ? "Sim" : "Não") },
    { titulo: "Distância (km)", valor: (v) => arred(v.distanciaKm, 2) },
    { titulo: "Deslocamento (min)", valor: (v) => arred(v.deslocamentoMin, 1) },
    { titulo: "Atendimento (min)", valor: (v) => arred(v.atendimentoMin, 1) },
    { titulo: "Consumo médio (km/L)", valor: (v) => v.consumoKmL },
    { titulo: "Combustível estimado (L)", valor: (v) => arred(v.litros, 3) },
    { titulo: "Preço do litro (R$)", valor: (v) => v.precoLitro },
    { titulo: "Custo estimado (R$)", valor: (v) => arred(v.custo, 2) },
    { titulo: "Economia vs Normal (km)", valor: (v) => arred(v.comparacao && v.comparacao.economiaKm, 2) },
    { titulo: "Economia vs Normal (min)", valor: (v) => arred(v.comparacao && v.comparacao.economiaMin, 1) },
    { titulo: "Economia vs Normal (L)", valor: (v) => arred(v.comparacao && v.comparacao.economiaLitros, 3) },
    { titulo: "Economia vs Normal (R$)", valor: (v) => arred(v.comparacao && v.comparacao.economiaReais, 2) },
    { titulo: "Método", valor: (v) => ({ exato: "Exato (ótimo)", heuristica: "Heurística", trivial: "Trivial", manual: "Ordem cadastrada" })[v.metodo] },
    { titulo: "Origem dos dados", valor: (v) => (v.origem === "osrm" ? "OSRM (ruas)" : "Aproximação em linha reta") }
  ], viagens);
}

export function csvVeiculos(veiculos) {
  return paraCsv([
    { titulo: "Código", valor: (v) => v.codigo },
    { titulo: "Tipo", valor: (v) => v.tipo },
    { titulo: "Responsável", valor: (v) => v.responsavel },
    { titulo: "Transportadora", valor: (v) => v.transportadora },
    { titulo: "Situação", valor: (v) => v.situacao },
    { titulo: "Consumo médio (km/L)", valor: (v) => v.consumoKmL }
  ], veiculos);
}

export function csvQuebras(quebras, veiculos) {
  const codigo = (id) => { const v = veiculos.find((x) => x.id === id); return v ? v.codigo : "Veículo removido"; };
  return paraCsv([
    { titulo: "Data", valor: (q) => q.data.split("-").reverse().join("/") },
    { titulo: "Veículo", valor: (q) => codigo(q.veiculoId) },
    { titulo: "Motivo", valor: (q) => q.motivo },
    { titulo: "Registrado por", valor: (q) => q.registradoPor },
    { titulo: "Observações", valor: (q) => q.observacoes }
  ], quebras);
}

export function baixarArquivo(nome, conteudo, tipo) {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function nomeComData(prefixo, extensao) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return prefixo + "-" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + "." + extensao;
}

// ---------- Backup completo ----------

const CHAVES = { veiculos: CHAVE_VEICULOS, quebras: CHAVE_QUEBRAS, galpao: CHAVE_GALPAO, viagens: CHAVE_VIAGENS, historico: CHAVE_HISTORICO, config: CHAVE_CONFIG };

/** Lê o conteúdo atual do navegador (valores já decodificados; seções ausentes ficam null). */
export function montarBackup() {
  const dados = {};
  Object.keys(CHAVES).forEach((secao) => {
    let bruto = null;
    try { bruto = localStorage.getItem(CHAVES[secao]); } catch (erro) { bruto = null; }
    try { dados[secao] = bruto === null ? null : JSON.parse(bruto); } catch (erro) { dados[secao] = null; }
  });
  return { app: MARCA_BACKUP, versao: VERSAO_BACKUP, geradoEm: new Date().toISOString(), dados };
}

/**
 * Valida o texto de um arquivo de backup SEM gravar nada.
 * @returns {{ok:true, dados:object, resumo:object}|{ok:false, erro:string}}
 */
export function validarBackup(texto) {
  let arquivo;
  try { arquivo = JSON.parse(texto); } catch (erro) { return { ok: false, erro: "O arquivo não é um JSON válido." }; }
  if (!arquivo || typeof arquivo !== "object" || arquivo.app !== MARCA_BACKUP) return { ok: false, erro: "Este arquivo não é um backup do Frota Recife." };
  if (!Number.isInteger(arquivo.versao) || arquivo.versao > VERSAO_BACKUP) return { ok: false, erro: "Backup de uma versão mais nova do sistema; atualize o aplicativo antes de importar." };
  const d = arquivo.dados;
  if (!d || typeof d !== "object") return { ok: false, erro: "O backup não contém dados." };

  const limpo = {};
  try {
    if (d.veiculos !== null && d.veiculos !== undefined) {
      if (!Array.isArray(d.veiculos)) throw new Error("A lista de veículos está num formato inválido.");
      limpo.veiculos = d.veiculos.map(normalizarVeiculo);
      if (new Set(limpo.veiculos.map((v) => v.id)).size !== limpo.veiculos.length) throw new Error("Há veículos com identificadores repetidos.");
    }
    if (d.quebras !== null && d.quebras !== undefined) {
      if (!Array.isArray(d.quebras)) throw new Error("A lista de ocorrências está num formato inválido.");
      limpo.quebras = d.quebras.map(normalizarQuebra);
    }
    if (d.galpao !== null && d.galpao !== undefined) {
      if (typeof d.galpao.nome !== "string" || !coordenadaValida(d.galpao)) throw new Error("O galpão do backup é inválido.");
      limpo.galpao = { nome: d.galpao.nome, lat: d.galpao.lat, lng: d.galpao.lng };
    }
    if (d.viagens !== null && d.viagens !== undefined) {
      if (typeof d.viagens !== "object" || typeof d.viagens.viagens !== "object" || d.viagens.viagens === null) throw new Error("Os planejamentos de viagem estão num formato inválido.");
      limpo.viagens = d.viagens; // será saneado pelo próprio módulo ao ser lido
    }
    if (d.historico !== null && d.historico !== undefined) {
      if (!Array.isArray(d.historico.viagens)) throw new Error("O histórico de viagens está num formato inválido.");
      const lidos = d.historico.viagens.map(sanearRegistro);
      if (lidos.some((r) => r === null)) throw new Error("O histórico contém registros inválidos.");
      limpo.historico = { versao: 1, viagens: lidos };
    }
    if (d.config !== null && d.config !== undefined) {
      if (typeof d.config !== "object") throw new Error("As configurações estão num formato inválido.");
      limpo.config = { versao: 1, precoCombustivel: typeof d.config.precoCombustivel === "number" ? d.config.precoCombustivel : null };
    }
  } catch (erro) {
    return { ok: false, erro: "Backup inválido: " + erro.message };
  }
  const resumo = {
    geradoEm: arquivo.geradoEm || null,
    veiculos: limpo.veiculos ? limpo.veiculos.length : 0,
    quebras: limpo.quebras ? limpo.quebras.length : 0,
    viagensConcluidas: limpo.historico ? limpo.historico.viagens.length : 0
  };
  return { ok: true, dados: limpo, resumo };
}

/** Substitui os dados do navegador pelos do backup já validado. Guarda uma cópia do estado anterior. */
export function aplicarBackup(dados) {
  const anterior = montarBackup();
  try { localStorage.setItem(CHAVE_BACKUP_ANTERIOR, JSON.stringify(anterior)); } catch (erro) { /* sem espaço: segue sem a cópia */ }
  try {
    Object.keys(CHAVES).forEach((secao) => {
      if (dados[secao] !== undefined) localStorage.setItem(CHAVES[secao], JSON.stringify(dados[secao]));
      else localStorage.removeItem(CHAVES[secao]);
    });
  } catch (erro) {
    // Tenta voltar ao estado anterior para não deixar dados pela metade.
    try {
      Object.keys(CHAVES).forEach((secao) => {
        if (anterior.dados[secao] !== null) localStorage.setItem(CHAVES[secao], JSON.stringify(anterior.dados[secao]));
        else localStorage.removeItem(CHAVES[secao]);
      });
    } catch (e) { /* nada mais a fazer */ }
    throw new Error("Não foi possível gravar o backup neste navegador (armazenamento cheio ou bloqueado). Os dados anteriores foram mantidos.");
  }
}

// ---------- Relatório operacional (para impressão) ----------

function el(tag, texto, classe) {
  const e = document.createElement(tag);
  if (texto !== undefined) e.textContent = texto;
  if (classe) e.className = classe;
  return e;
}

/** Preenche "alvo" com o relatório operacional. Todo texto entra como texto, nunca HTML. */
export function construirRelatorio(alvo, indicadores, viagens, precoLitro) {
  alvo.innerHTML = "";
  alvo.appendChild(el("h1", "Frota Recife — Relatório operacional"));
  alvo.appendChild(el("p", "Gerado em " + new Date().toLocaleString("pt-BR") + ". Valores estimados a partir dos registros deste navegador."));

  const resumo = el("dl", undefined, "relatorio-resumo");
  const linhas = [
    ["Veículos cadastrados", String(indicadores.totalVeiculos) + " (" + indicadores.ativos + " ativos, " + indicadores.emManutencao + " em manutenção, " + indicadores.inativos + " inativos)"],
    ["Viagens concluídas", String(indicadores.viagensConcluidas)],
    ["Distância percorrida", formatarKm(indicadores.kmPercorridos)],
    ["Combustível estimado", indicadores.litrosEstimados === null ? "indisponível (sem consumo cadastrado)" : formatarLitros(indicadores.litrosEstimados)],
    ["Preço do litro configurado", precoLitro === null ? "não configurado" : formatarReais(precoLitro)],
    ["Economia de distância (Turbo × Normal)", indicadores.economiaKm === null ? "sem viagens comparadas" : formatarKm(indicadores.economiaKm)],
    ["Economia de combustível", indicadores.economiaLitros === null ? "indisponível" : formatarLitros(indicadores.economiaLitros)],
    ["Economia financeira", indicadores.economiaReais === null ? "indisponível (sem preço ou consumo)" : formatarReais(indicadores.economiaReais)]
  ];
  linhas.forEach(([t, v]) => { resumo.append(el("dt", t), el("dd", v)); });
  alvo.appendChild(resumo);

  alvo.appendChild(el("h2", "Viagens"));
  if (viagens.length === 0) { alvo.appendChild(el("p", "Nenhuma viagem concluída.")); }
  else {
    const tabela = el("table", undefined, "tabela");
    const cab = el("tr");
    ["Data", "Veículo", "Modo", "Entregas", "Distância", "Duração", "Combustível", "Economia"].forEach((t) => cab.appendChild(el("th", t)));
    tabela.appendChild(el("thead")).appendChild(cab);
    const corpo = el("tbody");
    viagens.forEach((v) => {
      const tr = el("tr");
      const eco = v.comparacao && v.comparacao.economiaReais !== null ? formatarReais(v.comparacao.economiaReais)
        : v.comparacao && v.comparacao.economiaKm !== null ? formatarKm(v.comparacao.economiaKm) : "—";
      [new Date(v.concluidaEm).toLocaleDateString("pt-BR"), v.veiculoCodigo, v.modo === "turbo" ? "Turbo" : "Normal", String(v.entregas),
        formatarKm(v.distanciaKm), formatarDuracao(v.deslocamentoMin + v.atendimentoMin), v.litros === null ? "—" : formatarLitros(v.litros), eco
      ].forEach((t) => tr.appendChild(el("td", t)));
      corpo.appendChild(tr);
    });
    tabela.appendChild(corpo);
    alvo.appendChild(tabela);
  }
  alvo.appendChild(el("p", "Estimativas baseadas no consumo médio informado, sem considerar trânsito em tempo real, relevo, carga, condições do motor ou estilo de condução.", "relatorio-nota"));
}

export { formatarPercentual };

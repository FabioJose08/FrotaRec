// Dados persistidos no navegador. Não exige servidor nem banco instalado.

import { VEICULOS_DEMO } from "./dados-demo.js";
import { descartarPlano } from "./viagem.js";
import { consumoValido, CONSUMO_MAXIMO_KM_L } from "./combustivel.js";
import { lerNumero } from "./geo.js";

export const SITUACOES = ["Ativo", "Em manutenção", "Inativo"];
export const CHAVE_VEICULOS = "frota-recife-veiculos";
export const CHAVE_QUEBRAS = "frota-recife-quebras";

export function dataDeHoje() {
  const agora = new Date();
  return agora.getFullYear() + "-" + String(agora.getMonth() + 1).padStart(2, "0") + "-" + String(agora.getDate()).padStart(2, "0");
}

function iniciais() {
  return VEICULOS_DEMO.map(function (veiculo) {
    return {
      id: veiculo.id,
      codigo: veiculo.codigo,
      tipo: veiculo.tipo,
      responsavel: "",
      transportadora: "",
      situacao: veiculo.situacao,
      consumoKmL: null
    };
  });
}

// Garante que cada registro lido tenha os campos esperados, sem alterar o que está salvo.
// Registros que não sejam objetos com "id" e "codigo"/"data" legíveis indicam dados corrompidos.
export function normalizarVeiculo(v) {
  if (!v || typeof v !== "object" || typeof v.id !== "string" || typeof v.codigo !== "string") throw new Error("registro inválido");
  return {
    id: v.id,
    codigo: v.codigo,
    tipo: typeof v.tipo === "string" ? v.tipo : "",
    responsavel: typeof v.responsavel === "string" ? v.responsavel : "",
    transportadora: typeof v.transportadora === "string" ? v.transportadora : "",
    situacao: SITUACOES.includes(v.situacao) ? v.situacao : "Inativo",
    // Campo novo: veículos antigos não o têm e ficam com null (nunca se inventa um consumo).
    consumoKmL: consumoValido(v.consumoKmL) ? v.consumoKmL : null
  };
}

export function normalizarQuebra(q) {
  if (!q || typeof q !== "object" || typeof q.id !== "string" || typeof q.data !== "string") throw new Error("registro inválido");
  return {
    ...q,
    veiculoId: typeof q.veiculoId === "string" ? q.veiculoId : "",
    motivo: typeof q.motivo === "string" ? q.motivo : "",
    registradoPor: typeof q.registradoPor === "string" ? q.registradoPor : "",
    observacoes: typeof q.observacoes === "string" ? q.observacoes : "",
    criadoEm: Number.isFinite(q.criadoEm) ? q.criadoEm : 0
  };
}

function lerLista(chave, valorInicial) {
  let salvo;
  try {
    salvo = localStorage.getItem(chave);
  } catch (erro) {
    throw new Error("O armazenamento local deste navegador está indisponível (modo privado ou bloqueado).");
  }
  try {
    if (salvo === null) {
      localStorage.setItem(chave, JSON.stringify(valorInicial));
      return valorInicial.slice();
    }
    const valor = JSON.parse(salvo);
    if (!Array.isArray(valor)) throw new Error("formato");
    const normalizar = chave === CHAVE_VEICULOS ? normalizarVeiculo : normalizarQuebra;
    return valor.map(normalizar);
  } catch (erro) {
    throw new Error("Não foi possível ler os dados salvos neste navegador. Eles podem estar corrompidos; limpe os dados do site para recomeçar.");
  }
}

function salvarLista(chave, lista) {
  try {
    localStorage.setItem(chave, JSON.stringify(lista));
  } catch (erro) {
    throw new Error("Não foi possível salvar os dados neste navegador (armazenamento cheio ou bloqueado).");
  }
}

function novoId() {
  return crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2);
}

function texto(valor, campo, maximo, obrigatorio = false) {
  if (typeof valor !== "string") throw new Error("Informe " + campo + ".");
  const resultado = valor.trim();
  if (obrigatorio && !resultado) throw new Error("Informe " + campo + ".");
  if (resultado.length > maximo) throw new Error(campo + " deve ter no máximo " + maximo + " caracteres.");
  return resultado;
}

function validarConsumo(valor) {
  if (valor === undefined || valor === null || valor === "") return null;
  const numero = typeof valor === "number" ? valor : lerNumero(String(valor));
  if (Number.isNaN(numero) || !consumoValido(numero)) {
    throw new Error("O consumo médio deve ser maior que zero e até " + CONSUMO_MAXIMO_KM_L + " km/L (ex.: 8,5).");
  }
  return numero;
}

function validarVeiculo(dados) {
  if (!SITUACOES.includes(dados.situacao)) throw new Error("Escolha a situação operacional.");
  return {
    consumoKmL: validarConsumo(dados.consumoKmL),
    codigo: texto(dados.codigo, "a placa ou o código do veículo", 20, true),
    tipo: texto(dados.tipo, "o tipo do veículo", 40, true),
    responsavel: texto(dados.responsavel || "", "o responsável", 60),
    transportadora: texto(dados.transportadora || "", "a transportadora", 60),
    situacao: dados.situacao
  };
}

function validarData(data) {
  if (typeof data !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error("Informe uma data válida.");
  const [ano, mes, dia] = data.split("-").map(Number);
  const dataValida = new Date(Date.UTC(ano, mes - 1, dia));
  if (dataValida.getUTCFullYear() !== ano || dataValida.getUTCMonth() + 1 !== mes || dataValida.getUTCDate() !== dia) {
    throw new Error("Informe uma data válida.");
  }
  if (data > dataDeHoje()) throw new Error("A data da ocorrência não pode ser futura.");
}

export async function listarVeiculos() {
  return lerLista(CHAVE_VEICULOS, iniciais()).sort(function (a, b) {
    return a.codigo.localeCompare(b.codigo, "pt-BR", { sensitivity: "base" });
  });
}

export async function salvarVeiculo(dados) {
  const veiculos = lerLista(CHAVE_VEICULOS, iniciais());
  const campos = validarVeiculo(dados);
  const duplicado = veiculos.some(function (veiculo) {
    return veiculo.id !== dados.id && veiculo.codigo.toLocaleLowerCase("pt-BR") === campos.codigo.toLocaleLowerCase("pt-BR");
  });
  if (duplicado) throw new Error("Já existe um veículo com esse código.");

  const id = dados.id || novoId();
  const atualizado = { id, ...campos };
  const indice = veiculos.findIndex(function (veiculo) { return veiculo.id === id; });
  if (dados.id && indice < 0) throw new Error("Veículo não encontrado.");
  if (indice < 0) veiculos.push(atualizado); else veiculos[indice] = atualizado;
  salvarLista(CHAVE_VEICULOS, veiculos);
  return atualizado;
}

export async function excluirVeiculo(id) {
  const quebras = lerLista(CHAVE_QUEBRAS, []);
  if (quebras.some(function (quebra) { return quebra.veiculoId === id; })) {
    throw new Error("Este veículo tem quebras registradas e não pode ser excluído.");
  }
  const veiculos = lerLista(CHAVE_VEICULOS, iniciais());
  const atualizados = veiculos.filter(function (veiculo) { return veiculo.id !== id; });
  if (atualizados.length === veiculos.length) throw new Error("Veículo não encontrado.");
  salvarLista(CHAVE_VEICULOS, atualizados);
  descartarPlano(id); // a viagem planejada deste veículo não faz mais sentido
}

export async function listarQuebras() {
  return lerLista(CHAVE_QUEBRAS, []).sort(function (a, b) {
    return b.data.localeCompare(a.data) || b.criadoEm - a.criadoEm;
  });
}

export async function salvarQuebra(dados) {
  const veiculos = lerLista(CHAVE_VEICULOS, iniciais());
  if (!dados.veiculoId || !veiculos.some(function (veiculo) { return veiculo.id === dados.veiculoId; })) {
    throw new Error("Escolha um veículo cadastrado.");
  }
  validarData(dados.data);
  const campos = {
    veiculoId: dados.veiculoId,
    data: dados.data,
    motivo: texto(dados.motivo, "o motivo da ocorrência", 120, true),
    registradoPor: texto(dados.registradoPor, "quem está registrando a ocorrência", 60, true),
    observacoes: texto(dados.observacoes || "", "as observações", 500)
  };
  const quebras = lerLista(CHAVE_QUEBRAS, []);
  const antiga = quebras.find(function (quebra) { return quebra.id === dados.id; });
  if (dados.id && !antiga) throw new Error("Ocorrência não encontrada.");
  const salva = {
    id: dados.id || novoId(),
    ...campos,
    criadoPor: antiga ? antiga.criadoPor : "local",
    criadoEm: antiga ? antiga.criadoEm : Date.now()
  };
  const indice = quebras.findIndex(function (quebra) { return quebra.id === salva.id; });
  if (indice < 0) quebras.push(salva); else quebras[indice] = salva;
  salvarLista(CHAVE_QUEBRAS, quebras);
  return salva;
}

export async function excluirQuebra(id) {
  const quebras = lerLista(CHAVE_QUEBRAS, []);
  const atualizadas = quebras.filter(function (quebra) { return quebra.id !== id; });
  if (atualizadas.length === quebras.length) throw new Error("Ocorrência não encontrada.");
  salvarLista(CHAVE_QUEBRAS, atualizadas);
}

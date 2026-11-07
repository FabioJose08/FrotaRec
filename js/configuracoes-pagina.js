// Tela de configurações: preço do combustível e backup/restauração em JSON.

import { lerConfiguracoes, interpretarPreco, salvarPrecoCombustivel } from "./configuracoes.js";
import { montarBackup, validarBackup, aplicarBackup, baixarArquivo, nomeComData } from "./relatorios.js";
import { pegar, mostrarMensagem } from "./ui.js";
import { formatarReais } from "./combustivel.js";

const campoPreco = pegar("preco-combustivel");
const msgConfig = pegar("mensagem-config");
const msgBackup = pegar("mensagem-backup");

const inicial = lerConfiguracoes();
if (inicial.erro) mostrarMensagem(msgConfig, inicial.erro, "erro");
if (inicial.precoCombustivel !== null) campoPreco.value = String(inicial.precoCombustivel).replace(".", ",");

pegar("form-config").addEventListener("submit", (evento) => {
  evento.preventDefault();
  try {
    const preco = interpretarPreco(campoPreco.value);
    salvarPrecoCombustivel(preco);
    mostrarMensagem(msgConfig, preco === null ? "Preço removido. O custo em reais não será calculado." : "Preço salvo: " + formatarReais(preco) + " por litro.", "ok");
  } catch (erro) {
    mostrarMensagem(msgConfig, erro.message, "erro");
  }
});

pegar("btn-exportar-backup").addEventListener("click", () => {
  baixarArquivo(nomeComData("frota-recife-backup", "json"), JSON.stringify(montarBackup(), null, 2), "application/json");
  mostrarMensagem(msgBackup, "Backup gerado. Guarde o arquivo em local seguro.", "ok");
});

const entradaArquivo = pegar("arquivo-backup");
pegar("rotulo-arquivo").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); entradaArquivo.click(); } });

entradaArquivo.addEventListener("change", async () => {
  const arquivo = entradaArquivo.files && entradaArquivo.files[0];
  entradaArquivo.value = "";
  if (!arquivo) return;
  if (arquivo.size > 5 * 1024 * 1024) { mostrarMensagem(msgBackup, "O arquivo é grande demais para ser um backup válido (máximo 5 MB).", "erro"); return; }
  let texto;
  try { texto = await arquivo.text(); } catch (erro) { mostrarMensagem(msgBackup, "Não foi possível ler o arquivo.", "erro"); return; }
  const r = validarBackup(texto);
  if (!r.ok) { mostrarMensagem(msgBackup, r.erro, "erro"); return; }
  const resumo = r.resumo;
  const pergunta = "Importar este backup SUBSTITUI os dados atuais deste navegador.\n\n" +
    "Conteúdo: " + resumo.veiculos + " veículo(s), " + resumo.quebras + " ocorrência(s), " + resumo.viagensConcluidas + " viagem(ns) no histórico" +
    (resumo.geradoEm ? " (gerado em " + new Date(resumo.geradoEm).toLocaleString("pt-BR") + ")" : "") + ".\n\nContinuar?";
  if (!window.confirm(pergunta)) { mostrarMensagem(msgBackup, "Importação cancelada. Nada foi alterado.", "info"); return; }
  try {
    aplicarBackup(r.dados);
    mostrarMensagem(msgBackup, "Backup importado. Os dados anteriores foram guardados como cópia de segurança neste navegador.", "ok");
    const novo = lerConfiguracoes();
    campoPreco.value = novo.precoCombustivel === null ? "" : String(novo.precoCombustivel).replace(".", ",");
  } catch (erro) {
    mostrarMensagem(msgBackup, erro.message, "erro");
  }
});

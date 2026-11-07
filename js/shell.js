// Estrutura comum a todas as páginas: navegação lateral e barra superior.
// Cada página declara data-pagina e data-titulo no <body>.

import { icone, simboloMarca } from "./icones.js";
import { lerConfiguracoes } from "./configuracoes.js";
import { formatarReais } from "./combustivel.js";

const ITENS = [
  { id: "visao-geral", href: "index.html", rotulo: "Visão geral", icone: "painel" },
  { id: "planejamento", href: "planejamento.html", rotulo: "Planejamento de rotas", icone: "rota" },
  { id: "frota", href: "veiculos.html", rotulo: "Frota", icone: "caminhao" },
  { id: "ocorrencias", href: "quebras.html", rotulo: "Ocorrências", icone: "alerta" },
  { id: "historico", href: "historico.html", rotulo: "Histórico de viagens", icone: "relogio" },
  { id: "configuracoes", href: "configuracoes.html", rotulo: "Configurações", icone: "ajustes" }
];

function el(tag, classe, texto) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

function montarNavegacao(atual) {
  const nav = document.getElementById("nav-lateral");
  if (!nav) return;
  nav.innerHTML = "";
  const marca = el("a", "marca");
  marca.href = "index.html";
  const nome = el("span");
  nome.append("Frota Recife");
  nome.appendChild(el("small", undefined, "Gestão logística"));
  marca.append(simboloMarca(), nome);

  const menu = el("nav", "menu");
  menu.setAttribute("aria-label", "Principal");
  ITENS.forEach((item) => {
    const a = el("a");
    a.href = item.href;
    a.append(icone(item.icone), el("span", undefined, item.rotulo));
    if (item.id === atual) a.setAttribute("aria-current", "page");
    menu.appendChild(a);
  });

  nav.append(marca, el("p", "nav-titulo", "Operação"), menu, el("p", "nav-rodape", "Dados salvos neste navegador. Sem GPS nem trânsito em tempo real."));
}

function montarTopo(titulo) {
  const topo = document.getElementById("barra-topo");
  if (!topo) return;
  topo.innerHTML = "";
  const botao = el("button", "botao botao-secundario botao-menu");
  botao.type = "button";
  botao.setAttribute("aria-label", "Abrir menu de navegação");
  botao.appendChild(icone("menu"));
  botao.addEventListener("click", () => alternarMenu(true));

  const preco = lerConfiguracoes().precoCombustivel;
  const chip = el("a", "chip-preco" + (preco === null ? " alerta" : ""));
  chip.href = "configuracoes.html";
  chip.append(icone("combustivel"), preco === null ? "Preço do combustível não configurado" : "Combustível " + formatarReais(preco) + "/L");

  topo.append(botao, el("h1", undefined, titulo), el("span", "topo-espaco"), chip);
}

function alternarMenu(aberto) {
  document.body.classList.toggle("nav-aberta", aberto);
}

function iniciar() {
  const atual = document.body.dataset.pagina;
  montarNavegacao(atual);
  montarTopo(document.body.dataset.titulo || document.title);
  const fundo = document.getElementById("fundo-nav");
  if (fundo) fundo.addEventListener("click", () => alternarMenu(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") alternarMenu(false); });
}

iniciar();

// Campo de pesquisa de locais (lista de sugestões abaixo do campo).
//
// Componente de apresentação, reutilizado nos quatro pontos da tela de planejamento (galpão,
// coleta, entrega e editor de entrega). Ele só pesquisa e devolve o local escolhido; quem decide o
// que fazer com ele (marcador, validações, gravação) é a tela, pelos mesmos caminhos do clique no mapa.
//
// Controle das requisições: espera de 400 ms depois da última tecla (debounce), mínimo de 3 caracteres,
// no máximo 5 sugestões, cancelamento da consulta anterior (AbortController), descarte de respostas
// antigas (contador de geração) e nenhuma consulta repetida para o mesmo texto e a mesma região.
//
// Acessibilidade: padrão "combobox" com lista (role=combobox/listbox/option), setas, Enter, Esc e Tab,
// mensagens de estado em região role=status. Todo texto vindo da API entra por textContent (nunca HTML).
//
// HTML esperado: <div class="busca-local"><input id="..." type="text"></div>, com <label for> no campo.

import {
  buscarLocais, chaveConfigurada, limparConsulta, ErroGeocodificacao, MENSAGEM_SEM_CHAVE, MINIMO_CARACTERES
} from "./geocodificacao.js";

export const ATRASO_MS = 400;
const MAXIMO_NO_CACHE = 20;
let contadorDeInstancias = 0;

function criar(tag, classe, texto) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

/**
 * @param {object} opcoes
 * @param {HTMLInputElement} opcoes.input campo de texto que já existe no HTML
 * @param {(local:{nome:string,resumo:string,endereco:string,lat:number,lng:number}) => (true|false|string)} opcoes.aoEscolher
 *        true = aplicado; string = mensagem de erro para mostrar junto ao campo; false = não aplicado (a tela já avisou)
 * @param {() => ({lat:number,lng:number}|null)} [opcoes.obterProximidade] região a priorizar (Recife)
 * @param {Function} [opcoes.buscar] só para testes
 * @param {number} [opcoes.atrasoMs]
 */
export function criarBuscaLocal({ input, aoEscolher, obterProximidade, buscar = buscarLocais, atrasoMs = ATRASO_MS }) {
  const envoltorio = input.parentElement;
  if (!envoltorio || !envoltorio.classList.contains("busca-local")) {
    throw new Error("O campo de pesquisa precisa estar dentro de um elemento .busca-local.");
  }
  contadorDeInstancias += 1;
  const idLista = "busca-lista-" + contadorDeInstancias;
  const idStatus = "busca-status-" + contadorDeInstancias;

  const indicador = criar("span", "busca-carregando");
  indicador.setAttribute("aria-hidden", "true");
  indicador.hidden = true;
  const lista = criar("ul", "busca-lista");
  lista.id = idLista;
  lista.setAttribute("role", "listbox");
  lista.setAttribute("aria-label", "Sugestões de locais");
  lista.hidden = true;
  const status = criar("div", "busca-status");
  status.id = idStatus;
  status.setAttribute("role", "status");
  status.hidden = true;
  envoltorio.append(indicador, lista, status);

  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", idLista);
  input.setAttribute("aria-describedby", idStatus);
  input.setAttribute("autocomplete", "off");
  input.setAttribute("spellcheck", "false");

  let temporizador = null;
  let controle = null;
  let geracao = 0;                 // cada nova consulta (ou cancelamento) invalida as respostas anteriores
  let emAndamento = null;          // chave da consulta em andamento (evita duplicar)
  let resultados = [];
  let ativo = -1;
  let escolhido = null;            // texto do campo logo após uma escolha (para não pesquisar de novo)
  let semChave = false;
  let chaveVerificada = false;
  let desabilitado = input.disabled;
  const cache = new Map();         // só nesta sessão da página; nada é gravado

  // ---------- Região e consulta ----------

  function proximidade() {
    const p = obterProximidade ? obterProximidade() : null;
    return p && Number.isFinite(p.lat) && Number.isFinite(p.lng) ? p : null;
  }

  function chaveDaConsulta(texto) {
    const p = proximidade();
    return texto.toLocaleLowerCase("pt-BR") + "@" + (p ? p.lat.toFixed(2) + "," + p.lng.toFixed(2) : "-");
  }

  function guardarNoCache(chave, locais) {
    cache.delete(chave);
    cache.set(chave, locais);
    if (cache.size > MAXIMO_NO_CACHE) cache.delete(cache.keys().next().value);
  }

  // ---------- Estados visuais ----------

  /** tipo: dica | carregando | vazio | erro | ok | leitor (só para leitores de tela). */
  function mostrarStatus(tipo, texto, comNovaTentativa) {
    status.replaceChildren();
    status.className = "busca-status busca-status-" + tipo + (tipo === "leitor" ? " so-leitor" : "");
    status.append(criar("span", "", texto));
    if (comNovaTentativa) {
      const botao = criar("button", "botao botao-secundario botao-pequeno", "Tentar novamente");
      botao.type = "button";
      botao.addEventListener("click", () => { input.focus(); pesquisarAgora(true); });
      status.append(botao);
    }
    status.hidden = false;
  }

  function limparStatus() {
    status.hidden = true;
    status.replaceChildren();
  }

  function mostrarCarregando(sim) {
    indicador.hidden = !sim;
    input.setAttribute("aria-busy", sim ? "true" : "false");
  }

  function fechar() {
    lista.hidden = true;
    lista.replaceChildren();
    ativo = -1;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }

  function marcarAtivo(indice) {
    const itens = lista.children;
    if (ativo >= 0 && itens[ativo]) {
      itens[ativo].classList.remove("ativa");
      itens[ativo].setAttribute("aria-selected", "false");
    }
    ativo = indice;
    if (ativo >= 0 && itens[ativo]) {
      itens[ativo].classList.add("ativa");
      itens[ativo].setAttribute("aria-selected", "true");
      input.setAttribute("aria-activedescendant", itens[ativo].id);
      if (typeof itens[ativo].scrollIntoView === "function") itens[ativo].scrollIntoView({ block: "nearest" });
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  }

  function mostrarResultados(locais) {
    resultados = locais;
    fechar();
    if (locais.length === 0) {
      mostrarStatus("vazio", "Nenhum local encontrado. Tente outro nome, inclua o bairro ou marque o ponto no mapa.");
      return;
    }
    locais.forEach((local, i) => {
      const item = criar("li", "busca-opcao");
      item.id = idLista + "-" + i;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", "false");
      item.append(criar("span", "busca-titulo", local.nome));
      if (local.resumo && local.resumo !== local.nome) item.append(criar("span", "busca-endereco", local.resumo));
      // mousedown não pode tirar o foco do campo, senão a lista fecharia antes do clique.
      item.addEventListener("mousedown", (evento) => evento.preventDefault());
      item.addEventListener("click", () => escolher(i));
      item.addEventListener("mousemove", () => { if (ativo !== i) marcarAtivo(i); });
      lista.appendChild(item);
    });
    lista.hidden = false;
    input.setAttribute("aria-expanded", "true");
    mostrarStatus("leitor", locais.length + (locais.length === 1 ? " local encontrado." : " locais encontrados.") + " Use as setas para escolher e Enter para confirmar.");
  }

  function mostrarErro(falha) {
    resultados = [];
    fechar();
    const repetivel = falha instanceof ErroGeocodificacao && ["rede", "tempo", "servidor", "http", "resposta"].includes(falha.codigo);
    if (falha instanceof ErroGeocodificacao && falha.codigo === "sem-chave") semChave = true;   // buscarLocais também confere a chave
    mostrarStatus("erro", falha instanceof ErroGeocodificacao ? falha.message : "Não foi possível pesquisar agora. Marque o ponto no mapa.", repetivel);
  }

  // ---------- Pesquisa ----------

  function cancelarPendencias() {
    clearTimeout(temporizador);
    temporizador = null;
    if (controle) { controle.abort(); controle = null; }
    geracao += 1;
    emAndamento = null;
    mostrarCarregando(false);
  }

  async function executar(texto, forcar) {
    const chave = chaveDaConsulta(texto);
    if (!forcar && cache.has(chave)) { mostrarResultados(cache.get(chave)); return; }
    if (!forcar && emAndamento === chave) return;   // mesma consulta já a caminho: não duplica

    if (controle) controle.abort();
    controle = new AbortController();
    const meu = ++geracao;
    emAndamento = chave;
    fechar();
    mostrarCarregando(true);
    mostrarStatus("carregando", "Pesquisando…");
    try {
      const locais = await buscar(texto, { signal: controle.signal, proximidade: proximidade() });
      if (meu !== geracao) return;   // chegou depois de uma consulta mais nova (ou de uma escolha): descartada
      guardarNoCache(chave, locais);
      mostrarResultados(locais);
    } catch (falha) {
      if (meu !== geracao || (falha && falha.name === "AbortError")) return;
      mostrarErro(falha);
    } finally {
      if (meu === geracao) { emAndamento = null; controle = null; mostrarCarregando(false); }
    }
  }

  /** Pesquisa já, sem esperar o debounce (Enter ou "Tentar novamente"). */
  function pesquisarAgora(forcar) {
    const texto = limparConsulta(input.value);
    if (desabilitado || semChave || texto.length < MINIMO_CARACTERES) return;
    if (!forcar && escolhido !== null && input.value === escolhido) return;   // já escolhido: nada a pesquisar
    clearTimeout(temporizador);
    temporizador = null;
    executar(texto, forcar);
  }

  async function verificarChave() {
    if (chaveVerificada) return;
    chaveVerificada = true;
    if (!(await chaveConfigurada())) {
      semChave = true;
      if (document.activeElement === input) avisarSemChave();
    }
  }

  function avisarSemChave() {
    mostrarStatus("erro", MENSAGEM_SEM_CHAVE);
  }

  // ---------- Escolha ----------

  function escolher(indice) {
    const local = resultados[indice];
    if (!local) return;
    const digitado = input.value;
    cancelarPendencias();            // nenhuma resposta atrasada pode reabrir a lista depois da escolha
    fechar();
    resultados = [];
    const retorno = aoEscolher(local);
    if (retorno === true) {
      input.value = local.nome;
      escolhido = input.value;
      mostrarStatus("ok", "Selecionado: " + local.endereco);
    } else if (typeof retorno === "string") {
      input.value = digitado;
      mostrarStatus("erro", retorno);
    } else {
      input.value = digitado;
      limparStatus();
    }
  }

  // ---------- Eventos ----------

  input.addEventListener("input", () => {
    escolhido = null;
    cancelarPendencias();
    fechar();
    resultados = [];
    if (semChave) return;                       // mantém o aviso de "chave não configurada"
    const texto = limparConsulta(input.value);
    if (texto.length < MINIMO_CARACTERES) {
      mostrarStatus("dica", "Digite pelo menos " + MINIMO_CARACTERES + " caracteres para pesquisar.");
      return;
    }
    limparStatus();
    temporizador = setTimeout(() => { temporizador = null; executar(texto, false); }, atrasoMs);
  });

  input.addEventListener("focus", () => {
    if (desabilitado) return;
    verificarChave();
    if (escolhido !== null && input.value === escolhido) { input.select(); return; }
    const texto = limparConsulta(input.value);
    if (semChave) { avisarSemChave(); return; }
    if (texto.length < MINIMO_CARACTERES) { mostrarStatus("dica", "Digite pelo menos " + MINIMO_CARACTERES + " caracteres para pesquisar."); return; }
    const guardado = cache.get(chaveDaConsulta(texto));
    if (guardado && lista.hidden && !temporizador && !emAndamento) mostrarResultados(guardado);
  });

  input.addEventListener("keydown", (evento) => {
    const aberta = !lista.hidden;
    const n = resultados.length;
    switch (evento.key) {
      case "ArrowDown":
        evento.preventDefault();
        if (!aberta && n > 0) { mostrarResultados(resultados); marcarAtivo(0); }
        else if (aberta) marcarAtivo(ativo + 1 >= n ? 0 : ativo + 1);
        break;
      case "ArrowUp":
        evento.preventDefault();
        if (aberta) marcarAtivo(ativo <= 0 ? n - 1 : ativo - 1);
        break;
      case "Enter":
        evento.preventDefault();      // dentro do formulário de entrega, Enter não deve salvar por acidente
        if (aberta && ativo >= 0) escolher(ativo);
        else pesquisarAgora(false);
        break;
      case "Escape":
        if (aberta) {
          evento.preventDefault();
          evento.stopPropagation();   // fecha só a lista; não cancela a escolha no mapa
          fechar();
          if (status.className.includes("so-leitor")) limparStatus();
        }
        break;
      case "Tab":
        fechar();
        break;
      default:
    }
  });

  envoltorio.addEventListener("focusout", (evento) => {
    if (envoltorio.contains(evento.relatedTarget)) return;
    fechar();
    if (status.className.includes("busca-status-dica") || status.className.includes("so-leitor")) limparStatus();
  });

  return {
    /** Habilita/desabilita o campo (mesmas regras dos botões de marcar no mapa). Não faz nada se o estado não mudou. */
    desabilitar(valor) {
      const novo = Boolean(valor);
      if (novo === desabilitado) return;
      desabilitado = novo;
      input.disabled = novo;
      if (novo) { cancelarPendencias(); fechar(); resultados = []; limparStatus(); }
    },
    /** Esvazia o campo e qualquer estado pendente. */
    limpar() {
      cancelarPendencias();
      fechar();
      resultados = [];
      escolhido = null;
      input.value = "";
      limparStatus();
    }
  };
}

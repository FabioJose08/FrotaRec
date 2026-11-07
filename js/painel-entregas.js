// Lista dinâmica de entregas e formulário de edição.
// Tudo é criado por JavaScript a partir da lista de entregas do veículo: não existe
// nenhum botão ou campo fixo por destino no HTML. Textos digitados pelo usuário
// entram sempre por textContent (nunca como HTML).

const pegar = (id) => document.getElementById(id);

export function criarPainelEntregas(chamadas) {
  const lista = pegar("lista-entregas");
  const vazio = pegar("vazio-entregas");
  const contador = pegar("contador-entregas");
  const formulario = pegar("form-entrega");
  const tituloEditor = pegar("titulo-editor");
  const campoNome = pegar("entrega-nome");
  const campoLat = pegar("entrega-lat");
  const campoLng = pegar("entrega-lng");
  const campoMinutos = pegar("entrega-minutos");
  const erroEditor = pegar("erro-editor");
  const botaoMapa = pegar("btn-editor-mapa");
  const botaoCancelar = pegar("btn-cancelar-entrega");

  let editandoId = null; // null = nova entrega

  function botao(texto, rotuloAcessivel, aoClicar, perigo, desabilitado) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "botao botao-pequeno " + (perigo ? "botao-perigo" : "botao-secundario");
    b.textContent = texto;
    b.setAttribute("aria-label", rotuloAcessivel);
    b.disabled = Boolean(desabilitado);
    b.addEventListener("click", aoClicar);
    return b;
  }

  /**
   * @param {object} dados { entregas, posicoes: {idEntrega: número da visita}|null, bloqueado, visitadas:Set }
   */
  function desenhar(dados) {
    lista.innerHTML = "";
    contador.textContent = String(dados.entregas.length);
    vazio.hidden = dados.entregas.length > 0;

    // Com rota calculada, a lista segue a ordem de visita; sem rota, a ordem em que foram adicionadas.
    const entregas = dados.entregas.slice();
    if (dados.posicoes) entregas.sort((a, b) => dados.posicoes[a.id] - dados.posicoes[b.id]);

    entregas.forEach((entrega, indice) => {
      const item = document.createElement("li");
      item.className = "item-entrega";
      if (entrega.id === editandoId) item.classList.add("em-edicao");

      const numero = document.createElement("span");
      numero.className = "numero-entrega" + (dados.posicoes ? "" : " sem-ordem");
      numero.textContent = String(dados.posicoes ? dados.posicoes[entrega.id] : indice + 1);
      numero.title = dados.posicoes ? "Ordem de visita" : "Ordem em que foi adicionada (ainda não otimizada)";

      const texto = document.createElement("span");
      texto.className = "texto-entrega";
      const nome = document.createElement("strong");
      nome.textContent = entrega.nome;
      const detalhe = document.createElement("small");
      detalhe.textContent = entrega.lat.toFixed(5) + ", " + entrega.lng.toFixed(5) + " · atendimento " + entrega.minutos + " min";
      texto.append(nome, detalhe);

      const acoes = document.createElement("span");
      acoes.className = "acoes-entrega";
      acoes.append(
        botao("Ver", "Ver " + entrega.nome + " no mapa", () => chamadas.aoLocalizar(entrega), false, false),
        botao("Editar", "Editar " + entrega.nome, () => chamadas.aoEditar(entrega), false, dados.bloqueado),
        botao("Remover", "Remover " + entrega.nome, () => chamadas.aoRemover(entrega), true, dados.bloqueado)
      );

      item.append(numero, texto, acoes);
      lista.appendChild(item);
    });
  }

  function limparErro() {
    erroEditor.hidden = true;
    erroEditor.textContent = "";
  }

  function mostrarErro(mensagem) {
    erroEditor.textContent = mensagem;
    erroEditor.hidden = false;
  }

  function abrirEditor(entrega, nomeSugerido) {
    editandoId = entrega ? entrega.id : null;
    tituloEditor.textContent = entrega ? "Editar entrega" : "Nova entrega";
    campoNome.value = entrega ? entrega.nome : (nomeSugerido || "");
    campoLat.value = entrega ? String(entrega.lat) : "";
    campoLng.value = entrega ? String(entrega.lng) : "";
    campoMinutos.value = entrega ? String(entrega.minutos) : "5";
    limparErro();
    formulario.hidden = false;
    campoNome.focus();
  }

  function fecharEditor() {
    editandoId = null;
    formulario.hidden = true;
    limparErro();
  }

  formulario.addEventListener("submit", (evento) => {
    evento.preventDefault();
    chamadas.aoSalvar(editandoId, {
      nome: campoNome.value,
      lat: campoLat.value,
      lng: campoLng.value,
      minutos: campoMinutos.value
    });
  });
  botaoMapa.addEventListener("click", () => chamadas.aoEscolherNoMapa());
  botaoCancelar.addEventListener("click", () => chamadas.aoCancelar());

  return {
    desenhar,
    abrirEditor,
    fecharEditor,
    mostrarErro,
    editorAberto: () => !formulario.hidden,
    idEmEdicao: () => editandoId,
    preencherCoordenadas(lat, lng) {
      campoLat.value = lat.toFixed(6);
      campoLng.value = lng.toFixed(6);
      limparErro();
      campoNome.focus();
    },
    // Local escolhido na pesquisa: preenche nome e coordenadas; o salvamento segue o fluxo normal do formulário.
    preencherLocal(local) {
      campoNome.value = local.nome;
      campoLat.value = local.lat.toFixed(6);
      campoLng.value = local.lng.toFixed(6);
      limparErro();
    }
  };
}

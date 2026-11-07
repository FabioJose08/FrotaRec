// Funções que mexem no mapa. O Leaflet é carregado pelo index.html e fica
// disponível como a variável global "L".
//
// Segurança: nomes digitados pelo usuário (galpão, coleta, entregas, código do veículo)
// são sempre inseridos como TEXTO (textContent), nunca como HTML.

import { CENTRO_RECIFE, ZOOM_INICIAL } from "./dados-demo.js";

function elementoComTexto(tag, texto, classe) {
  const el = document.createElement(tag);
  el.textContent = texto;
  if (classe) el.className = classe;
  return el;
}

export function iniciarMapa(idElemento) {
  const mapa = L.map(idElemento, {
    center: CENTRO_RECIFE,
    zoom: ZOOM_INICIAL,
    minZoom: 2,
    maxZoom: 18
  });

  // Atribuição obrigatória do OpenStreetMap.
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(mapa);

  return mapa;
}

export function criarMarcadorVeiculo(posicao, codigo) {
  const icone = L.divIcon({
    className: "marcador-veiculo",
    html: elementoComTexto("span", codigo),
    iconSize: [72, 24],
    iconAnchor: [36, 12]
  });
  return L.marker(posicao, { icon: icone, title: "Veículo " + codigo, keyboard: true });
}

// Atualiza o texto do marcador quando o código do veículo é editado no cadastro.
export function atualizarMarcadorVeiculo(marcador, codigo) {
  const icone = L.divIcon({
    className: "marcador-veiculo",
    html: elementoComTexto("span", codigo),
    iconSize: [72, 24],
    iconAnchor: [36, 12]
  });
  marcador.setIcon(icone);
  if (marcador.getElement()) marcador.getElement().title = "Veículo " + codigo;
}

export function criarLinha(coordenadas, estilo) {
  return L.polyline(coordenadas, estilo);
}

export function criarGrupo() {
  return L.layerGroup();
}

// Ponto de origem, destino ou parada. Origem e destino mostram o rótulo sempre.
export function criarPontoRota(local, rotulo, cor, rotuloFixo) {
  const ponto = L.circleMarker([local.lat, local.lng], {
    radius: 8,
    color: "#1B2A33",
    weight: 2,
    fillColor: cor,
    fillOpacity: 1
  });
  ponto.bindTooltip(elementoComTexto("span", rotulo), { permanent: rotuloFixo, direction: "top", offset: [0, -6] });
  return ponto;
}

// Parada numerada (1, 2, 3...) para mostrar a ordem das entregas no mapa.
export function criarPontoNumerado(local, numero, rotulo, cor, rotuloFixo) {
  const icone = L.divIcon({
    className: "ponto-numerado",
    html: elementoComTexto("span", String(numero)),
    iconSize: [26, 26],
    iconAnchor: [13, 13]
  });
  const marcador = L.marker([local.lat, local.lng], { icon: icone, title: rotulo, keyboard: false });
  marcador.bindTooltip(elementoComTexto("span", rotulo), { permanent: rotuloFixo, direction: "top", offset: [0, -14] });
  marcador.on("add", () => {
    const el = marcador.getElement();
    if (el) el.style.setProperty("--cor-ponto", cor);
  });
  return marcador;
}

// Ajusta o zoom para mostrar o percurso selecionado.
export function ajustarVisao(mapa, limites) {
  mapa.fitBounds(limites, { padding: [40, 40], maxZoom: 15 });
}

export function centralizarEm(mapa, posicao) {
  mapa.setView(posicao, 14);
}

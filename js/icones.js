// Ícones SVG de traço (24×24), criados por JavaScript. Substituem emojis e são herdados da cor do texto.
const NS = "http://www.w3.org/2000/svg";

const CAMINHOS = {
  painel: ["M3 3h7v9H3z", "M14 3h7v5h-7z", "M14 12h7v9h-7z", "M3 16h7v5H3z"],
  rota: ["M6 16a3 3 0 1 0 0 6 3 3 0 0 0 0-6z", "M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15", "M18 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"],
  caminhao: ["M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2", "M15 18H9", "M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14", "M17 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4z", "M7 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"],
  alerta: ["M21.73 18l-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z", "M12 9v4", "M12 17h.01"],
  relogio: ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z", "M12 6v6l4 2"],
  ajustes: ["M4 21v-7", "M4 10V3", "M12 21v-9", "M12 8V3", "M20 21v-5", "M20 12V3", "M1 14h6", "M9 8h6", "M17 16h6"],
  menu: ["M4 6h16", "M4 12h16", "M4 18h16"],
  combustivel: ["M3 22h12", "M4 9h10", "M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18", "M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0V9.83a2 2 0 0 0-.59-1.42L18 5"],
  raio: ["M13 2L3 14h9l-1 8 10-12h-9l1-8z"],
  baixar: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M7 10l5 5 5-5", "M12 15V3"],
  enviar: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M17 8l-5-5-5 5", "M12 3v12"],
  imprimir: ["M6 9V2h12v7", "M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2", "M6 14h12v8H6z"],
  fechar: ["M18 6L6 18", "M6 6l12 12"]
};

export function icone(nome) {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  (CAMINHOS[nome] || []).forEach((d) => {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    svg.appendChild(p);
  });
  return svg;
}

// Símbolo da marca: dois pontos ligados por um percurso.
export function simboloMarca() {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 32 32");
  svg.setAttribute("class", "marca-simbolo");
  svg.setAttribute("aria-hidden", "true");
  const parte = (tag, attrs) => { const e = document.createElementNS(NS, tag); Object.keys(attrs).forEach((k) => e.setAttribute(k, attrs[k])); svg.appendChild(e); };
  parte("rect", { width: "32", height: "32", rx: "8", fill: "#2563EB" });
  parte("path", { d: "M9 23h8a4 4 0 0 0 0-8h-3a4 4 0 0 1 0-8h9", fill: "none", stroke: "#fff", "stroke-width": "2.4", "stroke-linecap": "round", "stroke-linejoin": "round" });
  parte("circle", { cx: "9", cy: "23", r: "2.6", fill: "#fff" });
  parte("circle", { cx: "23", cy: "7", r: "2.6", fill: "#6EE7B7" });
  return svg;
}

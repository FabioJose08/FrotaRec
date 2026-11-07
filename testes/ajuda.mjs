// Utilidades dos testes de navegador (Playwright + Chromium local).
import { createRequire } from "node:module";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { criarOsrmFalso } from "./osrm-falso.mjs";
// Procura o Playwright em locais comuns (instalação global, /opt ou node_modules local).
function carregarPlaywright() {
  const bases = [process.env.PLAYWRIGHT_MODULE_DIR, "/usr/local/lib/node_modules_global/", "/opt/npm-tools/node_modules/", import.meta.url.replace("file://", "")].filter(Boolean);
  for (const base of bases) {
    try { return createRequire(base.endsWith("/") ? base : base)("playwright"); } catch (erro) { /* tenta o próximo */ }
  }
  throw new Error("Playwright não encontrado. Instale com: npm install playwright && npx playwright install chromium");
}
const { chromium } = carregarPlaywright();
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css" };

export function servir() {
  const servidor = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split("?")[0]);
    const arquivo = path.join(RAIZ, url === "/" ? "index.html" : url);
    if (!arquivo.startsWith(RAIZ) || !fs.existsSync(arquivo) || fs.statSync(arquivo).isDirectory()) { res.writeHead(404); res.end("não encontrado"); return; }
    res.writeHead(200, { "Content-Type": TIPOS[path.extname(arquivo)] || "application/octet-stream" });
    fs.createReadStream(arquivo).pipe(res);
  });
  return new Promise((ok) => servidor.listen(0, "127.0.0.1", () => ok({ servidor, url: "http://127.0.0.1:" + servidor.address().port })));
}

export async function abrir(opcoes = {}) {
  const { servidor, url } = await servir();
  const navegador = await chromium.launch({ args: ["--no-sandbox"] });
  const contexto = await navegador.newContext({ viewport: opcoes.viewport || { width: 1280, height: 900 } });
  const osrm = criarOsrmFalso(opcoes.osrm);
  await contexto.route("**/router.project-osrm.org/**", osrm.tratar);
  await contexto.route("**/leaflet@1.9.4/dist/leaflet.js", (r) => r.fulfill({ contentType: "text/javascript", body: fs.readFileSync(path.join(RAIZ, "testes/leaflet-falso.js"), "utf8") }));
  await contexto.route("**/leaflet@1.9.4/dist/leaflet.css", (r) => r.fulfill({ contentType: "text/css", body: "" }));
  // Fontes (Google Fonts) são só estilo: respondidas vazias para o teste não depender da internet.
  await contexto.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ contentType: "text/css", body: "" }));
  await contexto.route("**/fonts.gstatic.com/**", (r) => r.fulfill({ contentType: "font/woff2", body: "" }));
  const pagina = await contexto.newPage();
  const erros = [];
  pagina.on("pageerror", (e) => erros.push("pageerror: " + e.message));
  pagina.on("console", (m) => { if (m.type() === "error") erros.push("console.error: " + m.text()); });
  const dialogos = [];
  pagina.on("dialog", async (d) => {
    const resposta = dialogos.fila && dialogos.fila.length ? dialogos.fila.shift() : undefined;
    dialogos.push({ tipo: d.type(), texto: d.message() });
    if (d.type() === "prompt") await d.accept(resposta !== undefined && resposta !== null ? resposta : d.defaultValue());
    else if (resposta === false) await d.dismiss(); else await d.accept();
  });
  dialogos.fila = [];
  return { url, pagina, contexto, navegador, servidor, osrm, erros, dialogos, fechar: async () => { await navegador.close(); servidor.close(); } };
}

export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

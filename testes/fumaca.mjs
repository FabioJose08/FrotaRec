import { abrir } from "./ajuda.mjs";
const t = await abrir();
await t.pagina.goto(t.url + "/planejamento.html");
await t.pagina.waitForSelector(".item-veiculo");
console.log("veículos na lista:", await t.pagina.$$eval(".item-veiculo", (b) => b.map((x) => x.innerText.replace(/\n/g, " | "))));
console.log("marcadores no mapa:", await t.pagina.$$eval(".marcador-veiculo", (m) => m.length));
console.log("mensagem:", await t.pagina.textContent("#mensagem-rota"));
console.log("erros:", t.erros);
await t.fechar();

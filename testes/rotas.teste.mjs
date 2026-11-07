import assert from "node:assert/strict";
import { indicesDosPontos, lerMatriz, lerRota, ErroRoteamento, matrizAproximada } from "../js/rotas.js";
// Rota que vai e volta pela MESMA rua: A(0) → B(1 km) → A de novo → C
const lat = (m) => -8 + m / 111320;
const rua = []; for (let m = 0; m <= 1000; m += 100) rua.push([lat(m), -34.9]);
const volta = rua.slice(0, -1).reverse();
const coords = [...rua, ...volta, [lat(-300), -34.9]];
const idx = indicesDosPontos(coords, [1000, 1000, 300]);
assert.deepEqual(idx, [0, 10, 20, coords.length - 1]);
console.log("OK índices corretos mesmo passando duas vezes pela mesma rua:", idx.join(","));
assert.throws(() => lerMatriz({ durations: [[0, null], [5, 0]] }, [{ nome: "a" }, { nome: "b" }]), (e) => e instanceof ErroRoteamento && e.codigo === "sem-rota");
assert.throws(() => lerMatriz({ durations: [[0, 1]] }, [{}, {}]), (e) => e.codigo === "invalida");
assert.throws(() => lerMatriz({ durations: [[0, -1], [1, 0]] }, [{}, {}]), (e) => e.codigo === "invalida");
assert.throws(() => lerRota({ routes: [] }, [{}, {}]), (e) => e.codigo === "invalida");
const m = lerMatriz({ durations: [[0, 5], [6, 0]] }, [{}, {}]); assert.equal(m.modo, "ruas");
assert.equal(matrizAproximada([{ lat: 0, lng: 0 }, { lat: 0, lng: 0.1 }]).modo, "aproximada");
console.log("OK validação das respostas do OSRM");

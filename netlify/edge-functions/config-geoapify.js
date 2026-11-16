// Serve js/config.local.js no site publicado, com a chave da Geoapify vinda da variável de
// ambiente GEOAPIFY_API_KEY (configurada no painel da Netlify). Assim a chave não fica no Git.
// Localmente, continue usando o arquivo js/config.local.js (ignorado pelo Git).
// Aceita só a chave ou uma URL completa da Geoapify (ex.: ...&apiKey=XXXX): nesse caso extrai a chave.
function extrairChave(valor) {
  const texto = (valor || "").trim();
  const naUrl = texto.match(/[?&]apiKey=([^&#\s]+)/i);
  return naUrl ? decodeURIComponent(naUrl[1]) : texto;
}

export default async () => {
  const chave = extrairChave(Netlify.env.get("GEOAPIFY_API_KEY"));
  return new Response(`export const GEOAPIFY_API_KEY = ${JSON.stringify(chave)};\n`, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-store"
    }
  });
};

export const config = {
  path: "/js/config.local.js"
};

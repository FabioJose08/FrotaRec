// MODELO de configuração da pesquisa de locais (Geoapify). Este arquivo é versionado e NÃO contém chave.
//
// Como usar:
//   1. Copie este arquivo para  js/config.local.js  (esse nome é ignorado pelo Git).
//   2. Troque o texto abaixo pela sua chave (https://myprojects.geoapify.com/ → seu projeto → API Keys).
//   3. Recarregue a página de planejamento.
//
// Sem o arquivo (ou com a chave vazia), a pesquisa fica desativada e o resto do sistema funciona
// normalmente, inclusive marcar galpão, coleta e entregas direto no mapa.
//
// ATENÇÃO: o Frota Recife não tem backend, então a chave é enviada pelo navegador e qualquer pessoa
// que abra o sistema consegue vê-la. Ela NÃO é secreta. Por isso, no painel da Geoapify:
//   - restrinja as origens/domínios autorizados (ex.: http://127.0.0.1:5500 e o endereço publicado);
//   - habilite apenas as APIs necessárias (aqui: Geocoding / Address Autocomplete);
//   - acompanhe o consumo e mantenha-se dentro da cota do plano gratuito;
//   - se a chave vazar ou for abusada, gere outra e apague a antiga.
export const GEOAPIFY_API_KEY = "COLE_SUA_CHAVE_AQUI";

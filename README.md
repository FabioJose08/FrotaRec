# FrotaRec

Sistema web de **gestão de frota e planejamento logístico**, desenvolvido para organizar veículos, planejar entregas e comparar rotas com foco em tempo, distância e custo estimado de combustível.

## Funcionalidades

- **Visão geral:** indicadores da frota, desempenho e últimas viagens.
- **Gestão da frota:** cadastro de veículos, situação operacional e consumo médio (km/L).
- **Planejamento de rotas:** definição de galpão, ponto de coleta e entregas pelo mapa, coordenadas ou pesquisa de endereço.
- **Rotas Normal e Turbo:** comparação entre a ordem cadastrada e uma sequência otimizada pelo Problema do Caixeiro Viajante.
- **Combustível:** estimativa de litros, custo e possível economia com base no consumo do veículo e no preço configurado.
- **Simulação e histórico:** acompanhamento do percurso, registro de viagens, relatórios e exportação CSV.
- **Ocorrências e configurações:** controle de ocorrências, preço do combustível e backup/restauração dos dados.

## Como funciona a otimização?

A rota **Normal** segue a ordem em que as entregas foram cadastradas. A rota **Turbo** reorganiza somente as entregas: o galpão é a origem, a coleta permanece como primeira parada e o retorno ao galpão é opcional.

O otimizador utiliza uma estratégia híbrida:

- **Até 15 entregas:** algoritmo Held-Karp, com programação dinâmica e garantia de solução ótima para a matriz de custos recebida.
- **A partir de 16 entregas:** heurísticas de vizinho mais próximo, 2-opt, Or-opt e busca local iterada. O método procura uma boa rota, mas não garante o ótimo global.

Os tempos e as distâncias pelas ruas são obtidos pelo OSRM. O sistema também pode usar uma aproximação em linha reta quando o serviço de rotas estiver indisponível, identificando o resultado como estimativa.

## Tecnologias

- HTML, CSS e JavaScript (módulos ES)
- Leaflet e OpenStreetMap para o mapa
- OSRM para matrizes de tempo/distância e trajetos
- Geoapify para pesquisa de locais e endereços (opcional)
- localStorage para persistência dos dados no navegador

## Como executar

1. Clone ou baixe este repositório.
2. Abra a pasta no VS Code e inicie o **Live Server**.
3. Acesse `index.html` pelo endereço HTTP fornecido pelo Live Server.

É necessário acesso à internet para carregar o mapa e consultar os serviços externos. **Não é necessário instalar Node.js para utilizar a aplicação.**

### Pesquisa de endereços (opcional)

Para habilitar a pesquisa por nome ou endereço, configure uma chave da Geoapify: copie `js/config.local.example.js` para `js/config.local.js` e informe sua chave. O arquivo local não deve ser enviado ao Git. Como a aplicação não possui backend, restrinja as origens autorizadas da chave no painel da Geoapify.

No site publicado na Netlify, a chave vem da variável de ambiente `GEOAPIFY_API_KEY`: a edge function `netlify/edge-functions/config-geoapify.js` gera `js/config.local.js` com ela.

## Armazenamento

O FrotaRec não possui backend: os dados ficam no `localStorage` do navegador e não são sincronizados automaticamente entre dispositivos ou navegadores. Utilize a opção de backup nas configurações para exportar e restaurar os dados.

Para instruções detalhadas, limitações e comandos de teste, consulte o [LEIAME.md](LEIAME.md).

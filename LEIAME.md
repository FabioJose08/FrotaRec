# Frota Recife

Sistema web de **gestão logística e planejamento inteligente de rotas**: cadastro de frota, ocorrências, planejamento com mapa, comparação entre rota **Normal** e rota **Turbo** (Problema do Caixeiro Viajante), estimativa de combustível, simulação da viagem, histórico, relatórios e backup.

HTML, CSS e JavaScript puro (módulos ES). Mapa com Leaflet/OpenStreetMap; tempos, distâncias e rotas pelas ruas via OSRM. **Sem backend**: tudo fica no `localStorage` do navegador usado (não é sincronizado entre computadores ou navegadores).

## Como executar

1. Abra a pasta no VS Code e inicie o **Live Server** (ou publique em qualquer hospedagem estática).
2. Acesse o endereço HTTP (ex.: `http://127.0.0.1:5500/index.html`). Não abra o HTML com duplo clique: os módulos exigem um servidor de arquivos.
3. É preciso internet (mapa, Leaflet via CDN, fonte Inter e OSRM). Não é necessário Node.js nem instalar nada para usar.

## Navegação

| Seção | Página | O que faz |
|---|---|---|
| Visão geral | `index.html` | Indicadores da frota e do desempenho, alertas, últimas viagens |
| Planejamento de rotas | `planejamento.html` | Mapa, entregas, modos Normal/Turbo, comparação e simulação |
| Frota | `veiculos.html` | Cadastro (inclui consumo km/L), situação operacional, exportação CSV |
| Ocorrências | `quebras.html` | Registro, edição, exclusão, filtro, indicadores, exportação CSV |
| Histórico de viagens | `historico.html` | Viagens concluídas, detalhes, filtros, CSV e relatório para impressão |
| Configurações | `configuracoes.html` | Preço do combustível e backup/restauração em JSON |

> Mudança em relação à versão anterior: o mapa agora está em `planejamento.html`; `index.html` é a Visão geral.

## Planejamento em 4 etapas

1. **Veículo** — escolha um veículo *Ativo* (em manutenção/inativos ficam bloqueados).
2. **Pontos** — defina o galpão, marque a coleta e adicione entregas (clique no mapa ou coordenadas; tempo de atendimento por parada; editar/remover/ver). Cada local pode ser definido **pesquisando pelo nome ou endereço** (ver abaixo), clicando no mapa ou por coordenadas. Limite: **97 entregas** (restrição de 100 coordenadas do OSRM público).
3. **Modo** — interruptor *Turbo* (ligado = Turbo; desligado = Normal), prioridade do Turbo e *Retornar ao galpão*.
4. **Resultado e simulação** — resumo, comparação, combustível, simulação e percurso.

### Pesquisa de locais e endereços (Geoapify)

Em **Galpão**, **Coleta** e **Entregas** há um campo *Pesquisar … por nome ou endereço* (o formulário “Adicionar por coordenadas” também tem um). Digite, por exemplo, “Shopping Recife”, “Marco Zero” ou “Avenida Boa Viagem”, escolha a sugestão (mouse, ou setas + Enter; Esc fecha a lista) e o local entra **pelo mesmo caminho do clique no mapa**: mesmas validações, mesmo marcador, mesma gravação, e a rota calculada é descartada como em qualquer alteração. Nomes acima de 60 caracteres são abreviados; coordenadas e endereço vêm da API (nada é fixo no código).

Detalhes: consulta a partir de 3 caracteres, espera de 400 ms após a última tecla, até 5 sugestões, consulta anterior cancelada, respostas antigas descartadas, pausa automática após HTTP 429. A busca prioriza a região do galpão (ou o centro de Recife se ele ainda não existe) e é limitada ao Brasil. O endereço completo aparece só como confirmação na tela: o formato salvo no `localStorage` **não mudou**.

**Configurar a chave (opcional — sem ela só a pesquisa fica desativada):**

1. Crie uma chave gratuita em <https://myprojects.geoapify.com/>.
2. Copie `js/config.local.example.js` para `js/config.local.js` e cole a chave no lugar do texto de exemplo. Esse arquivo está no `.gitignore` e não deve ser publicado.
3. Recarregue `planejamento.html`. Se o arquivo não existir, o campo avisa “pesquisa não configurada” (e o navegador pode registrar um 404 desse arquivo no console, o que é esperado).

> **A chave não é secreta.** Como não há backend, ela trafega pelo navegador e qualquer visitante a vê. No painel da Geoapify: restrinja as **origens autorizadas** (ex.: `http://127.0.0.1:5500` e o endereço publicado), habilite só as APIs necessárias (Geocoding/Autocomplete), acompanhe o consumo e respeite a cota gratuita. Se vazar, gere outra e apague a antiga. Confira também nos termos da Geoapify as regras de atribuição e de armazenamento de resultados do seu plano (os pontos escolhidos ficam salvos no `localStorage`).

### Rota Normal × rota Turbo

- **Normal:** respeita exatamente a ordem cadastrada (Galpão → Coleta → Entrega 1 → 2 → …). Não reordena nada.
- **Turbo:** usa o Problema do Caixeiro Viajante para reordenar as entregas. Prioridade escolhível: **menor tempo de deslocamento (padrão)** ou **menor distância e consumo estimado**.
- Os dois cenários saem de **uma única consulta de matriz** ao OSRM. A geometria pelas ruas só é pedida para a rota exibida; alternar entre Normal e Turbo (botões sobre o mapa ou interruptor) **não recalcula a ordem** e reaproveita geometrias já obtidas. A rota alternativa aparece discreta (tracejada) depois de consultada, com legenda no mapa.
- Mesmo no modo Normal, o sistema mostra quanto o Turbo reduziria.

### Restrições do problema (inalteradas)

Galpão = origem; coleta = primeira parada e nunca reordenada; só as entregas mudam de posição; cada entrega visitada exatamente uma vez; retorno ao galpão opcional (então é o destino final); a matriz é **direcional** (A→B ≠ B→A). O tempo de atendimento compõe o total da viagem, mas não interfere na otimização (é independente da ordem).

### Quando a solução é exata e quando é heurística (`js/otimizador.js`, preservado)

| Entregas | Método | Garantia |
|---|---|---|
| até 15 | Programação dinâmica sobre subconjuntos (Held-Karp) | **Ótima** para a matriz de custos recebida |
| 16 ou mais | Vizinho mais próximo (várias partidas) + 2-opt + Or-opt + busca local iterada (semente fixa, orçamento de 0,4 s) | Boa solução, **sem garantia de ótimo global** |

Os limites (15 entregas e 0,4 s) foram mantidos; só devem mudar com testes que comprovem melhoria. A interface nunca apresenta heurística como ótima. Salvaguarda adicional (`js/cenarios.js`): se a heurística não superar a ordem cadastrada no critério escolhido, o Turbo mantém a ordem cadastrada e informa isso.

## Combustível e economia

Cadastre o **consumo médio (km/L)** por veículo (Frota) e o **preço do litro (R$/L)** em Configurações. Fórmulas (sem arredondar nos cálculos; só na exibição):

```
Litros            = distância (km) / consumo médio (km/L)
Custo             = litros × preço do litro
Economia (litros) = litros da rota Normal − litros da rota Turbo
Economia (R$)     = custo Normal − custo Turbo
Percentual        = economia / valor da rota Normal × 100
```

Exemplo (8 km/L, R$ 6,00/L): Normal 80 km → 10 L → R$ 60,00; Turbo 60 km → 7,5 L → R$ 45,00; economia 2,5 L, R$ 15,00 e 25%.

Regras de honestidade:
- Sem consumo cadastrado: pede o cadastro e **não** calcula combustível nem economia (nada é inventado; veículos antigos ficam como “Não informado”).
- Sem preço: mostra litros, **não** mostra custo em reais.
- Se o Turbo não reduzir, mostra “Sem redução”, nunca uma economia falsa.
- É uma **estimativa** pelo consumo médio informado: não considera trânsito em tempo real, relevo, carga, condições do motor ou estilo de condução.
- Distâncias e tempos vêm da matriz de percursos do OSRM. Se o OSRM falhar e for usada a linha reta, tudo é rotulado como **aproximação** (comparação, resumo e histórico).

## Simulação

Iniciar, pausar, continuar, reiniciar; barra de progresso, parada atual, horários simulados e lista de percurso com o que já foi feito. A simulação segue exatamente a geometria calculada; cada veículo tem temporizadores próprios e qualquer mudança de planejamento invalida requisições e temporizadores antigos. A animação é acelerada (≈ 1 s na tela = 1 min; paradas de 4 s); o relógio simulado parte de 08:00 e soma deslocamento + atendimento.

## Histórico, relatórios e backup

- Ao concluir uma simulação grava-se **um único registro** (`id` da rota calculada; repetir/reiniciar a mesma rota não duplica). Guarda: veículo, data/hora, modo, critério, entregas, retorno, distância, deslocamento, atendimento, consumo, litros, preço, custo, economia vs Normal, método do algoritmo, origem dos dados (OSRM ou aproximação) e paradas com horários.
- **CSV** (UTF-8 com BOM, separador `;`, vírgula decimal — abre direto no Excel pt-BR; textos que parecem fórmula são neutralizados): histórico (respeita filtros), frota, ocorrências.
- **Relatório operacional**: botão *Imprimir relatório* (layout próprio para impressão).
- **Backup completo em JSON** (Configurações): exportar; importar valida o arquivo, mostra o resumo e **pede confirmação** antes de substituir; guarda uma cópia do estado anterior (`frota-recife-backup-anterior`) e desfaz se a gravação falhar.

## Persistência e compatibilidade

| Chave | Conteúdo |
|---|---|
| `frota-recife-veiculos` | Lista de veículos (campo novo opcional `consumoKmL`; registros antigos continuam válidos) |
| `frota-recife-quebras` | Ocorrências (inalterada) |
| `frota-recife-galpao` | Galpão (inalterada) |
| `frota-recife-viagens` | Planejamentos por veículo, `versao: 1` (campo novo opcional `criterio`; `otimizar: true` = Turbo, `false` = Normal) |
| `frota-recife-viagens-backup` | Cópia de segurança de planejamento ilegível (inalterada) |
| `frota-recife-historico` | **Nova.** `{ versao: 1, viagens: [...] }` |
| `frota-recife-historico-backup` | **Nova.** Cópia de histórico ilegível |
| `frota-recife-config` | **Nova.** `{ versao: 1, precoCombustivel }` |
| `frota-recife-backup-anterior` | **Nova.** Estado anterior à última importação |

Nenhum dado existente é apagado ou sobrescrito na atualização. Dados corrompidos geram mensagem clara e uma cópia, sem travar o sistema.

## Falhas e limitações

Erros de rede, tempo esgotado (20 s), HTTP 429, respostas inválidas, `TooBig` e pontos sem ligação por estrada mostram mensagens em português e *Tentar novamente*; falhas não ficam em cache. Quando os tempos pelas ruas não puderem ser obtidos, a ordem usa distância em linha reta e a rota é desenhada tracejada, **sempre com aviso** de que é aproximação.

- Sem trânsito em tempo real e sem GPS (posições simuladas).
- OSRM público: sujeito a indisponibilidade e limites; para uso intenso use servidor próprio (`URL_BASE` em `js/rotas.js`).
- `localStorage`: ~5 MB, preso ao navegador/endereço; modo privado pode impedir gravação (o sistema avisa). O histórico guarda no máximo 2000 registros.
- A rota calculada não é restaurada ao recarregar (só o planejamento); basta recalcular.
- Cada rota calculada vale um registro no histórico; para registrar de novo, recalcule ou alterne a rota.

## Organização do código

| Arquivo | Responsabilidade |
|---|---|
| `js/otimizador.js` | PCV: Held-Karp + heurística (independente do navegador) — **preservado** |
| `js/cenarios.js` | Cenários Normal × Turbo a partir da matriz (puro) |
| `js/combustivel.js` | Litros, custo, economia, formatação (puro) |
| `js/rotas.js` | OSRM: matriz, rota, cache, erros, aproximação |
| `js/geocodificacao.js` | Geoapify: consulta, erros, pausa em 429, conversão (sem DOM) |
| `js/busca-local.js` | Campo de pesquisa com sugestões (acessível, debounce, cancelamento) |
| `js/config.local.example.js` | Modelo da chave (versionado); a chave real fica em `js/config.local.js` (ignorado pelo Git) |
| `js/viagem.js` | Plano da viagem, validações e persistência |
| `js/principal.js` | Tela de planejamento: estado por veículo, mapa, cálculo e simulação |
| `js/painel-resultado.js` | Comparação e combustível no painel |
| `js/simulacao.js`, `js/mapa.js`, `js/geo.js`, `js/painel-entregas.js` | Simulação, Leaflet, geografia, lista de entregas |
| `js/historico.js`, `js/historico-pagina.js` | Persistência (idempotente) e tela do histórico |
| `js/dashboard.js`, `js/visao-geral.js` | Indicadores (puro) e tela inicial |
| `js/configuracoes.js`, `js/configuracoes-pagina.js` | Preço do combustível; backup |
| `js/relatorios.js` | CSV, backup/validação, relatório de impressão |
| `js/dados.js`, `js/veiculos.js`, `js/quebras.js`, `js/ui.js` | Cadastros e componentes comuns |
| `js/shell.js`, `js/icones.js` | Navegação lateral/topo e ícones SVG |
| `css/estilo.css` | Identidade visual (variáveis CSS), responsivo, impressão, movimento reduzido |

Acessibilidade: foco visível, navegação por teclado, rótulos e `aria-*`, estados com texto (não só cor), `prefers-reduced-motion`.

## Testes (opcionais; não são necessários para usar)

Exigem Node 18+ e, para os de navegador, `playwright` com Chromium (`PLAYWRIGHT_MODULE_DIR` pode apontar onde ele está instalado).

```
node testes/otimizador.teste.mjs    # algoritmo: força bruta, heurística, tempos
node testes/rotas.teste.mjs         # leitura/validação das respostas do OSRM
node testes/combustivel.teste.mjs   # fórmulas, cenários, histórico, compatibilidade, backup
node testes/e2e.mjs                 # regressão da interface (Leaflet e OSRM simulados)
node testes/e2e-novo.mjs            # Normal/Turbo, combustível, histórico, dashboard, backup, celular
node testes/geocodificacao.teste.mjs # pesquisa: URL, conversão, erros HTTP, 429, cancelamento (sem rede)
node testes/pesquisa.mjs            # pesquisa na interface: galpão/coleta/entrega, teclado, falhas, otimização, simulação
```

Os testes de navegador usam Leaflet, OSRM e Geoapify **simulados**; não substituem um teste manual com os serviços reais.

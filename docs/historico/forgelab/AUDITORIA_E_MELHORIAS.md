# Auditoria e melhorias — Livro Didático Digital de Ferramentaria

## Resumo executivo

A auditoria foi feita a partir do ZIP recebido, sem reescrever a estrutura do produto. Foram corrigidos riscos no backend e no progresso, pontos de acessibilidade e robustez do tema, e configurações do pnpm. Nesta etapa também foi consolidada a linguagem editorial ForgeLab, ajustadas as proporções desktop/mobile e refinada a hierarquia do leitor e do timer. Nesta continuidade, as sessões de estudo passaram a validar publicação/etapa, expirar sessões abertas antigas e evitar dupla contagem de retries; a supervisão docente passou a exibir segundos reais por etapa e módulo. A revisão final alinhou totais de aluno/docente e retomada após recarga, filtrou sessões/progresso órfãos ou inconsistentes, deduplicou progresso de forma determinística e adicionou confirmação docente antes de redefinir timers/progresso quando a identidade, ordem ou quantidade das etapas muda. Essa funcionalidade usa a migration `drizzle/0005_shiny_manta.sql`, que cria `student_step_sessions`. A continuação visual Magic UI de 21/10 não criou outra tabela nem migration.

**Validação atualizada:** 55 testes passaram em 11 arquivos; TypeScript e build passaram. O bundle JavaScript principal permanece acima do limite de 500 KB (547,00 kB, 157,51 kB gzip).

## Achados priorizados e estado

| Prioridade | Achado | Estado | Observação |
|---|---|---|---|
| Alta | Imagens de capa/etapa chegavam como data URL e eram persistidas nas colunas `TEXT`. | Corrigido | O backend valida os dados inline, limita a 5 MB, verifica assinatura do formato, envia ao storage e grava somente a URL retornada. URLs HTTPS e caminhos internos de storage já existentes continuam editáveis. |
| Alta | A validação anterior aceitava qualquer URL válida como modelo 3D. | Corrigido | A API agora aceita somente HTTPS, sem credenciais embutidas, e caminho terminado em `.glb` ou `.gltf`. Há teste da validação na fronteira tRPC. |
| Alta | O catálogo público retornava conteúdo não publicado. | Corrigido | Alunos e visitantes recebem apenas módulos publicados; admins continuam podendo consultar rascunhos. |
| Alta | O cliente podia fornecer um percentual de progresso arbitrário, tentar saltar etapas ou regredir o índice salvo. | Corrigido | O backend calcula o percentual pelo total real de etapas, impede saltos e mantém o progresso monotônico. O leitor também bloqueia a abertura antecipada das próximas etapas. |
| Média | Preferência de tema podia lançar exceção se `localStorage` estivesse bloqueado; a classe era aplicada em efeito pós-montagem. | Corrigido | Leitura/gravação agora são resilientes e a classe do tema é aplicada em `useLayoutEffect`. |
| Média | A central de notificações não fechava ao pressionar Escape ou clicar fora. | Parcialmente corrigido | Agora fecha por Escape/clique externo e devolve o foco ao acionador. Os registros ainda são demonstrativos. |
| Média | Configuração `pnpm` no `package.json` era ignorada pela versão usada, gerando warning. | Corrigido | Configurações foram migradas para `pnpm-workspace.yaml`; `pnpm install --frozen-lockfile` passa sem o warning. |
| Média | Anotações ainda ficam em `localStorage` e não são isoladas por identidade no servidor. | Pendente | O cronograma foi movido para o MariaDB e agora tem mutation docente protegida; as anotações ainda precisam de API, persistência e regras por aluno. |
| Média | Notificações são hardcoded e seu estado de leitura existe apenas na memória da página. | Pendente | Não há estados persistentes de lida/arquivada nem geração real por publicação, cronograma, feedback ou conclusão. |
| Média | O papel docente é uma alternância local de demonstração; no backend, os papéis são `user` e `admin`, e escrita exige `admin`. | Pendente para login real | O backend bloqueia `user`; manter o alternador está de acordo com o protótipo. Não há papel docente configurável no provedor de login atual. |
| Baixa | Bundle principal acima do limite de 500 KB do Vite. | Pendente | A integração Three.js/React Three Fiber carrega no bundle principal. Próxima otimização: lazy loading do viewer e compartilhamento/cache dos modelos. |

## Mudanças implementadas

- `server/routers.ts`: validação estrita de referências de imagem e URLs 3D; upload de imagens inline ao storage antes da persistência; catálogo chama o filtro de publicação conforme papel; mutation de progresso deixou de aceitar percentual do cliente.
- `server/content-assets.ts`: validação e upload de imagens com limite de tamanho e conferência de assinatura JPEG/PNG/WebP.
- `server/db.ts`: filtro server-side para rascunhos e cálculo de progresso a partir das etapas e do estado salvo.
- `shared/model-url.ts` e `shared/progress.ts`: regras de domínio reutilizáveis para modelos 3D e progressão sequencial.
- `client/src/pages/Home.tsx`: bloqueio visual para evitar pular etapas; central de notificações fecha por Escape/clique externo e retorna o foco; marca duplicada removida da sidebar; a troca de foto atualiza imediatamente a prévia local e valida formato e limite de 5 MB; ícones dos módulos refletem sua categoria técnica; a legenda fixa de sucesso do modelo 3D foi removida para que o status real não seja contradito; seção de docentes recolhida por padrão, com contador, estado ARIA e lista expandida sob demanda; diário com cobertura `n/12` de períodos realmente anotados, estado vazio contextual, contagem de palavras e salvamento local com feedback de erro se `localStorage` falhar.
- `client/src/index.css`: espaçamento da navegação lateral refinado e glow do avatar respeita `prefers-reduced-motion`; grid do painel direito se reorganiza conforme a lista de docentes está recolhida ou aberta, usando uma coluna por perfil em notebooks.
- `client/src/forge-editorial.css`: sistema visual ForgeLab para dashboard, biblioteca, leitor, recursos 3D, docente e anotações; Atkinson Hyperlegible para corpo/UI e base de 16 px, Manrope para títulos/marca; somente duas famílias tipográficas; pesos, espaçamentos e breakpoints responsivos; timer centralizado no cartão mobile, selo 3D separado das instruções e controle docente discreto com foco visível.
- `client/index.html`: título da aba alinhado ao projeto e carregamento de fontes otimizado com `preconnect`, `display=swap` e apenas os pesos utilizados de Atkinson Hyperlegible e Manrope.
- `client/src/contexts/ThemeContext.tsx`: armazenamento de tema tolerante a falhas e aplicação pré-pintura.
- `shared/class-schedule.ts`, `server/db.ts` e `server/routers.ts`: grade única de 12 períodos consecutivos de 45 minutos, agenda limitada a dias úteis, conflito de horário validado no servidor e gravação transacional no MariaDB.
- `client/src/pages/Home.tsx` e `client/src/index.css`: editor de agenda conectado ao painel docente; início escolhido por aula, término automático, visualização compartilhada com as anotações e mesma lista dos próximos cinco dias letivos.
- `server/db.ts`, `server/routers.ts`, `shared/progress.ts` e `shared/supervision.ts`: sessões de estudo com validação server-side, expiração de abandonos antigos, proteção contra dupla contagem de retries e resumo docente com tempo real por etapa; a ficha individual mostra o histórico por módulo e etapa. O leitor exibe um único timer por etapa; ele só começa após o clique em “Iniciar etapa”, restaura após recarga o timer aberto mais recente do aluno, sem iniciar nova sessão, informa que salva ao concluir e anima o ícone do relógio durante a contagem. Ao voltar, o aluno continua vendo a etapa concluída e seu tempo salvo; apenas a etapa pendente atual pode ser iniciada/concluída. A ficha docente permite resetar, por aluno e módulo, o progresso e timers, com confirmação e endpoint protegido por `adminProcedure`. O cartão “Horas estudadas” na tela inicial soma os segundos exatos dos timers concluídos e respeita o período selecionado; sessões abertas só contam após a conclusão. O timer de foco local redundante foi removido. Referência visual: [Cult UI Timer](https://www.cult-ui.com/docs/components/timer).
- `client/src/components/TeacherAnalyticsCharts.tsx`: gráficos do painel docente com alternância independente entre barras e pizza/rosca, tooltips flutuantes, gradiente e legenda com totais e percentuais; as barras preservam a comparação de categorias, sem transformar dados de estado em uma série temporal. O módulo Recharts é importado sob demanda e não cria dependências novas. Referência visual: [Cult UI Analytics Chart](https://www.cult-ui.com/docs/components/analytics-chart).
- `pnpm-workspace.yaml` e `package.json`: configurações do gerenciador de pacotes migradas para o arquivo de workspace.
- Testes novos em `server/content-assets.test.ts`, `server/progress.test.ts`, `server/supervision.test.ts`, `server/notes.test.ts` e `server/notes-coverage.test.ts`, além de testes de autorização/validação de agenda e tempo em `server/learning.auth.test.ts`. `shared/notes.ts` centraliza a derivação de períodos distintos com registro, seguindo a grade canônica.

## Validações executadas

- `pnpm install --frozen-lockfile` — passou.
- `pnpm test` — **11 arquivos e 55 testes passaram** na validação atual, incluindo soma de segundos de timers concluídos, filtragem por período, regra de etapa concluída, limites de tempo, acumulação, isolamento por aluno e a quantização do timer (1,5 s → 1 s).
- `pnpm check` — passou, sem erros TypeScript.
- `pnpm build` — passou. O módulo de gráficos foi separado em chunk sob demanda (`TeacherAnalyticsCharts`, 419,94 kB/113,05 kB gzip); o chunk principal permanece em 547,00 kB/157,51 kB gzip, com aviso de tamanho acima de 500 KB.
- Smoke test HTTP local — a raiz respondeu HTTP 200 e serviu o HTML da aplicação.
- Prévia demo após limpeza solicitada — Matriz de molde e Operação de torno em 0%; cartão do aluno mostra `0h` e `00:00` cronometrados, sem sessões nem progresso residual para esses módulos.
- Fluxo de etapa concluída — na prévia, voltar à etapa 1 exibiu “Concluída” e o tempo `00:13`, sem botão para reiniciar; a etapa 2 permaneceu acessível. O reset pela ficha docente foi executado em um único módulo demo e a supervisão retornou a 0%/0 min.
- Gráficos docentes — prévia visual confirmou barras e pizza/rosca nos dois cartões, alternância independente e distribuição recalculada após reset; após recarga, Matriz de molde e Operação de torno continuaram em 0%, com zero linhas de progresso/sessões no banco demo.
- Prévia HTTPS — página e endpoint de sessão de demonstração responderam HTTP 200; MariaDB local respondeu ao ping.
- Revisão visual em viewport móvel de 390 px — sem rolagem horizontal; mostrador do timer centralizado em x=195 px e estado do modelo 3D sem sobreposição às instruções. A sessão HTTPS de demonstração abriu sem aviso de falha de conexão.
- Anotações — faixa de dias e grade foram conferidas em viewport móvel de 390 px; a faixa de dias rola dentro de seu próprio contêiner e a página e o rodapé do editor permanecem dentro da viewport. Criação e edição temporárias refletiram `1/12`, contagem de palavras e hora de atualização; perfil isolado confirmou sucesso após recarregar e foi limpo ao final. Com falha de quota simulada em outro perfil isolado, o editor anunciou erro com `role="alert"`; nenhum dado de teste ficou na prévia.

## Limitações do teste integrado

Para esta prévia foi configurado um MariaDB local isolado e sessões de demonstração para aluno/docente. O cronograma foi testado ponta a ponta: uma atividade foi criada na interface, salva no banco, localizada no diário no mesmo dia/período e removida depois do teste. Também foram conferidas durações de 45 minutos no banco. Isso não equivale a uma implantação de produção: autenticação OAuth e storage externo ainda precisam ser configurados. As anotações permanecem em `localStorage`, e as notificações continuam demonstrativas.

## Próxima sequência recomendada

1. Configurar banco, OAuth e storage num ambiente de integração e testar aluno, admin, criação/edição/publicação/exclusão, upload e progresso real.
2. Criar API e persistência de anotações com propriedade por aluno e testes de isolamento; migrar o `localStorage` legado com cuidado. A agenda já tem API docente e persistência no banco.
3. Criar persistência de notificações com estados não lida/lida/arquivada, estado vazio e eventos reais do produto.
4. Conectar a identidade ao papel real de docente/admin e deixar o alternador somente em modo demo.
5. Hospedar modelos 3D aprovados no storage próprio e reduzir o bundle com carregamento sob demanda do viewer.
6. Completar auditoria formal WCAG dos fluxos, verificando contraste, teclado, leitores de tela e modos claro/escuro em desktop e mobile.


## Pesquisa e implementação do glow na foto de perfil

O exemplo de glow pulsante do GitHub demonstra a variação de `box-shadow` com keyframes; adaptei o princípio sem prefixos antigos e com intensidade suficiente para ficar visível sem aspecto neon [1]. A documentação MDN explica que `prefers-reduced-motion` representa a preferência do usuário por remover, reduzir ou substituir movimento não essencial [2].

No projeto, o brilho fica restrito aos círculos de perfil no header e no painel do aluno. Ele aparece também sobre as iniciais de fallback, para continuar visível quando ainda não há foto carregada. A cor segue o tema e o ciclo é lento (4,8 segundos); para quem prefere movimento reduzido, a pulsação vira um brilho estático suave.

**Referências**

[1]: https://gist.github.com/johnhunter/5826565 "Throbbing glow effect — GitHub Gist"
[2]: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion "prefers-reduced-motion — MDN Web Docs"

## Grade única de 45 minutos

A agenda usa a mesma lista compartilhada de períodos que o diário de aula. A regra atual é segunda a sexta, 12 aulas contínuas entre 07:45 e 16:45, uma atividade por aula e fim calculado automaticamente após 45 minutos. O editor não aceita horários livres fora da grade. A prévia sincroniza a agenda com o banco; o resumo do processo e as referências consultadas estão em [DOCUMENTACAO_DO_PROJETO.md](DOCUMENTACAO_DO_PROJETO.md).


## Pesquisa de componentes e melhoria da tela inicial — 16/10/2026

- Cartões de módulos: substituída a barra simples por segmentos derivados de `currentStepIndex` e da quantidade de etapas enviada pelo catálogo. O componente expõe `role="progressbar"`, limites, valor e descrição textual; utiliza movimento zero. A barra percentual anterior continua como fallback quando faltam dados de etapas.
- Filtros: receberam agrupamento nomeado e `aria-pressed`, preservando a aparência editorial e evitando dependência de hover.
- Busca/filtros sem resultado: agora exibem um estado vazio contextual com um botão funcional para limpar a busca ou retornar aos módulos em andamento.
- Fontes avaliadas: Cult UI Halo Progress, shadcn/ui Progress e Empty, Magic UI Animated Circular Progress Bar, React Bits Stepper e o catálogo Aceternity UI. Foram selecionados somente padrões que ajudam a compreender o avanço real e recuperar-se de uma lista vazia. Gauge circular, timeline com rolagem, efeitos e animações foram descartados por duplicação, ruído ou requisitos extras de acessibilidade.
- A implementação usa CSS/JSX do próprio ForgeLab, sem instalar dependências nem copiar código de registry. A documentação de decisão está em `docs/PESQUISA_COMPONENTES_DASHBOARD.md`.
- Validação desta rodada: `pnpm check`, `pnpm test` (7 arquivos, 27 testes) e `pnpm build` passaram. A home foi conferida na prévia HTTPS em desktop e viewport de 390 px; os filtros `Próximos` e `Concluídos`, a busca sem resultados e o botão de limpar foram exercitados sem gravar dados. Prévia HTTP 200 e MariaDB disponível; permanece o aviso de bundle principal acima de 500 KB.

Referências: [Cult UI — Halo Progress](https://www.cult-ui.com/docs/components/halo-progress), [shadcn/ui — Progress](https://ui.shadcn.com/docs/components/base/progress), [shadcn/ui — Empty](https://ui.shadcn.com/docs/components/base/empty), [Magic UI — Animated Circular Progress Bar](https://magicui.design/docs/components/animated-circular-progress-bar), [React Bits — Stepper](https://reactbits.dev/components/stepper) e [Aceternity UI](https://ui.aceternity.com/components).

## Pesquisa de componentes e melhoria da área de anotações — 16/10/2026

- Comparadas fontes oficiais do Cult UI, shadcn/ui, Magic UI, React Bits e Aceternity UI; decisões, limitações de acessibilidade e URLs verificadas estão em `docs/PESQUISA_COMPONENTES_ANOTACOES.md`.
- Aplicados padrões de estado vazio contextual, cobertura real do diário (`n/12` períodos com anotações) e feedback de salvamento. Esse indicador descreve registros existentes; não afirma conclusão pedagógica. `Textarea` serviu como referência de editor simples, sem adotar um pacote, editor rico, tabs animadas ou busca que não exista.
- A confirmação local só aparece após a gravação em `localStorage`; a falha de gravação vira um alerta assertivo. A persistência continua local, sem mudança de esquema ou do MariaDB.
- `pnpm check`, `pnpm test` (8 arquivos, 29 testes) e `pnpm build` passaram; o build mantém apenas o aviso já conhecido de chunk acima de 500 KB. Teste manual em desktop e 390 px verificou criação, alteração da contagem, indicador `1/12`, exclusão da nota temporária e ausência de overflow horizontal no documento. O alerta de armazenamento foi testado em perfil isolado.


## Badges de competência e verificação de regressão — 16/10/2026

- Criado `shared/competencies.ts` para derivar badges exclusivamente de módulos publicados totalmente concluídos (`currentStepIndex === steps.length`). Cada módulo concluído gera badge de área; recursos vinculados em `machines` podem gerar badges de máquina, deduplicadas por nome.
- A interface ocupa o espaço vazio sob as métricas da sidebar preta, sem novo endpoint, schema ou alteração do banco. O estado vazio não atribui competências; o rótulo esclarece que conclusão de módulo não equivale a avaliação prática. Em celular, badges existentes aparecem em uma faixa horizontal interna; sem badges, a seção vazia permanece escondida.
- `server/competencies.test.ts` cobre conclusão exata, módulos parciais/rascunho/vazios/sem índice confiável e deduplicação de máquinas.
- Verificação de regressão: comparação com o ZIP anterior mostrou, em `Home.tsx`, somente a nova importação, derivação e seção das badges; nenhum outro bloco do dashboard foi alterado. Revisão visual em 1440, 1024 e 390 px confirmou que o título, cards, filtros e docentes recolhidos continuam consistentes e que o documento não tem overflow horizontal. A tela mobile permanece compacta quando a badge está bloqueada.
- Validação atual: `pnpm check`, `pnpm test` (9 arquivos, 32 testes) e `pnpm build` passaram. O build emite apenas o aviso conhecido de chunk Vite acima de 500 KB (1.436,32 kB, 396,51 kB gzip).


## Correção semântica das badges — 16/10/2026

- O comportamento anterior de derivar badges de conclusão de módulos foi removido. Badges agora são registros independentes em `student_badges` e só podem ser atribuídas ou removidas por docente autenticado como administrador; não há qualquer gatilho em progresso, etapas, publicação ou recursos do módulo.
- O painel docente permite escolher aluno, registrar no que ele se destaca (ex.: “metrologia de precisão”) e acrescentar uma observação opcional. Na home do aluno, o item é apresentado como “Bom em …” e a consulta mostra somente seus pontos fortes.
- Adicionada a migração `0002_student_badges_awarded_by_teacher.sql`, e as rotas de leitura pessoal e gestão administrativa estão protegidas por `protectedProcedure`/`adminProcedure`.
- Substituídos testes de concessão automática por testes de normalização do conteúdo manualmente atribuído. TypeScript, 32 testes e build passaram; as rotas públicas de preview responderam 200 e o fluxo docente → aluno → remoção foi exercitado sem deixar badge temporária no banco.


## Correção de lógica e dados — 17/10/2026

A auditoria de continuidade foi validada contra o código atualizado e as correções seguras foram implementadas. O catálogo deixou de semear durante leituras públicas; o seed de demonstração agora é explícito, controlado por `PREVIEW_DEMO_MODE`, serializado e transacional. A agenda exige `moduleId` não vazio, confirma a existência do módulo no serviço e ganhou seleção de módulo no editor. A leitura pública filtra atividades de módulos não visíveis. A exclusão de módulo passou a remover atividades, etapas, recursos e progresso dentro da mesma transação.

O progresso agora só é aceito para módulo existente e publicado, com percentual derivado das etapas e reconciliação da interface após confirmação da API. A UI deixou de usar módulo fictício em erro/vazio, usa o papel autenticado fora do preview, separa caches por identidade, inicializa a etapa pelo estado retornado e mantém a tela confirmada em caso de falha otimista. As anotações continuam locais, mas passaram a usar chave por usuário e a visão docente foi rotulada como consulta local, sem prometer compartilhamento inexistente.

Foi adicionada `drizzle/0003_auth_sessions.sql`: sessões novas recebem `jti`, são registradas em `auth_sessions`, verificam `appId` estrito e podem ser revogadas no logout tanto pelo cookie quanto pelo Bearer. O upload de avatar agora valida assinatura binária e MIME declarado. A cobertura passou a 10 arquivos e 36 testes, incluindo revogação de sessão e validação de imagem.

Não foram escolhidas políticas ainda pendentes sobre histórico/unique de progresso, FKs, ownership, métricas por período, streak/XP, agenda de rascunhos/conflitos, notas server-side, modo demo, URLs remotas, viewer 3D, recomendações/notificações ou `CHECK` de MySQL/TiDB. A migration não foi aplicada a nenhum banco real. Veja o detalhamento em [docs/IMPLEMENTACAO_LOGICA_E_DADOS.md](docs/IMPLEMENTACAO_LOGICA_E_DADOS.md) e o relatório-base em [docs/AUDITORIA_LOGICA_E_DADOS.md](docs/AUDITORIA_LOGICA_E_DADOS.md).


## Continuidade Magic UI e integridade do timer — 21/10/2026

A análise percorreu individualmente os 77 componentes oficiais do Magic UI. Foram adaptados somente `StudyProgressRing` e `NumberTicker`, sem pacote novo; shortlist, exclusões e fontes estão no [relatório Magic UI](../magic-ui-forgelab-report.md).

A consulta `learning.catalog` inclui `viewerId` e `viewerRole` determinados no servidor. A chave de cache separa identidade autenticada, papel server-side e papel da prévia, mas não é usada para autorização. O client não mostra conteúdo enquanto identidade ou papel da resposta não correspondem à sessão atual. Aluno e docente só somam sessões dos módulos visíveis ao papel; docentes no painel vêm exclusivamente do catálogo e, quando a lista está vazia, a interface explica isso em vez de inventar pessoas.

Sessões ativas são recuperadas sem iniciar outra, somente para o viewer atual, e timers novos exigem clique. Display, payload e serviço usam o mesmo piso de segundos e limite de 24 h. Retries de etapas concluídas devolvem tempo persistido sanitizado. O início/conclusão server-side também confirma que as posições materializadas formam `0..N-1` e que a posição informada existe antes de gravar; lacunas ou duplicatas não são aceitas. Sessões inválidas e rascunhos não inflam horas do aluno.

Progresso histórico é selecionado de forma determinística por aluno/módulo, limitado às etapas existentes e repercentualizado pelo índice confirmado. Ao inserir, excluir ou reordenar etapas, a interface docente explica o impacto desde a primeira etapa alterada e exige confirmação explícita; o servidor exige o sinal no mesmo pedido. A transação invalida timer/progresso afetados, preserva etapas anteriores e recalcula minutos a partir dos segundos válidos. Alterações só textuais/metadados com IDs e ordem estáveis preservam o histórico. Excluir módulo confirma e remove sessões, progresso e conteúdo relacionado na mesma transação.

A tabela `student_step_sessions` vem da migration histórica `drizzle/0005_shiny_manta.sql`. Não houve nova migration, endpoint ou dependência; foram acrescentados metadados de viewer na resposta já existente e um campo de confirmação opcional à mutation existente. Nenhuma sessão demo foi concluída/resetada, nenhum módulo foi excluído e nenhuma leitura/escrita do banco foi feita durante esta validação.

Validação final: `pnpm check` passou; `pnpm test` aprovou **55 testes em 11 arquivos**; `pnpm build` compilou cliente e servidor, com aviso Vite não bloqueante no chunk principal (547,00 kB minificado / 157,51 kB gzip). Raiz e `/manus-routes.json` responderam HTTP 200 local e publicamente; o manifesto declara somente `/`.
A revisão read-only após os cinco reparos não encontrou problema confirmado.

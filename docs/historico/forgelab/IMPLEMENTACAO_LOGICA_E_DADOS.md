# Implementação da auditoria de lógica e dados — ForgeLab

## Escopo

Este documento registra a implementação realizada sobre a auditoria consolidada em [AUDITORIA_LOGICA_E_DADOS.md](./AUDITORIA_LOGICA_E_DADOS.md). A auditoria original foi usada como fonte de achados; suas recomendações não foram tratadas como mudanças já existentes.

Nenhuma conexão com banco compartilhado ou de produção foi feita nesta rodada. A migração foi apenas adicionada ao projeto e validada por inspeção, TypeScript e testes unitários.

## Fonte de verdade adotada

| Domínio | Fonte autoritativa | Regra aplicada |
| --- | --- | --- |
| Catálogo e publicação | `learning_modules` e seus filhos | Leitura pública retorna somente módulos publicados; dados vazios/erro não são substituídos por fixtures no frontend. |
| Etapas e leitor | `learning_steps` ordenadas por `position` | O leitor mostra imagens estáticas por etapa. Nenhum viewer 3D foi reintroduzido. |
| Agenda | `learning_activities` | Cada atividade deve apontar para um módulo existente; a leitura pública remove atividades cujo módulo não é visível. |
| Progresso | `student_progress` por usuário e módulo | O módulo precisa existir e estar publicado para o aluno; o percentual é calculado pelo número de etapas e a UI só reconcilia após confirmação da API. |
| Badges/pontos fortes | `student_badges` | São registros atribuídos e removidos manualmente por administrador; conclusão de módulo não cria badge. |
| Sessão | JWT + `auth_sessions` | O JWT precisa ter `jti`, `appId` estrito e registro ativo; logout revoga cookie e Bearer apresentados. |
| Anotações | `localStorage` com chave por usuário | Continua sendo um recurso local, não compartilhado pelo servidor; a interface não o apresenta mais como sincronização de turma. |

## Correções implementadas

### Catálogo e seed

- `learning.catalog` deixou de executar seed durante uma consulta pública.
- O seed demonstrativo foi movido para a inicialização do servidor somente quando `PREVIEW_DEMO_MODE=true` em desenvolvimento.
- O seed passou a ser serializado no processo e executado dentro de uma transação, reduzindo corrida e catálogo parcialmente escrito na prévia.
- Atividades retornadas a alunos/visitantes são filtradas pelos módulos visíveis.

A carga demonstrativa não é uma estratégia de inicialização de produção. Ambientes reais devem receber conteúdo por migration, backfill ou fluxo administrativo controlado.

### Agenda

- `moduleId` agora é obrigatório e não pode ser vazio na borda tRPC.
- O serviço valida, dentro da transação de substituição, que todos os módulos referenciados existem.
- A UI docente ganhou seleção explícita de módulo, removendo o antigo envio implícito de string vazia.
- Atividades ligadas a rascunhos continuam disponíveis na visão administrativa, mas não vazam para alunos/visitantes; a política de permitir ou não agendar rascunhos permanece documentada como decisão de produto.
- A exclusão de módulo agora remove atividades, etapas, recursos e progresso na mesma transação.

### Progresso

- A mutation verifica módulo existente e publicado antes de consultar etapas ou gravar progresso.
- A validação de domínio e a gravação ficam na mesma transação.
- Erros de módulo ausente/não publicado chegam como `NOT_FOUND`, em vez de uma falha interna genérica.
- O frontend deixou de alterar o percentual local antes da resposta do servidor, inicializa o leitor pelo `currentStepIndex` retornado e bloqueia cliques concorrentes enquanto a mutation está pendente.

Não foi adicionada uma `UNIQUE(userId,moduleId)` nesta rodada: a decisão entre uma linha corrente e histórico de eventos ainda é de produto, e a base legada não foi inventariada/deduplicada. Streak, revisitas, métricas por período e migração semântica de etapas também permanecem pendentes.

### Sessões e logout

- Foi adicionada a tabela `auth_sessions` na migration `drizzle/0003_auth_sessions.sql`.
- Tokens novos recebem `jti`, são registrados com validade e são rejeitados quando expirados ou revogados.
- A verificação compara o `appId` do token com o `VITE_APP_ID` configurado.
- O nome vazio emitido por um provedor OAuth recebe fallback estável para o `openId`.
- Logout tenta revogar tanto o token do cookie quanto o token Bearer de `Authorization`, além de limpar o cookie.
- Tokens legados sem `jti` deixam de ser aceitos após a implantação; isso provoca novo login dos usuários que ainda carregarem uma sessão antiga e deve ser comunicado no rollout.

### Frontend, identidade e cache

- O papel docente visual usa o papel autenticado (`admin`) fora da prévia. O alternador aluno/docente só aparece quando a prévia explicitamente controlada está habilitada.
- Chaves de consulta de catálogo e badges incluem um identificador de cache da sessão. Esse valor serve apenas para separar caches; autorização continua sendo exclusivamente server-side.
- Login/logout ou troca de conta não reutilizam o catálogo de outra identidade enquanto a nova consulta está carregando.
- Módulos fictícios não substituem catálogo vazio ou erro remoto.
- Salvar/excluir módulo e concluir etapa só anunciam sucesso depois da resposta e reconsulta do servidor.
- Anotações locais usam `student-notes:user:<id>` quando há identidade autenticada. A visão docente foi rotulada como consulta local, pois ainda não existe API de notas compartilhadas.

### Upload de avatar

O avatar passou a reutilizar o mesmo validador de imagens: base64 canônico, limite de 5 MB, assinatura JPEG/PNG/WebP e correspondência entre bytes e MIME declarado. O conteúdo não é aceito somente porque o cliente informou um tipo.

## Migration e segurança operacional

A migration `0003_auth_sessions.sql` e o snapshot `drizzle/meta/0003_snapshot.json` são aditivos. Não foram aplicados em banco de produção, compartilhado ou demonstração real nesta rodada.

Antes de aplicar em qualquer banco existente:

1. Faça backup/snapshot e confirme que `auth_sessions` ainda não existe.
2. Aplique a migration em uma cópia isolada e confirme criação da tabela e dos dois índices.
3. Planeje o novo login obrigatório decorrente da rejeição de tokens antigos sem `jti`.
4. Verifique a configuração de `JWT_SECRET`, `VITE_APP_ID` e banco antes do rollout.
5. Não use o seed demonstrativo como backfill de um banco real.

Nenhuma migration destrutiva, limpeza de órfãos ou deduplicação foi executada automaticamente.

## Decisões ainda pendentes

Continuam pendentes: histórico versus estado corrente de progresso, constraint unique/FKs e exclusões, ownership/multi-tenant, semântica de streak/XP/missão/períodos, agenda em rascunhos/conflitos, notas compartilhadas, limites do modo demo, allowlist de URLs, viewer 3D/recomendações/notificações persistentes e compatibilidade de `CHECK` no MySQL/TiDB. Sem alterar schema, a aplicação escolhe deterministicamente o progresso mais avançado por aluno/módulo e normaliza ao número de etapas válidas; limpeza geral/índice unique continuam pendentes.

## Validação executada

Na cópia de trabalho `/home/ubuntu/ferramentaria-audit/ferramentaria-lab-export`:

- `pnpm install --frozen-lockfile`
- `pnpm check`
- `pnpm test` — 10 arquivos e 36 testes aprovados
- `pnpm build`
- `pnpm drizzle-kit generate` com URL fictícia somente para gerar/verificar metadados; nenhuma migration foi aplicada

Os testes novos cobrem revogação de sessão, revogação simultânea de cookie/Bearer e coerência entre assinatura de imagem e MIME declarado.

> **Estado consolidado posterior (21/10/2026):** a validação atual passou em 11 arquivos e 55 testes. A deduplicação continua em nível de aplicação e determinística; não foi criada constraint unique nem migration nova. Posições materiais de etapas, papel/cache e visibilidade das sessões estão descritos na [auditoria atual](../AUDITORIA_E_MELHORIAS.md). As contagens das seções acima permanecem históricas.


## Continuidade — sessões e supervisão por etapa (17/10/2026)

- `startStudentStep` agora confirma que o módulo existe, está publicado, que a etapa pertence ao módulo e que não está além do progresso autorizado do aluno.
- Sessões abertas com mais de 24 horas são removidas ao reabrir o mesmo slot, evitando que um abandono antigo infle o tempo da próxima visita ou bloqueie o índice único.
- `updateProgress` valida o limite de 24 horas também no serviço, usa o tempo server-side quando há sessão aberta e não soma novamente uma sessão já concluída em retries.
- A supervisão docente consulta `student_step_sessions` concluídas e exibe, na ficha individual, o tempo registrado de cada etapa, separado por aluno e módulo. O tempo por etapa não é estimativa.
- Foram adicionados testes para limites/acumulação de tempo e isolamento do resumo docente por aluno. A persistência server-side de anotações continua pendente e permanece explicitamente local no produto.

## Timer visual por etapa — 17/10/2026

O leitor apresenta um único timer, associado à etapa atual; o cronômetro de foco local redundante foi removido para não confundir o aluno. Ao abrir uma etapa, o cronômetro permanece parado em `00:00`; só começa após o aluno clicar em “Iniciar etapa”. Durante a contagem, o botão passa a “Concluir etapa”, e o texto informa que o tempo será salvo ao concluir. O ícone de relógio gira enquanto a sessão está ativa, no estilo `loading` do Cult UI, e respeita `prefers-reduced-motion`.

O início de etapa devolve `startedAt`, tempo salvo e estado de conclusão da sessão do banco. A interface retoma a contagem a partir desses dados; concluir a etapa grava os segundos medidos no servidor e devolve o valor confirmado. A mesma sessão aparece no painel docente por aluno, módulo e etapa em formato de relógio, sem arredondamento. O botão de conclusão aguarda a sessão server-side estar aberta, e retries de etapas já registradas preservam o tempo salvo.

O leitor usa o progresso confirmado pelo servidor, independentemente da etapa atualmente selecionada: voltar a uma etapa concluída mantém o marcador de conclusão e mostra o tempo salvo, sem oferecer “Iniciar” ou “Concluir” novamente. O aluno ainda pode voltar à etapa pendente atual. `startStep` rejeita a reabertura de etapa concluída e `updateProgress` só aceita a próxima etapa com sessão aberta; uma repetição idempotente devolve o registro original, sem alterar progresso ou tempo.

Na ficha individual de supervisão, o docente dispõe de “Resetar progresso” por módulo, protegido por `adminProcedure` e confirmação. O reset transacional remove as conclusões e sessões de timer daquele aluno naquele módulo; não altera os demais módulos.

Na tela inicial do aluno, o cartão “Horas estudadas” soma os segundos exatos das sessões concluídas em `student_step_sessions`, usando `completedAt` para respeitar o período selecionado. Sessões ainda abertas só entram depois de concluir a etapa. O cartão mostra horas inteiras e a duração acumulada exata em `MM:SS` ou `HH:MM:SS`; os minutos usados na gamificação são derivados dessa mesma soma.

A apresentação visual segue o padrão compound/outline documentado pelo Cult UI, com visor monoespaçado e formatos `MM:SS` e `HH:MM:SS`. O ForgeLab implementa a apresentação no CSS/React existente, sem adicionar dependência ou copiar o pacote. [Referência Cult UI Timer](https://www.cult-ui.com/docs/components/timer).

## Gráficos do painel docente — 18/10/2026

Os cartões de progresso da turma e de finalidade das atividades mostram distribuições categóricas. Para não sugerir uma evolução temporal que esses dados não representam, a visualização oferece barras para comparação e pizza/rosca para proporções, com alternância independente em cada cartão. O visual usa cartões compactos, gradiente da marca, legenda com contagens/percentuais e tooltip flutuante, inspirado no acabamento do Cult UI Analytics Chart. Uma tabela semântica mantém os valores acessíveis; o layout responde a telas menores.

`TeacherAnalyticsCharts.tsx` usa Recharts já presente no projeto e é carregado sob demanda no modo docente, evitando incluir essa biblioteca na carga inicial do painel do aluno. Nenhuma dependência nova foi adicionada. [Referência Cult UI Analytics Chart](https://www.cult-ui.com/docs/components/analytics-chart).


## Estado consolidado posterior — 21/10/2026

As contagens das seções anteriores são fotografias das rodadas de 17/10. A validação corrente concluiu com `pnpm check`, 11 arquivos/52 testes, build de cliente e servidor e smoke HTTP local/público da raiz e manifesto. Progresso duplicado é tratado na camada da aplicação; nenhuma migration adicional foi criada nem aplicada e nenhum dado demo/produção foi modificado durante essa validação. Consulte [AUDITORIA_E_MELHORIAS.md](../AUDITORIA_E_MELHORIAS.md) para o estado detalhado.

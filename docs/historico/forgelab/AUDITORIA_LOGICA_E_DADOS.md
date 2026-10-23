# Auditoria de lógica e dados — ForgeLab

## Resumo executivo

Este relatório consolida **somente** os resultados estruturados fornecidos pelos agentes da auditoria. Não houve reauditoria dos arquivos, conexão ao banco, chamada de endpoint, alteração de código, alteração de schema ou alteração de dados.

Foram agrupados achados repetidos entre schema/migrações, persistência, API/autorização, frontend/contrato de dados e testes. A normalização de prioridade usada neste documento é:

- **Crítica (P1):** efeito concreto sobre segurança, exposição de dados, integridade ou contrato público, com impacto imediato ou amplo.
- **Alta:** bug concreto ou risco de corrupção/isolamento/concurrency com impacto relevante.
- **Média:** risco operacional ou de contrato cuja severidade depende de configuração, intenção de produto ou caminho de execução.
- **Baixa:** endurecimento, documentação, consistência de tipos ou validação de menor impacto.

### Contagem consolidada

| Prioridade | Quantidade | Observação |
|---|---:|---|
| Crítica | 5 | Achados P1 explícitos e agrupados sem duplicação |
| Alta | 11 | Bugs concretos, riscos de integridade e lacunas críticas de cobertura |
| Média | 10 | Riscos condicionais, operacionais ou de contrato |
| Baixa | 4 | Hardening e inconsistências de menor impacto |
| **Total** | **30** | Contagem de achados agrupados, não de menções individuais |

Os riscos mais urgentes são: a query pública que executa seed com escrita, a agenda que aceita/exibe referências inválidas ou ocultas, o progresso que pode ser registrado em módulos não publicados, a ausência de revogação efetiva no logout e a exclusão de módulo que deixa atividades órfãs. Em seguida vêm a concorrência do progresso, o isolamento de notas e caches, a divergência entre papel visual e papel autenticado, as métricas por período e a validação de avatares.

O material também registra que a cadeia do journal do Drizzle está ordenada e que não foi encontrada divergência concreta entre schema, SQLs e metadados quanto a tabelas, colunas, tipos/enums, nulabilidade, defaults, PKs ou `users.avatarUrl`. A ausência de FKs, unicidade composta e checks aparece como risco de integridade, mas algumas decisões dependem da regra de negócio e da compatibilidade do alvo.

## Escopo e arquivos informados

A consolidação cobriu os seguintes domínios e arquivos que constam nos resultados recebidos.

### Schema, migrações e persistência

- `drizzle/schema.ts`
- `drizzle/relations.ts`
- `drizzle/0000_smiling_wilson_fisk.sql`
- `drizzle/0001_fast_omega_red.sql`
- `drizzle/0002_student_badges_awarded_by_teacher.sql`
- `drizzle/meta/_journal.json`
- `drizzle/meta/0000_snapshot.json`
- `drizzle/meta/0001_snapshot.json`
- `drizzle/meta/0002_snapshot.json`
- `server/db.ts`
- `shared/progress.ts`
- `shared/class-schedule.ts`
- `shared/notes.ts`
- `shared/competencies.ts`
- `shared/model-url.ts`
- `shared/focus-timer.ts`
- `shared/theme.ts`
- `shared/types.ts`

### API, autenticação, autorização e storage

- `server/routers.ts`
- `server/content-assets.ts`
- `server/storage.ts`
- `server/preview-storage.ts`
- `server/_core/env.ts`
- `server/_core/trpc.ts`
- `server/_core/context.ts`
- `server/_core/sdk.ts`
- `server/_core/oauth.ts`
- `server/_core/preview.ts`
- `server/_core/cookies.ts`
- `server/_core/systemRouter.ts`
- `server/_core/notification.ts`
- `server/_core/storageProxy.ts`

### Frontend e contrato de dados

- `client/src/pages/Home.tsx`
- `client/src/main.tsx`
- `client/src/lib/trpc.ts`
- `client/src/_core/hooks/useAuth.ts`
- `client/src/contexts/ThemeContext.tsx`
- `client/src/App.tsx`
- `client/src/components/TeacherBadgeManager.tsx`
- `client/src/components/DashboardLayout.tsx`
- `client/src/components/Map.tsx`

### Testes e documentação consultados pelos resultados

- `package.json`
- `vitest.config.ts`
- `server/progress.test.ts`
- `server/notes.test.ts`
- `server/notes-coverage.test.ts`
- `server/competencies.test.ts`
- `server/content-assets.test.ts`
- `server/learning.auth.test.ts`
- `server/auth.logout.test.ts`
- `server/focus-timer.test.ts`
- `server/theme.test.ts`
- `AUDITORIA_E_MELHORIAS.md`

## Achados priorizados

### Críticos

#### C-01 — Query pública de catálogo executa escrita de seed

- **Natureza:** bug comprovado de contrato e risco de concorrência.
- **Evidência:** `learning.catalog` é `publicProcedure` e chama `seedCatalogIfEmpty`; o seed insere módulos, etapas, recursos, instrutores e atividades. A operação verifica apenas se existe algum módulo e realiza várias inserções sem transação ou lock. Duas primeiras requisições podem correr simultaneamente; falha intermediária pode deixar catálogo parcial.
- **Caminhos:** `server/routers.ts:94`; `server/db.ts:126-180`.
- **Impacto:** uma consulta de leitura tem efeito de escrita sem autenticação. O estado depende de quem foi o primeiro leitor, podem ocorrer duplicatas/erro de chave e dados demonstrativos podem misturar-se com produção. O catálogo pode ficar parcialmente populado.
- **Ação recomendada:** remover escrita da query pública. Mover seed para migration, startup controlado ou comando administrativo; torná-lo idempotente, transacional e serializado. Se o seed continuar em runtime, usar lock e verificação de completude, não apenas a existência de um módulo.

#### C-02 — Exclusão de módulo deixa atividades órfãs

- **Natureza:** bug comprovado de integridade referencial.
- **Evidência:** `deleteLearningModule` remove etapas, recursos, progresso e o módulo, mas não remove `learningActivities`. `learning_activities.moduleId` é obrigatório, porém não há FK nem cascade.
- **Caminhos:** `server/db.ts:249-256`; `drizzle/schema.ts:87-96`; `drizzle/0000_smiling_wilson_fisk.sql:13-23,43-78`.
- **Impacto:** a agenda pode continuar exibindo aula de conteúdo inexistente; falhas parciais ou leituras posteriores mantêm a inconsistência.
- **Ação recomendada:** excluir/remapear atividades na mesma transação, verificar existência e definir política de retorno quando o módulo não existir. Complementar com FK e ação de exclusão escolhida após limpeza de órfãos.

#### C-03 — Agenda aceita referências inválidas e pode expor rascunhos

- **Natureza:** bug comprovado de contrato, visibilidade e concorrência.
- **Evidência:** `moduleId` aceita string vazia ou ID não existente; `replaceLearningSchedule` não valida módulo e substitui a agenda inteira. `getCatalog` carrega atividades sem filtrar pelos módulos visíveis. No frontend, atividade sem vínculo pode cair silenciosamente em `modules[0]`.
- **Caminhos:** `server/routers.ts:60-81,108-114`; `server/db.ts:173-221,258-275`; `client/src/pages/Home.tsx:292-338`; `drizzle/schema.ts:87-96`.
- **Impacto:** podem ser persistidas atividades órfãs ou ligadas a módulo oculto; visitantes/alunos podem receber metadados de rascunhos. Uma gravação concorrente pode apagar a agenda inteira de outro administrador. O fallback para o primeiro módulo abre conteúdo errado ou nenhum conteúdo.
- **Ação recomendada:** exigir vínculo válido ou modelar explicitamente atividade sem módulo; validar existência e política de publicação no serviço; filtrar por visibilidade para não-admins; substituir o last-write-wins por versão/ETag, lock otimista ou comandos incrementais; tratar vínculo ausente explicitamente na UI.

#### C-04 — Progresso pode ser gravado para módulo não publicado ou inexistente

- **Natureza:** bug comprovado de fronteira de autorização/publicação.
- **Evidência:** `updateProgress` é protegido apenas por autenticação, consulta etapas por `moduleId` e não verifica existência/publicação de `learningModules`; a leitura do catálogo filtra rascunhos, mas a mutação não.
- **Caminhos:** `server/routers.ts:120-123`; `server/db.ts:278-289`; `shared/progress.ts:8-21`.
- **Impacto:** usuário autenticado que conheça ou adivinhe um ID pode pré-completar conteúdo oculto. Esse estado pode contaminar XP, estatísticas e conclusão quando o módulo for publicado; chamadas internas podem gravar valores que o router validaria.
- **Ação recomendada:** no serviço e dentro da transação, carregar módulo, exigir existência e aplicar política de publicação por papel. Retornar `NOT_FOUND` quando apropriado e validar tipos/faixas também no serviço, não apenas no tRPC.

#### C-05 — Logout não revoga o JWT já emitido

- **Natureza:** bug comprovado de sessão.
- **Evidência:** `logout` apenas limpa cookie; tokens têm expiração padrão de um ano e `verifySession` verifica assinatura/expiração, sem lookup de sessão, revogação ou denylist. O cliente também pode usar o mesmo token via Bearer em `sessionStorage`.
- **Caminhos:** `server/routers.ts:87-90`; `server/_core/sdk.ts:180-231`; `client/src/main.tsx:47-70`.
- **Impacto:** token roubado continua aceito após logout, inclusive para mutations protegidas/admin, até expirar. Limpar apenas o cookie não encerra o Bearer armazenado.
- **Ação recomendada:** adotar sessão revogável server-side ou `jti`/denylist, access token curto com rotação de refresh e revogação no logout; limpar também o armazenamento Bearer e testar o token antes/depois do logout.

### Alta prioridade

#### A-01 — Progresso sem unicidade e sem atualização atômica

- **Natureza:** risco concreto de concorrência e agregação; bug comprovável no desenho atual, embora a unicidade final dependa da regra de negócio.
- **Evidência:** `student_progress` possui apenas índice comum `(userId,moduleId)`. `updateProgress` faz SELECT e depois INSERT/UPDATE separados, fora de transação/lock. `getCatalog` usa `Map(moduleId,row)` para uma linha, mas soma todas nos agregados.
- **Caminhos:** `drizzle/schema.ts:65-74`; `drizzle/0000_smiling_wilson_fisk.sql:68-78,97`; `server/db.ts:184-194,281-289`.
- **Impacto:** requisições simultâneas podem inserir duplicatas ou perder minutos/avanço; a linha escolhida pelo `Map` não é determinística, enquanto XP, média e etapas podem ser supercontados.
- **Ação recomendada:** decidir se o modelo é uma linha corrente por aluno/módulo. Se sim, limpar/deduplicar dados, criar `UNIQUE(userId,moduleId)` e usar upsert atômico ou transação com lock. Se histórico for intencional, modelar eventos e ajustar consultas para explicitar o registro válido.

#### A-02 — Sequência, repetições e minutos não representam claramente o estudo

- **Natureza:** bug comprovado de regra de persistência, com decisão de produto pendente.
- **Evidência:** o valor salvo é `Math.max(existing[0].streakDays, 1)`, portanto não incrementa; se o índice resolvido é igual ao existente, a função retorna antes de somar `studiedMinutes`.
- **Caminhos:** `server/db.ts:283-288`; `shared/progress.ts:8-21`.
- **Impacto:** a sequência fica no máximo em um dia e revisitas legítimas podem perder minutos/XP. O código não distingue retry idempotente de novo estudo na mesma etapa.
- **Ação recomendada:** definir evento/chave de idempotência e persistir datas ou eventos de estudo; calcular sequência atomicamente com `lastStudyDate` ou agregados por dia, em vez de tratar todo mesmo índice como duplicata.

#### A-03 — Edição de etapas deixa progresso posicional semanticamente inválido

- **Natureza:** bug comprovado de reconciliação de dados.
- **Evidência:** salvar módulo apaga e recria etapas; progresso armazena apenas `stepIndex`, sem versionamento ou reconciliação. Alterar quantidade, ordem ou conteúdo não migra o progresso.
- **Caminhos:** `server/db.ts:237-246`; `shared/progress.ts:15-21`.
- **Impacto:** índice pode apontar para etapa inexistente, produzir 100% para conteúdo novo ou representar outra etapa após reordenação.
- **Ação recomendada:** versionar módulo/etapas, guardar IDs concluídos ou aplicar política explícita de reset/migração na mesma transação. Não assumir que posição numérica preserva identidade semântica.

#### A-04 — Integridade referencial depende somente do código de aplicação

- **Natureza:** risco concreto; a obrigação de adicionar FK depende do lifecycle compatível.
- **Evidência:** não há `FOREIGN KEY` nas três migrações nem relações Drizzle; colunas como `userId`, `awardedBy`, `createdBy` e `moduleId` aceitam referências sem garantia de existência. Os snapshots finais registram `foreignKeys` vazias.
- **Caminhos:** `drizzle/schema.ts:16-23,25-74,87-96`; `drizzle/relations.ts:1-2`; `drizzle/0000_smiling_wilson_fisk.sql:1-97`; `drizzle/meta/0002_snapshot.json` nas tabelas auditadas.
- **Impacto:** importações, novos endpoints ou exclusões incompletas podem deixar órfãos em badges, progresso, etapas, recursos e atividades; `createdBy`/`awardedBy` não têm ciclo de vida garantido.
- **Ação recomendada:** inventariar órfãos, decidir `RESTRICT`, `CASCADE` ou `SET NULL` por relação e só então migrar FKs. Considerar nulabilidade distinta de `createdBy` e referências obrigatórias de progresso/badges.

#### A-05 — Notas são globais no navegador, não dados isolados por aluno

- **Natureza:** bug comprovado de isolamento/persistência.
- **Evidência:** `NotesPage` usa apenas `localStorage['student-notes']`; não há tabela, `userId`, router ou autorização de turma. O modo docente apenas lê o mesmo array local e apresenta “Anotações da turma”.
- **Caminhos:** `client/src/pages/Home.tsx:157-220`; `shared/notes.ts:3-44`; ausência de entidade correspondente em `drizzle/schema.ts` conforme o resultado fornecido.
- **Impacto:** contas no mesmo navegador compartilham notas; outro dispositivo não as vê; alternar aluno/docente não troca identidade. A UI sugere sincronização docente inexistente.
- **Ação recomendada:** criar persistência com `userId`, período/data, conteúdo e timestamps, com autorização explícita para leitura docente; ou rotular o recurso como rascunho local e remover a promessa de turma.

#### A-06 — Cache de catálogo e badges não inclui identidade

- **Natureza:** bug comprovado de isolamento no frontend.
- **Evidência:** `learning.catalog.useQuery` recebe somente `period`, embora o resultado dependa de `ctx.user?.id`; `badges.mine` também não recebe identidade. Login/logout normal não invalida ou limpa essas consultas.
- **Caminhos:** `client/src/pages/Home.tsx:350-379,425`; `client/src/main.tsx:12,41-72`; `server/routers.ts:94,126-127`.
- **Impacto:** progresso/badges da conta anterior podem permanecer após troca de sessão, e o catálogo anônimo pode continuar exibindo estado de demonstração ou de outra identidade.
- **Ação recomendada:** incluir identidade/papel efetivo no escopo da query quando apropriado e, principalmente, remover/invalidate queries em login, logout e troca de conta; impedir ações enquanto a autenticação não estiver estável.

#### A-07 — Papel visual de docente diverge do papel autenticado

- **Natureza:** bug comprovado de autorização de UI; não é bypass do backend.
- **Evidência:** `isTeacher` vem de `localStorage` (`demo-role`), enquanto mutations exigem `adminProcedure` e `canManageBadges` consulta o papel real. Usuário comum pode abrir editor/agenda/visão docente e só receber `FORBIDDEN` ao persistir.
- **Caminhos:** `client/src/pages/Home.tsx:350-379,456-516`; `server/_core/trpc.ts:30-45`.
- **Impacto:** permissões percebidas, mensagens e estado otimista ficam incoerentes; localStorage de uma conta pode afetar a próxima. O backend continua bloqueando a gravação.
- **Ação recomendada:** usar o papel da sessão como fonte de verdade; manter alternador somente atrás de modo demo explicitamente verificado pelo servidor e ocultar ações não autorizadas.

#### A-08 — Estado otimista do frontend confirma operações antes do servidor

- **Natureza:** bug comprovado de consistência DB↔UI.
- **Evidência:** `completeStep`, salvar e excluir módulo alteram estado local antes da resposta; erros exibem toast, sem rollback consistente, e algumas operações não refazem `catalogQuery`.
- **Caminhos:** `client/src/pages/Home.tsx:444-455,512-516`; `server/routers.ts:95-123`.
- **Impacto:** falha de autorização, rede ou banco deixa conteúdo/progresso aparentemente salvo ou excluído, revertendo somente no reload; reabrir módulo começa em `stepIndex=0` mesmo quando existe `currentStepIndex`.
- **Ação recomendada:** usar `onMutate/onError/onSettled` com snapshot e rollback, aguardar confirmação ou refazer query; inicializar etapa pelo valor autoritativo; desabilitar ações concorrentes e anunciar sucesso apenas em `onSuccess`.

#### A-09 — Métricas filtradas por período usam acumulados históricos

- **Natureza:** bug comprovado de semântica de dados.
- **Evidência:** o filtro seleciona linhas por `updatedAt`, mas `studiedMinutes`, `stepIndex` e `progress` são acumulados na mesma linha; backend calcula XP, missão, nível e média a partir desses acumulados. `streakDays` também nunca é incrementado corretamente.
- **Caminhos:** `server/db.ts:185-228`; `drizzle/schema.ts:65-74`; `client/src/pages/Home.tsx:223-229,260-266,290-291`.
- **Impacto:** “Hoje” pode contar todo o histórico atualizado hoje, inflar missão/XP e fazer o resultado mudar artificialmente com o filtro.
- **Ação recomendada:** persistir eventos/deltas e consultar por intervalo, ou manter agregados por dia/semana; separar métricas de período de nível/XP lifetime e definir formalmente a missão semanal.

#### A-10 — Avatar aceita bytes arbitrários ou MIME divergente

- **Natureza:** bug comprovado de validação de upload.
- **Evidência:** `uploadAvatar` verifica apenas prefixo `data:image/...;base64,` e tamanho; não verifica base64 canônico, assinatura JPEG/PNG/WebP ou correspondência com `mimeType`. O teste disponível de avatar é anônimo e termina antes do handler.
- **Caminhos:** `server/routers.ts:142-153`; `server/content-assets.ts:5-41`; `server/learning.auth.test.ts:47-50`.
- **Impacto:** bytes que não são imagem podem ser armazenados com tipo declarado pelo cliente; falha posterior em `setUserAvatar` deixa objeto órfão.
- **Ação recomendada:** reutilizar validador único de conteúdo, exigir assinatura e MIME coerentes, derivar tipo dos bytes e implementar compensação/limpeza para falha entre storage e banco.

#### A-11 — Cobertura não comprova os fluxos críticos ponta a ponta

- **Natureza:** lacuna de testes, não bug funcional isoladamente; evidência parcialmente incerta quanto à execução.
- **Evidência:** `vitest.config.ts` inclui testes `server/**/*.test.ts`/`spec.ts`; inventário indica nove arquivos/32 casos, sem testes client, shared independentes ou integração real DB↔API. Não há cobertura de concorrência, publicação, delete cleanup, isolamento de usuários, badges completas, avatar autenticado, revogação, rollback ou preview gate. Um resultado informa `pnpm check` e suíte disponível passaram; outro declara auditoria estática sem executar testes.
- **Caminhos:** `package.json:6-13`; `vitest.config.ts:15-18`; testes listados no escopo.
- **Impacto:** regressões transversais podem passar; os testes atuais comprovam sobretudo guards, validações anteriores ao banco e funções puras.
- **Ação recomendada:** adicionar testes de contrato, client/jsdom, integração com banco efêmero/mocks fiéis e E2E isolado. Registrar claramente quais comandos foram executados; não tratar suíte verde como prova de transação ou concorrência.

### Média prioridade

#### M-01 — Storage e banco não têm transação conjunta

- **Natureza:** risco operacional comprovado; solução depende do lifecycle escolhido.
- **Evidência:** uploads de cover/etapas/avatars ocorrem antes da transação do módulo/usuário; storage gera sufixo aleatório e não há remoção/garbage collection. Retries reenviam objetos.
- **Caminhos:** `server/routers.ts:95-105,142-153`; `server/content-assets.ts:21-41`; `server/storage.ts:41-59`; `server/db.ts:240-246`.
- **Impacto:** objetos órfãos, referências antigas inacessíveis e crescimento de storage quando DB falha ou o usuário repete a operação.
- **Ação recomendada:** usar chaves determinísticas/versionadas, staging e compensação após falha, limpeza após commit ou job de garbage collection; documentar a ordem de publicação.

#### M-02 — Ownership/tenant não participa da autorização administrativa

- **Natureza:** risco condicionado à decisão single-tenant versus multi-tenant.
- **Evidência:** `adminProcedure` verifica apenas `role === 'admin'`; save, delete, agenda e badges não conferem `createdBy`, autor, tenant ou proprietário.
- **Caminhos:** `server/_core/trpc.ts:30-45`; `server/db.ts:237-275`; `drizzle/schema.ts:25-40,87-96`.
- **Impacto:** em ambiente multi-instrutor/tenant, um admin pode editar conteúdo alheio, apagar progresso ou substituir agenda global. Em single-tenant isso pode ser intencional.
- **Ação recomendada:** decidir e documentar admin global ou introduzir escopo; quando necessário, adicionar filtros de owner/tenant às leituras e escritas e testar dois administradores/tenants.

#### M-03 — Leitura de catálogo e substituição de agenda não têm visão/versionamento comum

- **Natureza:** risco de consistência sob concorrência.
- **Evidência:** catálogo faz seis leituras independentes em `Promise.all`, fora de snapshot comum; salvar módulo substitui filhos em transação. Agenda é replace-all e aceita last-write-wins.
- **Caminhos:** `server/db.ts:169-221,237-246,258-275`.
- **Impacto:** resposta pode combinar cabeçalho novo com etapas/recursos antigos; gravação concorrente da agenda perde mudanças silenciosamente.
- **Ação recomendada:** ler agregado em transação/snapshot ou por versão de catálogo; adotar versão/ETag/lock otimista na agenda ou comandos incrementais.

#### M-04 — Validações e erros de domínio estão distribuídos e incompletos

- **Natureza:** risco de contrato e hardening.
- **Evidência:** banco não impõe `progress BETWEEN 0 AND 100`, não-negatividade de contadores ou limites binários para `published`/`active`; `studiedMinutes` é limitado apenas no router. `moduleInput` não limita quantidades/tamanhos nem IDs únicos. Erros de domínio são lançados como `Error`, chegando potencialmente como `INTERNAL_SERVER_ERROR` em vez de `BAD_REQUEST`/`NOT_FOUND`.
- **Caminhos:** `drizzle/schema.ts:34,36,60,69-72,83`; `server/routers.ts:26-58,120-153`; `shared/progress.ts:8-21`; `server/content-assets.ts:29-37`.
- **Impacto:** chamadas internas podem contornar invariantes, payloads grandes podem consumir storage, e clientes não distinguem entrada inválida de falha de infraestrutura.
- **Ação recomendada:** centralizar schemas/normalização, validar também no serviço, adicionar limites de payload/coleções e checks compatíveis com MySQL/TiDB após limpeza; converter erros de domínio na borda tRPC.

#### M-05 — Contrato de sessão tem appId e nome potencialmente incompatíveis

- **Natureza:** risco condicionado a configuração e perfis OAuth.
- **Evidência:** `verifySession` exige `appId` não vazio, mas não compara estritamente com `ENV.appId`; OAuth pode assinar `name: ''`, enquanto verificação rejeita nome vazio.
- **Caminhos:** `server/_core/sdk.ts:212-227`; `server/_core/oauth.ts:51-57`.
- **Impacto:** segredo compartilhado entre apps pode permitir aceitação cross-app; usuário OAuth sem nome pode ficar sem sessão funcional.
- **Ação recomendada:** comparar `appId` estritamente, garantir configuração segura e usar fallback estável ou tornar `name` opcional de forma consistente; cobrir ambos os casos.

#### M-06 — Modo preview/demo pode emitir sessão administrativa em ambiente exposto

- **Natureza:** capacidade deliberada de demo, não bypass comprovado da produção correta.
- **Evidência:** com `NODE_ENV=development` e `PREVIEW_DEMO_MODE=true`, POST de preview aceita papel teacher, faz upsert de usuário demo como admin e emite JWT sem autenticação prévia. Cliente usa flag diferente (`VITE_PREVIEW_DEMO`).
- **Caminhos:** `server/_core/preview.ts:7-57`; `server/_core/env.ts:10`; `client/src/pages/Home.tsx:350-414`.
- **Impacto:** ambiente de desenvolvimento exposto pode conceder admin demo e persistir dados; flags divergentes podem produzir UI e servidor incompatíveis.
- **Ação recomendada:** fail-closed em produção, separar host/banco demo, alinhar flags e impedir exposição externa do dev server; documentar que teacher demo não representa papel OAuth real.

#### M-07 — Fallback demonstrativo substitui vazio/erro remoto

- **Natureza:** bug de autoridade de fixture no frontend.
- **Evidência:** `normalizeModules` retorna `defaultModules` quando a lista é vazia/não-array; loading/erro não têm estado que substitua o conteúdo sintético. O servidor também pode retornar catálogo vazio legitimamente.
- **Caminhos:** `client/src/pages/Home.tsx:95-122,415-425`; `server/db.ts:132-136,197-208`.
- **Impacto:** usuário pode ver progresso e módulos que não existem no banco, iniciar ações com IDs demo e não perceber falha ou catálogo vazio.
- **Ação recomendada:** separar loading, erro, vazio e demo; ativar defaults somente em preview explícito; impedir concluir/salvar sobre fixture.

#### M-08 — Recursos 3D são persistidos, mas não são renderizados no leitor

- **Natureza:** divergência de produto/contrato; não é falha de persistência comprovada.
- **Evidência:** editor promete que `modelUrl` aparece no leitor, mas `Home.tsx` só renderiza cards textuais e não lê/renderiza `modelUrl`; servidor apenas valida/grava URL `.glb/.gltf`.
- **Caminhos:** `client/src/pages/Home.tsx:155,518-562`; `server/routers.ts:33-42`; `drizzle/schema.ts:52-63`.
- **Impacto:** docente recebe confirmação de recurso 3D utilizável, mas aluno não vê modelo nem link correspondente.
- **Ação recomendada:** implementar viewer seguro com loading/erro ou renomear labels para recurso externo/textual; manter imagem da etapa distinta do modelo 3D.

#### M-09 — Recomendação e notificações exibem persistência inexistente

- **Natureza:** bug de contrato de UX.
- **Evidência:** botão de recomendação apenas chama `onNotify`; notificações/read state são `useState` e resetam no reload. Não há router ou armazenamento correspondente.
- **Caminhos:** `client/src/pages/Home.tsx:294,426-443,517`; `client/src/main.tsx:25-39`.
- **Impacto:** usuário recebe confirmação de “salvo”, mas recarregar perde a ação e o status de leitura.
- **Ação recomendada:** persistir via router com invalidação/refetch, ou alterar as mensagens para indicar explicitamente que são ações locais/não implementadas.

#### M-10 — Cobertura de badges e fixtures não valida o contrato real

- **Natureza:** lacuna de teste e fragilidade de fixture, não bug funcional comprovado isoladamente.
- **Evidência:** testes cobrem `normalizeBadgeContent`, não caller admin/user, isolamento entre alunos, atribuição/remoção persistente ou `awardedBy`. Fixture de agenda usa `moduleId: ''`; teste de imagem usa assinatura PNG truncada e helper direto; fixture de progresso envia campo obsoleto `progress` que o schema remove.
- **Caminhos:** `server/competencies.test.ts:4-22`; `server/learning.auth.test.ts:29-50`; `server/content-assets.test.ts:24-35`; `server/routers.ts:60-80,120-123`.
- **Impacto:** testes podem parecer cobrir agenda, imagem ou percentual sem alcançar a fronteira real de persistência e validação.
- **Ação recomendada:** usar módulo existente nas fixtures, testar callers autenticados e caminho tRPC completo, usar imagem mínima realmente válida, remover campo obsoleto e adicionar casos de isolamento/erro.

### Baixa prioridade

#### B-01 — Flags binários aceitam inteiros fora de 0/1

- **Natureza:** hardening; a necessidade depende de a flexibilidade ser intencional.
- **Evidência:** `learning_modules.published` e `instructors.active` são `int NOT NULL` sem check, embora seed e código usem 0/1.
- **Caminhos:** `drizzle/schema.ts:36,83`; `drizzle/0000_smiling_wilson_fisk.sql:8,36`; `server/db.ts:133-135`.
- **Impacto:** filtros e serialização podem interpretar 2 ou -1 de formas inconsistentes.
- **Ação recomendada:** se 0/1 for invariável, check ou tipo boolean compatível; caso contrário, documentar a flexibilidade e validar na aplicação.

#### B-02 — URLs HTTPS de imagem não são verificadas como imagem

- **Natureza:** recomendação de política, não SSRF comprovado.
- **Evidência:** referências não-`data:` são aceitas como qualquer URL `https`; servidor não faz fetch nem verifica Content-Type/extensão.
- **Caminhos:** `server/routers.ts:13-24`; `server/content-assets.ts:22-28`.
- **Impacto:** catálogo pode exibir HTML, documento, recurso inexistente ou conteúdo remoto inesperado; não há SSRF porque o servidor não faz fetch.
- **Ação recomendada:** documentar allowlist/origem confiável ou aceitar apenas storage próprio; validar conteúdo se referências remotas forem requisito.

#### B-03 — Dados locais de notas não têm validação robusta de shape/IDs

- **Natureza:** fragilidade de armazenamento local.
- **Evidência:** `JSON.parse` é apenas convertido para `StudentNote[]`; não há validação de campos, datas/períodos ou recuperação de JSON corrompido. IDs usam `Date.now()`.
- **Caminhos:** `shared/notes.ts:13-43`; `client/src/pages/Home.tsx:170-184`.
- **Impacto:** storage corrompido pode quebrar renderização; criações no mesmo milissegundo podem colidir; invariantes de dia/período não são garantidas.
- **Ação recomendada:** validar/normalizar com schema, gerar IDs robustos e cobrir corrupção, duplicidade, período inválido e concorrência de abas.

#### B-04 — Tipos locais do frontend podem divergir do router

- **Natureza:** risco de manutenção e compilação, sem falha funcional comprovada.
- **Evidência:** `Home.tsx` redefine `CatalogData`, `DidacticModule`, `Resource` e `Activity` e usa casts; não deriva a resposta de `RouterOutputs<AppRouter>`.
- **Caminhos:** `client/src/pages/Home.tsx:124-143,369,425,516`; `shared/types.ts:1-8`; `client/src/lib/trpc.ts:1-4`.
- **Impacto:** mudanças em nullable, datas, `currentStepIndex` ou recursos podem chegar ao runtime sem alerta de compilação.
- **Ação recomendada:** derivar tipos do router ou criar schema compartilhado; manter adaptações locais explícitas e verificadas.

## Fluxo coerente esperado

A sequência abaixo descreve o comportamento que os resultados indicam como necessário para um fluxo consistente; é uma proposta de coerência, não uma alteração executada.

1. **Identidade e sessão:** autenticar, validar estritamente `appId`, papel e expiração; no logout, revogar a sessão e limpar cookie, Bearer e caches dependentes da identidade.
2. **Leitura do catálogo:** `learning.catalog` deve ser somente leitura. Seed demo deve ocorrer em etapa controlada e separada. A resposta deve usar um snapshot/versão coerente, filtrar módulos por publicação/papel e retornar apenas atividades com vínculo válido e visível.
3. **Administração de conteúdo:** salvar módulo deve validar limites e IDs, publicar referências de storage de forma compensável e atualizar módulo/etapas/recursos em transação. Alterações estruturais devem versionar ou migrar o progresso.
4. **Progresso do aluno:** o serviço deve confirmar que o módulo existe e está autorizado, validar minutos e índice, deduplicar retries por chave de evento e atualizar estado/estatísticas de forma atômica. A semântica de histórico, período, XP e streak deve estar definida antes de escolher o schema final.
5. **Agenda:** cada atividade deve ter `moduleId` válido, ou a ausência deve ser uma categoria explicitamente modelada. Escritas concorrentes devem detectar conflito; leituras devem ocultar atividades de módulos não visíveis.
6. **Exclusão:** remover ou remapear todos os dependentes em uma única transação, ou aplicar FKs com política de exclusão definida. O catálogo após a operação não deve conter órfãos.
7. **Frontend:** usar papel autenticado, estados reais de loading/error/empty, chave de cache com identidade e resposta do servidor como autoridade. Mutations devem confirmar, invalidar e fazer rollback quando necessário.
8. **Notas e recursos complementares:** notas devem ser persistentes e autorizadas se a promessa for de turma; caso contrário, devem ser identificadas como locais. Recursos 3D, recomendações e notificações devem ter implementação correspondente ou rótulo honesto de protótipo.
9. **Verificação:** testar cada etapa com aluno A/B, admin, anônimo, módulo publicado/rascunho, concorrência, erro de storage, rollback e reconsulta após mutation.

## Decisões pendentes do usuário/produto

Estas decisões não devem ser inferidas somente do código:

1. `student_progress` representa **uma linha corrente por aluno/módulo** ou um histórico de eventos/linhas? Isso determina `UNIQUE`, deduplicação e estratégia de agregação.
2. Quais FKs devem existir e qual política usar por relação: `RESTRICT`, `CASCADE` ou `SET NULL`? Em especial para usuário, módulo, atividades, progresso, badges, `createdBy` e `awardedBy`.
3. Aluno pode registrar progresso em módulo rascunho? Admin pode fazê-lo? A mesma política vale para agenda e recursos?
4. O sistema é single-tenant com admin global ou precisa isolar proprietários, turmas e tenants?
5. “Hoje”, “últimos 7 dias” e “este mês” filtram eventos/deltas ou uma fotografia do estado acumulado? Nível, XP e missão são lifetime, semanais ou dependem do filtro?
6. Como deve funcionar streak: dias consecutivos, sessões, etapas ou outra regra? Como retries e revisitas devem ser identificados?
7. Atividade sem módulo é válida? Se sim, qual sua UX; se não, deve ser rejeitada no formulário, serviço e banco?
8. Agenda é um replace-all intencional ou deve aceitar edição incremental/versionada e conflito entre administradores?
9. Notas são protótipo local ou devem ser compartilhadas entre aluno e docente com autorização por turma?
10. Preview/demo pode existir apenas isolado em desenvolvimento ou haverá um ambiente demo controlado? Quais flags e banco o identificam?
11. URLs remotas de imagens são requisito? Qual allowlist/origem e política de limpeza do storage?
12. O produto promete viewer 3D, recomendação salva e notificações persistentes? Se não, os rótulos devem ser ajustados.
13. O alvo MySQL/TiDB suporta e deve aplicar os `CHECK`s propostos em todas as versões suportadas?

## Ordem recomendada de trabalho incremental e segura

1. **Preservação e diagnóstico:** fazer backup/snapshot, inventariar duplicatas, órfãos, referências a módulos apagados, tokens/sessões e objetos de storage; registrar ambiente e decisões de produto. Não ativar constraints antes da limpeza.
2. **Conter efeitos perigosos:** remover escrita de `learning.catalog`; bloquear progresso em módulos inexistentes/não publicados; impedir exposição de atividades invisíveis; corrigir a exclusão de atividades no delete; manter o modo preview ausente em produção.
3. **Criar testes de contrato antes das migrações:** cobrir admin/aluno/anônimo, módulos publicados/rascunhos, dois usuários, agenda válida/inválida, delete, upload, logout/revogação, cache e rollback. Usar banco/storage efêmeros ou mocks fiéis.
4. **Tornar progresso determinístico:** decidir estado corrente versus eventos; deduplicar dados legados; aplicar unicidade se apropriada; implementar transação/upsert e idempotência; somente depois ajustar streak e métricas por período.
5. **Reforçar integridade do banco:** limpar órfãos, adicionar FKs/checks/uniques compatíveis e validar migração em cópia. Definir ações de exclusão individualmente, sem presumir `CASCADE`.
6. **Corrigir agenda e catálogo:** validar vínculo e publicação no serviço, filtrar por visibilidade, eliminar fallback para `modules[0]` e introduzir versionamento/controle de concorrência.
7. **Corrigir publicação de arquivos:** staging, chaves determinísticas/versionadas, validação única de imagens, compensação/GC e tratamento de retries/falhas entre storage e DB.
8. **Alinhar frontend à autoridade do servidor:** papel autenticado, cache por identidade, loading/error/empty reais, inicialização pelo progresso retornado, rollback/refetch e confirmação somente no sucesso.
9. **Implementar ou reclassificar funcionalidades:** decidir notas, viewer 3D, recomendações, notificações e ownership; persistir com autorização ou marcar explicitamente como demo/local.
10. **Hardening final:** `CHECK`s de flags e contadores, appId/nome de sessão, erros tRPC consistentes, limites de payload/IDs, URLs remotas e tipos derivados do router.

## Limites desta auditoria

- Este documento usa exclusivamente os resultados estruturados fornecidos; os arquivos não foram reabertos e não houve nova auditoria.
- Não houve conexão ao banco, execução de migrações, chamadas a endpoints, testes de concorrência ou operações em storage.
- Nenhum código, schema, migração ou dado foi modificado.
- A ausência de FK, UNIQUE ou CHECK foi observada nos artefatos descritos, mas a decisão de adicioná-los depende do modelo de dados, dados legados e compatibilidade do banco.
- Os achados de ownership, preview/demo, URLs remotas, viewer 3D e persistência de notas distinguem deliberadamente bug comprovado de comportamento que pode ser protótipo ou escolha de produto.
- Os resultados recebidos não são uniformes quanto à execução da suíte: um informa `pnpm check`/suíte disponível aprovada, enquanto outro informa auditoria estática sem execução. Portanto, este relatório não trata a suíte como evidência de integração DB↔API↔UI; a cobertura descrita deve ser confirmada em execução reproduzível.
- A contagem é de achados agrupados. Menções repetidas ao mesmo risco em domínios diferentes foram consolidadas; recomendações não foram contadas como bugs adicionais.

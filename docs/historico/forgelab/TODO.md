# TODO — ForgeLab UI, Magic UI e integridade do timer

## 1. Sidebar e Timeline — concluído

- [x] Sidebar expansível por hover/foco em desktop; drawer e rótulos preservados em mobile; foco/`aria-current` acessíveis.
- [x] Timeline apresenta título integral e estados legíveis; o aluno volta a etapa concluída e não pode pular etapas futuras.
- [x] Selecionar etapa apenas navega. Iniciar timer novo exige clique explícito em “Iniciar etapa”; somente docente pode resetar.

## 2. Magic UI — concluído

- [x] Análise individual dos 77 componentes oficiais, shortlist e motivos de exclusão documentados.
- [x] `StudyProgressRing` e `NumberTicker` adaptados localmente para dados persistidos; sem pacote/dependência nova, sem controlar domínio, ARIA/reduced motion respeitados.

## 3. Identidade, papel e catálogo — concluído

- [x] Cache da consulta separa usuário, papel autenticado e papel de prévia; a resposta só é usada se `viewerId` e `viewerRole` correspondem à sessão atual.
- [x] Chave de cache é somente de isolamento; autorização e filtro de rascunhos permanecem baseados na sessão no servidor.
- [x] Troca de identidade/papel bloqueia e limpa conteúdo anterior antes de exibir o catálogo novo.
- [x] Aluno não contabiliza tempo de módulos não publicados; consulta docente/admin inclui somente módulos visíveis a esse papel.
- [x] Lista de docentes vem exclusivamente do catálogo. Quando vazia, a UI mostra estado vazio; não inventa pessoas.

## 4. Timer e progresso — concluído

- [x] Após recarga, a sessão aberta mais recente pode ser retomada sem iniciar uma nova; sessões abertas em outros módulos permanecem acessíveis por eles.
- [x] Display, payload e servidor usam o mesmo piso em segundos; sessões abertas não entram nas horas concluídas.
- [x] Backend só inicia/conclui se toda a estrutura estiver sequencial e a posição informada existir; rejeita lacunas, duplicatas e etapas não materializadas.
- [x] Retry de etapa já concluída devolve apenas duração validada/sanitizada, nunca valor legado negativo ou acima de 24 horas.
- [x] Progresso duplicado é selecionado deterministicamente; sessões órfãs, inválidas e além do avanço confirmado não inflam totais/supervisão.

## 5. Supervisão e edição docente — concluído

- [x] Horas do aluno e duração docente por etapa/módulo vêm de segundos reais confirmados; minutos são derivados da mesma soma.
- [x] Alteração de ID/ordem/quantidade de etapas exige confirmação docente explícita; o servidor também exige o sinal no mesmo pedido.
- [x] A transação remove progresso/timers desde a primeira etapa afetada, mantém etapas anteriores e recalcula percentuais/minutos válidos.
- [x] Excluir módulo confirma e remove sessões, progresso, etapas, recursos e conteúdo dentro da mesma transação.

## 6. Validação — em andamento

- [x] `pnpm check`: sem erros TypeScript.
- [x] `pnpm test`: 11 arquivos, 55 testes aprovados; inclui posições não sequenciais, filtro por módulos visíveis e sanitização de retry.
- [x] `pnpm build`: cliente e servidor compilados; chunk principal 547,00 kB / 157,51 kB gzip, aviso Vite não bloqueante.
- [x] Smoke HTTP da raiz e do manifesto local/público: ambos responderam HTTP 200 e o manifesto contém somente `/`.
- [x] Nenhum reset, exclusão ou gravação no banco demo/produção foi executado durante a validação.
- [x] Revisão read-only final: nenhum problema confirmado; nenhum banco foi acessado.

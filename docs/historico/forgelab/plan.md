# Plano de melhoria do ForgeLab — Aceternity UI + Magic UI

## Objetivo e limites

Aplicar padrões visuais seletivos preservando identidade editorial industrial, timer server-side, início manual de sessões novas, segundos exatos, reset docente e isolamento por identidade/papel. Reutilizar React 19, Tailwind CSS 4, Framer Motion 12 e Lucide existentes; não instalar bibliotecas. A tabela de sessões vem da migration histórica `drizzle/0005_shiny_manta.sql`; sem nova migration ou gravação/exclusão/reset durante validação.

## Componentes e responsabilidades

`Home.tsx` mantém navegação, identidade do viewer, leitor, comandos de timer e chave de cache que discrimina identidade, papel autenticado e papel de prévia. `ReaderTimeline.tsx` conduz o avanço das etapas. `StudyProgressRing.tsx` apresenta o progresso recebido do servidor; `NumberTicker.tsx` anima somente alterações confirmadas em horas reais. Esses elementos visuais não medem nem gravam progresso.

A resposta do `learning.catalog` inclui `viewerId`/`viewerRole` e sessões abertas recentes do próprio usuário. O client bloqueia qualquer resposta cuja identidade ou papel não corresponda ao atual; a chave de cache inclui a identidade e os papéis do servidor/prévia. Essa chave é só isolamento do cache: permissões e módulos publicados continuam determinados exclusivamente pela sessão no backend. O aluno recebe sessões e horas somente de módulos visíveis.

`shared/progress.ts` seleciona progresso canônico por aluno/módulo, valida posições de etapas, limita índices ao conteúdo materializado e centraliza piso de segundos/limite de 24 h. `server/db.ts` rejeita início/conclusão em posições ausentes ou sequências inválidas; sessões de retry são sanitizadas. Instrutores vêm apenas do catálogo confirmado, com estado vazio explícito.

## Direção visual

Preservar papel claro, tinta escura, vermelho de ferramental, Atkinson Hyperlegible + Manrope e bordas enxutas. Usar arco SVG para progresso, contador de horas reais e estados responsivos de sidebar/Timeline, sempre com valor inicial estável e respeito a `prefers-reduced-motion`. Evitar brilho contínuo, partículas ou movimento que esconda conteúdo.

## Integridade do timer, progresso e edição

Após recarga, o leitor reabre somente a sessão já ativa mais recente na identidade/papel atuais, sem chamar início; novos timers exigem “Iniciar etapa”. Display, payload e servidor usam segundos inteiros quantizados pelo mesmo piso. Somente sessões concluídas de etapas existentes, confirmadas e de módulos visíveis entram nos totais. Posições inválidas, duplicatas e dados históricos corruptos não podem gerar progresso/tempo adicional.

Inserir, excluir ou reordenar etapas exige confirmação docente na UI e no contrato server-side. A transação invalida progresso/timers desde a primeira etapa alterada, preserva as anteriores e recalcula minutos da soma de segundos válida. Alterações somente textuais/metadados com IDs e ordem estáveis preservam histórico. A exclusão de módulo já remove sessões/progresso/conteúdo na mesma transação; nenhum reset/exclusão/gravação foi executado na validação.

## Validação

Usar `pnpm check`, suíte unitária, `pnpm build`, smoke HTTP da raiz/manifesto e revisão read-only; evitar leituras ou alterações do banco demo/produção.

# Auditoria e integração dos dois projetos

Data: 22/10/2026. Escopo: unificar o **ForgeLab** (projeto educacional) e o **ControlLab** (protótipo de estoque/ferramentas) em um único sistema, com o estoque restrito a docentes.

---

## 1. Arquitetura encontrada

| Aspecto | ForgeLab (`ferramentaria-lab-…zip`) | ControlLab (`ControlLab-main.zip`) |
|---|---|---|
| Linguagem | TypeScript (cliente, servidor e `shared/`) | JavaScript puro (um único `dist/app.js`, ~720 linhas) |
| Frontend | React 19, Vite 7, Tailwind 4, Framer Motion 12, Radix/shadcn, lucide | HTML gerado por template strings, sem framework |
| Rotas | Estado interno (`view`) num único `Home.tsx` (~4.700 linhas); `wouter` instalado mas não usado | Hash (`#/catalogo`, `#/estoque`…) |
| Backend | Express 4 + tRPC 11 + superjson | **Inexistente** |
| Autenticação | OAuth da plataforma Manus + JWT em cookie + registro `auth_sessions` (revogação) + rota de “prévia” que criava sessões de demonstração | **Inexistente**: um `<select>` troca o perfil no navegador |
| Banco / ORM | MariaDB/MySQL via Drizzle ORM (mysql2) | **Inexistente**: dados em memória, perdidos ao recarregar |
| Tabelas | `users`, `auth_sessions`, `learning_modules`, `learning_steps`, `learning_resources`, `student_progress`, `student_step_sessions`, `student_badges`, `instructors`, `learning_activities` | — (2 itens e 1 pedido fixos no código) |
| Migrations | 0000–0006 com **0004 ausente** (o próprio README pedia “rebaseline”) | — |
| Seed | Embutida no servidor, só no modo prévia | Estado inicial no código |
| Temas | Claro/escuro (`ThemeContext`, `html.dark`), identidade editorial papel/tinta/vermelho | Uma paleta própria, sem tema escuro |
| Testes | Vitest, 11 arquivos / 55 testes (progresso, cronômetro, sessão, permissões…) | `node --test` com DOM simulado (eventos da página estática) |
| Scripts | `dev` com `NODE_ENV=…` inline (não funciona no Windows), `db:push` | `python3 -m http.server` |
| Variáveis | `DATABASE_URL`, `JWT_SECRET`, `VITE_APP_ID`, `OAUTH_SERVER_URL`, `BUILT_IN_FORGE_*` (Manus) | — |

### Pontos fortes

- **ForgeLab**: progresso e cronômetro calculados no servidor (segundos reais, idempotência, sequência obrigatória), transações nas operações críticas, isolamento de cache por identidade, testes de regra de negócio, editor docente completo, acessibilidade cuidada.
- **ControlLab**: modelagem de domínio de estoque muito bem pensada e revisada: físico × reservado × disponível; reserva na aprovação; retirada que desconta **uma única vez** (“testar repetição”); devolução parcial e com avaria que não volta ao saldo; ajuste/estorno com justificativa preservando o registro original; **código SAP como texto não único** (o mesmo SAP aparece em descrições diferentes) com identificador interno próprio; bloqueio de troca de unidade (UN ≠ JG) quando há saldo; histórico com snapshot de nome/local.

### Problemas encontrados

| # | Projeto | Problema | Impacto |
|---|---|---|---|
| 1 | ForgeLab | Login dependia do OAuth da Manus (`OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL`); fora daquela plataforma não havia como entrar | Sistema inutilizável localmente sem o modo “prévia” |
| 2 | ForgeLab | Modo prévia criava sessões de docente/aluno com um clique (`/api/preview/session`) e alternava papel pelo frontend | Mistura de demonstração com fluxo real |
| 3 | ForgeLab | Cookie de sessão `SameSite=None` sem `Secure` em HTTP | Navegadores descartam o cookie: sessão não persistia em `http://localhost` |
| 4 | ForgeLab | Papéis `user`/`admin` (docente era “admin”) | Sem distinção entre docente e administração |
| 5 | ForgeLab | Migration 0004 listada no journal sem arquivo SQL | `drizzle-kit migrate` falhava |
| 6 | ForgeLab | Upload de imagens dependia do storage Manus (Forge/S3) | Fotos e imagens não salvavam fora da plataforma |
| 7 | ForgeLab | `auth.me` devolvia a linha inteira do usuário | Com senha local, o hash iria ao navegador (corrigido antes de existir) |
| 8 | ForgeLab | `animation: none !important` em cards e linhas cancelava as entradas animadas do próprio projeto | Animações perdidas sem justificativa |
| 9 | ForgeLab | Navegação sem URL (recarregar sempre voltava ao início; sem como bloquear uma rota digitada) | Impossível proteger “/estoque” por URL |
| 10 | ForgeLab | `maximum-scale=1` no viewport | Bloqueava zoom (acessibilidade) |
| 11 | ForgeLab | Script `dev` com variável inline (`NODE_ENV=development tsx …`) | Não roda no terminal padrão do Windows |
| 12 | ForgeLab | `server/index.ts` duplicava um servidor estático que não era usado (o real é `server/_core/index.ts`) | Arquivo duplicado, removido |
| 13 | ControlLab | Sem backend, autenticação ou persistência; o perfil é um `<select>` | Nenhuma regra é realmente protegida |
| 14 | ControlLab | Aluno solicita itens e vê saldo | Conflita com a regra “estoque exclusivo do docente” |
| 15 | ControlLab | Pessoas e saldos fictícios apresentados na interface | Precisava de rotulagem clara |

---

## 2. Decisão sobre a base

**Base: ForgeLab.** Critérios: única base com backend, banco, autenticação com revogação, transações e testes; menor risco de regressão no que já funcionava (progresso, cronômetro, editor). O ControlLab não tem código reaproveitável no servidor; dele foram migradas **as regras de domínio, os estados e os textos**, reimplementados em TypeScript (`shared/inventory.ts`) e no banco.

Não foi feita cópia de pastas: o `dist/app.js` do ControlLab não entra no projeto. Seus documentos foram preservados em `docs/historico/controllab/` para rastreabilidade.

## 3. Funcionalidades preservadas

**Do ForgeLab (todas):** dashboard do aluno com perfil e engrenagens animadas, biblioteca com filtros e busca, leitor com etapas sequenciais, cronômetro server-side (relógio girando enquanto ativo), progresso real e idempotente, conclusão de módulo com celebração, recursos técnicos por categoria, editor docente (etapas, imagens, publicação, confirmação de reset de progresso), supervisão de alunos e gráficos, badges/competências, agenda de aulas por período letivo, anotações, notificações, tema claro/escuro, foto de perfil.

**Do ControlLab (regras migradas):** saldo físico/reservado/disponível; reserva → retirada → devolução; retirada idempotente; devolução parcial e com avaria; ajuste com justificativa sem apagar o histórico; SAP não único + código interno único; bloqueio de troca de unidade com saldo; tipo devolvível × consumível; setor + localização; histórico com responsável, referência e snapshot; motivos de cancelamento visíveis; filtros por tipo/setor/disponibilidade.

## 4. Conflitos e como foram resolvidos

| Conflito | Resolução |
|---|---|
| ControlLab permite ao **aluno** solicitar e ver o estoque; o requisito é estoque **exclusivo do docente** | O fluxo de solicitação do aluno foi removido. O **docente** registra o empréstimo em nome do aluno/turma (campo “quem recebe”, com seleção de aluno cadastrado). Sem etapa de aprovação: quem cria já é docente; a reserva acontece na criação. |
| Três perfis no ControlLab (aluna, docente aprovador, administração/estoque) × dois no ForgeLab | Modelo normalizado `student` / `teacher` / `admin`. Docente e administração operam o estoque. |
| Autoaprovação, momento da reserva e quem entrega eram “hipóteses não validadas” no ControlLab | Decisão documentada: reserva na criação do empréstimo, retirada confirmada por docente, entregador e recebedor registrados. Pode ser revista com o setor (ver pendências). |
| “Recursos do módulo” (ForgeLab) × “itens” (ControlLab) | Recurso ganhou `inventoryItemId` opcional. O título do recurso funciona como snapshot; arquivar o item não quebra o módulo. As categorias pedagógicas (materiais, máquinas, ferramentas, mini peças) correspondem aos tipos do estoque. |
| Quantidades com unidade UN/JG (ControlLab) | Unidades contáveis `UN, JG, PC, CX, PAR`, sempre inteiras. Materiais em barra são contados em peças (`PC`). Unidades contínuas (kg, m) ficaram fora para não introduzir decimais sem necessidade levantada. |
| Dados “fictícios” do ControlLab | A seed usa itens realistas (incluindo o inserto SAP 1004916 citado no ControlLab), mas toda a interface em desenvolvimento mostra o selo **DEV** e o README declara que são dados de demonstração. |
| Identidade visual diferente | A área de estoque usa os mesmos tokens do ForgeLab (papel, tinta, vermelho, Manrope + Atkinson Hyperlegible) e vive dentro do mesmo shell (menu, cabeçalho, notificações, tema). |

## 5. Funcionalidades novas/migradas

- Login por e-mail e senha (scrypt), logout com revogação, expiração configurável, limitação de tentativas, redirecionamento por papel, tela de login própria (claro/escuro, foco, Caps Lock, mostrar senha).
- Rotas por URL (`/`, `/biblioteca`, `/leitor`, `/anotacoes`, `/editor`, `/estoque`, `/estoque/emprestimos`, `/estoque/movimentacoes`, `/estoque/categorias`) com tela 403 para alunos e 404 para endereços inexistentes.
- Estoque completo: itens, categorias, movimentações, empréstimos, arquivamento/restauração, histórico de cadastro (auditoria), resumo com alertas, paginação, busca e filtros.
- Integração: vínculo recurso ↔ item no editor; disponibilidade no leitor (docente); “usado nos módulos” no detalhe do item; módulo opcional em movimentações e empréstimos; alertas de estoque baixo e empréstimos atrasados nas notificações do docente.
- Armazenamento local de imagens em `uploads/` (substitui o storage Manus).
- Scripts de banco (`db:setup`, `db:migrate`, `db:seed`, `db:reset`, `db:generate`, `user:create`) e tarefas do VS Code.

## 6. Decisões de banco

- **SQLite** (decisão revista em 22/10/2026, a pedido): o banco é o arquivo `data/forgelab.db` dentro do projeto, usando o `node:sqlite` embutido no Node 22.16+. Sem Docker, XAMPP ou dependência nativa para compilar — basta `pnpm install`, `pnpm db:setup`, `pnpm dev`. O Drizzle foi mantido (driver `sqlite-proxy`).
- **Rebaseline das migrations**: `drizzle/0000_forgelab_baseline.sql` cria o schema completo em SQLite; as migrations MariaDB antigas (com a 0004 ausente) ficaram em `drizzle/legacy/` apenas como histórico.
- Tabelas do estoque com **chaves estrangeiras** (verificação ligada por `PRAGMA foreign_keys`), **`CHECK`** de saldo não negativo e reserva ≤ físico, **índices únicos** para código patrimonial, nome de categoria e chaves de idempotência.
- **Sem exclusão física** de itens: arquivamento (`archivedAt`, `archivedBy`, `archiveReason`). Movimentações são imutáveis; correções são novos ajustes.
- Concorrência: uma conexão por processo e transações serializadas por mutex (substitui o `SELECT … FOR UPDATE` do MariaDB). Adequado a uma instância do servidor — o cenário do TCC.
- Detalhes: [`BANCO_DE_DADOS.md`](BANCO_DE_DADOS.md).

## 7. Decisões de autenticação

- OAuth Manus e modo prévia **removidos**. Autenticação local por e-mail/senha.
- Sessão = JWT HS256 (assinado com `SESSION_SECRET`) em cookie `httpOnly`, `SameSite=Lax`, `Secure` em HTTPS, **mais** o registro `auth_sessions` (expiração e revogação no servidor).
- A cada requisição o usuário é recarregado do banco: mudar o papel ou desativar a conta tem efeito imediato.
- Contas de desenvolvimento vêm do `.env` pela seed; contas reais pelo `pnpm user:create`.
- Detalhes: [`PERMISSOES_E_ACESSOS.md`](PERMISSOES_E_ACESSOS.md).

## 8. Riscos identificados

| Risco | Mitigação |
|---|---|
| Concorrência em saídas/reservas simultâneas | Transações serializadas (mutex sobre a conexão SQLite, testado em `server/sqlite.test.ts`); `CHECK` no banco como última barreira. |
| Duplo clique / reenvio de rede | Chave de idempotência (`requestKey`) única por movimentação/empréstimo/devolução; botões desabilitados durante o envio. |
| Edição concorrente do cadastro | Controle otimista (`version`); conflito pede para recarregar. |
| Força bruta no login | Limitador por e-mail + IP (5 falhas → 15 min). Em várias instâncias, trocar por armazenamento compartilhado. |
| Troca para SQLite | Dados de bancos MariaDB antigos (prévia) não são migrados; rode `pnpm db:setup` para um banco novo. Uma única instância do servidor deve usar o arquivo. |
| `node:sqlite` é marcado como experimental pelo Node | API estável na prática desde o Node 22.13; o aviso é silenciado e o projeto exige Node ≥ 22.16. |
| `Home.tsx` muito grande (~4.700 linhas) | Mantido para evitar regressão; o estoque foi feito em módulos separados (`pages/Inventory.tsx`, `components/inventory/`). Refatoração sugerida como pendência. |

## 9. Verificação realizada nesta entrega

O ambiente em que a integração foi feita **não tinha acesso ao registro npm**. Por isso:

- **Executado aqui**: verificação de sintaxe dos 139 arquivos `.ts/.tsx` (esbuild); checagem de tipos dos módulos compartilhados de estoque, schemas e papéis (`tsc`, sem erros); execução das regras de estoque (`inventory.rules.test.ts` — 23 casos) e de segurança (`auth.security.test.ts` — 9 casos), todos aprovados, além da regressão dos testes puros já existentes (cronômetro, anotações, tema, competências, supervisão — 22 casos aprovados). Com o SQLite, a migration base foi **aplicada de verdade** e as restrições e a serialização de transações foram testadas (`server/sqlite.test.ts` — 9 casos aprovados). O SQL da migration base e o snapshot do Drizzle foram gerados a partir de uma especificação conferida coluna a coluna contra `drizzle/schema.ts`.
- **A executar no VS Code** (requer `pnpm install` e banco): `pnpm check`, `pnpm test` (inclui os testes de tRPC/sessão/permissões que dependem das bibliotecas), `pnpm build`, `pnpm db:setup` e o roteiro manual de [`FLUXOS_DO_SISTEMA.md`](FLUXOS_DO_SISTEMA.md#roteiro-de-verificação-manual).

## 10. Pendências reais

1. **Rodar `pnpm check`, `pnpm test`, `pnpm build` e `pnpm db:setup`** em uma máquina com internet (ver seção 9).
2. **Anotações** continuam salvas no navegador (`localStorage`), como no ForgeLab original. Levá-las ao banco é a próxima evolução natural.
3. **Validar com o setor** as regras herdadas do ControlLab que eram hipóteses: reserva na criação do empréstimo, quem pode confirmar retirada/devolução, tratamento de consumíveis devolvidos.
4. **Dependências sem uso** (`mysql2` — o banco agora é SQLite —, `@aws-sdk/*`, `three`/`@react-three/*`, `streamdown`, `@types/google.maps`, plugin `vite-plugin-jsx-loc` e o patch do `wouter`) foram mantidas para não invalidar o `pnpm-lock.yaml` neste ambiente sem rede; podem ser removidas com `pnpm remove …` seguido de `pnpm install`.
5. **Recuperação de senha** por e-mail não existe; a redefinição é feita por `pnpm user:create` (mesmo e-mail atualiza a senha).
6. **Refatorar `Home.tsx`** em páginas menores (biblioteca, leitor, dashboards) quando houver tempo, sem mudar comportamento.
7. Testes de interface automatizados (navegador real) não foram adicionados; o roteiro manual cobre responsividade, teclado, temas e animações.

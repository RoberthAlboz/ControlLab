# Permissões e acessos

## Papéis

| Papel | Valor no banco | Descrição |
|---|---|---|
| Aluno | `student` | Estuda os módulos publicados, registra o próprio progresso e tempo, faz anotações, vê as próprias competências. |
| Docente | `teacher` | Tudo da área docente (editor, agenda, supervisão, badges) **e o estoque**. Visualiza módulos sem alterar progresso. |
| Administração | `admin` | Mesmas permissões do docente; reservado para manutenção do sistema. |
| Visitante | — (sem sessão) | Só acessa a tela de login. |

O papel fica na coluna `users.role`. Contas novas são criadas pela seed (desenvolvimento) ou por `pnpm user:create` (uso real).

## Onde a regra é aplicada

### 1. Servidor (fonte da verdade)

- `server/_core/context.ts` lê o cookie `forgelab_session`, valida assinatura e expiração do JWT, confere no registro `auth_sessions` que a sessão não foi revogada nem expirou e **recarrega o usuário do banco**. Conta inexistente ou desativada = sem sessão.
- `server/_core/trpc.ts` define os procedimentos:
  - `protectedProcedure` — exige sessão (`UNAUTHORIZED` caso contrário);
  - `studentProcedure` — exige `role = student` (progresso e cronômetro);
  - `teacherProcedure` — exige `teacher` ou `admin`;
  - `inventoryProcedure` — o mesmo que `teacherProcedure`, usado em **todos** os endpoints `inventory.*`;
  - `adminProcedure` — exige `admin`.
- O papel **nunca** é lido do corpo da requisição. Campos extras enviados pelo cliente (ex.: `role`, `userId`) são descartados pela validação; o responsável por cada movimentação é sempre `ctx.user.id`.
- O catálogo (`learning.catalog`) só inclui disponibilidade de estoque nos recursos quando a sessão é de docente/admin. Para alunos, `inventoryItemId` e `inventory` são `null`.

### 2. Frontend (experiência)

- Rotas além de `/login` só são montadas com sessão válida (`ProtectedApp` em `client/src/App.tsx`); sem sessão → `/login?next=…`.
- Menu “Modo docente” (Editor, Estoque), atalhos do cabeçalho, cartão do estoque e notificações de estoque só são renderizados para docentes.
- Abrir `/estoque` (ou subpáginas) com conta de aluno mostra a tela **403 — Acesso restrito a docentes**. Mesmo que alguém force a renderização, todas as chamadas `inventory.*` retornam `FORBIDDEN`.
- Depois do login, `safeRedirectPath` impede redirecionar aluno para rotas docentes e bloqueia redirecionamentos externos.
- Sessão expirada durante o uso: qualquer chamada protegida retorna `UNAUTHORIZED` e o cliente leva à tela de login preservando a página.

### 3. Banco de dados

- Toda movimentação, empréstimo e alteração de cadastro grava o docente responsável (`userId`, `createdBy`, `deliveredBy`, `closedBy`, `updatedBy`, `archivedBy`) com chave estrangeira para `users`.
- `inventory_audit_log` registra criação, edição (antes/depois), arquivamento e restauração.
- Restrições `CHECK` impedem saldo negativo e reserva maior que o físico mesmo se uma regra de aplicação falhar.

## Matriz de endpoints

| Endpoint | Visitante | Aluno | Docente / Admin |
|---|---|---|---|
| `auth.me`, `auth.login`, `auth.logout`, `system.info`, `system.health` | ✅ | ✅ | ✅ |
| `learning.catalog` (somente publicados) | ✅ | ✅ | ✅ (+ rascunhos e estoque) |
| `learning.startStep`, `learning.updateProgress` | ❌ 401 | ✅ | ❌ 403 |
| `learning.saveModule`, `deleteModule`, `saveSchedule`, `resetStudentModule` | ❌ 401 | ❌ 403 | ✅ |
| `badges.mine` | ❌ 401 | ✅ | ❌ 403 |
| `badges.adminData`, `badges.assign`, `badges.remove` | ❌ 401 | ❌ 403 | ✅ |
| `profile.uploadAvatar` | ❌ 401 | ✅ | ✅ |
| `inventory.*` (resumo, opções, categorias, itens, movimentações, empréstimos) | ❌ 401 | ❌ 403 | ✅ |

Os testes `server/inventory.access.test.ts` percorrem **todos** os endpoints `inventory.*` registrados e verificam 401 para visitante e 403 para aluno.

## Sessões

| Item | Comportamento |
|---|---|
| Duração | `SESSION_TTL_HOURS` (padrão 12 h). Recarregar a página mantém a sessão. |
| Logout | Revoga o `jti` no servidor e apaga o cookie. O token antigo deixa de funcionar mesmo se copiado. |
| Novo login no mesmo navegador | Revoga a sessão anterior apresentada. |
| Cookie | `httpOnly`, `SameSite=Lax`, `Secure` em HTTPS, `path=/`. |
| Senhas | Hash scrypt com sal aleatório; nunca enviadas ao navegador nem gravadas em log. |
| Tentativas | 5 falhas por e-mail + IP em 15 min bloqueiam por 15 min. Mensagem genérica (“E-mail ou senha incorretos.”) para não revelar contas existentes. |

## Contas de desenvolvimento

Definidas no `.env` (`SEED_TEACHER_*`, `SEED_STUDENT_*`) e criadas por `pnpm db:seed`. A interface exibe o selo **DEV** fora de produção e não mostra senhas. A seed recusa rodar com `NODE_ENV=production`.

# Permissões e acessos

## Papéis

| Papel | Valor no banco | Descrição |
|---|---|---|
| Aluno | `student` | Estuda os módulos publicados, registra o próprio progresso e tempo, faz anotações, vê as próprias competências. |
| Docente | `teacher` | Tudo da área docente (editor, agenda, supervisão, badges) **e o estoque**. Visualiza módulos sem alterar progresso. |
| Administração | `admin` | Tudo do docente (editor, estoque, conteúdo de qualquer autor) **e a gestão de contas** em `/admin/usuarios`: cria logins de alunos, docentes e outros admins, edita nome/e-mail/tipo de acesso, ativa/desativa e redefine senhas. |
| Visitante | — (sem sessão) | Só acessa a tela de login. |

O papel fica na coluna `users.role`. Contas novas são criadas pela administração na tela **Usuários**, pela seed (desenvolvimento) ou por `pnpm user:create` (primeiro admin em uso real).

### Docente × alunos das próprias turmas

O docente só acessa dados de aluno das turmas **ativas** em que é o responsável: supervisão de progresso e tempo, diário de aula (`notes.ofStudent`), atribuir/remover competências e resetar progresso de módulo. Fora disso a API responde `FORBIDDEN` e o aluno não aparece nas listas. A administração vê todos. Aluno sem turma só aparece para a administração, até ser vinculado a uma turma em **Usuários**.

### Turmas e supervisão do estoque

- Docentes **operam** o estoque (entradas, saídas, empréstimos). A administração **acompanha** em `/admin/estoque` e aciona o docente responsável.
- Cada turma (`classrooms`) tem um docente responsável. Alunos são vinculados a uma turma na tela **Usuários**; turmas são cadastradas em `/admin/turmas`.
- Empréstimos e saídas gravam a turma no momento do registro (snapshot): para aluno cadastrado vale a turma do cadastro; nos demais casos o docente escolhe a turma (opcional).
- A supervisão mostra consumo **por turma** e **por docente** — nunca por aluno — e gera alertas de empréstimo atrasado, baixa por perda/ajuste manual, devolução com avaria, saída com motivo “Outro” e turma retirando ≥ 2× a média das demais. O alerta indica o responsável pela turma (ou, sem turma, quem registrou) com um botão “Acionar” que abre um e-mail pronto.

### Regras da gestão de contas

- Desativar uma conta, trocar o tipo de acesso ou redefinir a senha **encerra as sessões abertas** dela na hora.
- A administração não pode rebaixar nem desativar a própria conta — sempre resta ao menos um admin ativo.
- E-mail é único; a senha mínima é de 8 caracteres e vira hash scrypt no servidor.

## Onde a regra é aplicada

### 1. Servidor (fonte da verdade)

- `server/_core/context.ts` lê o cookie `forgelab_session`, valida assinatura e expiração do JWT, confere no registro `auth_sessions` que a sessão não foi revogada nem expirou e **recarrega o usuário do banco**. Conta inexistente ou desativada = sem sessão.
- `server/_core/trpc.ts` define os procedimentos:
  - `protectedProcedure` — exige sessão (`UNAUTHORIZED` caso contrário);
  - `studentProcedure` — exige `role = student` (progresso e cronômetro);
  - `teacherProcedure` — exige `teacher` ou `admin`;
  - `inventoryProcedure` — o mesmo que `teacherProcedure`, usado em **todos** os endpoints `inventory.*`;
  - `adminProcedure` — exige `admin`; usado em **todos** os endpoints `admin.*`.
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

| Endpoint | Visitante | Aluno | Docente | Admin |
|---|---|---|---|---|
| `auth.me`, `auth.login`, `auth.logout`, `system.info`, `system.health` | ✅ | ✅ | ✅ | ✅ |
| `learning.catalog` (somente publicados) | ✅ | ✅ | ✅ (+ rascunhos e estoque) | ✅ (+ rascunhos e estoque) |
| `learning.startStep`, `learning.updateProgress` | ❌ 401 | ✅ | ❌ 403 | ❌ 403 |
| `learning.saveModule`, `deleteModule`, `saveSchedule`, `resetStudentModule` | ❌ 401 | ❌ 403 | ✅ | ✅ |
| `badges.mine` | ❌ 401 | ✅ | ❌ 403 | ❌ 403 |
| `badges.adminData`, `badges.assign`, `badges.remove` | ❌ 401 | ❌ 403 | ✅ | ✅ |
| `profile.uploadAvatar` | ❌ 401 | ✅ | ✅ | ✅ |
| `inventory.*` (resumo, opções, categorias, itens, movimentações, empréstimos) | ❌ 401 | ❌ 403 | ✅ | ✅ |
| `admin.users.*`, `admin.classrooms.*`, `admin.inventory.oversight` | ❌ 401 | ❌ 403 | ❌ 403 | ✅ |

Os testes `server/inventory.access.test.ts` e `server/admin.access.test.ts` percorrem **todos** os endpoints `inventory.*` e `admin.*` registrados e verificam 401 para visitante e 403 para quem não tem o papel.

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

Definidas no `.env` (`SEED_ADMIN_*`, `SEED_TEACHER_*`, `SEED_STUDENT_*`) e criadas por `pnpm db:seed`. A conta admin é opcional: sem `SEED_ADMIN_PASSWORD` a seed apenas avisa e segue. A interface exibe o selo **DEV** fora de produção e não mostra senhas. A seed recusa rodar com `NODE_ENV=production`.

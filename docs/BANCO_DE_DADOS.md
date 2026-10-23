# Banco de dados

**SQLite**, usando o módulo nativo `node:sqlite` do Node.js 22.16+ (nenhum servidor de banco nem dependência nativa para instalar). O banco é um arquivo dentro do projeto: `data/forgelab.db` (variável `DATABASE_FILE`). Schema central: [`drizzle/schema.ts`](../drizzle/schema.ts). Migration base: [`drizzle/0000_forgelab_baseline.sql`](../drizzle/0000_forgelab_baseline.sql).

## Como executar no VS Code

1. `cp .env.example .env` (o padrão `DATABASE_FILE=data/forgelab.db` já serve).
2. `pnpm db:setup` — cria o arquivo, aplica as migrations e roda a seed.
3. `pnpm dev`.

Visualizar: extensão **SQLite Viewer** (sugerida em `.vscode/extensions.json`) — clique em `data/forgelab.db` no explorador do VS Code. Também funciona com o DB Browser for SQLite ou com o `sqlite3` de linha de comando.

Backup: copie `data/forgelab.db` com o servidor parado. Resetar (desenvolvimento): `pnpm db:reset` (pare o `pnpm dev` antes) ou apague a pasta `data/` e rode `pnpm db:setup`.

## Postgres / Supabase (uso temporário)

O SQLite continua sendo o banco principal. Para hospedar os dados no **Supabase** (ou em qualquer Postgres 14+), basta trocar a configuração; o código é o mesmo.

```env
DATABASE_PROVIDER=postgres
DATABASE_URL=postgresql://postgres.<ref>:<senha>@aws-0-<região>.pooler.supabase.com:5432/postgres
DATABASE_SSL=require
```

- **Connection string**: no Supabase, botão **Connect** → **Session pooler** (porta 5432). A conexão direta (`db.<ref>.supabase.co`) só funciona com IPv6. Senhas com caracteres especiais precisam de URL-encode.
- **Criar as tabelas**: `pnpm db:setup` (ou `pnpm db:migrate`, sem seed). Alternativa: colar [`drizzle/postgres/0000_controllab_baseline.sql`](../drizzle/postgres/0000_controllab_baseline.sql) no **SQL Editor** do Supabase. O script é idempotente.
- **Como funciona**: o Drizzle continua gerando SQL do SQLite e `server/_core/postgres.ts` o adapta (`?` → `$1`, `LIKE` → `ILIKE`). A estrutura Postgres (`drizzle/postgres/`) mantém as mesmas convenções: datas em `BIGINT` (ms), booleanos 0/1, a função `unixepoch()` e um gatilho que gera o `id` quando a aplicação envia `NULL`, como o SQLite faz.
- **Segurança**: o script liga o RLS em todas as tabelas sem criar políticas. A API pública do Supabase (chave `anon`) não acessa nada; o servidor do Control Lab conecta como `postgres`, que ignora o RLS.
- **Mudanças de schema**: altere `drizzle/schema.ts`, gere a migration do SQLite (`pnpm db:generate`) e escreva a equivalente em `drizzle/postgres/` (nova entrada em `meta/_journal.json`).
- **Uploads** (fotos e imagens) continuam em disco (`UPLOAD_DIR`), não no Supabase.

## Configuração da conexão

`server/_core/sqlite.ts` abre o arquivo com:

| PRAGMA | Por quê |
|---|---|
| `journal_mode = WAL` | Leituras não bloqueiam a escrita; mais seguro contra corrupção. |
| `foreign_keys = ON` | O SQLite só verifica chaves estrangeiras com esta opção ligada. |
| `busy_timeout = 5000` | Espera até 5 s se outro processo (ex.: um visualizador) estiver escrevendo. |
| `synchronous = NORMAL` | Bom equilíbrio entre durabilidade e velocidade em WAL. |

O Drizzle conversa com o SQLite pelo driver `sqlite-proxy`. Há **uma conexão** por processo, e as transações passam por um mutex assíncrono: uma por vez, e consultas de outras requisições esperam a transação em curso terminar (sem entrar no meio dela). Isso substitui o `SELECT … FOR UPDATE` usado na versão MariaDB e é coberto por `server/sqlite.test.ts`.

Convenções de tipos: datas em `INTEGER` (milissegundos, convertidas em `Date` pelo Drizzle); booleanos em `INTEGER` 0/1; enums em `TEXT` (valores restritos pelo TypeScript e validados pelo zod na API).

## Migrations

- `pnpm db:migrate` aplica as pendentes (tabela `__drizzle_migrations`, mesmo formato do Drizzle).
- Para mudar o schema: edite `drizzle/schema.ts` → `pnpm db:generate` → revise o SQL gerado → `pnpm db:migrate`.
- `drizzle/legacy/` guarda as migrations MariaDB do ForgeLab original, só como histórico.

## Seed (idempotente)

`pnpm db:seed` pode ser executado várias vezes. Cada registro tem uma chave estável e só é criado se faltar:

| Dado | Chave | Conteúdo |
|---|---|---|
| Contas | e-mail | 1 docente e 1 aluno (dados do `.env`). Senha só é redefinida com `SEED_RESET_PASSWORDS=true`. |
| Módulos, etapas, recursos, agenda | `id` | Matriz de molde (4 etapas), Operação de torno (3 etapas), Ajuste e acabamento (rascunho); 6 recursos; 2 aulas. |
| Docentes exibidos no painel do aluno | tabela vazia | 3 registros (somente na primeira execução). |
| Categorias | nome | 6 categorias. |
| Itens | código patrimonial | 9 itens (ferramentas, máquinas, material, peças), incluindo um em manutenção. |
| Movimentações | `requestKey` | Entradas iniciais, **saída** de insertos para aula (gera **estoque baixo**: 8 disponíveis, mínimo 10) e saída de matéria-prima. |
| Empréstimos | `requestKey` | Paquímetro **retirado** pelo aluno e brocas **reservadas** para uma turma. |
| Vínculos | recurso sem vínculo | 6 recursos dos módulos ligados a itens do estoque. |

Dados de demonstração — a interface mostra o selo **DEV** fora de produção.

## Tabelas

### Identidade

| Tabela | Finalidade | Destaques |
|---|---|---|
| `users` | Contas | `role` ∈ {student, teacher, admin}; `passwordHash` (scrypt); `active`; `email` único; `openId` único (identificador da sessão). |
| `auth_sessions` | Sessões emitidas | `jti` (PK), `expiresAt`, `revokedAt`. Permite expirar e revogar JWTs. |

### Área educacional (preservadas do ForgeLab)

| Tabela | Finalidade |
|---|---|
| `learning_modules` | Módulos (código, título, tipo, objetivo, capa, publicação). |
| `learning_steps` | Etapas ordenadas (`position`) com dica e imagem. |
| `learning_resources` | Recursos técnicos do módulo. **Novo:** `inventoryItemId` → `inventory_items.id` (`ON DELETE SET NULL`). |
| `student_progress` | Progresso por aluno/módulo (único por par). |
| `student_step_sessions` | Cronômetro por etapa (início, conclusão, segundos). |
| `student_badges` | Competências atribuídas pelo docente. |
| `instructors` | Docentes exibidos no painel do aluno. |
| `learning_activities` | Agenda de aulas por período letivo. |

### Estoque

```
inventory_categories 1───* inventory_items 1───* inventory_movements
                                   │  1                 * │
                                   └───* inventory_loans ─┘
learning_resources *───1 inventory_items        users 1───* (responsáveis)
learning_modules  1───* inventory_movements / inventory_loans (opcional)
inventory_audit_log (item | categoria) *───1 users
```

| Tabela | Colunas principais | Restrições |
|---|---|---|
| `inventory_categories` | `name`, `description`, `archivedAt`, `createdBy` | `name` único; FK `createdBy` → users. |
| `inventory_items` | `code` (patrimônio/interno), `sapCode` (texto, **não único**), `name`, `itemType` (tool/machine/material/part), `categoryId`, `unit` (UN/JG/PC/CX/PAR), `returnable`, `quantityPhysical`, `quantityReserved`, `minQuantity`, `sector`, `location`, `conservation`, `status` (disponível/manutenção/indisponível), `version`, `archivedAt/By/Reason`, `createdBy`, `updatedBy` | `code` único; `CHECK quantityPhysical ≥ 0`; `CHECK 0 ≤ quantityReserved ≤ quantityPhysical`; `CHECK minQuantity ≥ 0`; FKs para categoria e usuários. |
| `inventory_movements` | `itemId`, `movementType`, `quantity`, `physicalBefore/After`, `reservedBefore/After`, `reason`, `reference`, `note`, `loanId`, `moduleId` + `moduleTitleSnapshot`, `itemCodeSnapshot`, `itemNameSnapshot`, `unitSnapshot`, `requestKey`, `userId`, `createdAt` | `CHECK quantity > 0`; `CHECK` de saldo resultante; `requestKey` único (idempotência); FKs para item, empréstimo, módulo (`SET NULL`) e usuário. **Imutável.** |
| `inventory_loans` | `itemId`, `borrowerUserId` + `borrowerName`, `quantity`, `returnedQuantity`, `damagedQuantity`, `status` (reservado/retirado/devolvido/cancelado), `purpose`, `moduleId`, `dueAt`, `cancelReason`, `requestKey`, `createdBy`, `deliveredBy`, `closedBy`, datas | `CHECK quantity > 0`; `CHECK returned + damaged ≤ quantity`; `requestKey` único. |
| `inventory_audit_log` | `entityType`, `entityId`, `action` (create/update/archive/restore), `changes` (JSON antes/depois), `userId` | FK `userId`. |

### Movimentos e efeito no saldo

| Movimento | Físico | Reservado | Origem |
|---|---|---|---|
| `entrada` / `ajuste_entrada` | + q | — | Manual |
| `saida` / `ajuste_saida` | − q (≤ disponível) | — | Manual |
| `reserva` | — | + q (≤ disponível) | Criar empréstimo |
| `cancelamento_reserva` | — | − q | Cancelar empréstimo |
| `retirada` | − q | − q | Confirmar retirada |
| `devolucao` | + q | — | Devolução em bom estado |
| `devolucao_avaria` | — | — | Devolução com avaria (registro) |

### Integridade das operações

Cada operação que altera saldo roda em transação exclusiva (mutex da conexão SQLite), calcula o novo saldo com `shared/inventory.ts` (as mesmas funções usadas na prévia da interface), grava item + movimentação e confirma. Repetir a mesma `requestKey` devolve o resultado já gravado. Edições de cadastro usam `version` (controle otimista).

### Exclusão × arquivamento

- Itens e categorias são **arquivados**, nunca apagados.
- Módulos educacionais continuam com exclusão física (comportamento original, com confirmação). O vínculo de movimentações e empréstimos com o módulo vira `NULL`; as movimentações preservam o título em `moduleTitleSnapshot`.

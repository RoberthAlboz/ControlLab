# Banco de dados

**PostgreSQL no Supabase**. Schema central: [`drizzle/schema.ts`](../drizzle/schema.ts). Estrutura do Postgres: [`drizzle/postgres/`](../drizzle/postgres/). Script único para o Supabase (estrutura + seed): [`supabase/controllab-supabase.sql`](../supabase/controllab-supabase.sql).

Os testes automáticos e o trabalho sem internet usam o mesmo código sobre um arquivo **SQLite** (`DATABASE_PROVIDER=sqlite`, módulo nativo `node:sqlite` do Node.js 22.16+).

## Preparar o Supabase

**Pelo navegador**: SQL Editor → New query → colar [`supabase/controllab-supabase.sql`](../supabase/controllab-supabase.sql) → Run. O script:

- aplica as migrations de `drizzle/postgres/` e as registra em `__drizzle_migrations` (um `pnpm db:migrate` posterior reconhece o banco e só aplica as novas);
- insere a seed de demonstração, gerada por `pnpm db:export-sql` a partir de `server/seed.ts`, com senhas sorteadas (em `supabase/CONTAS-SEED.local.txt`, fora do git);
- é idempotente: rodar de novo não duplica tabelas nem linhas.

**Pelo projeto**:

```env
DATABASE_PROVIDER=postgres
DATABASE_URL=postgresql://postgres.<ref>:<senha>@aws-0-<região>.pooler.supabase.com:5432/postgres
DATABASE_SSL=require
```

`pnpm db:setup` (migrations + seed com as senhas `SEED_*` do `.env`) ou `pnpm db:migrate` (sem seed).

- **Connection string**: no Supabase, botão **Connect**. No computador, **Session pooler** (porta 5432); na Vercel, **Transaction pooler** (porta 6543). A conexão direta (`db.<ref>.supabase.co`) só funciona com IPv6. Senhas com caracteres especiais precisam de URL-encode (`&` → `%26`).
- **Rede bloqueada**: redes que barram a porta do Postgres (comum em escolas) deixam a conexão aberta sem resposta, e o erro aparece como `timeout`. Use o SQL Editor do Supabase ou outra rede.
- **Como funciona**: o Drizzle gera o SQL e `server/_core/postgres.ts` o adapta ao Postgres (`?` → `$1`, `LIKE` → `ILIKE`). A estrutura (`drizzle/postgres/`) segue as mesmas convenções nos dois bancos: datas em `BIGINT` (ms), booleanos 0/1, a função `unixepoch()` e um gatilho que gera o `id` quando a aplicação envia `NULL`.
- **Transações**: cada transação pega a trava `pg_advisory_xact_lock`, liberada no COMMIT/ROLLBACK. Assim fica uma transação de escrita por vez no banco todo, mesmo com várias instâncias da função na Vercel (o mutex de `db-lock.ts` só vale dentro de um processo).
- **Segurança**: todas as tabelas têm RLS ligado e nenhuma política. A API pública do Supabase (chave `anon`) não acessa nada; o servidor do Control Lab conecta como `postgres`, que ignora o RLS.
- **Mudanças de schema**: altere `drizzle/schema.ts`, gere a migration do SQLite (`pnpm db:generate`), escreva a equivalente em `drizzle/postgres/` (nova entrada em `meta/_journal.json`) e rode `pnpm db:export-sql` para atualizar o script do Supabase.

## Arquivos enviados

Fotos de perfil, imagens e anexos de módulos ficam na tabela `stored_files` (`STORAGE_DRIVER=database`, padrão com Postgres e obrigatório na Vercel, onde o disco não persiste). Os registros guardam só a URL `/uploads/...`; o servidor lê o arquivo do banco e o entrega com o tipo deduzido da extensão, `X-Content-Type-Options: nosniff` e download forçado para o que o navegador não exibe com segurança. Com SQLite o padrão é a pasta `UPLOAD_DIR` (`STORAGE_DRIVER=disk`). `pnpm uploads:clean` lista e apaga arquivos sem uso nos dois modos.

## SQLite (testes e uso sem internet)

1. No `.env`: `DATABASE_PROVIDER=sqlite` (arquivo em `DATABASE_FILE`, padrão `data/forgelab.db`).
2. `pnpm db:setup` cria o arquivo, aplica as migrations de `drizzle/` e roda a seed.

Visualizar: extensão **SQLite Viewer** (sugerida em `.vscode/extensions.json`). Backup: copie `data/forgelab.db` com o servidor parado. Resetar: `pnpm db:reset` (pare o `pnpm dev` antes).

## Configuração da conexão SQLite

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
| `stored_files` | Arquivos enviados (`STORAGE_DRIVER=database`) | `key` (PK, caminho depois de `/uploads/`), `contentType`, `size`, `data` (`bytea` no Postgres). |

### Área educacional (preservadas do ForgeLab)

| Tabela | Finalidade |
|---|---|
| `learning_modules` | Módulos (código, título, tipo, objetivo, capa, publicação). |
| `learning_steps` | Etapas ordenadas (`position`) com dica e imagem. `quiz`: JSON opcional da verificação da etapa (pergunta, 2–4 alternativas, gabarito e explicação; ver `shared/quiz.ts`). |
| `learning_resources` | Recursos técnicos do módulo. **Novo:** `inventoryItemId` → `inventory_items.id` (`ON DELETE SET NULL`). |
| `student_progress` | Progresso por aluno/módulo (único por par). |
| `student_step_sessions` | Cronômetro por etapa (início, conclusão, segundos). O tempo gravado é o creditado: mínimo de 20 s para concluir e teto de 3× o tempo previsto por etapa (10 min a 2 h). |
| `student_quiz_attempts` | Cada resposta do aluno ao quiz de uma etapa (`stepId`, alternativa, acerto). Alimenta "acerto de primeira" no painel docente e o bônus de XP. |
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

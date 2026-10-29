# Control Lab — Ferramentaria

Plataforma web para o ensino de ferramentaria. Reúne dois contextos em um único sistema:

- **Área educacional** (alunos e docentes): biblioteca de módulos, leitor com etapas sequenciais, progresso real gravado no banco, cronômetro por etapa, recursos técnicos, agenda de aulas, anotações, notificações, competências (badges), tema claro/escuro e painel de perfil com engrenagens.
- **Estoque da ferramentaria** (somente docentes): ferramentas, máquinas, materiais e peças com saldo físico/reservado/disponível, localização, estado de conservação, entradas e saídas, ajustes justificados, empréstimos com reserva → retirada → devolução, alertas de estoque baixo, histórico imutável e vínculo com os recursos dos módulos.

Projeto resultante da unificação do **ForgeLab** (base técnica) com as regras de negócio do protótipo **ControlLab**. O porquê de cada decisão está em [`docs/AUDITORIA_INTEGRACAO_DOIS_PROJETOS.md`](docs/AUDITORIA_INTEGRACAO_DOIS_PROJETOS.md).

---

## Aluno × docente

| | Aluno (`student`) | Docente (`teacher`) | Administração (`admin`) |
|---|---|---|---|
| Biblioteca e leitor (módulos publicados) | ✅ | ✅ (inclui rascunhos) | ✅ |
| Registrar progresso e cronômetro | ✅ | — (pré-visualiza sem alterar) | — |
| Editor de módulos, agenda, badges, supervisão | — | ✅ | ✅ |
| **Estoque** (tela, URL e API) | ❌ bloqueado | ✅ | ✅ |

O papel vem **sempre** da sessão validada no servidor. Detalhes em [`docs/PERMISSOES_E_ACESSOS.md`](docs/PERMISSOES_E_ACESSOS.md).

## Como o estoque funciona

- **Disponível = físico − reservado.** Nenhuma operação deixa saldo negativo nem reserva maior que o físico (regra no código e `CHECK` no banco).
- **Entrada / saída / ajuste**: cada movimentação grava responsável, data, motivo, referência e o saldo antes e depois. Ajustes, perdas e avarias exigem justificativa.
- **Empréstimo** (itens devolvíveis): criar reserva → confirmar retirada (desconta o físico uma única vez) → registrar devolução (parcial ou total). Unidades devolvidas com avaria ficam registradas e **não** voltam ao disponível.
- **Arquivar** em vez de excluir: o item sai das listas, mas o histórico e os módulos que o citam continuam mostrando a referência original.
- **Integração com os módulos**: no editor, cada recurso técnico pode apontar para um item do estoque. O docente vê a disponibilidade no leitor; o aluno não recebe nenhum dado do estoque.

Fluxos completos em [`docs/FLUXOS_DO_SISTEMA.md`](docs/FLUXOS_DO_SISTEMA.md).

---

## Pré-requisitos

- **Node.js 22.16 ou mais novo** (Node 22 LTS atualizado ou 24) e **pnpm** (`corepack enable` ativa o pnpm que vem com o Node).
- **Banco**: nada a instalar. O Control Lab usa **SQLite**, que já vem embutido no Node.js; o banco é o arquivo `data/forgelab.db` dentro da pasta do projeto. Opcionalmente, os dados podem ficar num **Postgres/Supabase** (veja [Banco no Supabase](#banco-no-supabase)).
- **VS Code** com as extensões sugeridas em `.vscode/extensions.json` (opcional).

## Primeira execução (VS Code)

Abra a pasta do projeto no VS Code e, no terminal integrado:

```bash
pnpm install                 # 1. dependências
cp .env.example .env         # 2. configuração (no Windows: copy .env.example .env)
pnpm db:setup                # 3. cria data/forgelab.db, aplica migrations e a seed
pnpm dev                     # 4. inicia frontend + API em http://localhost:3000
```

As mesmas etapas existem como tarefas: **Terminal → Executar Tarefa → “Control Lab: …”**.

### Configurar o `.env`

O arquivo `.env.example` documenta todas as variáveis. As principais:

| Variável | Para que serve |
|---|---|
| `DATABASE_PROVIDER` | `sqlite` (padrão) ou `postgres` (Supabase). |
| `DATABASE_FILE` | Arquivo do banco SQLite (padrão `data/forgelab.db`, relativo à pasta do projeto). |
| `DATABASE_URL`, `DATABASE_SSL` | Conexão com o Postgres/Supabase (somente com `DATABASE_PROVIDER=postgres`). |
| `SESSION_SECRET` | Assina as sessões. Troque por um valor longo e aleatório (≥ 32 caracteres em produção). |
| `SESSION_TTL_HOURS` | Validade da sessão (padrão 12 h). |
| `APP_URL`, `PORT`, `NODE_ENV` | Endereço, porta e ambiente. |
| `SEED_*` | Contas de **desenvolvimento** criadas pela seed. |

Se o banco não puder ser aberto ou ainda não tiver tabelas, o servidor mostra no terminal o motivo e o que fazer (versão do Node, `DATABASE_FILE`, `pnpm db:setup`).

### Contas de desenvolvimento

A seed cria duas contas **apenas para desenvolvimento**, com e-mail e senha definidos no seu `.env` (`SEED_TEACHER_*` e `SEED_STUDENT_*`). Com o `.env.example` sem alterações:

- Docente: valor de `SEED_TEACHER_EMAIL` / `SEED_TEACHER_PASSWORD`
- Aluno: valor de `SEED_STUDENT_EMAIL` / `SEED_STUDENT_PASSWORD`

A interface nunca exibe senhas; em desenvolvimento ela mostra o selo **DEV** e indica onde encontrar as contas. Para contas reais:

```bash
pnpm user:create -- --email maria@escola.br --name "Maria Silva" --role teacher
```

(a senha é pedida no terminal).

## Banco de dados

| Comando | O que faz |
|---|---|
| `pnpm db:setup` | Cria o arquivo do banco se não existir, aplica migrations e roda a seed. Seguro para repetir. |
| `pnpm db:migrate` | Aplica somente as migrations pendentes. |
| `pnpm db:seed` | Roda a seed idempotente (não duplica dados). |
| `pnpm db:generate` | Gera uma nova migration a partir de `drizzle/schema.ts`. |
| `pnpm db:reset` | **Apaga** e recria o banco de desenvolvimento (pede confirmação; bloqueado em produção). Pare o `pnpm dev` antes. |

**Visualizar o banco no VS Code**: instale a extensão sugerida *SQLite Viewer* e clique em `data/forgelab.db`. Backup = copiar esse arquivo (com o `pnpm dev` parado). Estrutura completa em [`docs/BANCO_DE_DADOS.md`](docs/BANCO_DE_DADOS.md).

## Banco no Supabase

O SQLite é o banco principal, mas os mesmos dados podem ficar num Postgres do **Supabase** sem mudar código:

1. No Supabase, crie o projeto e copie a connection string em **Connect → Session pooler**.
2. No `.env` (ou nas variáveis do serviço de hospedagem):
   ```env
   DATABASE_PROVIDER=postgres
   DATABASE_URL=postgresql://postgres.<ref>:<senha>@aws-0-<região>.pooler.supabase.com:5432/postgres
   ```
3. `pnpm db:setup` cria as tabelas (e a seed, fora de produção). Alternativa: colar `drizzle/postgres/0000_controllab_baseline.sql` no SQL Editor do Supabase.

Para voltar ao SQLite, use `DATABASE_PROVIDER=sqlite`. Detalhes em [`docs/BANCO_DE_DADOS.md`](docs/BANCO_DE_DADOS.md#postgres--supabase-uso-temporário).

## Deploy

1. **Hospedagem**: um serviço Node.js de longa duração (Render, Railway, Fly.io…). Vercel/Netlify não servem: o servidor é Express e as imagens enviadas ficam em disco.
2. **Comandos**: build `pnpm install --prod=false && pnpm build` (o `--prod=false` garante as ferramentas de build mesmo com `NODE_ENV=production`); antes de iniciar, `pnpm db:migrate`; start `pnpm start`.
3. **Variáveis**: `NODE_ENV=production`, `SESSION_SECRET` novo (≥ 32 caracteres), `APP_URL`, `DATABASE_PROVIDER`/`DATABASE_URL` (Supabase) ou `DATABASE_FILE` num disco persistente (SQLite), e `UPLOAD_DIR` num disco persistente. Nunca use os valores do `.env.example` em produção.
4. **Contas reais**: `pnpm user:create -- --email ... --name "..." --role teacher` (a seed não roda em produção).
5. **Uploads**: sem disco persistente, fotos de perfil e imagens de módulos somem a cada novo deploy.

## Testes, verificação e build

```bash
pnpm check     # TypeScript
pnpm test      # Vitest (regras de estoque, permissões, sessão, progresso, cronômetro…)
pnpm build     # frontend (Vite) + servidor (esbuild) em dist/
pnpm start     # executa o build de produção (o bundle do servidor já roda em modo production)
```

## Resetar o ambiente local

```bash
pnpm db:reset            # recria banco + seed (pergunta antes)
pnpm uploads:clean       # lista imagens/anexos que nenhum registro usa mais
pnpm uploads:clean -- --yes  # apaga esses arquivos
```

Ou, para começar do zero sem a seed, apague a pasta `data/` e rode `pnpm db:setup -- --no-seed`.

No navegador, “Sair” encerra e revoga a sessão no servidor.

## Estrutura

```
client/        React 19 + Vite + Tailwind 4 + Framer Motion (telas, login, estoque)
server/        Express + tRPC (autenticação, módulos, progresso, estoque)
shared/        regras e validações usadas pelo cliente e pelo servidor
drizzle/       schema SQLite, migration base, versão Postgres/Supabase (postgres/) e histórico MariaDB (legacy/)
scripts/       setup, migração, seed, reset e criação de usuários
docs/          auditoria, permissões, banco e fluxos (+ histórico dos dois projetos)
```

## Documentação

- [Auditoria e decisões da integração](docs/AUDITORIA_INTEGRACAO_DOIS_PROJETOS.md)
- [Permissões e acessos](docs/PERMISSOES_E_ACESSOS.md)
- [Banco de dados](docs/BANCO_DE_DADOS.md)
- [Fluxos do sistema](docs/FLUXOS_DO_SISTEMA.md)
- Histórico dos projetos de origem: `docs/historico/`

> Nunca coloque senhas reais no repositório ou neste README. O `.env` está no `.gitignore`.

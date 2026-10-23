# Fluxos do sistema

Cada fluxo segue o caminho **interface → chamada → validação → autorização → banco → resposta → atualização da interface**. As validações de formulário usam os mesmos schemas do servidor (`shared/inventory-schemas.ts`), e o servidor revalida tudo.

## 1. Login e sessão

1. `/login` → usuário informa e-mail e senha (validação local: formato do e-mail, campos obrigatórios).
2. `auth.login` → limitador de tentativas → busca a conta → compara a senha (scrypt, tempo constante; conta inexistente também executa o hash).
3. Sucesso: revoga a sessão anterior do navegador, cria `auth_sessions` (jti + expiração), grava cookie `httpOnly`, responde só dados públicos.
4. A interface atualiza `auth.me` e redireciona para `next` (validado por `safeRedirectPath`: nunca externo e nunca para rota docente se for aluno).
5. Erro: a senha é limpa, o e-mail permanece, a mensagem aparece no formulário e o foco volta ao campo de senha.
6. Recarregar a página: `auth.me` lê o cookie, o servidor valida JWT + registro + conta ativa.
7. **Logout**: revoga o jti, apaga o cookie, limpa o cache do cliente → `/login`.
8. Sessão expirada/revogada no meio do uso: a próxima chamada protegida retorna 401 → o cliente leva ao login com `next` da página atual.

## 2. Estudo do aluno (preservado do ForgeLab)

1. Biblioteca → abrir módulo → leitor.
2. **Iniciar etapa** → `learning.startStep` (somente aluno; módulo publicado; etapa na sequência) → servidor grava o início. O relógio do cronômetro gira enquanto a etapa está ativa.
3. **Concluir etapa** → `learning.updateProgress` → o servidor calcula os segundos a partir do horário gravado (não confia no cliente), marca a etapa e recalcula o percentual. Reenvio da mesma conclusão é idempotente.
4. Recarregar a página com etapa aberta retoma o cronômetro sem iniciar outra sessão.
5. Docente no leitor: pré-visualiza, vê a disponibilidade dos recursos vinculados ao estoque e não altera progresso.

## 3. Editor docente + vínculo com o estoque

1. Editor → “Recursos técnicos do capítulo” → campo **Item do estoque vinculado** (lista de itens ativos com disponível atual).
2. Salvar → `learning.saveModule` (docente) → o servidor confere que cada item existe; novos vínculos não podem apontar para item arquivado (vínculos antigos com item arquivado são mantidos).
3. No leitor, o docente vê “N disponíveis · situação”; o aluno vê apenas o título do recurso.
4. No detalhe do item do estoque, a seção **Usado nos módulos** lista os módulos/recursos e abre o módulo no leitor.

## 4. Estoque — cadastro

1. Estoque → **Novo item** → código patrimonial (único, normalizado em maiúsculas), SAP opcional (pode repetir), descrição, tipo, categoria, unidade, controle (devolvível/consumível), setor, localização, conservação, disponibilidade, mínimo para alerta, quantidade inicial e origem.
2. `inventory.items.create` → transação: cria o item com saldo 0, registra auditoria e, se houver quantidade inicial, uma **entrada** com motivo (inventário/compra/doação).
3. **Editar**: não altera quantidades. Envia `expectedVersion`; se outra pessoa salvou antes → conflito (recarregar). Unidade bloqueada se houver saldo ou histórico; tipo de controle bloqueado com empréstimos ativos; indisponibilizar bloqueado com reservas. Alterações vão para o histórico de cadastro (antes/depois).
4. **Arquivar** (com motivo, confirmação): bloqueado com empréstimos/reservas; avisa se ainda há saldo físico. **Restaurar** devolve às listas.

## 5. Estoque — movimentações

1. **Movimentar** (no topo, na linha do item ou no detalhe) → item, tipo (Entrada, Saída, Ajuste +, Ajuste −), quantidade, motivo (filtrado pelo tipo), módulo opcional, referência, observação/justificativa.
2. A prévia mostra “saldo físico antes → depois” calculada com as mesmas regras do servidor e já indica bloqueios (ex.: “saldo disponível insuficiente”).
3. `inventory.movements.create` → valida quantidade inteira positiva, motivo compatível, justificativa (ajuste, perda, avaria, outro) → transação com bloqueio da linha → nunca deixa saldo negativo nem saída acima do disponível (reservas são respeitadas) → grava movimentação imutável com snapshot.
4. Duplo clique ou reenvio: mesma `requestKey` → resposta “já registrada”, sem duplicar.

## 6. Estoque — empréstimo

| Etapa | Ação | Efeito no saldo |
|---|---|---|
| Criar | Item devolvível e disponível, quantidade ≤ disponível, quem recebe (aluno cadastrado ou turma/pessoa), finalidade, módulo e devolução prevista opcionais | Reservado + q (disponível − q) |
| Confirmar retirada | Somente “reservado”; repetir não desconta de novo | Físico − q, reservado − q |
| Cancelar | Somente “reservado”, com motivo | Reservado − q |
| Devolver | Somente “retirado”; parcial ou total; bom estado + avaria ≤ pendente; avaria exige descrição | Bom estado: físico + q. Avaria: registrada, não volta ao saldo |

Empréstimos retirados com devolução prevista vencida aparecem como **Atrasado** e geram notificação para o docente.

## 7. Alertas e notificações

- **Estoque baixo**: item ativo com mínimo > 0 e disponível ≤ mínimo. Aparece no resumo, na faixa de alertas da aba Itens, no cartão do dashboard docente, no contador do menu e nas notificações.
- **Empréstimos atrasados**: no resumo e nas notificações do docente.
- Notificações do aluno continuam vindo da agenda e do progresso reais (nenhuma informação de estoque).

## 8. Estados de interface

| Estado | Onde |
|---|---|
| Carregando | Engrenagens (`GearLoader`) na verificação de sessão, no catálogo e nas listas do estoque; botões mostram “Salvando…/Registrando…” com spinner e ficam desabilitados. |
| Vazio | Mensagens específicas por filtro (com “Limpar filtros”) ou com ação para cadastrar. |
| Erro | Bloco com “Tentar novamente”; erros de formulário aparecem dentro do modal sem perder o que foi digitado. |
| Sem permissão | Tela 403 para alunos em `/estoque`. |
| Rota inexistente | Tela 404 no shell. |

## Roteiro de verificação manual

Execute depois de `pnpm db:setup` e `pnpm dev`:

1. **Login inválido**: senha errada → mensagem genérica, e-mail preservado.
2. **Aluno**: entrar com a conta de aluno do `.env`. O menu não mostra “Estoque”. Digitar `http://localhost:3000/estoque` → tela 403. No console do navegador, `fetch('/api/trpc/inventory.summary')` → erro `FORBIDDEN`.
3. **Progresso**: abrir “Matriz de molde” → Iniciar etapa → o relógio gira → Concluir → progresso 25%. Recarregar a página: continua 25%.
4. **Sair** e entrar como **docente**: menu “Modo docente” com Editor e Estoque (contador de alerta = 1 pelo inserto).
5. **Estoque**: o resumo mostra 9 itens, 1 em estoque baixo, 2 empréstimos ativos. Filtro “Estoque baixo” lista o inserto.
6. **Saída acima do disponível**: Movimentar → inserto → Saída 20 → a prévia e o servidor bloqueiam.
7. **Empréstimo**: Emprestar → Broca → 2 unidades → Reservar (disponível 18 → 16) → Empréstimos → Confirmar retirada (físico 20 → 18) → Registrar devolução 1 boa + 1 com avaria → físico 19, empréstimo “Devolvido”, histórico com os dois movimentos.
8. **Integração**: Editor → módulo Operação de torno → recurso “Inserto” já vinculado → o leitor (docente) mostra “8 UN disponíveis · Estoque baixo”. Arquivar um item vinculado sem empréstimos → o módulo continua mostrando o título do recurso.
9. **Tema**: alternar claro/escuro no login, no dashboard e no estoque (modais incluídos).
10. **Responsividade**: largura de 375 px → tabelas viram cartões, menu lateral abre como gaveta com “Sair”, modais ocupam a parte inferior da tela.
11. **Teclado**: Tab percorre login, menu e formulários com foco visível; Esc fecha modais (exceto durante um envio).
12. **Movimento reduzido**: com “reduzir movimento” no sistema operacional, as engrenagens e as entradas dos cards param; o layout permanece igual.

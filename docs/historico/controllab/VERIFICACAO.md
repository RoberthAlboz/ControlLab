# Verificação de comportamento — ControlLab

Data: 2026-10-01. Papel: QA. Agente: `behavior-qa`. Run: `2026-10-01-website-reassessment`.

Estado: **passou no escopo de comportamento**. Versão final sinalizada pelo coordenador: sintaxe válida e **29/29 testes passaram**, sem falhas ou skips. O preflight formal e a avaliação em navegador continuam fora da evidência concluída.

## Escopo e autorização

Contrato imutável: `Contracts/behavior-qa.json`. Foram lidos o papel QA, Access Policy, Run Protocol e as duas fontes selecionadas: `ControlLab-contexto-prototipo.md` e `ControlLab-estudo-UX.md`.

A aplicação permaneceu somente leitura em `dist/app.js`, `dist/index.html` e `dist/styles.css`. Esta tarefa escreveu apenas:

- `/workspace/scratch/0de3be651357/verification/tests/controllab.test.cjs`
- `Projects/ControlLab/Runs/2026-10-01-website-reassessment/Artifacts/08-verification.md`

Sem Sites, GitHub, publicação, modificação de registry, uso de navegador ou delegação. O registro/preflight formal completo permanece **bloqueado** porque ControlLab não consta no `vault.json` remoto, conforme o contrato e o coordenador. Não foi inventada aprovação nem alterado o contrato. As restrições declarativas de papel/tarefa foram seguidas; elas não equivalem a isolamento técnico dos tools herdados.

## Método e comandos

Harness sem dependências externas, usando apenas módulos nativos do Node (`node:test`, `assert`, `fs`, `path`, `vm`, `crypto`). Cada cenário executa o `app.js` verdadeiro em um VM novo. A fonte é lida uma vez por processo e seu SHA-256 é exibido no início da execução, evitando misturar revisões dentro da mesma suíte. O teste é portátil: usa `CONTROLLAB_SOURCE` quando fornecido e, caso contrário, resolve `../dist/app.js` a partir de `tests/`.

Os listeners reais `app.addEventListener('click'/'submit')`, os listeners de campos e os listeners de `window` recebem eventos sintéticos. Os stubs fornecem árvore DOM, valores e um `FormData` falso. Assertions inspecionam o HTML gerado, os erros associados a campos e snapshots de `state`. Helpers de teste só encadeiam eventos de interface; não implementam regras de solicitação, reserva, entrega ou devolução.

Checks autorizados:

```text
syntax:
node --check /workspace/scratch/0de3be651357/.sites-checkout/dist/app.js

behavior:
CONTROLLAB_SOURCE=/workspace/scratch/0de3be651357/.sites-checkout/dist/app.js node --test /workspace/scratch/0de3be651357/verification/tests/controllab.test.cjs
```

O coordenador autorizou expressamente a adaptação portátil e o uso desta variável no check `behavior`, ficando responsável por registrar a definição atualizada no contrato. O QA não editou seu próprio contrato.

## Evidência atual

| Execução | Resultado | Evidência |
| --- | --- | --- |
| Sintaxe após primeiro patch | Exit 0 | `node --check`, sem erro de parsing |
| Baseline do harness adaptado ao primeiro patch | 27/27 passaram; exit 0 | SHA-256 `0b97ad70ede49a24275c86a33d3c4ce1eb6a31e6ddb421739f73976699bb6df8`; ~999 ms |
| Assertions reforçadas de erro associado e prévia antes/depois | 26/27 passaram; exit 1; 0 skipped | SHA-256 `525cef2a0ac915775baeeeb6db02ff140a944d8af9ca679fa3d3d519632d2468`; ~1032 ms |
| Verificação anterior de comportamento, incluindo proteção do local | 28/28 passaram; exit 0; 0 falhas; 0 skipped | SHA-256 `9adf20a761f2dc05bb562bb7c46b2f5d2bc93e99ff2241531a288344d5107651`; ~1210 ms |
| Verificação final de sintaxe após correção de restauração do estoque | Exit 0 | `node --check` sobre a versão final sinalizada pelo coordenador |
| Verificação final de comportamento, incluindo reset → continuar no estoque | **29/29 passaram; exit 0; 0 falhas; 0 skipped** | SHA-256 `7272cf97ba722e830143199f49cff1b62e863f06ddf022955a80c1662de12afa`; ~1097 ms |

A única falha intermediária foi corrigida pelo coordenador: o caso 07 agora preserva o pedido e associa o erro ao campo `decision-reason` com `aria-invalid="true"` e `aria-describedby`. A execução final também verifica setor/local preservados quando há pedido, além dos participantes renderizados no detalhe da entrega. A aplicação não foi editada pelo QA.

A revisão posterior do coordenador identificou uma regressão na restauração do formulário de estoque: após reset → continuar, a quantidade digitada voltava, mas a prévia ficava em 1. O teste 25 executa essa sequência pelos listeners reais com item 02 e quantidade 5; após fechar o reset, seletor e input são preservados e a prévia continua em **17 UN**, sem movimentar o estoque. A correção da aplicação foi feita pelo coordenador, justificando esta última reexecução.

## Cobertura observada

| Cenário | Evidência do comportamento | Estado atual |
| --- | --- | --- |
| Percurso principal 20→18 por perfis | Envio: 20/0/20; aprovação: 20/2/18; retirada: 18/0/18. Solicitante, aprovador, entregador e recebedor identificados no estado/histórico | Passou |
| Repetição de entrega | Mesmos itens, pedidos, devoluções e histórico; mensagem de retirada já confirmada | Passou |
| Cancelamento antes da entrega | Reserva liberada, físico preservado; motivo armazenado e visível | Passou |
| Cancelamento após entrega e repetição de cancelamento | Eventos de controles obsoletos não alteram estado nem duplicam histórico | Passou |
| Rejeição com justificativa | Estoque preservado; motivo aparece no detalhe para a aluna | Passou |
| Rejeição sem justificativa | Pedido preservado; mensagem de correção associada ao campo | Passou |
| Autoaprovação docente | Pedido e estoque preservados; Sobre apresenta a restrição como hipótese/pendência | Passou |
| Quantidade inválida na solicitação | Zero, negativa, fracionária, acima do disponível e não numérica: nenhum pedido/modal de confirmação; erro associado ao campo | 5 passaram |
| Motivo vazio na solicitação | Nenhum pedido/modal; erro associado ao campo | Passou |
| Devolução parcial | 1 de 2 devolvidas, origem/responsável preservados; físico 19, disponível 19, pendente 1 | Passou |
| Devolução danificada | Físico/disponível continuam em 18; retorno em conferência e quantidade danificada registrada | Passou |
| Devolução acima da pendente | Estado/histórico preservados; erro associado à quantidade | Passou |
| Consumível | Não aparece ação natural de devolução; evento obsoleto não registra retorno nem aumenta estoque | Passou |
| Edição de unidade | Troca bloqueada com saldo, e também com físico zero mas pedido/histórico; valores injetados não mudam a unidade | 2 passaram |
| Seletores de edição | Item de exemplo criado por eventos mantém JG, Mecânica e SAP textual `1074050/1` ao reabrir | Passou |
| Proteção do local | Com pedido existente, tentativas de trocar setor ou localização preservam cadastro e indicam erro no campo | Passou |
| Rotas inválidas | Hash malformado não lança exception; solicitação de ID inexistente não substitui silenciosamente o item | 2 passaram |
| Referências de histórico | Entrada `REC-QA-001` é texto, sem link fictício; pedido real mantém link | Passou |
| Prévia de estoque | Seleção do item 02 mostra seu nome/saldo 12; quantidade 3 projeta físico 15 | Passou |
| Confirmações por perfil indevido | Aluna não aprova nem entrega via evento de confirmação obsoleto | Passou |
| Escape | Fecha modal/menu pelos listeners reais | Passou |
| Reset → continuar no estoque | Item 02, input 5 e prévia 17 preservados; estado de estoque/histórico sem movimento | Passou |

São 29 testes executados, incluindo os cinco valores inválidos como cenários separados. O percurso principal confere também os quatro rótulos/valores de participantes no HTML do detalhe: Solicitante, Aprovador, Entregue por e Recebido por.

## Limites e hipóteses

- Não houve QA visual ou em navegador. Desktop/mobile, contraste renderizado, zoom, reflow, leitores de tela, hit testing e foco real precisam de DOM/browser reais.
- O foco dentro de um modal (**focus trap**), a restauração efetiva do foco e navegação completa por teclado não são certificados por estes stubs. O teste de Escape demonstra apenas resposta dos listeners.
- `reportValidity()` é um stub; eventos de submit podem atingir a lógica mesmo com valores que o navegador normalmente bloquearia. Isso verifica as guardas da própria aplicação, sem afirmar equivalência com validação nativa.
- `FormData` falso permite valores explícitos, inclusive dados injetados em testes de controles obsoletos; não comprova comportamento completo do FormData nativo, disabled fields ou eventos de navegador.
- Reserva, permissões por perfil, autoaprovação, classificação de itens e regras de devolução são hipóteses demonstrativas. A seleção de perfil e as guardas locais não comprovam autorização real, concorrência, integridade operacional nem persistência.
- A suíte não demonstra aceitação do cliente ou conformidade WCAG. As fontes documentais foram usadas como critérios, sem pesquisa com usuários nesta tarefa.

Próxima ação: coordenador integrar o teste portátil no caminho permitido e manter esta evidência vinculada à revisão correspondente. A conclusão deste check não remove o bloqueio do preflight formal nem substitui uma avaliação visual/teclado em navegador.

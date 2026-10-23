# ControlLab — revisão independente do baseline

- Papel: `flow-reviewer` / reviewer; execução independente da implementação.
- Data: 2026-10-01.
- Baseline informado pelo coordenador: `c0c949889caa72dc6eb0c9bc6ace76b199dd45d2`.
- Arquivos inspecionados, somente leitura: `dist/app.js`, `dist/styles.css`, `dist/index.html` em `/workspace/scratch/0de3be651357/.sites-checkout`.
- Critérios: `ControlLab-contexto-prototipo.md` e `ControlLab-estudo-UX.md`, selecionados no contrato.
- Disposição final do diff: **pass-with-limitations** para as correções locais de fluxo revisadas. Não restam bloqueadores altos/médios desses percursos identificados pela inspeção; cobertura integral do briefing e QA visual/assistivo permanecem não comprovados.
- Disposição do baseline: **needs-work**. Os achados originais abaixo são mantidos para rastreabilidade; a seção final registra suas correções.

## Evidência e limites

O contrato, o papel Independent reviewer, Run Protocol e Access Policy foram lidos. A revisão usou trechos reais do baseline, sem depender do relato do implementador. Os passos abaixo são reproduções deduzidas de handlers e templates; **não foram executados em navegador**. Nenhum browser QA estava disponível. Não alego validação visual, aceitação do cliente, conformidade WCAG, autenticação ou integridade operacional.

Na revisão inicial do baseline, check nomeado executado: `node --check dist/app.js`, com diretório de trabalho `.sites-checkout`: **exit 0**, sem diagnóstico de sintaxe. Não foram escritos testes ou executados checks arbitrários/VM, porque naquele momento o contrato nomeava apenas `syntax`. O coordenador adicionou `diff` para a revisão final; o trabalhador não alterou o contrato.

O coordenador informou que ControlLab ainda não está registrado em `vault.json` e que o preflight completo do checker depende desse registro ausente. Esse arquivo não foi inspecionado nesta revisão. O contrato foi seguido como limitação declarativa; **não há aprovação técnica do checker nem isolamento de ferramentas comprovado**. A revisão não utilizou Sites, GitHub, publicação ou delegação. A revisão Git informada não foi autenticada por inspeção do repositório.

Severidades: **alta** afeta coerência dos dados ou operação por teclado de ações centrais; **média** impede entender ou completar uma etapa corretamente; **baixa** reduz clareza sem invalidar o saldo do percurso simples.

## Achados priorizados

### R1 — Alta — Editar unidade/local reinterpreta pedidos e saldos anteriores; seletores não preservam o cadastro

**Localização:** `dist/app.js:415,548` (editor/gravação); `268,294,317,329,330` (telas consultam cadastro atual); `479,495,508` (unidade copiada para o histórico).

**Reprodução:** concluir uma retirada de 2 UN da broca; na visão administrativa, editar a broca e selecionar JG, salvar. O saldo físico 18 e o pedido anterior passam a aparecer em JG; a devolução também usa a nova unidade, mas o evento anterior de retirada continua em UN. Alterar a localização muda retrospectivamente “Retirada em” no detalhe desse pedido, sem evento indicando a mudança.

Há um segundo caminho involuntário: abrir o editor do inserto, que é de Mecânica, e salvar sem mudar campos. O seletor de setor inicia em Ferramentaria. Depois de criar/editar um item em JG, reabrir o editor inicia a unidade em UN; salvar uma mudança de descrição pode trocar novamente a unidade.

**Evidência:** o template usa `<option>UN</option><option>JG</option>` e `<option>Ferramentaria</option><option>Mecânica</option>` sem seleção baseada no item. `Object.assign(item,{...,unit:...,area:...,location:...})` sobrescreve o cadastro e preserva os números/vínculos. Pedidos armazenam `itemId` e quantidade, sem unidade/local de origem; as telas usam `item.unit`/`item.location` atuais.

**Proposta:** preencher os seletores com os valores atuais; impedir troca de unidade quando houver saldo ou pedidos/movimentos vinculados, explicando o motivo. Guardar unidade e local relevantes no pedido/evento para conservar a origem das ações concluídas. Uma mudança cadastral não deve representar conversão silenciosa de UN para JG.

**Limite:** inconsistência local de demonstração, sem alegação de estoque real. Corrigir apenas os defaults não elimina a reinterpretação por mudança deliberada de unidade.

### R2 — Alta — Modal permite foco/ação no fundo e não devolve foco ao fechar

**Localização:** `dist/app.js:152,392–417,440,466,520–521,570–571`; `dist/styles.css:324–325`.

**Reprodução:** abrir uma confirmação pelo teclado. O foco inicial vai a Fechar. Shift+Tab nesse primeiro controle, ou Tab após o último, permite alcançar navegação/controles do fundo. `aria-modal="true"` não bloqueia esses elementos. Fechar com Escape/Voltar recria a página e remove o elemento focado, sem restaurar foco ao acionador. Se uma rota do fundo for ativada, o `hashchange` foca `main-content`, mesmo com o modal aberto.

**Evidência:** não há tratamento de Tab/Shift+Tab, `inert`, remoção dos controles do fundo da ordem de foco ou restauração de foco. `setModal` chama `render()` e foca apenas Fechar; fechamento chama novo `render()`. O handler de teclado contempla somente Escape.

**Proposta:** conter foco no diálogo, tornar o fundo inerte e restaurar foco ao acionador. Atualizar o modal sem substituir indiscriminadamente o formulário, ou restaurar estado/foco por identificadores estáveis. O menu móvel recolhido também deve ficar fora da navegação de teclado: atualmente sai da tela apenas por `transform`.

**Limite:** a ordem exata exige browser/tecnologia assistiva. A ausência dos mecanismos e os controles ativos no DOM são demonstráveis pela inspeção.

### R3 — Média — “Revisar” apaga quantidade e motivo digitados

**Localização:** `dist/app.js:256,258,397,440,466,520,554–559`.

**Reprodução:** solicitar a broca com 3 UN e motivo próprio; enviar para aprovação; clicar Revisar. O formulário é recriado com `value="2"` e “Atividade demonstrativa de usinagem”. Fechar pelo X/Escape produz o mesmo efeito. Um novo envio confirma os defaults em vez dos valores revisados.

**Evidência:** o draft existe somente em `state.modal.draft`; `renderRequestForm` não o lê. Abrir/fechar modal substitui `app.innerHTML`.

**Proposta:** conservar um draft de formulário separado do modal ou manter o formulário montado. Rever/fechar deve retornar aos valores informados.

### R4 — Média — Justificativa de rejeição fica inacessível para a aluna

**Localização:** `dist/app.js:294,297,424,482–483`.

**Reprodução:** Tiago rejeita pedido de Beatriz com “Quantidade não autorizada para esta atividade”. Voltar ao perfil Beatriz e abrir o pedido rejeitado. A tela diz “Consulte o motivo registrado”, mas mostra só o motivo original da solicitação. `reasonDecision` não é renderizado em nenhuma tela; a justificativa aparece no histórico, indisponível para aluno.

**Proposta:** mostrar justificativa da decisão no detalhe e explicar o próximo passo. Para cancelamento, o briefing também pede justificativa, mas o modal não coleta uma e o histórico registra “Registro preservado”; completar essa simulação local ou declarar sua cobertura incompleta.

**Limite:** cancelamento aprovado libera reserva corretamente no caminho exposto. `cancelRequest` sem guarda de status não foi classificado como falha reproduzida de UI: o botão só é gerado para Solicitada/Aprovada.

### R5 — Média — Detalhe da retirada não identifica quem entregou

**Localização:** `dist/app.js:291,297,494–495`.

**Reprodução:** Beatriz solicita; Tiago aprova; Helena entrega. O detalhe registra em “Entrega” e na etapa Retirada o nome de Beatriz, recebedora. `deliveredBy='Helena Duarte'` é gravado, mas não utilizado pelo template. A aluna, sem histórico, não identifica ali a operadora da entrega.

**Proposta:** mostrar Entregador e Recebedor com rótulos distintos e os campos já existentes, além de solicitante/aprovador. O histórico já preserva Helena como autora da retirada.

### R6 — Média — Docente pode aprovar a própria solicitação no cenário

**Localização:** `dist/app.js:257,303–308,473–479,535,558`.

**Reprodução:** selecionar Tiago; criar solicitação pelo catálogo; abrir Aprovações e aprovar o próprio pedido. A autorização considera apenas `role.type==='teacher'`, sem comparar solicitante/aprovador; aplica a reserva normalmente.

**Critério:** o briefing deixa autoaprovação pendente, mas pede solicitante/aprovador diferentes no roteiro e que a restrição seja apresentada como hipótese.

**Proposta:** impedir essa autoaprovação na demonstração e explicar junto da ação que é uma hipótese a validar. Não transformar isso em alegação de segurança real.

### R7 — Média — Referências de entradas/ajustes levam a solicitações inexistentes

**Localização:** `dist/app.js:343,355,563–566`.

**Reprodução:** Helena registra entrada com referência `ENTRADA-DEMO`; abrir Histórico e clicar a referência. Toda referência vira `#/solicitacoes/<ref>`; resulta em “Solicitação não encontrada”. Ajuste com referência livre tem o mesmo problema.

**Proposta:** ligar à solicitação somente quando houver vínculo real com pedido do cenário. Para referências livres, mostrar texto e detalhe do evento com item, unidade, local, autor e referência. O ícone de arquivo da linha não abre evento atualmente.

**Limite adicional:** `addHistory` não registra local e o histórico não o exibe; momento é apenas “Demonstração local”, sem data/hora fictícia. Campos, abertura de evento e filtros por item/período previstos no briefing estão incompletos. São lacunas locais, sem necessidade de backend.

### R8 — Média — Prévia de estoque descreve sempre o primeiro item

**Localização:** `dist/app.js:347,352,358,445–453,563–565`.

**Reprodução:** Helena abre Entradas e ajustes; seleciona inserto, físico inicial 12. A lateral “Saldo antes da simulação” continua mostrando broca, físico 20. Não há listener para `stock-item` e `renderStock` usa `state.items[0]`. Entrada de 1 atualiza corretamente inserto para 13, mas a decisão foi acompanhada por prévia de outro item.

**Proposta:** manter seleção em estado e atualizar item, unidade, local e saldo antes/depois conforme seleção/quantidade. A confirmação deve resumir o movimento demonstrativo aplicado.

### R9 — Média — Hash malformado interrompe renderização; item inválido escolhe a broca silenciosamente

**Localização:** `dist/app.js:103–106,249–250,420–429,570–573`.

**Reprodução A:** abrir página com `#/itens/%ZZ`. `decodeURIComponent('%ZZ')` lança `URIError`; não há captura antes do `render()` inicial. Em carga inicial, `app` permanece vazio em vez de exibir recuperação.

**Reprodução B:** abrir `#/solicitar/ITEM-INEXISTENTE`. `getItem(itemId) || state.items[0]` preenche nova solicitação da broca, em vez de dizer que o item não existe.

**Proposta:** tratar decodificação inválida como rota recuperável; mostrar erro/retorno ao catálogo para ID inexistente. Não selecionar outro item implicitamente.

**Limite:** links internos codificam IDs. Reprodução A é deep link incorreto/manual, não navegação interna comum.

## Cobertura demonstrada pelo código

| Percurso/estado | Resultado deduzido dos handlers | Evidência |
| --- | --- | --- |
| Broca inicial | físico 20, reservado 0, disponível 20 | `app.js:45,91` |
| Solicitar 2 | Solicitada; saldo 20 / 0 / 20 | `554–559,524–528` |
| Aprovar 2 | físico 20, reservado 2, disponível 18 | `473–480` |
| Entregar 2 | físico 18, reservado 0, disponível 18 | `488–496` |
| Repetir retirada | mensagem explícita; sem novo desconto | `490,540` |
| Cancelar aprovação | reduz reserva em 2; físico permanece 20 | `467–471` |
| Rejeitar | não muda físico/reservado; motivo no histórico | `481–484` |
| Devolver 1 de 2, não danificado | pendente 1; físico 18→19 | `498–509` |
| Devolver danificado | Aguardando conferência; físico não aumenta | `505–509` |
| Devolver acima da pendente | validação numérica e mensagem | `410,503,542` |
| Busca vazia / aprovação sem saldo | estados específicos | `210–223,307,477` |

Resultados pressupõem unidade inalterada, conforme R1. Trocar perfil preserva pedidos, usando Beatriz/Tiago/Helena; são fictícios, embora diferentes dos nomes escolhidos no briefing.

## Recursos informativos ou incompletos, sem ampliar escopo

| Recurso | O que existe no baseline | Limite contra o briefing |
| --- | --- | --- |
| Locais | lista derivada dos itens; Adicionar local abre explicação (`364,547`) | Não cria/edita exemplo de local; botão promete adição antes de revelar limitação. |
| Pessoas/permissões | tabela estática de três perfis com aviso demonstrativo (`365`) | Sem criar/editar pessoas/autorizações locais. Separação conceitual entre aprovar e operar estoque existe. |
| Ajuste / estorno | grava quantidade/justificativa no histórico, sem mudar saldo (`566`) | É proposta/conferência; não demonstra ajuste/estorno físico antes/depois. Descrever como tal. |
| Cadastro de item | descrição, SAP texto, unidade, setor, localização (`415,548`) | Sem tipo/classificação/foto; novo item fica Tipo a classificar*, sem como resolver classificação. |
| Catálogo/detalhe | busca, setor, disponibilidade, identificação, local, saldos | Filtro por tipo, falta de foto na lista e Localização não informada incompletos. Painel contém pedidos ativos, não histórico resumido do item. |
| Solicitações/histórico | filtro por estado; histórico por tipo/responsável | Filtros por período e por item no histórico ausentes; sem painel próprio de evento. |
| Proveniência | amostra, saldos/locais ilustrativos, fictícios e limites das contagens (`222,235,363,376–382`) | Falta distinguir descrição/SAP do inserto documentados no plano dos campos fictícios: unidade, tipo, local, saldo. “Extração recebida” pode sugerir leitura direta da planilha, não comprovada nas fontes selecionadas. |

Proveniência é uma lacuna **baixa**, não prova de dado real incorreto: não foi acessada planilha/fonte externa. Contagens históricas estão separadas do catálogo e 160 não é usado como físico atual. Não há necessidade de backend, importação real, persistência ou autenticação para resolver estes achados.

## Handoff

Alteração desta função: somente `Projects/ControlLab/Runs/2026-10-01-website-reassessment/Artifacts/07-review.md`; criado também seu diretório pai ausente para permitir a gravação.

Próxima ação: corrigir R1/R2 e demais percursos concretos no estado local autorizado; declarar coberturas informativas; submeter diff para nova revisão independente. Executar QA de browser/teclado quando houver superfície acessível. Sintaxe sozinha não comprova correção dos fluxos.


## Revisão final do diff — 2026-10-01

**Disposição: pass-with-limitations.** As correções dos percursos concretos de R1–R9 estão sustentadas pelo código final. Nenhum bloqueador adicional desses fluxos foi encontrado após os dois ajustes finais de prévia restaurada e menu fechado. Esse resultado se aplica ao diff revisado e não declara implementação integral do briefing: as funcionalidades informativas e a proveniência parcial listadas abaixo continuam limitadas.

O coordenador atualizou o contrato, acrescentando o check `diff` e os comandos exatos, mantendo a aplicação somente leitura para esta função. O diff foi solicitado pela nova atribuição e relido integralmente após o contrato atualizado. O registro formal continua bloqueado pela ausência de ControlLab no cadastro remoto, conforme a declaração do coordenador e `formal_preflight` no contrato. Não houve alteração do registro compartilhado.

Evidência própria da revisão final:

- Check `diff`: `git diff c0c949889caa72dc6eb0c9bc6ace76b199dd45d2 -- dist/app.js dist/styles.css dist/index.html`; exit 0, saída obtida sem truncamento. Houve diferenças somente em `dist/app.js` e `dist/styles.css`; `dist/index.html` não tem diferença nesse comparador.
- Identificação do snapshot lido: índices do diff `24ecfd9..63be18e` para app.js e `f2344da..3899614` para styles.css. São hashes abreviados de blobs mostrados pelo diff, não commits de publicação.
- Check `syntax`: `node --check dist/app.js` no último snapshot; **exit 0**, sem diagnósticos.
- Revisão por leitura dos handlers, templates e CSS alterados, comparando com os trechos baseline e fontes selecionadas. Não foram usados os resultados de QA do implementador para declarar estas correções.
- Nenhum navegador, teste de layout, leitor de tela ou VM foi usado por esta função. A revisão não afirma execução dos percursos por cliques nem conformidade WCAG.

### Disposição dos achados originais

| Achado | Disposição final e evidência no snapshot |
| --- | --- |
| R1 — unidade/setor/local | **Corrigido no código.** Editor seleciona unidade/setor atuais (`app.js:426`). `saveItem` impede mudança de unidade com saldo/registros e de setor/local/tipo quando existem pedidos (`560–579`). Assim, a retirada anterior mantém unidade e local. Histórico inicial e novos eventos conservam nome/local/unidade (`70,479–483,354`). Mudança de local de um item sem pedido continua possível; eventos anteriores de estoque guardam a localização original. |
| R2 — modal/teclado | **Corrigido no código; QA de browser pendente.** Fundo principal/sidebar inertes no modal, loop Tab/Shift+Tab e Escape (`126–149,705–717`), captura de acionador e retorno por ID/ação ou main-content (`499–518`), retorno após decisões/entrega/devolução (`541–542,588,606,617,632`). Botão de envio do pedido tem ID estável (`272`). Menu móvel fechado usa `visibility:hidden`, aberto usa `visible` (`styles.css:363–364`); abrir/fechar preserva foco (`app.js:642–643,715`). |
| R3 — revisão do pedido | **Corrigido no código.** `captureFormDraft`/`restoreFormDraft` conservam campos nomeados, incluindo quantidade/motivo, e `closeModal` restaura antes de devolver foco (`485–518`). |
| R4 — motivos de rejeição/cancelamento | **Corrigido no código.** Detalhe mostra `reasonDecision` ao aluno (`309`); cancelamento coleta motivo, valida, grava e libera reserva conforme estado (`418,582–588,658`). Erro de rejeição é associado ao campo (`661,520–529`). |
| R5 — entregador | **Corrigido no código.** Participantes distinguem Entregue por (`deliveredBy`) e Recebido por (`receiver`) (`301`), preservando autora e recebedora da história. |
| R6 — autoaprovação | **Corrigido no código.** A ação fica desabilitada com motivo explícito e rotulado como hipótese (`318`); handler também rejeita autoaprovação (`590–597`). |
| R7 — referências | **Corrigido o link incorreto.** `historyReference` cria link somente quando há pedido correspondente; referência livre fica como texto (`531–534,354`). História inclui localização original e data/hora da sessão marcada demo (`479–483`). Painel de evento e filtros por item/período continuam ausentes. |
| R8 — prévia de estoque | **Corrigido no código.** Seleção é mantida em `stockItemId`, listeners atualizam prévia/unidade/local com a quantidade digitada (`358–369,462–463,544–558`). Após fechar modal e restaurar stock-form, a prévia é recalculada (`497`). O cenário inserto 12 + quantidade 5 → 17 permanece coerente também após Reiniciar → Continuar. |
| R9 — rotas | **Corrigido no código.** Decodificação inválida é capturada e renderização trata página desconhecida (`107–112,436–437`); solicitar ID inexistente mostra Item não encontrado sem escolher broca (`258–260`). |

O cálculo central permanece: solicitar 2 não reserva; aprovar move 20/0/20 para 20/2/18; retirada move para 18/0/18; repetição retorna mensagem sem descontar novamente. Guardas adicionais restringem decisões/entrega/retorno ao papel demonstrativo adequado e cancelamento aos estados antes da retirada. São controles de cenário local, não autenticação ou autorização real.

### Correções adicionais verificadas

Tabs têm IDs, `aria-controls`, painel associado, seleção explícita e uma parada Tab; setas/Home/End acionam a aba e restauram o foco (`app.js:535–539,361,380,667–668,699–703`). Catálogo ganha filtro por tipo sem recriar o campo de busca a cada letra (`211–218,228,461`). Editor passa a expor classificação demonstrativa do item e preserva o tipo após pedido (`426,573`). Submit nativo de item/devolução é tratado, além dos botões (`678–679`).

O CSS mantém paleta e logotipo, aumenta rótulos/estados e ajusta quebra de cabeçalho/modal em largura reduzida. Há regras de foco, movimento reduzido e rolagem de tabelas. A leitura dessas regras **não confirma** legibilidade, ausência de corte, reflow, contraste final ou comportamento de zoom no layout renderizado.

### Limitações que permanecem

- **Cobertura informativa:** Locais ainda deriva da lista de itens, e Adicionar local apenas explica uma limitação. Pessoas/permissões continuam como tabela, sem criação/edição. Ajuste/estorno registra justificativa e deixa explícito na prévia que o físico depende de conferência; não simula correção de saldo. Não tratar esses recursos como CRUD/ajuste completo.
- **Campos/cenários de apoio:** foto continua opcional sem editor, catálogo não indica ausência de foto na linha, e estado de localização não informada não tem fixture acessível. Não há histórico resumido do item, painel de evento ou filtros de período/item do histórico. O filtro de tipo e a classificação, que faltavam no baseline, agora existem.
- **Proveniência baixa:** a tela Sobre identifica amostra e limites das contagens, mas ainda não separa claramente descrição/SAP documentados no plano dos campos fictícios do inserto. A redação “extração recebida” continua ambígua sobre leitura direta da planilha. Não há evidência de estoque 160 validado sendo usado como saldo físico.
- **Validação:** o fluxo final foi revisado por código; browser, teclado real, zoom, celular e tecnologia assistiva aguardam QA. A aceitação do cliente também não foi medida.

Essas limitações conservam o aceite integral do briefing como **parcial**. Elas não exigem backend, autenticação real ou importador da planilha. A próxima ação do coordenador é incorporar a revisão e a evidência QA separada, apresentar a cobertura com esses limites e programar a validação visual quando houver uma superfície acessível.

Alteração final desta função: somente este `07-review.md`. Nenhuma aplicação, contrato, fonte ou arquivo compartilhado foi editado pelo revisor.

# Reavaliação do ControlLab — 1 de outubro de 2026

## Resultado

O ControlLab continua sendo uma demonstração de interface, adequada para avaliar o fluxo com o cliente. Não deve ser tratado como sistema operacional de estoque. A avaliação levou a correções de consistência, orientação e teclado, preservando os dashboards por perfil, o logotipo, a paleta e a navegação expansível.

## Fontes e execução

- Workflow: `coderTognoli/context-vault`, revisão `cef378864cb319b234752b43abf7c685670b2f70`.
- Código inicial: revisão `c0c949889caa72dc6eb0c9bc6ace76b199dd45d2` do site existente.
- Fontes lidas: `ControlLab-contexto-prototipo.md` e `ControlLab-estudo-UX.md`, de 25/09/2026.
- Papéis executados: coordenação/implementação pelo responsável pelo site; revisor independente e QA em agentes separados, com contratos limitados.
- Os agentes herdam ferramentas em Work; os contratos são limites declarativos, não isolamento técnico.

O ControlLab não consta no `vault.json` remoto. O registro formal da execução e o preflight que exige esse projeto não puderam ser concluídos. Nenhum arquivo compartilhado ou de outro projeto foi alterado. Esta avaliação usa os papéis, escopos e evidências do workflow e deixa a integração formal pendente; não declara aprovação técnica do checker.

## Correções aplicadas

| Problema observado | Comportamento revisado |
| --- | --- |
| Editor usava UN/Ferramentaria como padrão ao editar | Unidade, setor e tipo atuais permanecem selecionados |
| Trocar UN por JG reinterpretava saldo e pedidos | Mudança de unidade bloqueada quando há saldo ou registros; outro cadastro representa outra unidade |
| Alterar local reescrevia a origem de pedidos | Local/setor preservados em itens com pedidos; eventos guardam nome, local e horário da sessão |
| Revisar um pedido apagava a quantidade/motivo digitados | Fechar/revisar o modal recupera o formulário original |
| Motivo de rejeição não aparecia para o aluno | Detalhe apresenta o motivo da rejeição ou do cancelamento |
| Detalhe confundia recebedor e entregador | Participantes identificam aprovador, entregador e recebedor separadamente |
| Prévia de estoque permanecia no primeiro item | Prévia acompanha item e quantidade selecionados, com local, unidade e saldo posterior à entrada |
| Referência livre de entrada abria pedido inexistente | Apenas referências a pedidos existentes são links de solicitação |
| Hash malformado podia interromper a interface | Rota inválida recebe uma tela de recuperação; item inexistente não vira outro item silenciosamente |
| Modais e menu móvel não continham/restauravam foco | Fundo fica inerte; Tab/Escape e retorno ao acionador foram implementados |
| Abas não tinham relação completa com seus painéis | Abas recebem IDs, painéis associados e teclas de navegação |
| Erros dependiam de mensagem temporária | Campos inválidos recebem mensagem associada, indicação e foco |

Foram acrescentadas guardas no movimento demonstrativo: retirada duplicada não desconta novamente, cancelamento após retirada não muda o pedido, autoaprovação não ocorre neste roteiro e devolução de consumível não altera estoque. A decisão sobre autoaprovação continua explicitamente não validada.

O catálogo ganhou o filtro por tipo previsto no briefing. Rótulos de estados, controles e saldos ganharam legibilidade. Os ajustes visuais preservam a identidade existente.

## Verificação e alcance

A revisão independente e o relatório de QA estão nos arquivos desta pasta. Testes automatizados executam a aplicação verdadeira e seus eventos com DOM simulado; não demonstram fidelidade visual, conformidade WCAG, aceitação pelo cliente, autenticação ou segurança operacional. Não houve verificação em navegador real nesta execução: a infraestrutura de preview disponível não atende esta aplicação estática.

## Pendências

1. Validar com uma pessoa de cada perfil o percurso principal, a linguagem e a leitura dos saldos, em desktop/celular e com teclado/zoom.
2. Confirmar momento da reserva, pessoas autorizadas a aprovar/entregar, autoaprovação, consumíveis e regras de devolução.
3. Confirmar escopo do diário e data/duração da apresentação; nenhum prazo novo foi presumido.
4. Locais/pessoas continuam informativos; o ajuste físico não é simulado. Ampliar esses recursos exige uma próxima etapa definida.
5. Registrar o ControlLab no context-vault em uma etapa autorizada de onboarding, preservando o restante do cadastro.
6. Publicação do código atendida nesta entrega em `coderTognoli/ControlLab`, branch `main`, pelo plugin GitHub, após criação do destino pelo proprietário.

As contagens históricas documentadas — 127 registros, 57 movimentações (49 negativas, 8 positivas), 8 SAP repetidos e 14 saldos atualizados zero — foram preservadas. Não se confundem com a amostra de dois itens nem com uma contagem física atual.

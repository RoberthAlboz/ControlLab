# Componentes para a tela de leitor ForgeLab

**Data:** 16 de outubro de 2026

> **Nota de estado atual (21/10/2026):** os testes e inspeções abaixo registram rodadas históricas do leitor. A validação consolidada posterior passou em 11 arquivos e 55 testes; veja [AUDITORIA_E_MELHORIAS.md](../AUDITORIA_E_MELHORIAS.md).

## Padrões selecionados

- **Halo Tabs — Cult UI:** o indicador ativo pode ser uma linha ou uma cápsula que desliza entre opções. A tela de leitor usa categorias para filtrar uma lista, não para alternar painéis independentes; por isso, o padrão visual será adaptado a botões nativos com estado pressionado, sem importar o componente ou suas dependências [1].
- **Halo Progress — Cult UI:** a documentação diferencia progresso determinado, quando a conclusão é mensurável, de progresso indeterminado. O leitor já possui `activeModule.progress` persistido; a interface pode exibi-lo em uma barra determinada e acessível, sem Motion ou Base UI [2].
- **Tabs — shadcn/ui:** abas mostram um painel de conteúdo relacionado por vez. Esse modelo não se aplica diretamente aos filtros de recursos, que mostram uma lista filtrada; manter semântica de grupo de botões evita declarar um padrão de abas que não existe [3].
- **Stepper — Material UI:** uma sequência de passos pode destacar etapas atuais e concluídas e usar conectores para explicar a ordem. O leitor já implementa esse fluxo; o refinamento vai tornar o estado e o avanço mais visíveis sem alterar sua lógica [4].

## Referências

[1]: https://www.cult-ui.com/docs/components/halo-tabs "Cult UI — Halo Tabs"
[2]: https://www.cult-ui.com/docs/components/halo-progress "Cult UI — Halo Progress"
[3]: https://ui.shadcn.com/docs/components/base/tabs "shadcn/ui — Tabs"
[4]: https://mui.com/material-ui/react-stepper/ "Material UI — Stepper"

## Integração realizada

O leitor mostra a porcentagem de progresso já salva em uma barra determinada acessível. A trilha de etapas identifica o passo atual e os concluídos, com conectores preenchidos e rótulos acessíveis. Os filtros de recursos exibem contagens em círculos, usam estado pressionado e quebram em linhas em painéis estreitos. Quando uma categoria não tem recursos, a mensagem é contextual e oferece retorno a Todos. Não foram adicionadas bibliotecas ou alterada a persistência.

A navegação lateral permanece fixa no desktop durante a rolagem e pode rolar internamente quando seu conteúdo ultrapassa a janela; o comportamento móvel existente foi preservado.

## Verificações

- `pnpm check`: aprovado.
- `pnpm test`: 9 arquivos e 32 testes aprovados.
- `pnpm build`: cliente e servidor compilados; permanece apenas o aviso conhecido de bundle JavaScript acima de 500 kB.
- Prévia: o filtro Ferramentas exibiu somente o recurso correspondente; a categoria vazia mostrou a mensagem e o botão de retorno, que restaurou Todos.
- Prévia: após rolar até o fim do leitor, a navegação lateral continuou visível. Os testes foram de leitura/visualização e não alteraram registros do banco.

## Revisão de hierarquia visual

O objetivo do módulo e o progresso salvo agora compartilham uma faixa compacta, em vez de dois blocos independentes. Removi o botão que repetia em toast a instrução já visível e os rótulos de estado redundantes do stepper; os estados continuam acessíveis nos nomes dos botões. O cronômetro e a dica mantêm suas funções, mas com menos molduras, ícones e texto auxiliar. No painel de recursos, miniaturas 3D e seleção de modelos foram retiradas; a lista mostra apenas categoria, descrição e etapa. A visualização principal agora usa a imagem estática associada à etapa, com estado vazio orientando o docente quando ela ainda não existe. A decisão atual substitui qualquer referência anterior a um modelo 3D interativo no leitor; os campos GLB/GLTF do editor e os dados salvos permanecem preservados para uma possível etapa futura. Não foi alterado o backend nem escrito no banco durante a revisão.

Após essa revisão, `pnpm check` passou, os 32 testes passaram e `pnpm build` compilou cliente e servidor. A prévia foi inspecionada no leitor em desktop; a imagem estática e seu estado vazio foram conferidos, sem carregar o visualizador 3D.


## Ajuste de espaçamento do painel de recursos

Os filtros agora mantêm largura natural com intervalos uniformes, evitando esticar a última categoria. Os cartões passaram a ter altura mínima consistente, mais espaço interno e separação visível entre itens; ícone, descrição e etapa ficam alinhados em linhas próprias. As linhas de recursos são informativas e não selecionam modelos 3D.


## Carrossel manual do passo a passo

### Referências consultadas

- [Cult UI — Feature Carousel](https://www.cult-ui.com/docs/components/feature-carousel): referência principal para apresentar uma sequência com guias de etapa, título/descrição, imagem e indicadores de posição. A documentação também destaca responsividade, transições e navegação acessível.
- [Aceternity UI — Apple Cards Carousel](https://ui.aceternity.com/components/apple-cards-carousel): referência complementar para composição visual centrada em conteúdo e imagens em cartões.
- [Nielsen Norman Group — Designing Effective Carousels](https://www.nngroup.com/articles/designing-effective-carousels/): recomenda deixar clara a quantidade e a posição dos itens, manter controles visíveis e fáceis de reconhecer e evitar avanço automático quando o usuário precisa ler o conteúdo.

### Aplicação no ForgeLab

O leitor agora apresenta as etapas como um carrossel manual: guias numeradas com o nome e o estado, uma etapa/imagem por vez, indicador “Etapa X de Y”, botão **Anterior** e a ação existente **Concluir etapa**. O avanço continua usando a regra de conclusão sequencial do módulo; etapas futuras não podem ser abertas antes da conclusão da atual. Não há autoplay. A imagem muda com transição curta respeitando `prefers-reduced-motion`; o estado atual é anunciado por tecnologia assistiva e os controles são botões nativos de teclado. Nenhuma biblioteca de terceiros ou dependência nova foi adicionada.

Os links superiores **Início**, **Módulos** e **Leitor** foram removidos porque as mesmas rotas já existem no menu lateral. O atalho **Editor docente** permanece somente para o perfil docente.

Verificação da implementação: `pnpm check`, 32 testes (`pnpm test`) e `pnpm build` passaram. A prévia confirmou os quatro indicadores de etapa, a imagem/estado vazio, os controles **Anterior** e **Concluir etapa**, os recursos laterais e a navegação lateral. A revisão foi somente visual; nenhum progresso de aluno foi alterado.

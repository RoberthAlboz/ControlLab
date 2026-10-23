# Pesquisa de componentes para a tela inicial ForgeLab

**Data:** 16 de outubro de 2026

## Decisões de interface

A home já apresenta módulos, indicadores gerais, cronograma, anotações e docentes. A pesquisa priorizou componentes que clarificam uma ação existente sem introduzir outra camada permanente de cartões ou efeitos decorativos.

A barra de progresso dos cartões de módulo será substituída por um **indicador segmentado de etapas** quando o servidor fornece o índice de etapas concluídas. O componente usará o estado real sequencial do módulo, um resumo textual e semântica `progressbar` com mínimo, máximo, valor e descrição acessível. Sem dados de etapa válidos — por exemplo, no catálogo local de demonstração — a barra percentual continuará disponível como fallback. O padrão é inspirado nas referências de Progress do Cult UI e do shadcn/ui, mas a implementação será própria, estática e alinhada às cores ForgeLab [1] [2].

Quando uma busca ou um filtro não encontra módulos, a lista exibirá um **estado vazio contextual** com explicação breve. A ação limpará a busca ou retornará à aba “Em andamento”, conforme o motivo do vazio. Esse padrão segue a composição recomendada pelo shadcn/ui — título, descrição e ação — sem importar seus componentes nem dependências [3].

## Referências comparadas

- **Cult UI:** o Halo Progress oferece progresso determinado e indeterminado usando Base UI e Motion. Como o progresso acadêmico é conhecido e deriva das etapas concluídas, será usada apenas a ideia de progresso determinado; strips animadas, springs e dependências adicionais não são necessárias [1].
- **shadcn/ui:** a documentação de Progress recomenda combinar indicador, rótulo e valor; o componente Empty organiza mídia opcional, título, descrição e ação. São padrões adequados para a escala e a estrutura da home [2] [3].
- **Magic UI:** o progresso circular apresenta percentual dentro de um gauge e oferece limites e cores configuráveis. Não será adicionado porque repetiria as métricas existentes e ocuparia espaço que não melhora a decisão “qual módulo continuar?” [4].
- **React Bits:** o Stepper mostra uma sequência de etapas com indicador deslizante e transições spring. A ideia de explicitar a sequência é útil, mas a animação e o fluxo grande não são necessários dentro de cada cartão; adotaremos segmentos compactos e estáticos [5].
- **Aceternity UI:** o catálogo inclui linhas de tempo e efeitos ligados à rolagem. Não serão adicionados à home, pois duplicariam a sequência didática e poderiam ocultar informação em telas menores [6].

A alteração usa markup e CSS próprios, sem copiar código-fonte de terceiros ou adicionar dependências. As referências servem para justificar padrões de hierarquia, progresso e estado vazio; as cores, tipografia, dados, acessibilidade e comportamento permanecem sob controle do ForgeLab.

## Fontes oficiais

[1]: https://www.cult-ui.com/docs/components/halo-progress "Cult UI — Halo Progress"
[2]: https://ui.shadcn.com/docs/components/base/progress "shadcn/ui — Progress"
[3]: https://ui.shadcn.com/docs/components/base/empty "shadcn/ui — Empty"
[4]: https://magicui.design/docs/components/animated-circular-progress-bar "Magic UI — Animated Circular Progress Bar"
[5]: https://reactbits.dev/components/stepper "React Bits — Stepper"
[6]: https://ui.aceternity.com/components "Aceternity UI — catálogo de componentes"


## Atualização — filtros segmentados e contagens — 16/10/2026

A barra de filtros da home passou a usar um **controle segmentado compacto**, inspirado no Halo Segmented do Cult UI. Cada opção mostra a contagem real de módulos antes da busca; o estado selecionado recebe superfície elevada e contraste próprio. Mantivemos `role="group"`, `aria-pressed`, rótulos com quantidade e controles HTML nativos. A animação spring e a dependência Base UI/Motion do componente de referência não foram copiadas. O empty state continua contextual, no padrão composicional do shadcn/ui.

Fontes consultadas nesta atualização: [Cult UI — catálogo de componentes](https://www.cult-ui.com/docs/components/), [Cult UI — Halo Segmented](https://www.cult-ui.com/docs/components/halo-segmented) e [shadcn/ui — Empty](https://ui.shadcn.com/docs/components/base/empty).

# Componentes para a página de módulos ForgeLab

**Data:** 16 de outubro de 2026

> **Nota de estado atual (21/10/2026):** os testes e inspeções abaixo registram rodadas históricas da biblioteca. A validação consolidada posterior passou em 11 arquivos e 55 testes; veja [AUDITORIA_E_MELHORIAS.md](../AUDITORIA_E_MELHORIAS.md).

## Integrações escolhidas

A biblioteca agora tem filtros segmentados por tipo, contagem ao lado de cada opção, estado selecionado acessível (`aria-pressed`) e uma contagem dinâmica dos resultados. O padrão de seleção única do Halo Segmented do Cult UI foi adaptado sem o polegar animado, Base UI ou Motion: os controles permanecem botões nativos com o visual industrial do ForgeLab [1].

Os cartões mostram um badge estático de status. Para o docente, ele informa se o módulo está publicado ou em rascunho; para o aluno, se está não iniciado, em andamento ou concluído. A ideia deriva do uso de badges para rótulos de status, com contadores estáveis, do Halo Badge; não foram usadas animação, ponto pulsante nem dependências novas [2].

Quando filtros ou busca não retornam resultados, a grade dá lugar a um estado vazio com ícone, título, explicação contextual e ação para limpar os filtros. A composição adapta o padrão Empty do shadcn/ui a uma busca real do catálogo [3]. A busca existente permanece conectada a título, descrição e código do módulo.

## Padrões não adotados

O Halo Search acrescenta uma borda em gradiente e uma simulação de carregamento; a busca do catálogo já é síncrona e funcional, portanto esses efeitos não acrescentariam utilidade [4]. O Halo Card foi concebido como superfície destacada com borda animada e acabamento fosco. A página já tem cartões de conteúdo, então foi preservada a composição atual em vez de adicionar uma moldura decorativa [5].

As integrações são JSX e CSS próprios, sem copiar o código-fonte dos componentes e sem instalar bibliotecas adicionais. Os dados, os filtros e o progresso permanecem ligados ao catálogo existente.

## Referências

[1]: https://www.cult-ui.com/docs/components/halo-segmented "Cult UI — Halo Segmented"
[2]: https://www.cult-ui.com/docs/components/halo-badge "Cult UI — Halo Badge"
[3]: https://ui.shadcn.com/docs/components/base/empty "shadcn/ui — Empty"
[4]: https://www.cult-ui.com/docs/components/halo-search "Cult UI — Halo Search"
[5]: https://www.cult-ui.com/docs/components/halo-card "Cult UI — Halo Card"

## Validação

- `pnpm check`: TypeScript aprovado.
- `pnpm test`: 9 arquivos e 32 testes aprovados.
- `pnpm build`: build de cliente e servidor concluído (com o aviso já conhecido de bundle JavaScript acima de 500 kB).
- Prévia do banco de demonstração: filtros do aluno, estado sem resultados e restauração ao limpar filtros conferidos; no perfil docente, badge de rascunho/publicado e botão de novo módulo conferidos.

## Refinamento visual do cabeçalho e filtros

Após a referência visual enviada, o cabeçalho da biblioteca passou a usar um banner vermelho ForgeLab com gradientes, anéis de luz e um brilho lento; a animação é desligada quando o sistema prefere movimento reduzido. Os filtros passaram a ser chips em formato pill, com o filtro ativo em vermelho e contadores circulares, em vez de abas retangulares. A implementação é CSS local e mantém os mesmos filtros e contagens funcionais.

# Pesquisa de componentes para a área de anotações ForgeLab

**Data:** 16 de outubro de 2026  
**Escopo:** padrões oficiais para um diário didático ligado a 12 aulas de 45 minutos; comparação de cinco bibliotecas; foco em leitura, seleção, edição, salvamento e acessibilidade.

## Decisões aplicadas

A tela usa os períodos e as anotações já existentes, sem introduzir um editor rico ou mudar a persistência. O resumo do dia agora apresenta uma faixa segmentada **n/12 períodos com anotação**. O valor conta períodos distintos que de fato possuem um registro na data selecionada; não representa conclusão de conteúdo, aprendizagem ou avanço no curso. O contador é associado a `role="progressbar"`, limites e texto acessível. Os próprios cartões de período continuam sendo os controles de navegação.

O estado vazio identifica a aula que já está selecionada e oferece uma ação contextual. Removemos o botão “+” duplicado do painel lateral; “Nova anotação” e a ação contextual permanecem. No rodapé do editor, a interface informa o armazenamento local do navegador, a quantidade de palavras e a atualização. A mensagem de sucesso só aparece depois de uma gravação local bem-sucedida; uma falha é apresentada como erro. Essa indicação não afirma sincronização com o MariaDB: as anotações permanecem em `localStorage`, conforme a limitação já documentada.

A seleção de dia, período e nota expõe estado pressionado; grupos e campos recebem nomes acessíveis. O modo docente continua somente leitura. Não foram instaladas dependências nem copiados componentes: a implementação é JSX/CSS do próprio ForgeLab, estática e coerente com a identidade branca, preta e vermelha.

## Referências comparadas

| Biblioteca | Padrão avaliado | Decisão para o ForgeLab |
|---|---|---|
| **Cult UI** | Halo Toast, Search, Tabs e Progress. | Toast pode servir apenas para um resultado real de salvamento/erro; Search é uma casca visual, não indexa notas; 12 abas podem ficar densas. Não usar Halo Progress para confundir cobertura de registros com progresso pedagógico. Os componentes copiáveis exigem integração e podem trazer Motion, Sonner, lucide ou Base UI. |
| **shadcn/ui** | Textarea + Field; Sonner; Progress, Command e Empty. | Textarea com rótulo/descrição é o padrão mais direto para o editor simples; Progress requer rótulo e um estado real. Sonner só se houver um resultado a anunciar. Command não substitui uma busca/indexação funcional. A tela mantém controles nativos e feedback próprio, sem novas dependências. |
| **Magic UI** | Animated Circular Progress Bar, Animated List, Blur Fade e Scroll Progress. | Nenhum padrão é necessário para editar, localizar ou salvar notas. Um gauge só faria sentido com estado de conclusão definido; animações de lista/blur e progresso de rolagem foram descartadas como redundantes ou semântica inadequada. |
| **React Bits** | Animated List, Stepper e Line Sidebar. | Animated List oferece seleção por teclado, mas é voltada a itens/eventos animados e usa atraso; Stepper pode sugerir sequência obrigatória, ao contrário da navegação livre por aulas. Nenhum foi adotado. Verificar a licença específica (MIT + Commons Clause) antes de redistribuir o componente isoladamente. |
| **Aceternity UI** | Animated Tabs, Gooey Input e empty states de blocos. | Tabs e input animados não documentam integralmente ARIA, teclado/foco e `prefers-reduced-motion`; não são soluções prontas de navegação/busca. Foram descartados por risco de densidade/ruído e necessidade de prototipar acessibilidade. Empty states genéricos também não correspondiam ao fluxo de aula. |

## Acessibilidade e limites

- O segmento visual é acompanhado por rótulo e valor acessíveis; a cor vermelha não é o único sinal de registro.
- A grade mantém leitura e navegação direta por botões, com `aria-pressed` e foco padrão visível; o campo de texto tem nome acessível.
- O status de erro é anunciado como alerta; a confirmação rotineira usa status educado. O texto não promete persistência além do navegador.
- Evitamos transições, gamificação, indicadores circulares e abas comprimidas. A seleção de período não é progresso de aprendizagem.
- As páginas oficiais de Aceternity e de alguns componentes animados não especificam todos os requisitos de acessibilidade; não presumimos suporte ausente da documentação.

## Fontes oficiais

### Cult UI

- [Halo Toast](https://www.cult-ui.com/docs/components/halo-toast)
- [Halo Search](https://www.cult-ui.com/docs/components/halo-search)
- [Halo Tabs](https://www.cult-ui.com/docs/components/halo-tabs)
- [Halo Progress](https://www.cult-ui.com/docs/components/halo-progress)
- [Instalação](https://www.cult-ui.com/docs/installation)
- [Repositório e licença](https://github.com/nolly-studio/cult-ui)

### shadcn/ui

- [Textarea](https://ui.shadcn.com/docs/components/base/textarea)
- [Field](https://ui.shadcn.com/docs/components/base/field)
- [Progress](https://ui.shadcn.com/docs/components/base/progress)
- [Sonner](https://ui.shadcn.com/docs/components/radix/sonner)
- [Command](https://ui.shadcn.com/docs/components/radix/command)
- [Empty](https://ui.shadcn.com/docs/components/radix/empty)

### Magic UI

- [Animated Circular Progress Bar](https://magicui.design/docs/components/animated-circular-progress-bar)
- [Animated List](https://magicui.design/docs/components/animated-list)
- [Blur Fade — documentação v3](https://v3.magicui.design/docs/components/blur-fade)
- [Scroll Progress — documentação v3](https://v3.magicui.design/docs/components/scroll-progress)
- [Repositório](https://github.com/magicuidesign/magicui)

### React Bits

- [Animated List](https://reactbits.dev/components/animated-list)
- [Stepper](https://reactbits.dev/components/stepper)
- [Line Sidebar](https://reactbits.dev/components/line-sidebar)
- [Instalação](https://reactbits.dev/get-started/installation)
- [Introdução](https://reactbits.dev/get-started/introduction)
- [Licença](https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md)

### Aceternity UI

- [Animated Tabs](https://ui.aceternity.com/components/tabs)
- [Gooey Input](https://ui.aceternity.com/components/gooey-input)
- [Componentes de formulário](https://ui.aceternity.com/categories/form)
- [Blocos de estado vazio](https://ui.aceternity.com/blocks/empty-states)
- [Preços e acesso](https://ui.aceternity.com/pricing)


## Atualização — kit de escrita guiada — 16/10/2026

O editor ganhou chips para inserir os tópicos **Procedimento**, **Medida** e **Dúvida para revisar**. Cada ação acrescenta um marcador uma única vez à anotação existente; o campo continua editável, com salvamento local automático e leitura somente no modo docente. O padrão visual de campo com rótulo e ajuda segue a composição de Field/FieldDescription do shadcn/ui e o Halo Field do Cult UI. A inspiração é adaptada sem animação de borda, sem novas dependências e sem prometer sincronização. A instrução associada ao campo orienta o registro de procedimentos, medidas observadas e dúvidas da aula.

Fontes consultadas nesta atualização: [Cult UI — Halo Field](https://www.cult-ui.com/docs/components/halo-field), [shadcn/ui — Field](https://ui.shadcn.com/docs/components/base/field) e [shadcn/ui — Textarea](https://ui.shadcn.com/docs/components/base/textarea).

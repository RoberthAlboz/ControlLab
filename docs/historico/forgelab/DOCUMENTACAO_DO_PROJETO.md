# Documentação resumida — Livro Didático Digital de Ferramentaria

## Objetivo

O projeto é um protótipo de ambiente educacional para apoiar o ensino de ferramentaria. Ele reúne módulos didáticos, tutoriais por etapas, recursos 3D, acompanhamento de progresso, anotações de aula e um cronograma compartilhado entre a área do aluno e a área docente.

## O que já foi desenvolvido

- **Área do aluno:** dashboard com módulos, indicadores de progresso, perfil, docentes, próximas atividades e acesso às anotações.
- **Livro digital modular:** biblioteca por tipo de conteúdo, leitor com etapas sequenciais, objetivos, instruções e dicas. O aluno só avança para a etapa liberada.
- **Recursos visuais e 3D:** visualizador interativo de modelos GLTF/GLB, com zoom e rotação, além de cards de materiais, máquinas, ferramentas e peças.
- **Área docente:** criação, edição, publicação e exclusão de módulos; gerenciamento de etapas e inclusão de imagens e referências para modelos 3D.
- **Progresso e permissões:** o servidor calcula o progresso, impede saltos de etapas e restringe operações docentes a contas administrativas. O catálogo do aluno omite rascunhos.
- **Perfil e interface:** troca de foto com prévia imediata, glow discreto no avatar, tema claro/escuro, layout responsivo e melhorias de teclado/foco na central de notificações. A marca ForgeLab fica no cabeçalho, sem repetição no menu lateral.
- **Sessão de estudo:** cronômetro de foco no leitor, com meta de 45 minutos, iniciar/pausar/retomar/zerar, barra de progresso e recuperação da sessão no mesmo navegador.
- **Dados e serviços:** aplicação fullstack em React/TypeScript, Express, tRPC, Drizzle e MySQL/MariaDB. A prévia atual usa um banco MariaDB local isolado e sessões de demonstração de aluno e docente.
- **Qualidade e segurança:** validação de URLs GLB/GLTF, validação e armazenamento de imagens, tratamento de progresso no servidor e testes automatizados.

## Identidade visual e experiência de uso

A interface segue a identidade editorial ForgeLab: fundo claro, superfícies brancas, texto preto e vermelho como cor de ação e sinalização. Foram reduzidos gradientes, ornamentos e capas genéricas; os ícones variam conforme a categoria técnica do módulo. Início, Biblioteca e Leitor estão no menu lateral, sem links duplicados no cabeçalho; o atalho de edição docente permanece disponível para esse perfil.

O corpo, os controles e os metadados usam Atkinson Hyperlegible; Manrope cria contraste em títulos e marca. São as duas únicas famílias tipográficas importadas. A base é 16 px para leitura, 14 px para controles e 12 px apenas para metadados curtos. Em telas estreitas, os cartões passam para uma coluna, os filtros permanecem em uma faixa horizontal e o cronômetro fica centralizado no cartão, com ações de largura confortável. O leitor exibe a imagem estática associada a cada etapa como um carrossel manual com guias, posição, controles Anterior/Concluir e sem avanço automático; quando a imagem não foi adicionada, apresenta um estado vazio com orientação ao docente. Não carrega canvas ou arquivos GLB/GLTF. Para reduzir a densidade do dashboard, a seção de docentes inicia recolhida, mostra a quantidade disponível e expande a lista acionável sob demanda.

## Componentes funcionais adicionados à tela inicial

Os cartões de módulos passaram a mostrar uma trilha segmentada quando o banco fornece o número real de etapas concluídas. O indicador substitui a barra percentual anterior, anuncia módulo, valor, limite e texto equivalente a leitores de tela, e não usa animação. Quando não há índice de etapa confiável, a barra percentual acessível permanece como fallback. A regra é coerente com a validação sequencial do servidor.

Quando uma busca ou filtro não encontra módulos, a home apresenta um estado vazio breve e contextual. A ação disponível limpa a busca ou retorna aos módulos em andamento. Os filtros também expõem `aria-pressed` e agrupamento nomeado; nenhum pacote ou código-fonte de terceiros foi adicionado. A pesquisa considerou o Halo Progress do Cult UI, Progress e Empty do shadcn/ui, o indicador circular da Magic UI, Stepper do React Bits e o catálogo da Aceternity UI [11] [12] [13] [14] [15] [16]. Os critérios e os motivos para descartar padrões redundantes ou animados estão em `docs/PESQUISA_COMPONENTES_DASHBOARD.md`.

## Componentes funcionais aplicados à área de anotações

A comparação de Cult UI, shadcn/ui, Magic UI, React Bits e Aceternity UI está registrada em [docs/PESQUISA_COMPONENTES_ANOTACOES.md](docs/PESQUISA_COMPONENTES_ANOTACOES.md), com links para as documentações oficiais. A interface recebeu um indicador de **cobertura de registros** (número de períodos com anotação em 12), estado vazio contextual, uma única ação de criação e rodapé com contagem de palavras e atualização. A cobertura vem dos registros reais por dia e período; não significa conclusão da aula nem progresso pedagógico. Os controles nativos e a tela existente foram mantidos, sem instalar dependências, adotar animações ou copiar componentes.

O diário ainda é salvo em `localStorage`, não no MariaDB. Por isso, a interface só mostra “Salvo automaticamente neste navegador” depois que `setItem` conclui sem erro; se o armazenamento estiver indisponível ou cheio, apresenta um alerta de falha. A indicação não promete sincronização entre dispositivos nem persistência no servidor.

## Lógica do cronograma e das anotações

O cronograma e o diário de aula agora usam a mesma fonte de horários, definida em `shared/class-schedule.ts`. A grade atual contém **12 períodos consecutivos de 45 minutos**, entre **07:45 e 16:45**, de segunda a sexta. Por exemplo, a Aula 3 é **09:15–10:00**.

Para cadastrar uma atividade, o docente escolhe o dia letivo e uma das aulas disponíveis. O sistema calcula o término automaticamente, rejeita finais de semana e não permite duas atividades no mesmo período. Uma atividade ocupa uma aula; se a prática durar mais, ela deve ser dividida em atividades para períodos consecutivos. A atividade é salva no banco e aparece para o aluno e no diário, associada à mesma data e ao mesmo número de aula.

Assim, horários livres antigos como **09:00–11:00** deixam de ser aceitos: 09:00 não é início de um período na grade existente, e uma atividade não pode durar duas horas. A opção mais próxima da grade é 09:15–10:00. A regra é simples de conferir: escolha a aula indicada; cada aula dura 45 minutos e o horário final é automático.

> **Premissa registrada:** a grade atual considera 12 aulas contínuas, sem intervalos cadastrados. Se a escola tiver recreios ou pausas, esses horários precisam ser definidos como intervalos na mesma fonte de grade antes de alterar a duração do dia.

## Processo resumido para documentar novas etapas do trabalho

1. **Registrar a necessidade:** descrever o problema observado e quem é afetado.
2. **Definir a regra de aceite:** escrever como o usuário saberá que a mudança funciona. Exemplo: toda atividade precisa corresponder a uma aula de 45 minutos.
3. **Atualizar a regra central:** manter horários, validações e cálculos em uma fonte compartilhada; não repetir valores fixos em telas diferentes.
4. **Implementar interface e dados:** mostrar controles simples, validar no servidor, aplicar permissões e salvar no banco quando o dado precisar ser compartilhado.
5. **Verificar acessibilidade e telas:** testar teclado, mensagens de erro, celular e desktop; respeitar a preferência por movimento reduzido.
6. **Testar e registrar:** executar testes, verificação TypeScript e build; testar os fluxos principais na prévia e anotar o resultado, a data e limitações pendentes.

### Texto-base para inserir na documentação acadêmica

> O desenvolvimento do protótipo foi realizado de forma incremental para atender aos fluxos de aprendizagem do aluno e de gestão do docente. Foram implementadas a biblioteca de módulos, a leitura sequencial por etapas com imagens estáticas, o acompanhamento do progresso, as funções docentes e um cronograma de 12 aulas de 45 minutos compartilhado com as anotações. Os campos de recursos 3D permanecem no editor, mas a renderização interativa foi retirada do leitor até uma possível etapa futura. A interface recebeu uma revisão editorial responsiva com a identidade ForgeLab, fonte Atkinson Hyperlegible e base de 16 px. O leitor inclui um cronômetro de foco de 45 minutos, com estado armazenado localmente e separado do progresso acadêmico. Regras de acesso e validação são aplicadas no servidor, e os resultados foram verificados por testes automatizados, checagem TypeScript, build e prévia conectada ao MariaDB.

## Timer de foco inspirado no Cult UI

O Cult UI distribui componentes React como código-fonte copiável, não como um pacote de execução obrigatório [8]. A documentação do componente Timer apresenta tempo decorrido e controles de iniciar, parar e zerar [9]. No livro, esse padrão foi adaptado como um cronômetro de foco alinhado ao período letivo de 45 minutos, com barra de progresso, retomada após recarregar e suporte a movimento reduzido. Não foi adicionada dependência externa nem copiado código do registro.

O tempo do timer fica apenas no armazenamento local do navegador. Ele não altera notas, progresso acadêmico ou horas salvas no banco; a interface deixa essa diferença explícita. O repositório do Cult UI publica uma licença MIT, que exige preservar os avisos de licença ao redistribuir cópias substanciais do código [10].

[8]: https://www.cult-ui.com/docs "Cult UI — documentação e visão geral"
[9]: https://www.cult-ui.com/docs/components/timer "Cult UI — Timer"
[10]: https://github.com/nolly-studio/cult-ui/blob/main/LICENSE.md "Cult UI — licença MIT no GitHub"

## Validação desta etapa

- `pnpm check`: passou, sem erros de TypeScript.
- `pnpm test`: **29 testes passaram**, incluindo cinco casos do cronômetro de foco e dois testes de cobertura diária de períodos anotados.
- `pnpm build`: passou. O Vite ainda informa que o bundle principal é grande; isso é um aviso de otimização, não uma falha.
- Teste manual: uma atividade temporária foi criada no painel docente, salva no MariaDB, localizada nas anotações do mesmo dia e período e removida após a verificação.
- Dados de demonstração revisados: as atividades restantes estão em dias letivos e duram exatamente 45 minutos.
- Tipografia: dashboard, biblioteca, leitor e anotações foram conferidos; texto de leitura usa 16 px, controles e rótulos 14 px e metadados curtos 12 px. A fonte carregou corretamente e uma simulação de aumento do texto para 200% não causou rolagem horizontal na tela de anotações.
- Responsividade: em janela móvel de 390 px, o documento não apresenta rolagem horizontal nem textos visíveis abaixo de 12 px; o centro do mostrador do timer coincide com o centro da tela (x=195 px), e a imagem estática da etapa mantém proporção sem rolagem horizontal.
- Docentes: seção recolhida por padrão com botão `aria-expanded` e quantidade visível; ao abrir, apresenta os quatro perfis acionáveis. Os estados recolhido/expandido foram conferidos em 390 px e 1024 px, sem overflow; em notebook a lista usa uma coluna para manter nomes e cargos legíveis.
- Prévia HTTPS: a página respondeu HTTP 200, a sessão de demonstração HTTP 200 e o MariaDB local respondeu ao ping. Na captura mobile HTTPS, não houve aviso de falha de conexão.
- Home — componentes: em 390 px, a sequência segmentada permaneceu dentro do cartão sem overflow visível. Os filtros `Próximos` e `Concluídos` exibiram somente seus módulos; uma busca sem correspondência mostrou o estado vazio, e `Limpar busca` restaurou os cartões. Nenhum dado de teste foi gravado.
- Anotações — componentes: em 390 px, a faixa de dias pôde rolar dentro do próprio contêiner e o documento permaneceu com `scrollWidth` igual à viewport; o progresso mostrou `0/12` e, após uma nota temporária, `1/12`. O teste móvel confirmou o texto de salvamento, o contador e a largura do editor sem overflow; um perfil isolado confirmou que a nota sobrevive ao recarregamento e foi limpo ao final. Uma simulação isolada de falha de quota mostrou “Não foi possível salvar neste navegador” com `role="alert"`/`aria-live="assertive"`, sem alegar sucesso. Nenhum registro de teste permaneceu na prévia.

## Limitações conhecidas

As anotações ainda ficam no armazenamento local do navegador, portanto não são sincronizadas entre dispositivos nem isoladas por conta no servidor. A sessão docente disponível nesta prévia é de demonstração; uma implantação real precisa configurar autenticação, banco e armazenamento de arquivos de produção. As notificações exibidas continuam demonstrativas.

## Referências usadas para a decisão de grade

- O construtor de horários da OpenEduCat explicita duração dos períodos, dias letivos e intervalos como restrições configuráveis [1].
- O exemplo do Timefold representa aulas como intervalos fixos e inclui a regra de impedir aulas simultâneas no mesmo espaço, professor ou grupo [2].
- O repositório público `amrzhd/TimeTable` demonstra a geração de horários recorrentes em blocos de 45 minutos [3].

[1]: https://openeducat.org/tools/timetable-builder/ "Free Timetable Builder — OpenEduCat"
[2]: https://github.com/TimefoldAI/timefold-notebooks/blob/main/python/school-timetabling.ipynb "School timetabling — Timefold notebooks"
[3]: https://github.com/amrzhd/TimeTable "TimeTable — GitHub"


## Tipografia e legibilidade da interface

O corpo e os controles usam Atkinson Hyperlegible, escolhida pela distinção clara entre caracteres, inclusive para leitores com baixa visão [6]. Manrope destaca títulos, marca e indicadores numéricos: sua geometria mais compacta cria contraste com a textura aberta de Atkinson sem deixar o conjunto com aparência de template. São as duas únicas famílias externas do site. A importação usa `preconnect` e `display=swap`, com Atkinson nos pesos 400/700 e Manrope em 400/500/600/700. Códigos, horários e medidas usam a família de leitura, com hierarquia por peso, espaçamento, alinhamento e numerais tabulares, sem uma terceira fonte monoespaçada.

Como referência prática, o USWDS recomenda pelo menos 16 px efetivos para texto corrido, linhas geralmente entre 45 e 90 caracteres e entrelinha de 1,5 para textos longos [5]. A WCAG não impõe 16 px como tamanho padrão: exige que o conteúdo suporte ajustes de espaçamento — como 1,5× de altura de linha — sem perda de conteúdo ou função [4]. O repositório da família Atkinson Hyperlegible Next documenta aprimoramentos de glifos e kerning; nesta interface foi usada a família Atkinson Hyperlegible servida pelo Google Fonts [7]. Por isso, o projeto usa 16 px para leitura, 14 px para controles e rótulos e 12 px somente para metadados curtos; os tamanhos em `rem` acompanham o zoom do navegador.

[4]: https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html "W3C WCAG 2.2 — Understanding SC 1.4.12 Text Spacing"
[5]: https://designsystem.digital.gov/components/typography/ "U.S. Web Design System — Typography"
[6]: https://fonts.google.com/specimen/Atkinson+Hyperlegible "Google Fonts — Atkinson Hyperlegible"
[7]: https://github.com/googlefonts/atkinson-hyperlegible-next "GitHub — Atkinson Hyperlegible Next"
[11]: https://www.cult-ui.com/docs/components/halo-progress "Cult UI — Halo Progress"
[12]: https://ui.shadcn.com/docs/components/base/progress "shadcn/ui — Progress"
[13]: https://ui.shadcn.com/docs/components/base/empty "shadcn/ui — Empty"
[14]: https://magicui.design/docs/components/animated-circular-progress-bar "Magic UI — Animated Circular Progress Bar"
[15]: https://reactbits.dev/components/stepper "React Bits — Stepper"
[16]: https://ui.aceternity.com/components "Aceternity UI — catálogo de componentes"
[17]: https://ui.shadcn.com/docs/components/base/textarea "shadcn/ui — Textarea"
[18]: https://www.cult-ui.com/docs/components/halo-toast "Cult UI — Halo Toast"
[19]: https://magicui.design/docs/components/animated-circular-progress-bar "Magic UI — Animated Circular Progress Bar"
[20]: https://reactbits.dev/components/animated-list "React Bits — Animated List"
[21]: https://ui.aceternity.com/components/tabs "Aceternity UI — Animated Tabs"


## Badges técnicas atribuídas pelo docente — 16/10/2026

A sidebar do aluno exibe somente badges registradas pelo docente para aquele aluno. Concluir etapas ou módulos, publicar conteúdo ou vincular recursos **não cria nem libera badges**. O aluno consulta suas próprias atribuições; o estado vazio explica que ainda não recebeu uma badge.

No painel docente, a seção **Badges dos alunos** permite selecionar um aluno, informar o nome da badge e, opcionalmente, descrever a competência reconhecida. As atribuições ficam na tabela independente `student_badges` com o aluno, o docente que atribuiu e a data. A API protege consulta/atribuição/remoção pelo procedimento administrativo; a consulta do aluno é restrita ao próprio usuário. A badge não possui vínculo com `learning_modules` nem com o progresso do curso.

## Validação dos pontos fortes registrados pelo docente

- `pnpm check`, `pnpm test` (**32 testes em 9 arquivos**) e `pnpm build` passaram; permanece o aviso conhecido de bundle Vite acima de 500 kB.
- A API foi testada no Preview: docente atribui “metrologia de precisão” ao aluno de demonstração; a consulta do aluno recebe o registro sem `moduleId`/`moduleTitle`; o docente pode removê-lo. O registro foi removido ao final, deixando o banco de preview sem badge de teste.
- A sessão demo agora inclui um `VITE_APP_ID` local não secreto, requisito para validar o JWT de preview; o identificador e o segredo real continuam fora do ZIP.

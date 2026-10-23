# Ferramentaria Lab — Protótipo Educacional

Protótipo frontend em React + TypeScript para uma área de aprendizagem guiada de ferramentaria. A nova versão aproxima a composição da referência enviada: layout claro, cabeçalho discreto, título amplo, análise central e cards de recursos na lateral.

## Direção visual

A interface foi simplificada para uma estética **editorial educacional**, inspirada na clareza de plataformas como Khan Academy, Coursera e MIT OpenCourseWare: branco dominante para descanso visual, preto para leitura e vermelho controlado para progresso, estados ativos e chamadas à ação. A prioridade é facilitar o entendimento do tutorial sem cansar visualmente.

## Fluxo prototipado

- Cabeçalho e navegação lateral inspirados na estrutura do dashboard de referência.
- Tutorial em 4 etapas: material bruto, preparar máquina, lapidar/medir e montar peça.
- Leitor com imagens estáticas por etapa, navegação manual e dica do instrutor.
- Cards laterais para material, máquina, ferramenta e mini peças.
- Filtro por categoria e busca de recursos.
- Checklist visual e dica de instrutor.
- Estado de progresso por etapa.
- Layout responsivo para mobile com menu lateral recolhível.

## Fidelidade à referência visual

A composição desktop foi reenquadrada para seguir diretamente a imagem fornecida: moldura externa vermelha, painel de trabalho claro central, trilho vertical de ícones, cabeçalho horizontal com marca e navegação, título editorial amplo, etapa de progresso, painel de imagem estática à esquerda e grade de recursos à direita. A paleta mantém branco e preto como base, usando vermelho também na moldura externa, seleção, progresso e estados ativos.

## Recursos 3D preservados para evolução futura

Os campos de recursos 3D permanecem no editor e no banco. O leitor não tenta renderizar um viewer embutido: quando existe uma URL HTTPS válida `.glb`/`.gltf`, ele oferece uma referência técnica explícita para abertura em outra aba; as imagens exibidas ao aluno continuam sendo estáticas e vinculadas às etapas.

Modelos usados no protótipo:

| Uso | Modelo | Fonte |
|---|---|---|
| Material bruto | Utility Box 01 | [Poly Haven](https://polyhaven.com/a/utility_box_01) |
| Máquina | Drill Press 01 | [Poly Haven](https://polyhaven.com/a/drill_press_01) |
| Ferramenta | Combination Wrench | [Poly Haven](https://polyhaven.com/a/combination_wrench) |
| Mini peças | Metal Tool Chest | [Poly Haven](https://polyhaven.com/a/metal_tool_chest) |

Se o viewer for aprovado no futuro, recomenda-se baixar e versionar os arquivos `.glb`/`.gltf` aprovados, em vez de depender diretamente de URLs remotas.

## Como executar

```bash
pnpm install
pnpm dev
```

### Banco local da prévia

O projeto usa MariaDB/MySQL por meio de `DATABASE_URL`. Em um ambiente local, crie o banco e o usuário da aplicação, configure `DATABASE_URL` e `JWT_SECRET` no `.env`, e sincronize o schema com `pnpm exec drizzle-kit push --force`. O servidor de desenvolvimento inicializa o catálogo demonstrativo de forma idempotente quando o banco está vazio. Faça uma cópia do banco antes de aplicar alterações estruturais; o histórico recebido contém uma entrada antiga sem o arquivo SQL correspondente e, por isso, o fluxo de `migrate` deve ser rebaselined antes de ser usado em produção.

Para validar o build:

```bash
pnpm check
pnpm build
```

## Arquivos principais

- `client/src/pages/Home.tsx` — interface, dados do tutorial e carregamento dos modelos 3D.
- `client/src/index.css` — sistema visual clean, responsividade e componentes de interface.
- `client/src/App.tsx` — entrada da aplicação.
- `client/index.html` — metadados e título.

## Próximos passos sugeridos

1. Decidir se e quando o viewer 3D será reintroduzido no leitor.
2. Hospedar os modelos aprovados no storage próprio somente após essa decisão.
3. Criar o conteúdo detalhado de cada etapa com vídeo, desenho técnico, tolerâncias e validação do aluno.

## Progressão do tutorial

A progressão é apresentada como um carrossel manual: guias numeradas, indicador da etapa atual, imagem estática e controles **Anterior** e **Concluir etapa**. O avanço respeita a conclusão sequencial registrada pelo sistema; não há avanço automático e etapas futuras permanecem indisponíveis até a atual ser concluída.

As quatro etapas prototipadas são: identificação do material bruto, preparação da máquina, lapidação e medição, e montagem final.

## Controles funcionais

A interface foi auditada para que os elementos visíveis tenham comportamento: a busca filtra módulos; os filtros refinam a lista textual de recursos; o menu lateral concentra Início, Biblioteca e Leitor e funciona no mobile; a etapa do leitor exibe a imagem estática enviada pelo docente, sem carregar modelos 3D; e as ações de progresso e cronômetro continuam operacionais.

## Livro didático modular

A aplicação agora funciona como uma biblioteca de conteúdos, não como um único tutorial fixo. Cada módulo é independente e pode representar uma ferramenta, uma montagem ou um processo. O aluno abre um módulo, acompanha suas próprias etapas, consulta a imagem estática da etapa e avança o progresso daquele capítulo. Os campos de recursos 3D permanecem no editor para uma possível evolução futura, mas não são renderizados no leitor.

### Área docente

O botão **Editor docente** permite alterar nome, tipo, descrição, objetivo, cor de capa, publicação e etapas. Também é possível adicionar e excluir etapas. O botão **Novo módulo** cria um capítulo novo e o salva no catálogo. As alterações são persistidas no banco real via API tRPC. O acesso de edição é protegido pelo papel de administrador; o aluno pode consultar o catálogo e salvar o próprio progresso.

### Prévia incluída

- Biblioteca com filtros por ferramenta, montagem e processo.
- Leitor de módulo com objetivo, etapas, progresso, instruções, dica e recursos.
- Editor docente com formulário de conteúdo e gerenciamento de etapas.
- Três módulos de exemplo: Matriz de molde, Operação de torno e Ajuste e acabamento.

## Exclusão e imagens

O docente pode excluir módulos pela lixeira no card ou pelo editor. A exclusão pede confirmação e impede remover o último módulo do catálogo. O editor também aceita imagens locais para a capa do módulo e para cada etapa; a prévia aparece imediatamente no editor e a imagem da etapa é exibida no leitor. As imagens de capa e de etapa já estão modeladas para armazenamento persistente; o próximo passo é conectar o upload ao S3/storage para não gravar arquivos grandes no banco.

## Direção visual

A biblioteca recebeu uma linguagem híbrida: hero escuro e cinematográfico com vermelho editorial, cards e filtros claros para leitura, microinterações de hover/press inspiradas em experiências gamificadas, e editor organizado em painéis técnicos. A identidade mantém o vermelho, branco e preto do ForgeLab sem copiar nenhuma marca.

## Rodada de qualidade

A versão atual inclui normalização de módulos, compressão automática das imagens enviadas para no máximo 1600px, progresso sincronizado via API, limpeza da busca, estados vazios, focus states acessíveis, layout mobile refinado e um estado explícito quando a etapa ainda não possui imagem. O leitor não carrega arquivos GLB/GLTF.

## Edição de modelos 3D pelo docente

No **Editor docente**, os campos de URL GLB/GLTF e os dados de recursos continuam preservados. O conteúdo visual exibido ao aluno é a imagem anexada à etapa; quando houver URL técnica, o leitor exibe um link seguro para a referência externa, sem executar ou incorporar conteúdo remoto.

## Primeira tela do aluno

A entrada da aplicação agora é um dashboard do aluno com perfil e gamificação à esquerda, módulos selecionáveis e estatísticas no centro, docentes responsáveis à direita, recomendação de conteúdo e cronograma. As abas **Em andamento**, **Próximos** e **Concluídos** filtram os módulos disponíveis. O nome visual está provisoriamente como **NOME** para substituição posterior.

## Persistência fullstack

O projeto usa uma arquitetura fullstack com Express, tRPC, Drizzle e MySQL/TiDB. O banco contém as tabelas `learning_modules`, `learning_steps`, `learning_resources`, `student_progress`, `instructors` e `learning_activities`. A camada de autenticação e armazenamento deve ser conectada ao provedor escolhido no ambiente de produção.

- `learning.catalog` carrega módulos, etapas, recursos 3D, docentes, atividades e estatísticas.
- `learning.updateProgress` grava o progresso individual do aluno.
- `learning.saveModule` e `learning.deleteModule` são protegidos para administradores.
- O catálogo inicial é criado automaticamente no primeiro acesso quando o banco está vazio.
- Os testes automatizados cobrem logout e autorização de escrita.
- Um aluno sem sessões concluídas começa em `0%`; o progresso editorial do catálogo não é usado como progresso individual.

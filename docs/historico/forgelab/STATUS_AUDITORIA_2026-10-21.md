

## Auditoria docente complementar — 21/10/2026

Foi realizada auditoria independente em cinco frentes: navegação/sessão, métricas e supervisão, editor de módulos, agenda e pontos fortes/anotações/pré-visualização.

Correções aplicadas nesta rodada:

- O botão **Ver todos** do aluno agora abre diretamente a Biblioteca; **Ver módulos** fecha o menu móvel.
- **Registrar orientação** abre a área de anotações locais em vez de apenas exibir um toast enganoso.
- O painel docente diferencia carregamento/erro de dados de estado vazio e oferece retry para a consulta de supervisão/badges.
- O editor não exibe exclusão para rascunhos ainda não persistidos e bloqueia o botão de salvar enquanto a mutation está pendente.
- O controle de remoção da agenda ganhou interação por teclado e o título do calendário foi alinhado à visão mensal exibida.
- Falhas de inicialização da prévia agora saem do estado infinito de carregamento e permitem tentar novamente.
- Falhas de logout passam a ser comunicadas ao usuário.

Validação final desta rodada: `pnpm check` passou; `pnpm test` passou com 11 arquivos e 55 testes; `pnpm build` passou. O banco local MariaDB continua acessível e contém 3 módulos, 2 atividades, 1 conta estudantil e 0 badges no estado atual da prévia.

Limitações deliberadamente mantidas: anotações continuam locais ao navegador e notificações continuam demonstrativas; não são apresentadas como persistência compartilhada. A agenda permanece single-tenant e o endpoint de prévia continua destinado somente ao ambiente de demonstração local.

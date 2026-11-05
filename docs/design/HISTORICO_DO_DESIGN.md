# Histórico do design

Vídeo: [`linha-do-tempo-design.mp4`](linha-do-tempo-design.mp4) (58 segundos, 1920×1080, sem áudio).

As imagens do vídeo são capturas do sistema em execução em cada versão, com os dados de demonstração da seed. Cada versão tem uma tag no repositório.

| Versão | Tag | Data | Autoria | O que mudou no design |
|---|---|---|---|---|
| V1 | `design-v1` | 23/10/2026 | Giovana Moura | Base unificada: identidade vermelha e preta, trem de engrenagens no login, perfil do aluno em painel escuro, temas claro e escuro. Papéis de aluno e docente. |
| V2 | `design-v2` | 29/10/2026 | Roberth | Instrumentos de oficina: paquímetro de progresso e peça em usinagem no leitor, tela de abertura, tela inicial da administração. |
| V3 | `design-v3` | 29/10/2026 | Giovana Moura | Verificação da etapa no leitor, central docente em abas, estoque reorganizado com alternância entre lista e painel, empréstimos no painel do aluno. |
| V4 | `design-v4` | 30/10/2026 | Giovana Moura | Legibilidade: as 61 declarações de fonte abaixo de 12 px chegam a zero, sem redesenhar as telas. O quiz da etapa passa a ser opcional. |
| V5 | `design-v5` | 05/11/2026 | Giovana Moura | Novo Início para os três papéis: engrenagens guiadas pela rolagem, medidores e painéis de vidro. No tema escuro, a brasa chega às telas internas. |

## Como abrir uma versão

```bash
git checkout design-v3
pnpm install
pnpm db:setup
pnpm dev
```

Use uma cópia separada do projeto: as versões têm dependências e migrations diferentes, e `pnpm db:setup` altera o banco em `data/`. Para voltar, use `git checkout main`.

## Organização do histórico

Em 05/11/2026 os commits originais foram separados em etapas, com novas mensagens. Autoria e datas foram mantidas, e o conteúdo final de cada uma das versões V1 a V4 é idêntico ao do commit original. O corpo de cada mensagem cita o commit de origem.

Commits intermediários de uma mesma versão podem não compilar sozinhos, porque a separação foi feita por área do projeto. As tags apontam para estados completos.

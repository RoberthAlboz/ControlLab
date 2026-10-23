# ControlLab

Protótipo navegável em português para consulta, solicitação, aprovação, retirada e devolução de ferramentas. Os perfis e dashboards de aluna, docente e estoque compartilham um cenário demonstrativo durante a sessão.

## Executar

Sem instalação de dependências:

```sh
python3 -m http.server 8000 --directory dist
```

Abra `http://localhost:8000`. Em Windows, pode usar `py -m http.server 8000 --directory dist`.

## Verificar

Com Node.js 20 ou posterior:

```sh
node --check dist/app.js
node --test tests/controllab.test.cjs
```

Os testes executam o JavaScript distribuído e seus eventos em um ambiente DOM simulado, sem dependências. Não verificam layout, tecnologias assistivas ou comportamento real de foco do navegador.

## Apresentar o percurso 20→18

1. Reinicie a demonstração. Com **Beatriz Nogueira · Aluna**, abra o catálogo e solicite **2 UN** da broca.
2. Com **Tiago Fernandes · Docente**, aprove esse pedido: físico **20**, reservado **2**, disponível **18**.
3. Com **Helena Duarte · Administração**, confirme a retirada: físico **18**, reservado **0**, disponível **18**.
4. Use **Testar repetição**: o saldo permanece igual. Confira os participantes e o histórico.
5. Experimente devolução parcial e danificada. Apenas o recebimento conferido em bom estado retorna ao saldo disponível.

O pedido inicial de 3 UN do inserto é um exemplo separado da broca.

## Limites da entrega

Esta versão é um protótipo. Não possui autenticação real, banco, integração SAP nem gravação permanente. A troca de perfil altera a visão demonstrativa. Reiniciar ou recarregar a página restaura os dados iniciais.

Reserva após aprovação, responsáveis, autoaprovação, classificação e devoluções continuam sendo hipóteses para validação com o setor. O ajuste/estorno registra uma justificativa; não aplica correção física. Locais e pessoas têm apresentação demonstrativa, sem CRUD operacional completo. A amostra tem dois itens; os 127 registros, 57 movimentações e 8 SAP repetidos pertencem ao diagnóstico documentado da planilha, e não a estoque atual validado.

## Organização

- `dist/`: aplicação estática e logotipo existente.
- `tests/`: verificações de comportamento por eventos.
- `docs/`: reavaliação, evidências e handoff.
- `.openai/hosting.json`: vínculo com o site existente; manter sua identidade ao editar.

O workflow consultado está no repositório privado `coderTognoli/context-vault`, revisão `cef378864cb319b234752b43abf7c685670b2f70`. O ControlLab ainda não está no registro desse vault. Esta execução preservou os arquivos compartilhados e manteve o registro da avaliação neste repositório.

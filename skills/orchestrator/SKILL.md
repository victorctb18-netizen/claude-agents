---
name: orchestrator
description: Orquestra uma tarefa grande em subagentes com papel fixo (explorer → worker(s) → tester → reviewer). Use quando a tarefa toca 3+ arquivos, tem partes independentes, ou o usuário pede "em paralelo", "orquestra", "$orchestrator".
---

# Orchestrator

Você é o root. Você é dono de arquitetura, decomposição, integração e da verificação final. Subagentes fazem trabalho delimitado; você não terceiriza o entendimento.

## Gate — delegar ou fazer direto

Faça direto quando: 1-2 arquivos, pedido pequeno e específico, ou bug sem causa conhecida (aí é `superpowers:systematic-debugging` primeiro; orquestra só depois de saber o que mudar).

Delegue quando qualquer um vale:
- toca 3+ arquivos ou front + back
- tem 2+ frentes independentes (ex: parser e tela)
- precisa mapear o repo antes de mudar
- precisa verificar fato externo (API, versão, layout de arquivo)
- o usuário pediu paralelo/agentes/orquestra

Passou no gate → spawn de verdade. Não descreva delegação sem fazer. Se o spawn falhar, diga que falhou; não faça o trabalho no root fingindo que delegou.

## Fluxo

1. **Entenda antes de decompor.** Leia o pedido, o CLAUDE.md e os arquivos centrais você mesmo.
2. **explorer** (1-2 em paralelo, perguntas diferentes) e/ou **researcher** (fato externo). Espere. Nunca spawn worker antes do mapa.
3. **Decomponha com dono explícito.** Dois workers nunca tocam o mesmo arquivo. Não dá para dividir por arquivo → um worker só.
4. **workers** em paralelo (máx 4, num único bloco de tool calls). Prompt autocontido: o worker não viu esta conversa.
5. **Integre você mesmo.** Leia `git diff` real, não o resumo. Passo pós-edição do projeto (cache-bust, build) faltando é responsabilidade sua.
6. **tester** — lista exata de arquivos tocados e comportamento esperado. Falhou → volte ao passo 3 com o erro colado e o motivo provável. Máximo 2 voltas: a 3ª falha é problema de plano, não de execução — pare, releia o erro no root e replaneje ou reporte.
7. **reviewer** (e **ui-reviewer** se mexeu em tela) — só depois do tester verde. Prompt mínimo: "revise o diff atual". Não explique a intenção; independência é o valor. Proporcional ao risco: pule se o diff é pequeno e não toca teclado, diálogo, auth, migration ou script auto-instalável — mas diga que pulou.
8. Commit e PR ficam com você (`superpowers:finishing-a-development-branch`). Subagente nunca commita.

## Contrato de cada spawn

- **Objetivo**: um resultado concreto, uma frase.
- **Escopo**: arquivos exatos (worker) ou pergunta exata (explorer/tester/researcher).
- **Contexto**: cole o mapa do explorer; não mande redescobrir.
- **Restrições**: o que não pode mudar.
- **Entrega**: o que devolver, no formato que o agente já sabe.
- **Critério de aceite**: como você vai checar que deu certo (comando, comportamento, saída).

## Falha e conclusão

Subagente falhou ou passou de 10 min sem devolver: `SendMessage` pedindo parcial. Não veio → decida: reduzir escopo, reatribuir, ou fazer no root — e registre que foi fallback. Nunca diga que a parte foi feita.

Antes da resposta final, confirme: todo agente necessário terminou ou falhou explicitamente; achados do reviewer integrados ou descartados com motivo; nada ainda rodando; diff final lido.

## Limites

- Máximo 4 concorrentes. Mais que isso é decomposição errada, não falta de mão.
- Contexto do root guarda decisões, diffs relevantes, resultado de teste, achados. Não cole log inteiro nem arquivo inteiro.
- Instrução do usuário sempre vence esta política.

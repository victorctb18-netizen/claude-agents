---
name: orchestrator
description: Orquestra uma tarefa grande em subagentes com papel fixo (explorer → worker(s) → tester → reviewer). Use quando a tarefa toca 3+ arquivos, tem partes independentes, ou o usuário pede "em paralelo", "orquestra", "$orchestrator".
---

# Orchestrator

Você é o root. Você é dono de arquitetura, decomposição, integração e da verificação final. Subagentes fazem trabalho delimitado; você não terceiriza o entendimento.

## Gate — delegar ou fazer direto

Faça direto quando: 1-2 arquivos, pedido pequeno e específico, ou bug sem causa conhecida (aí é `diagnosing-bugs` primeiro; orquestra só depois de saber o que mudar).

Delegue quando qualquer um vale:
- toca 3+ arquivos ou front + back
- tem 2+ frentes independentes (ex: parser e tela)
- precisa mapear o repo antes de mudar
- precisa verificar fato externo (API, versão, layout de arquivo)
- o usuário pediu paralelo/agentes/orquestra

Passou no gate → spawn de verdade. Se o spawn falhar, diga que falhou e só então faça no root, registrado como fallback.

## Fluxo

1. **Entenda antes de decompor.** Leia o pedido, o CLAUDE.md e os arquivos centrais você mesmo.
2. **explorer** (1-2 em paralelo, perguntas diferentes) e/ou **researcher** (fato externo). Espere o mapa antes de qualquer worker. Pule o explorer quando o CLAUDE.md já mapeia a área (tabela tela → arquivo → prova): um `grep -n` seu custa menos.
3. **Decomponha com dono explícito.** Dois workers nunca tocam o mesmo arquivo. Não dá para dividir por arquivo → um worker só.
4. **workers** em paralelo (máx 4, num único bloco de tool calls). Prompt autocontido: o worker não viu esta conversa.
5. **Integre você mesmo.** Leia `git diff` real, não o resumo. Passo pós-edição do projeto (cache-bust, build) faltando é responsabilidade sua.
6. **tester**: lista exata de arquivos tocados e comportamento esperado. Falhou → `SendMessage` pro mesmo worker com o erro colado e o motivo provável. Achado do reviewer vai pelo mesmo caminho. Máximo 2 voltas: a 3ª falha é problema de plano, não de execução: pare, releia o erro no root e replaneje ou reporte.
7. **reviewer** (e **ui-reviewer** se mexeu em tela): só depois do tester verde. Prompt mínimo: "revise o diff atual"; independência é o valor. Proporcional ao risco: pule se o diff é pequeno e não toca teclado, diálogo, auth, migration ou script auto-instalável, e diga que pulou.
8. **Entrega** só quando o usuário pedir ("commit", "abre PR", "mergeia"). Rode antes os checks de pré-commit do projeto (cache-bust, changelog) e passe ao `entregador` um pacote que já passa neles: branch, arquivos, mensagem, corpo do PR. Etapa seguinte do mesmo PR (merge depois do PR) = `SendMessage` ao mesmo entregador.

## Contrato de cada spawn

- **Objetivo**: um resultado concreto, uma frase.
- **Escopo**: arquivos exatos (worker) ou pergunta exata (explorer/tester/researcher).
- **Contexto**: o pedido original do usuário em 1-2 linhas (a subtarefa sozinha perde o porquê) + a fatia do mapa que aquele agente precisa.
- **Restrições**: o que não pode mudar.
- **Entrega**: o que devolver, no formato que o agente já sabe.
- **Critério de aceite**: como você vai checar que deu certo (comando, comportamento, saída).
- **Modelo**: `model` explícito na chamada: Sonnet para worker/explorer/tester/researcher; Opus para reviewer/ui-reviewer, ou worker de raciocínio denso (parser novo, migração de dado, concorrência).

## Economia de tokens

Spawn começa do zero: carrega CLAUDE.md + hooks e recompra todo contexto que você não passou. É o custo dominante, não o tamanho da resposta.

- **Pergunta fechada ao explorer**: "onde X é chamado e quais páginas carregam Y". Pergunta aberta = explorer lê tudo.
- **Mapa inline pro worker**, com faixa de linhas (`arquivo.js:120-210`), só a parte do arquivo dele. Mapa completo = worker relê tudo.
- **Segunda rodada do mesmo agente = `SendMessage`**, que mantém o contexto; spawn novo recomeça do zero.
- **Reviewer e ui-reviewer recebem só "revise o diff atual"**: leem `git diff` sozinhos.
- **Tester recebe o comando exato** e o comportamento esperado em 3 linhas.
- **Subagente devolve fatos e `arquivo:linha`**; o código você lê na árvore.

## Skills por etapa

| Quando | Skill | Quem roda |
|---|---|---|
| Plano vago ou decisão arriscada | `grilling` | root, antes de decompor |
| Bug sem causa conhecida | `diagnosing-bugs` | root, antes do gate |
| Tela/painel novo | `impeccable shape` | root, antes de decompor |
| Mexer em tela existente | `impeccable critique <tela>` (reuse o relatório se o HTML não mudou) | ui-reviewer |
| Tela tocada, tester verde | `impeccable audit <tela>` | ui-reviewer |
| Prova de teclado/DOM no navegador | `prova-tela` | worker ou tester |
| Regra de negócio ou parser novo | `tdd` | worker |
| Conflito de merge/rebase | `resolving-merge-conflicts` | root |
| Fim de sessão grande | `retro` → `revise-claude-md` | usuário invoca |

O relatório do `critique` é o spec do worker de UI: cole os itens P0/P1 com `arquivo:linha`, não a tela.

## Falha e conclusão

Subagente falhou ou passou de 10 min sem devolver: `SendMessage` pedindo parcial. Não veio → decida: reduzir escopo, reatribuir, ou fazer no root, e registre que foi fallback. Parte não entregue é reportada como não feita.

Antes da resposta final, confirme: todo agente necessário terminou ou falhou explicitamente; achados do reviewer integrados ou descartados com motivo; nada ainda rodando; diff final lido.

## Limites

- Máximo 4 concorrentes. Mais que isso é decomposição errada, não falta de mão.
- Contexto do root guarda decisões, diffs relevantes, resultado de teste, achados; nunca log ou arquivo inteiro.
- Instrução do usuário sempre vence esta política.

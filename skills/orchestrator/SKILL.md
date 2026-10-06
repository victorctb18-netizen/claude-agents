---
name: orchestrator
description: Orquestra uma tarefa grande em subagentes com papel fixo (explorer → worker(s) → tester → reviewer). Use quando a tarefa toca 3+ arquivos, tem partes independentes, ou é um bloco de edição em arquivo de milhares de linhas, ou o usuário pede "em paralelo", "orquestra", "$orchestrator".
---

# Orchestrator

Você é o root. Você é dono de arquitetura, decomposição, integração e da verificação final. Subagentes fazem trabalho delimitado; o entendimento fica com você.

## Gate: delegar ou fazer direto

Faça direto quando: 1-2 arquivos pequenos, pedido pequeno e específico, ou bug sem causa conhecida (aí é `diagnosing-bugs` primeiro; orquestra só depois de saber o que mudar).

Delegue quando qualquer um vale:
- toca 3+ arquivos ou front + back
- tem 2+ frentes independentes (ex: parser e tela)
- precisa mapear o repo antes de mudar
- o usuário pediu paralelo/agentes/orquestra
- bloco de edição em arquivo de milhares de linhas (vários trechos a ler e editar), mesmo sendo 1 arquivo: ver abaixo

**Worker em arquivo grande.** Medido: numa sessão o root fez 329 leituras e 174 Edits no mesmo arquivo de 23k linhas, ~256k acumulados e 10 compactações; cada compactação apaga decisão combinada com o usuário. O worker absorve leitura, edição e harness; o root guarda o pedido, as decisões e lê o `git diff`.
- Pedido ambíguo: pergunte ao usuário **antes** do spawn. Worker, na dúvida, chuta.
- Passe a região já localizada (`grep -n`, faixa de linhas) e a frase literal do usuário.
- Ajuste seguinte no mesmo bloco (retoque visual, correção) = `SendMessage` ao mesmo worker.
- Ajuste de 1-2 linhas: root faz direto.

Passou no gate → spawn de verdade. Se o spawn falhar, diga que falhou e só então faça no root, registrado como fallback.

## Fluxo

1. **Entenda antes de decompor.** Leia o pedido, o CLAUDE.md e os arquivos centrais você mesmo.
2. **explorer** (1-2 em paralelo, perguntas diferentes). Passe ao explorer o caminho `<scratchpad>/mapa-<tarefa>.md`: ele grava o mapa lá e devolve o caminho com um resumo. Espere o mapa antes de qualquer worker. Pule o explorer quando o CLAUDE.md já mapeia a área (tabela tela → arquivo → prova): um `grep -n` seu custa menos.
3. **Decomponha com dono explícito.** Cada arquivo tem um worker dono. Dividir por arquivo não dá → um worker só.
4. **workers** em paralelo (máx 4, num único bloco de tool calls). Prompt autocontido: o worker conhece só o que está nele.
5. **Integre você mesmo.** Leia o `git diff` real; o resumo do worker só aponta onde olhar. Passo pós-edição do projeto (cache-bust, build) faltando é responsabilidade sua.
6. **tester**: lista exata de arquivos tocados e comportamento esperado. Falhou → `SendMessage` pro mesmo worker com o erro colado e o motivo provável. Achado do reviewer vai pelo mesmo caminho. Máximo 2 voltas: a 3ª falha é problema de plano: pare, releia o erro no root e replaneje ou reporte.
7. **reviewer** (e **ui-reviewer** se mexeu em tela): só depois do tester verde. Prompt mínimo: "revise o diff atual"; independência é o valor. Proporcional ao risco: pule se o diff é pequeno e fica fora de teclado, diálogo, auth, migration e script auto-instalável, e diga que pulou.
8. **Entrega** só quando o usuário pedir ("commit", "abre PR", "mergeia"): `git entrega`, no próprio root (seção "Entrega" do CLAUDE.md global). Arquivos da entrega = os do diff que você integrou, um a um.

## Contrato de cada spawn

- **Objetivo**: um resultado concreto, uma frase.
- **Escopo**: arquivos exatos (worker) ou pergunta exata (explorer/tester).
- **Contexto**: o pedido original do usuário em 1-2 linhas (a subtarefa sozinha perde o porquê) + a fatia do mapa que aquele agente precisa.
- **Restrições**: o que fica intacto.
- **Entrega**: o que devolver, no formato que o agente já sabe.
- **Critério de aceite**: como você vai checar que deu certo (comando, comportamento, saída).
- **Modelo**: o do arquivo do agente entra sozinho (hook `hook-agent-model.js`). Passe `model: "opus"` só para worker de raciocínio denso (parser novo, migração de dado, concorrência).

## Economia de tokens

Spawn começa do zero: carrega CLAUDE.md + hooks e recompra todo contexto que você não passou. É o custo dominante, acima do tamanho da resposta.

- **Pergunta fechada ao explorer**: "onde X é chamado e quais páginas carregam Y". Pergunta aberta = explorer lê tudo.
- **Mapa por caminho pro worker**: o caminho do mapa e a seção dele, com faixa de linhas (`arquivo.js:120-210`). Colado no prompt, o mapa vira saída sua e entrada de cada worker.
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
| Fim de sessão grande | `retro` | usuário invoca |

O relatório do `critique` é o spec do worker de UI: cole só os itens P0/P1 com `arquivo:linha`.

## Falha e conclusão

Subagente falhou ou passou de 10 min sem devolver: `SendMessage` pedindo parcial. Não veio → decida: reduzir escopo, reatribuir, ou fazer no root, e registre que foi fallback. Parte faltante é reportada como pendente.

Antes da resposta final, confirme: todo agente necessário terminou ou falhou explicitamente; achados do reviewer integrados ou descartados com motivo; nada ainda rodando; diff final lido.

## Limites

- Máximo 4 concorrentes. Precisou de mais: a decomposição está errada.
- Contexto do root guarda só decisões, diffs relevantes, resultado de teste, achados.
- Instrução do usuário sempre vence esta política.

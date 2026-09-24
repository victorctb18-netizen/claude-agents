---
name: prova-tela
description: Prova comportamento de tela (teclado, foco, DOM, print) num navegador headless de verdade, sem login e sem dependência. Use ao criar ou mexer em harness `.cdp.js`, ao provar atalho/foco/re-render, ou quando o CLAUDE.md pede "harness da tela" / `--prints`.
---

# Prova de tela

Teclado, foco e re-render só existem com DOM, foco e evento reais, que `node --test` não alcança. A prova é um harness `tests/<tela>-<assunto>.cdp.js` sobre o `cdp-lib.js` desta skill: servidor estático do repo + Edge/Chrome headless + stub de `fetch` dentro da página (a API real, com login, fica de fora).

## Passos

1. **Lib no projeto.** `tests/cdp-lib.js` existe → use a do projeto (pode ter ajuste local). Não existe → copie `cdp-lib.js` desta pasta para `tests/`. A lib assume `tests/` na raiz do repo (serve `..`).
2. **Harness.** Um arquivo por tela+assunto, nesta forma:

   ```js
   const { abrir, checar, resumo } = require('./cdp-lib');
   (async () => {
     const h = await abrir({ fetchStub: { '/api/empresas': { empresas: [] } } });
     await h.navegar('/app/empresas.html', 'document.getElementById("empresasBody")');
     await h.tecla('ArrowDown', 40);
     checar('seta desce', await h.avaliar('document.activeElement.id'), 'linha-1');
     await h.print('lista');           // só grava com --prints
     await h.fechar(); resumo();       // exit 1 se algum checar falhou
   })();
   ```

   API: `abrir({ fetchStub, rotas, viewport, scripts })` → `{ navegar(caminho, prontoExpr), avaliar(expr), tecla(key, keyCode, code), until(fn, desc), estabilizar(), print(nome), fechar() }`.
3. **Rode** `node tests/<harness>.cdp.js`. Bug: o harness fica **vermelho** antes da correção e verde depois: prova que não fica vermelha no bug não prova nada. Mudança visual: `--prints` grava `.prints/<harness>/*.png` para o `ui-reviewer`.

Pronto = saída do harness colada, com `N/N passaram`.

## Regras que já custaram investigação

- **Prontidão por polling**: `navegar(caminho, expr)` e `until()` esperam a expressão virar verdadeira. Espera por tempo fixo dá falso-negativo por corrida de carregamento de script.
- **Dígito com `code` explícito**: `tecla('2', 50, 'Digit2')`. Com `code` errado o navegador descarta o evento em silêncio.
- **Data fixa** quando a tela depende de hoje: injete via `scripts` um `Date` sem argumento fixado; `Date.now` fica real para o `until` ter relógio.
- **Animação**: conte chamadas à função que anima (espião) em vez de ler `getAnimations()`: na CI a lista mente sobre o frame.
- **Print**: estilo computado parado não basta; espere dois `requestAnimationFrame` antes do `print`.
- **Navegador**: Edge/Chrome no caminho padrão do Windows; em outro SO defina `CDP_BROWSER` ou `CHROME_BIN`.

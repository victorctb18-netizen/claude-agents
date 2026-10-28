---
name: mockup-antes
description: Mudança visual de tela passa por mockup aprovado antes do código. Use quando o pedido muda layout, hierarquia, agrupamento ou estilo de uma tela existente ou cria uma nova, ou quando o usuário diz "mockup", "me mostra antes", "como ficaria".
---

# Mockup antes do código

Implementar direto e iterar por print custou retrabalho em 8 de 99 sessões:
o usuário só sabe o que quer vendo, e cada volta no código real paga build,
teste e revisão. Mockup é descartável; código não.

## Fluxo

1. **Fonte primeiro.** Leia o design system do projeto (`design.md`,
   `DESIGN.md`, tokens no CSS) e uma tela parecida que já existe. Regra visual
   sem fonte no projeto é inventada e volta.
2. **2 a 5 opções num HTML só**, lado a lado, com o CSS real do projeto
   (`<link>` para os `.css` da tela) e dado com cara de real. Rótulo curto em
   cada uma (A, B, C) e, abaixo, 1 linha do que muda. Sem parágrafo de defesa.
3. **Print de cada opção** em PNG (headless, skill `prova-tela` quando o
   projeto tem) e link `file:///C:/...` absoluto de cada um na resposta.
4. **Espere a escolha.** "A com o cabeçalho da C" é resposta válida: refaça
   só aquela, mande o print de novo. Nada de código de produção antes do "vai".
5. **Implemente a opção aprovada**, rode o harness da tela e mande o print da
   tela real ao lado do mockup aprovado para conferir.

## Regras

- Mockup fica no scratchpad, nunca no repo.
- Opções diferentes de verdade (estrutura, não só cor). Duas quase iguais
  gastam a atenção do usuário.
- Iteração da mesma tela é um PR só, mergeado quando o usuário aprovou.

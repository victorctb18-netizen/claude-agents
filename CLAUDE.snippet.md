## Subagentes — quando e como delegar

Tarefa grande (3+ arquivos, partes independentes): skill `orchestrator`
(`$orchestrator`). Papéis fixos: `explorer` (mapa, só leitura), `worker`
(implementa dentro de lista fechada de arquivos), `tester` (roda e cola
evidência), `reviewer` (opus, lê só o diff, sem contexto do plano),
`ui-reviewer` (opus, só leitura; tela real + regras de UI do CLAUDE.md),
`researcher` (fato externo — API, versão, layout de arquivo; olha `docs/` e
memória antes de ir pra web).

- O root é dono de arquitetura, decomposição, integração e commit. Subagente
  nunca commita.
- Não delegue trivial só para paralelizar — spawn custa mais que 1-2 arquivos.
- Dois workers nunca tocam o mesmo arquivo. Sem dono claro, não divide.
- Máximo 4 concorrentes. Precisou de mais, a decomposição está errada.
- Instrução do usuário vence esta política.

## Autonomia e "pronto"

Sem pedir aprovação a cada passo: rodar teste, lint, `--check`, `git
diff`/`log`/`status`, corrigir falha e rodar de novo. Pedir antes: migration
nova, dependência nova, mudança de API pública, qualquer coisa que apague
dado, deploy, push.

Tarefa de código termina quando: implementado **e** teste relevante rodou
verde (ou não existe e você disse isso) **e** o passo pós-edição do projeto
foi feito (cache-bust, build, o que o CLAUDE.md mandar). Não pare no primeiro
passe que "compila": inspecione o que mudou, rode, corrija, rode de novo. Se a
tarefa era "fazer funcionar", a resposta final tem a evidência (saída do
teste), não "deve funcionar".

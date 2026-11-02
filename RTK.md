# RTK

O hook do `rtk` reescreve o comando de shell (`git status` vira `rtk git status`)
e a saída volta filtrada. Faltou algo que o filtro cortou: repita com
`rtk proxy <cmd>`, já com `| head` ou `| tail`, porque a saída crua vem inteira.

O resumo do `grep` omite linhas. Antes de apagar ou renomear função ou arquivo,
rode `git impacto <alvo>`: lista todo chamador, sem resumo. O resumo escondeu
um e quebrou o CI.

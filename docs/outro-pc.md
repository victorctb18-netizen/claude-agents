# Outro PC: o que não vem pelo git

`node install.js --global` traz agentes, skills, hooks, `CLAUDE.md`, plugins e
os scripts de `~/bin`. O resto é da máquina e se faz à mão, uma vez:

1. **GitHub CLI**: `winget install GitHub.cli` e `gh auth login`. Sem isso,
   `git entrega`, `git faxina` e `git pronta` não veem PR.
2. **Chave SSH e apelido do servidor**: copie do PC antigo o par de chaves
   (`~/.ssh/<chave>` e `<chave>.pub`) e o bloco `Host` do `~/.ssh/config`.
   Chave privada não vai por e-mail nem por chat: pendrive ou cópia direta
   na rede. Confira com `ssh -o BatchMode=yes <apelido> true`.
3. **`.env` de cada projeto**: não está no git de propósito. Copie do PC
   antigo pelo mesmo caminho da chave.
4. **`rtk`**: `winget install rtk-ai.rtk` e rode o `install.js` de novo para
   ligar o hook.
5. **Permissões que você liberou à mão** (`permissions.allow` do
   `~/.claude/settings.json` antigo): o instalador só soma as do
   `settings.base.json`. Copie as que ainda usa.

Fica para trás de propósito: memória automática do Claude (`~/.claude/projects/`).
Fato que vale nas duas máquinas vai para `docs/memoria/` do projeto.

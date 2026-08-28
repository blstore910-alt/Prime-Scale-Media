# Claude Code onderweg — mobile / remote toegang

Hoe editeer je deze codebase (of laat je Claude Code er in werken)
als je niet achter je laptop zit? Er zijn 3 opties, oplopend in
comfort.

## Optie 1 — Claude Code Web (claude.ai/code)

**Waar:** https://claude.ai/code in een mobiele browser (Chrome, Safari).

Wat je krijgt:
- Zelfde agent, zelfde tools, dezelfde memory als je desktop CLI.
- Werkt in de cloud, jouw laptop hoeft niet aan te staan.
- Ondersteunt een compleet git-repo via een remote/ephemeral
  workspace.
- Kan commits maken, PRs openen, tests draaien, buildstats bekijken.

Beperkingen:
- Getypeed op je telefoon is minder fijn dan een terminal, maar
  voor korte instructies ("fix P0-7", "run test plan sectie 3.4")
  prima.
- Sommige artifact-features werken beter op desktop.

Setup:
1. Log in met je Claude account.
2. `New session` → kies je repo (of paste een repo-URL).
3. Sessie start in de cloud met een verse checkout.

## Optie 2 — Claude Code mobile app (iOS / Android)

Anthropic heeft een officiële **Claude** app (App Store / Play Store).
Dat is de chat-app; Claude Code CLI zelf is een terminal-tool.

Voor kort Claude-vragen onderweg is de app ideaal. Voor daadwerkelijk
code committen richting Optie 1 of Optie 3.

## Optie 3 — SSH naar je laptop of een VPS

De volwaardigste optie: je desktop draait Claude Code, jij verbindt
vanaf je telefoon.

### Setup

Op je laptop (Windows / Mac / Linux):

1. **Zorg dat 'ie aan blijft** — instellingen: nooit slapen als op
   netstroom.
2. **SSH server aanzetten:**
   - Windows: Settings → System → Optional features → OpenSSH Server
     → Install.
   - Mac: `sudo systemsetup -setremotelogin on`.
3. **Tailscale** installeren (https://tailscale.com — gratis voor
   persoonlijk gebruik). Dit geeft je een private mesh network zodat
   je vanaf je telefoon veilig bij je laptop kunt zonder poorten open
   te zetten op je router. Login met dezelfde account op beide
   apparaten.
4. Op je telefoon: **Termius** (iOS/Android, gratis basic tier) of
   **Blink Shell** (iOS, betaald maar heel goed).
5. In Termius: SSH connection naar je laptop's Tailscale-IP
   (100.x.x.x). Username = je laptop-user.
6. Eenmaal ingelogd:
   ```bash
   cd /path/to/prime-scale-media-app
   claude
   ```
7. **Bonus:** gebruik `tmux` of `screen` zodat je sessie blijft
   bestaan als je telefoon disconnect:
   ```bash
   tmux new -s code
   # later:
   tmux attach -t code
   ```

### Wat kun je in Termius doen

- Alle Claude Code commands (`/task`, `/hooks`, `/memory`)
- Git commits + push
- `npm run build`, `npm test`
- File edits (via `claude` prompt, of `nano`/`vim` als je nostalgisch bent)

### Beveiliging

- Tailscale is end-to-end encrypted en niet publiek zichtbaar.
- Zet key-based auth aan (geen wachtwoorden voor SSH).
- Overweeg een YubiKey / TouchID voor de SSH-key.

## Aanbeveling voor deze workflow

- **Snelle correcties + review** → Optie 1 (claude.ai/code op mobiel).
- **Grote implementatie sessies onderweg** → Optie 3 (Tailscale + Termius
  + tmux). Je krijgt de volle desktop terminal ervaring op je telefoon.
- **Vraagjes stellen** → Optie 2 (Claude app).

Gebruikelijk pad: setup Optie 3 een keertje thuis (30-60 min), en gebruik
'm daarna gewoon. Optie 1 is de fallback als je telefoon geen goede
verbinding heeft.

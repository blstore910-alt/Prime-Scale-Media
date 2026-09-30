# Bericht aan Slash support

> Kopieer de tekst hieronder. Hij zegt precies wat er misgaat, met
> hun eigen foutmelding erbij, en stelt één concrete vraag — dat
> scheelt meestal twee heen-en-weertjes.
>
> **Plak nergens een sleutel in.** Ook niet de eerste tekens ervan.
> Er staat hieronder niets in dat geheim is.

---

**Onderwerp:** Public API v2 rejects a legal-entity-scoped key — where do I create a user API key?

Hi,

I'm building a read-only integration against the Slash API to show our
account balances on our own internal dashboard. Read access only — no
transfers, no card operations.

I created an API key under **Entity Settings → API management** for our
legal entity, with Scope "All". Every request returns:

```
Public API v2 requires a user API key. Create one under Settings → API keys
```

The request I'm making is:

```
GET https://api.slash.com/accounts
X-API-Key: <the key>
```

Your documentation describes two key types — legal-entity-scoped
("minted from the dashboard under a specific entity … use these for
server-to-server integrations against one entity") and user-scoped
(which additionally require an `x-legal-entity` header). It also says
both are created in the organization dashboard.

**My question:** Entity Settings → API management is the only place I
can find that creates keys, and it produces the entity-scoped kind that
v2 rejects. Where exactly is the **user API key** created? Is it a
separate screen at the organization level, or does my user need a role
or permission it does not have yet?

Two things that would help me either way:

1. If a user key is the right answer: the exact path in the dashboard,
   and confirmation that I should keep sending `x-legal-entity` with
   our entity id on every request.
2. If an entity-scoped key *should* work: which endpoint or API version
   accepts it, since `/accounts` does not.

Thanks,

---

## Wat je NIET hoeft te vragen

- **Of read-only kan.** Dat kan: het vinkje staat in hun eigen
  dialoog. Het is alleen niet wat deze fout veroorzaakt — hun melding
  gaat over de soort sleutel, niet over de rechten.
- **Of je de bestaande sleutel moet weggooien.** Nee. Een nieuwe
  entity-sleutel, read-only of niet, geeft exact dezelfde melding.
  Laat hem staan tot er een werkende is.

## Wat er hier gebeurt zodra je een werkende sleutel hebt

In Vercel, op **Production én Preview**:

```
SLASH_API_KEY        = de user-sleutel
SLASH_LEGAL_ENTITY   = de entity-id van ZANEL
```

Die tweede alleen als het een user-sleutel is; bij een
entity-sleutel laat je hem leeg en stuurt de adapter hem niet mee.
Daarna redeployen en zeggen dat hij erin staat — de rij staat al in de
kaart en gaat vanzelf van "unreadable" naar het saldo.

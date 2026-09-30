import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// ── EEN FEE DIE WE NIET KENNEN IS GEEN 0% ───────────────────────────
//
// `lib/pure-fee-suggestion.ts` zegt het in zijn eigen kop: "nothing is
// NOT zero ... a form that quietly writes 0 sells at cost for ever".
//
// Toch stond er op 30-09 nog een `fee: suggested.pct ?? 0` in de
// reset van create-ad-account-from-request-dialog.tsx, twintig regels
// boven een effect dat het WEL goed deed ("Leaving the box as it is
// beats writing a 0 that reads as 'charge nothing, for ever'"). Het
// gevolg is niet een leeg vakje maar een PRIJS: PSM verdient 0% op
// elke toekomstige top-up van dat ad-account, voor altijd, en niets
// op een scherm zegt dat.
//
// Waarom een test en geen afspraak: `?? 0` ziet er in een diff
// volstrekt onschuldig uit. Het is pas geld als je weet dat dat veld
// een tarief is, en dat weet je alleen als je het bestand kent.
//
// Deze test kijkt naar de plekken waar een fee in een FORMULIER wordt
// gezet. Een 0 die uit de database komt is prima -- dat is een
// gemeten nul. Een 0 die ontstaat omdat we het niet wisten, niet.

const BESTANDEN = [
  "components/ad-account-requests/create-ad-account-from-request-dialog.tsx",
  "components/account/ad-account-form.tsx",
];

/** `fee: <iets> ?? 0` en `fee: <iets> || 0`, over regelgrenzen heen.
 *  Geen `s`-flag: het tsconfig-target laat die niet toe -- node draaide
 *  hem wel en tsc keurde hem af, dus de test liep groen terwijl de build
 *  viel. `[^,;{}]` dekt een nieuwe regel toch al. */
const STILLE_NUL =
  /\bfee\s*:[^,;{}]*?(?:\?\?|\|\|)\s*0\b(?!\s*\.\d)/g;

test("een fee wordt nooit stilletjes op 0 gezet", () => {
  for (const pad of BESTANDEN) {
    let bron: string;
    try {
      bron = readFileSync(pad, "utf8");
    } catch {
      // Een bestand dat verdwijnt is geen falende test -- de lijst
      // hierboven is een vangnet, geen inventaris.
      continue;
    }
    // Commentaar eruit: deze test is er twee keer eerder ingetuind
    // door zijn eigen uitleg te matchen.
    const code = bron
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const treffers = [...code.matchAll(STILLE_NUL)].map((m) => m[0].trim());
    assert.deepEqual(
      treffers,
      [],
      `${pad}: een fee die we niet konden bepalen wordt hier als 0% ` +
        `opgeslagen, en dat is voor altijd. Laat het veld leeg en laat ` +
        `de admin het invullen. Gevonden: ${treffers.join(" | ")}`,
    );
  }
});

// En de andere kant van dezelfde regel: het schema mag een leeg veld
// niet alsnog tot 0 coercen. `z.coerce.number()` doet dat wel --
// Number("") is 0 -- dus een leeg vakje zou langs de validatie glippen
// en als 0% landen. Precies het gat dat de fix hierboven zou openen
// als niemand eraan dacht.
test("het fee-veld coerct een leeg vakje niet naar 0", () => {
  const pad =
    "components/ad-account-requests/create-ad-account-from-request-dialog.tsx";
  const bron = readFileSync(pad, "utf8");
  const schema = bron.slice(
    bron.indexOf("const schema = z.object({"),
    bron.indexOf("type FormValues"),
  );
  assert.ok(schema.length > 0, "het schema staat er niet meer zoals verwacht");
  assert.ok(
    !/fee\s*:\s*z\s*\.\s*coerce\s*\.\s*number\(\)/.test(
      schema.replace(/\s+/g, " "),
    ),
    "fee gebruikt z.coerce.number(): Number('') is 0, dus een leeg " +
      "vakje wordt 0% in plaats van geweigerd.",
  );
  assert.ok(
    /trim\(\)\s*!==\s*""/.test(schema),
    "het fee-veld weigert een leeg vakje niet expliciet.",
  );
});

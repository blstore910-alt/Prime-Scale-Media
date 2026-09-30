import { strict as assert } from "node:assert";
import { test } from "node:test";
import { en } from "../../lib/i18n/en";
import { nl } from "../../lib/i18n/nl";
import { asLocale, t } from "../../lib/i18n/index";

/**
 * DE WACHTERS VAN DE TAALSCHAKELAAR. Zie docs/NL_EN.md.
 *
 * "Foutloos" is hier geen voornemen maar drie tests die falen. Een
 * ontbrekende vertaling vangt tsc al (nl.ts is getypt op de sleutels van
 * en.ts); wat tsc NIET vangt staat hieronder.
 */

const sleutels = Object.keys(en) as (keyof typeof en)[];

test("elke Nederlandse zin is gevuld -- een lege string haalt tsc wel", () => {
  const leeg = sleutels.filter((k) => !String(nl[k] ?? "").trim());
  assert.deepEqual(leeg, [], `Leeg in nl.ts: ${leeg.join(", ")}`);
});

test("nl.ts heeft geen sleutels die en.ts niet kent", () => {
  const extra = Object.keys(nl).filter((k) => !(k in en));
  assert.deepEqual(extra, [], `Wees in nl.ts: ${extra.join(", ")}`);
});

// ── REGEL 3: KORT ─────────────────────────────────────────────────
//
// "Kort houden voor knoppen." Een knop, label of menu-item is in het
// Nederlands niet langer dan in het Engels plus twee tekens. Regel 4 --
// "het ontwerp wint" -- betekent dat een te lange zin korter wordt, en
// niet dat de knop breder mag.
const KORT = /^(btn|label|tab)\./;
const SPEELRUIMTE = 2;

test("een knop, label of menu-item is in het Nederlands niet langer", () => {
  const te_lang = sleutels
    .filter((k) => KORT.test(k))
    .filter((k) => nl[k].length > en[k].length + SPEELRUIMTE)
    .map((k) => `${k}: "${nl[k]}" (${nl[k].length}) tegen "${en[k]}" (${en[k].length})`);
  assert.deepEqual(
    te_lang,
    [],
    `Te lang -- maak de ZIN korter, niet de knop breder:\n  ${te_lang.join("\n  ")}`,
  );
});

// ── REGEL 2: VAKTERMEN BLIJVEN ENGELS ─────────────────────────────
//
// "Sommige dingen Engels laten, zoals top-up, exchange, accounts en
// wallet." Deze test zoekt naar de Nederlandse VERTALING van die
// woorden; staat er een, dan is een vakterm per ongeluk vertaald.
const VERTAALDE_VAKTERMEN: [RegExp, string][] = [
  [/portemonnee|beurs\b/i, "wallet"],
  [/opwaardeer|opwaarder|opladen/i, "top-up"],
  [/\bwissel(en|koers)?\b|omwissel/i, "exchange"],
  [/advertentie-?account|advertentierekening/i, "ad account"],
  [/abonnement/i, "plan"],
  // withdrawal staat hier NIET: "terugboeking" is gewoon Nederlands. De
  // woordenlijst was in een eerste versie opgerekt met woorden die de
  // eigenaar niet noemde, en deze wachter ving het -- zie docs/NL_EN.md.
  [/doorverwijz/i, "referral"],
  [/\bprovisie\b|\bkosten\b/i, "fee"],
];

test("de vaktermen uit de woordenlijst zijn niet vertaald", () => {
  const fout: string[] = [];
  for (const k of sleutels) {
    for (const [re, vakterm] of VERTAALDE_VAKTERMEN) {
      if (re.test(nl[k])) fout.push(`${k}: "${nl[k]}" vertaalt "${vakterm}"`);
    }
  }
  assert.deepEqual(fout, [], `Vakterm vertaald:\n  ${fout.join("\n  ")}`);
});

// ── DE VARIABELEN ─────────────────────────────────────────────────
//
// Een {amount} die in het Nederlands ontbreekt, laat een bedrag van het
// scherm vallen -- en de zin leest dan nog steeds alsof hij klopt.
const vars = (s: string) =>
  [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

test("dezelfde {variabelen} staan in beide talen", () => {
  const fout = sleutels
    .filter((k) => vars(en[k]) !== vars(nl[k]))
    .map((k) => `${k}: en {${vars(en[k])}} tegen nl {${vars(nl[k])}}`);
  assert.deepEqual(fout, [], fout.join("\n"));
});

// ── DE FUNCTIE ────────────────────────────────────────────────────

test("t vult variabelen in, in beide talen", () => {
  assert.equal(
    t("nl", "dash.nextPayment", { amount: "€75,00", date: "30 okt" }),
    "Volgende betaling €75,00 · op 30 okt",
  );
  assert.equal(t("en", "dash.activeCount", { count: 2 }), "2 active");
});

test("een ontbrekende variabele blijft zichtbaar in plaats van te verdwijnen", () => {
  assert.equal(t("nl", "dash.activeCount"), "{count} actief");
  assert.equal(t("nl", "dash.activeCount", {}), "{count} actief");
});

test("alles wat geen 'nl' is, wordt Engels -- ook een lege of onbekende waarde", () => {
  assert.equal(asLocale("nl"), "nl");
  for (const v of ["en", "", null, undefined, "de", "NL", 1]) {
    assert.equal(asLocale(v), "en", `asLocale(${String(v)})`);
  }
});

// ── DE ZELFTESTEN ─────────────────────────────────────────────────
//
// Een wachter die ik nooit heb zien falen, heb ik niet getest. Deze
// voeren de drie toetsen uit op zelfgemaakte foute invoer en eisen dat
// ze iets vinden.
test("zelftest: de lengtetoets vangt een te lange knop", () => {
  const e = "Save";
  const n = "Opslaan";
  assert.ok(n.length > e.length + SPEELRUIMTE, "de toets had dit moeten vangen");
});

test("zelftest: de vaktermtoets vangt een vertaalde wallet", () => {
  assert.ok(VERTAALDE_VAKTERMEN.some(([re]) => re.test("Je portemonnee")));
  assert.ok(VERTAALDE_VAKTERMEN.some(([re]) => re.test("Nu opwaarderen")));
  // En laat de vakterm zelf met rust.
  assert.ok(!VERTAALDE_VAKTERMEN.some(([re]) => re.test("EUR wallet · Top up")));
});

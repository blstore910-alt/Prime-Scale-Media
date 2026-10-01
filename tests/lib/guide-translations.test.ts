import { strict as assert } from "node:assert";
import { test } from "node:test";
import { GUIDE_LANGS, GUIDE_TRANSLATIONS } from "../../lib/guide-translations";
import { CUSTOMER_GUIDES } from "../../components/admin/manual-customer";

// De Engelse zinnen van de klanthulp, precies zoals het scherm ze toont.
const zinnen: string[] = [];
for (const a of ["advertiser", "affiliate"] as const) {
  const g = CUSTOMER_GUIDES[a];
  zinnen.push(g.heading, g.lead);
  for (const x of g.sections) zinnen.push(x.title, x.intro, ...x.steps, ...(x.notes ?? []).flatMap((n) => [n.label, n.text]));
}

test("elke vooraf vertaalde taal heeft (bijna) elke zin van de klanthulp", () => {
  for (const lang of GUIDE_LANGS) {
    const kaart = GUIDE_TRANSLATIONS[lang];
    const mist = zinnen.filter((z) => !(z in kaart));
    // Ontbreekt er een, dan is de Engelse zin gewijzigd zonder vertaling.
    assert.ok(mist.length === 0, `${lang}: ${mist.length} zinnen zonder vertaling, bv. "${mist[0]}"`);
  }
});

test("geen leverancier of intern type in een vertaling", () => {
  for (const lang of GUIDE_LANGS) {
    const alles = Object.values(GUIDE_TRANSLATIONS[lang]).join(" ");
    assert.doesNotMatch(alles, /rockads|seamx|falkyn|bestads|muxue|gradyn|slash|hk-meta|eu-meta/i, lang);
  }
});

import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  attachTeamAdvertiser,
  lacksOwnAdvertiser,
} from "../../lib/auth/pure-team-advertiser";

/**
 * DE SESSIELADER LIGT OP HET PAD VAN ELKE LOGIN.
 *
 * lib/auth/session.ts hangt sinds 30-09 de adverteerder van een team aan
 * het profiel van een teamlid (multi-user fase 3). Een fout daar
 * betekent dat niemand meer binnenkomt. De eigenschap die dat uitsluit
 * staat hier vast: een gewone klant komt er ONVERANDERD doorheen.
 */

const EIGEN = { id: "adv-eigen" };
const TEAM = { id: "adv-team" };

test("een klant met een eigen adverteerder komt er als HETZELFDE object doorheen", () => {
  const p = { role: "advertiser", tenant_id: "T1", advertiser: [EIGEN] };
  const uit = attachTeamAdvertiser(
    [p],
    [{ subject_id: "adv-team", tenant_id: "T1", role: "viewer" }],
    [TEAM],
  );
  // Referentie, niet alleen inhoud: er mag niet eens een kopie van
  // gemaakt worden.
  assert.equal(uit[0], p);
  assert.deepEqual(uit[0].advertiser, [EIGEN]);
});

test("de eigen adverteerder wint, ook als die klant ergens anders lid is", () => {
  const p = { role: "advertiser", tenant_id: "T1", advertiser: [EIGEN] };
  const uit = attachTeamAdvertiser(
    [p],
    [{ subject_id: "adv-team", tenant_id: "T1", role: "manager" }],
    [TEAM],
  );
  assert.equal((uit[0].advertiser as { id: string }[])[0].id, "adv-eigen");
});

test("een teamlid zonder eigen adverteerder krijgt die van zijn team, met zijn rol", () => {
  const p = { role: "advertiser", tenant_id: "T1", advertiser: [] };
  const uit = attachTeamAdvertiser(
    [p],
    [{ subject_id: "adv-team", tenant_id: "T1", role: "viewer" }],
    [TEAM],
  );
  assert.deepEqual(uit[0].advertiser, [TEAM]);
  assert.equal((uit[0] as { team_role?: string }).team_role, "viewer");
});

test("een lidmaatschap in een ANDERE tenant hangt niet aan dit profiel", () => {
  const p = { role: "advertiser", tenant_id: "T1", advertiser: [] };
  const uit = attachTeamAdvertiser(
    [p],
    [{ subject_id: "adv-team", tenant_id: "T2", role: "viewer" }],
    [TEAM],
  );
  assert.equal(uit[0], p);
  assert.deepEqual(uit[0].advertiser, []);
});

test("een admin- of affiliateprofiel zonder adverteerder wordt niet aangeraakt", () => {
  for (const role of ["admin", "affiliate", "", null]) {
    const p = { role, tenant_id: "T1", advertiser: [] };
    const uit = attachTeamAdvertiser(
      [p],
      [{ subject_id: "adv-team", tenant_id: "T1", role: "viewer" }],
      [TEAM],
    );
    assert.equal(uit[0], p, `rol ${String(role)} werd aangeraakt`);
  }
});

test("een lidmaatschap zonder leesbare adverteerder laat het profiel zoals het was", () => {
  const p = { role: "advertiser", tenant_id: "T1", advertiser: [] };
  const uit = attachTeamAdvertiser(
    [p],
    [{ subject_id: "adv-team", tenant_id: "T1", role: "viewer" }],
    [], // RLS gaf niets terug
  );
  assert.equal(uit[0], p);
});

test("lacksOwnAdvertiser: alleen een adverteerderprofiel zonder adverteerder", () => {
  assert.equal(lacksOwnAdvertiser({ role: "advertiser", advertiser: [] }), true);
  assert.equal(lacksOwnAdvertiser({ role: "advertiser", advertiser: null }), true);
  assert.equal(lacksOwnAdvertiser({ role: "ADVERTISER" }), true);
  assert.equal(lacksOwnAdvertiser({ role: "advertiser", advertiser: [EIGEN] }), false);
  assert.equal(lacksOwnAdvertiser({ role: "admin", advertiser: [] }), false);
});

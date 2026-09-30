"use server";

// ── EEN COLLEGA OP JE ACCOUNT ───────────────────────────────────────
//
// Multi-user fase 3. De eigenaar, 30-09: "multi user voor advertisers
// en affiliates." Zie docs/TEAM_ACCOUNTS.md.
//
// ── ALLEEN MEEKIJKEN, VOOR NU ─────────────────────────────────────
//
// De rollen `manager` en `viewer` bestaan allebei in de database, maar
// hier kan alleen een VIEWER worden uitgenodigd. Reden: een manager doet
// dingen -- opwaarderen, een account aanvragen -- en elke geld-functie
// zoekt "de adverteerder van de beller" op via `user_id = auth.uid()`.
// Een teamlid heeft zo'n rij niet, dus elke knop van een manager zou
// falen. Een rol aanbieden die niets kan, is een belofte die breekt.
// Managers zijn de volgende stap, en die raakt de geld-functies.
//
// ── WIE MAG UITNODIGEN ────────────────────────────────────────────
//
// Alleen de EIGENAAR van de adverteerder: `advertisers.user_id` is de
// beller. Een teamlid kan geen teamleden toevoegen. De tenant komt van
// de adverteerderrij, nooit van de aanroeper.

import { randomUUID } from "node:crypto";
import { resolveUserContext } from "./_shared";
import { createAdminClient } from "@/lib/supabase/server";
import { safeErrorMessage } from "@/lib/pure-error";
import { sendEmail } from "@/lib/email-sender";

const INVITE_VALID_DAYS = 7;

export type TeamMember = {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  isYou: boolean;
};
export type TeamInvite = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
};

/** De adverteerder waar de beller EIGENAAR van is, of niets. */
async function eigenAdverteerder(): Promise<
  | { ok: true; adv: { id: string; tenant_id: string }; userId: string; profileId: string }
  | { ok: false; error: string }
> {
  const res0 = await resolveUserContext();
  if (!res0.ok) return { ok: false, error: res0.error };
  const { supabase, profile } = res0.ctx;

  const { data: user } = await supabase.auth.getUser();
  const userId = user.user?.id;
  if (!userId) return { ok: false, error: "Unauthorized" };

  // limit(1), geen maybeSingle: advertisers.user_id is niet uniek
  // afgedwongen, en maybeSingle gooit bij twee rijen.
  const { data, error } = await supabase
    .from("advertisers")
    .select("id, tenant_id")
    .eq("user_id", userId)
    .eq("tenant_id", profile.tenant_id)
    .limit(1);
  if (error) return { ok: false, error: safeErrorMessage(error) };
  const adv = (data ?? [])[0];
  // Een teamlid heeft geen eigen adverteerder, en komt hier dus niet
  // langs. Dat is de toets "alleen de eigenaar".
  if (!adv) return { ok: false, error: "Only the account owner can manage the team." };
  return {
    ok: true,
    adv: { id: String(adv.id), tenant_id: String(adv.tenant_id) },
    userId,
    profileId: String(profile.id),
  };
}

export async function listTeam(): Promise<
  | { ok: true; data: { members: TeamMember[]; invites: TeamInvite[] } }
  | { ok: false; error: string }
> {
  const eig = await eigenAdverteerder();
  if (!eig.ok) return eig;
  const db = await createAdminClient();

  const { data: leden, error: ledenFout } = await db
    .from("subject_members")
    .select("id, user_id, role")
    .eq("subject_kind", "advertiser")
    .eq("subject_id", eig.adv.id);
  if (ledenFout) {
    return {
      ok: false,
      error: /subject_members/.test(ledenFout.message ?? "")
        ? "Teams are not switched on yet."
        : safeErrorMessage(ledenFout),
    };
  }

  const userIds = (leden ?? []).map((l) => String(l.user_id));
  const namen = new Map<string, { email: string | null; name: string | null }>();
  if (userIds.length) {
    const { data: profielen } = await db
      .from("user_profiles")
      .select("user_id, email, full_name")
      .eq("tenant_id", eig.adv.tenant_id)
      .in("user_id", userIds);
    for (const p of profielen ?? []) {
      namen.set(String(p.user_id), {
        email: p.email ?? null,
        name: p.full_name ?? null,
      });
    }
  }

  // Openstaande uitnodigingen. Kan falen als plak 179 er nog niet is --
  // dan zijn er per definitie geen, en is dat geen fout voor de lijst.
  let invites: TeamInvite[] = [];
  const { data: open, error: openFout } = await db
    .from("invitations")
    .select("id, email, member_role, expires_at")
    .eq("team_advertiser_id", eig.adv.id)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString());
  if (!openFout) {
    invites = (open ?? []).map((i) => ({
      id: String(i.id),
      email: String(i.email),
      role: String(i.member_role ?? "viewer"),
      expiresAt: String(i.expires_at),
    }));
  }

  // De eigenaar eerst, dan de rest op naam.
  const members: TeamMember[] = (leden ?? [])
    .map((l) => ({
      id: String(l.id),
      email: namen.get(String(l.user_id))?.email ?? null,
      name: namen.get(String(l.user_id))?.name ?? null,
      role: String(l.role),
      isYou: String(l.user_id) === eig.userId,
    }))
    .sort((a, b) =>
      a.role === "owner" ? -1 : b.role === "owner" ? 1 : String(a.name).localeCompare(String(b.name)),
    );

  return { ok: true, data: { members, invites } };
}

export async function inviteTeamMember(
  emailIn: string,
): Promise<
  | { ok: true; data: { link: string; emailSent: boolean } }
  | { ok: false; error: string }
> {
  const email = String(emailIn ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "That email address does not look right." };
  }

  const eig = await eigenAdverteerder();
  if (!eig.ok) return eig;
  const db = await createAdminClient();

  // Jezelf uitnodigen, of iemand die er al is, is geen uitnodiging.
  const { data: jij } = await db
    .from("user_profiles")
    .select("email")
    .eq("user_id", eig.userId)
    .limit(1);
  if (String((jij ?? [])[0]?.email ?? "").toLowerCase() === email) {
    return { ok: false, error: "That is you — you are already on the account." };
  }

  const { data: al } = await db
    .from("invitations")
    .select("id")
    .eq("team_advertiser_id", eig.adv.id)
    .eq("email", email)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .limit(1);
  if ((al ?? []).length) {
    return { ok: false, error: "There is already an open invitation for that address." };
  }

  const { data: tenant } = await db
    .from("tenants")
    .select("name")
    .eq("id", eig.adv.tenant_id)
    .limit(1);
  const tenantName = String((tenant ?? [])[0]?.name ?? "Prime Scale Media");

  const token = randomUUID();
  const expires_at = new Date(
    Date.now() + INVITE_VALID_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const link = `${process.env.NEXT_PUBLIC_APP_URL}/invite/accept?token=${token}`;

  // Kolom-allowlist: precies deze, en de tenant van de ADVERTEERDER.
  const { error: insFout } = await db.from("invitations").insert({
    email,
    tenant_id: eig.adv.tenant_id,
    tenant_name: tenantName,
    sender_id: eig.userId,
    sender_profile_id: eig.profileId,
    token,
    expires_at,
    // Een teamlid logt in als adverteerder, zodat de klantapp opent --
    // maar zonder eigen adverteerder; zie lib/auth/team-invite.ts.
    role: "advertiser",
    status: "pending",
    team_advertiser_id: eig.adv.id,
    member_role: "viewer",
  });
  if (insFout) {
    if (/team_advertiser_id|member_role/.test(insFout.message ?? "")) {
      return { ok: false, error: "Teams are not switched on yet." };
    }
    return { ok: false, error: safeErrorMessage(insFout) };
  }

  // De uitnodiging staat. De mail is een extra: valt die weg, dan is de
  // link er nog, en die geeft het scherm terug om te kopieren.
  let emailSent = false;
  try {
    await sendEmail({
      to: email,
      subject: `You have been invited to view an account on ${tenantName}`,
      text: [
        `You have been invited to view an ad account on Prime Scale Media.`,
        ``,
        `Accept: ${link}`,
        ``,
        `You can see balances, ad accounts and invoices. You cannot move money.`,
        `This link is valid for ${INVITE_VALID_DAYS} days.`,
      ].join(String.fromCharCode(10)),
      html: `<p>You have been invited to view an ad account on Prime Scale Media.</p><p><a href="${link}">Accept the invitation</a></p><p>You can see balances, ad accounts and invoices. You cannot move money. This link is valid for ${INVITE_VALID_DAYS} days.</p>`,
    });
    emailSent = true;
  } catch {
    emailSent = false;
  }

  return { ok: true, data: { link, emailSent } };
}

export async function removeTeamMember(
  memberId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const eig = await eigenAdverteerder();
  if (!eig.ok) return eig;
  const db = await createAdminClient();

  const { data: rijen, error } = await db
    .from("subject_members")
    .select("id, role, subject_id, user_id")
    .eq("id", String(memberId ?? ""))
    .limit(1);
  if (error) return { ok: false, error: safeErrorMessage(error) };
  const rij = (rijen ?? [])[0];
  // De rij moet bij JOUW adverteerder horen -- anders is het niet aan
  // jou om hem te verwijderen, en doen we alsof hij niet bestaat.
  if (!rij || String(rij.subject_id) !== eig.adv.id) {
    return { ok: false, error: "That person is not on your team." };
  }
  // De eigenaar verwijderen zou het account zonder eigenaar achterlaten.
  if (rij.role === "owner") {
    return { ok: false, error: "The owner cannot be removed." };
  }

  const { error: delFout } = await db
    .from("subject_members")
    .delete()
    .eq("id", rij.id)
    .eq("subject_id", eig.adv.id);
  if (delFout) return { ok: false, error: safeErrorMessage(delFout) };
  return { ok: true };
}

export async function cancelTeamInvite(
  inviteId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const eig = await eigenAdverteerder();
  if (!eig.ok) return eig;
  const db = await createAdminClient();

  // Status op cancelled en NIET wissen: een uitnodiging die ooit bestond
  // hoort terug te vinden te zijn. Alleen als hij bij JOUW adverteerder
  // hoort en nog openstaat.
  const { data, error } = await db
    .from("invitations")
    .update({ status: "cancelled" })
    .eq("id", String(inviteId ?? ""))
    .eq("team_advertiser_id", eig.adv.id)
    .eq("status", "pending")
    .select("id");
  if (error) return { ok: false, error: safeErrorMessage(error) };
  if (!(data ?? []).length) return { ok: false, error: "That invitation is no longer open." };
  return { ok: true };
}

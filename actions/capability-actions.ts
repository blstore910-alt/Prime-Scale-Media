"use server";

import { revalidatePath } from "next/cache";

import {
  maintenanceGuard,
  resolveAdminContext,
  resolveOwnerContext,
  type ActionResult,
} from "./_shared";
import { CAPABILITIES, GRANTABLE } from "@/lib/capabilities";
import { safeErrorMessage } from "@/lib/pure-error";

/**
 * HANDING OUT PERMISSIONS, AND TAKING THEM BACK.
 *
 * The owner, 26-09: "mooiste zou zijn als ik per admin wat
 * bevoegdheden kan instellen."
 *
 * ── GRANTING IS NEVER A CAPABILITY ────────────────────────────────
 *
 * This file is the one place that hands out rights, and it is
 * deliberately NOT protected by a capability of its own. An admin who
 * can grant himself rights has all rights, so the check is
 * `resolveOwnerContext` — owners only, always, whoever asks.
 *
 * It is checked twice on purpose: here, and again inside
 * `set_admin_capability` in the database (plak 143), which re-reads
 * the owner from `tenant_owners` under SECURITY DEFINER. Two gates
 * because getting this one wrong hands over everything else.
 */

/** Who has what, for the screen. */
export async function listCapabilities(): Promise<
  ActionResult<{ byProfile: Record<string, string[]>; owners: string[] }>
> {
  // An admin may READ who has what — they are about to be told anyway
  // by trying a button. Only granting is owner-only.
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profile } = auth.ctx;

  try {
    const [caps, owners, profiles] = await Promise.all([
      supabase
        .from("admin_capabilities")
        .select("user_id, capability")
        .eq("tenant_id", profile.tenant_id),
      supabase
        .from("tenant_owners")
        .select("user_id")
        .eq("tenant_id", profile.tenant_id),
      supabase
        .from("user_profiles")
        .select("id, user_id")
        .eq("tenant_id", profile.tenant_id)
        .eq("role", "admin"),
    ]);

    // Before plak 143 neither table exists. An empty answer is the
    // truth then: nobody has been granted anything.
    if (caps.error || owners.error) {
      return { ok: true, data: { byProfile: {}, owners: [] } };
    }
    if (profiles.error) return { ok: false, error: profiles.error.message };

    // The tables key on auth user id; the screen keys on profile id.
    const profileOf = new Map<string, string>();
    for (const p of (profiles.data ?? []) as { id: string; user_id: string }[]) {
      if (p.user_id) profileOf.set(p.user_id, p.id);
    }

    const byProfile: Record<string, string[]> = {};
    for (const c of (caps.data ?? []) as {
      user_id: string;
      capability: string;
    }[]) {
      const pid = profileOf.get(c.user_id);
      if (!pid) continue;
      (byProfile[pid] ??= []).push(c.capability);
    }

    const ownerProfiles: string[] = [];
    for (const o of (owners.data ?? []) as { user_id: string }[]) {
      const pid = profileOf.get(o.user_id);
      if (pid) ownerProfiles.push(pid);
    }

    return { ok: true, data: { byProfile, owners: ownerProfiles } };
  } catch (e) {
    return { ok: false, error: safeErrorMessage(e) };
  }
}

export async function setCapability(input: {
  profileId: string;
  capability: string;
  on: boolean;
}): Promise<ActionResult<{ capability: string; on: boolean }>> {
  const mm = maintenanceGuard();
  if (!mm.ok) return { ok: false, error: mm.error };

  // Owners only. Never a capability — see the note at the top.
  const auth = await resolveOwnerContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth.ctx;

  // ── A NAME NOBODY CAN GRANT IS WORSE THAN A REFUSAL ─────────────
  //
  // `admin_capabilities.capability` is free text with no constraint,
  // so a typo would insert happily and then never match the check in
  // the code — the admin would appear to have the right and have
  // nothing. Only names from the catalogue, and only ones that are
  // actually grantable.
  if (!GRANTABLE.some((c) => c.key === input.capability)) {
    const known = CAPABILITIES.find((c) => c.key === input.capability);
    return {
      ok: false,
      error: known?.ownerOnly
        ? "That one stays with the owners. Anybody who can hand out permissions can give themselves all of them."
        : "Unknown permission.",
    };
  }

  const { error } = await supabase.rpc("set_admin_capability", {
    p_profile_id: input.profileId,
    p_capability: input.capability,
    p_on: input.on,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admins");
  return { ok: true, data: { capability: input.capability, on: input.on } };
}

/**
 * Make somebody an owner, or stop them being one.
 *
 * The database refuses to remove the last one (plak 143): a tenant
 * with no owner is a tenant nobody can get into the settings of, and
 * that is not fixable from a screen.
 */
export async function setOwner(input: {
  profileId: string;
  on: boolean;
}): Promise<ActionResult<{ on: boolean }>> {
  const mm = maintenanceGuard();
  if (!mm.ok) return { ok: false, error: mm.error };

  const auth = await resolveOwnerContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth.ctx;

  const { error } = await supabase.rpc("set_tenant_owner", {
    p_profile_id: input.profileId,
    p_on: input.on,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admins");
  return { ok: true, data: { on: input.on } };
}

"use server";

import {
  fetchRockadsAdAccounts,
  fetchRockadsWallets,
  probeRockads,
  type RockadsAdAccount,
  type RockadsProbe,
  type RockadsWallet,
} from "@/lib/integrations/rockads-api";
import { resolveAdminContext } from "./_shared";
import type { ActionResult } from "./_shared";

/**
 * Read-only server actions over the RockAds adapter.
 *
 * ADMIN-GATED, all of them. Two reasons, and the second is the one that
 * matters: every ad account they return carries the commission WE pay
 * THEM, which is cost data. The owner's rule is that a supplier fee is
 * visible to admins and super-admins and to nobody else, and an action
 * without a guard is reachable by any signed-in user who knows its name.
 *
 * There is no write action here, and none in the adapter either — see the
 * note at the top of lib/integrations/rockads-api.ts. Nothing in this
 * codebase can move supplier credit.
 */

export async function getRockadsStatus(): Promise<ActionResult<RockadsProbe>> {
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  return { ok: true, data: await probeRockads() };
}

export async function getRockadsWallets(): Promise<
  ActionResult<{ wallets: RockadsWallet[] }>
> {
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { wallets, error } = await fetchRockadsWallets();
  if (error) return { ok: false, error };
  return { ok: true, data: { wallets } };
}

export async function getRockadsAdAccounts(): Promise<
  ActionResult<{ accounts: RockadsAdAccount[]; total: number }>
> {
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { accounts, total, error } = await fetchRockadsAdAccounts();
  if (error) return { ok: false, error };
  return { ok: true, data: { accounts, total } };
}

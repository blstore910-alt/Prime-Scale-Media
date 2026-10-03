import PartnerAdmin from "@/components/partners/partner-admin";
import PartnerDirectory from "@/components/partners/partner-directory";
import { requireAdmin } from "@/lib/auth/require-admin";
import { isTenantOwner } from "@/lib/auth/is-tenant-owner";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  // ── EEN EIGENAAR BEWERKT, EEN ADMIN KIJKT ─────────────────────────
  //
  // De eigenaar, 03-10: "admin mag partners zien maar niks verder doen
  // en partners page moeten ze als advertiser zien". Een gewone admin
  // krijgt dus precies de tegels die een klant krijgt -- handig als een
  // klant ernaar vraagt -- en geen knoppen. savePartner en deletePartner
  // weigeren een niet-eigenaar ook zelf (resolveOwnerContext): deze
  // splitsing is voor het scherm, niet de grens.
  const { user, profile } = await requireAdmin("/dashboard");
  const supabase = await createClient();
  const owner = await isTenantOwner(
    supabase,
    (profile as { tenant_id?: string | null }).tenant_id,
    user.id,
    (profile as { user_id?: string | null }).user_id,
  );
  if (owner) return <PartnerAdmin />;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <p className="mb-3 rounded-xl border bg-muted/40 px-4 py-2.5 text-sm text-muted-foreground">
        This is what customers see. Only an owner can add or change a partner.
      </p>
      <PartnerDirectory />
    </div>
  );
}

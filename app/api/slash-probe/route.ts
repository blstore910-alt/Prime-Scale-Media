import { apiRequireAdmin } from "@/lib/auth/api-require-admin";
import { NextResponse } from "next/server";
import { probeSlash } from "@/lib/integrations/slash-api";
import { safeErrorMessage } from "@/lib/pure-error";

// Alleen voor de beheerkant: wat Slash per rekening teruggeeft, zodat
// een $0.00 in "What we hold" te verklaren is. Leest alleen; geen
// sleutel en geen volledig rekening-id in het antwoord.
export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await apiRequireAdmin();
  if (error) return error;
  try {
    return NextResponse.json(await probeSlash());
  } catch (e) {
    return NextResponse.json({ error: safeErrorMessage(e) }, { status: 500 });
  }
}

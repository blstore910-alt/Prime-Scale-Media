import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Parse a Next.js API request body against a Zod schema. Returns
 * either `{ ok: true, data }` or a ready-to-return `{ ok: false,
 * response }` with a 400.
 */
export async function parseJsonBody<T extends z.ZodTypeAny>(
  req: Request,
  schema: T,
): Promise<
  | { ok: true; data: z.infer<T> }
  | { ok: false; response: NextResponse }
> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: "Malformed JSON body" },
        { status: 400 },
      ),
    };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          message: "Invalid request body",
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 400 },
      ),
    };
  }
  return { ok: true, data: parsed.data };
}

/**
 * Return a compact, PII-scrubbed representation of an error object
 * for logging. Never surface Supabase's `details`/`hint`/`row` fields
 * to server logs — those can contain user emails, IDs, or full row
 * payloads.
 */
export function safeErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const msg = (err as { message: unknown }).message;
    if (typeof msg === "string") return msg;
  }
  return "unknown error";
}

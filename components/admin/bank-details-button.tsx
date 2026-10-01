"use client";

// ── ALLE BANKGEGEVENS, EEN KNOP, VOOR ELKE ADMIN ────────────────────
//
// De eigenaar, 01-10: "alle bank details moeten voor 1 knop voor alle
// admins easy vindbaar zijn in de app, klikbaar, met een mooie prefilled
// WhatsApp-tekst, plug and play."
//
// De bankknop in de bovenbalk opent dit venster: kies de bank en de
// valuta, en dan staat elk gegeven er met een kopieerknop, plus "Copy
// message" en "Open WhatsApp" met het bericht al ingevuld. Kies je een
// klant, dan staan zijn naam en klantcode in het bericht.
//
// De gegevens zelf komen uit lib/bank-beneficiaries.ts -- dezelfde die de
// klant in zijn top-up-scherm ziet, dus nooit twee versies.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Copy, Landmark, MessageCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { bankInstructions, type BankGroup, type TransferCurrency } from "@/lib/bank-beneficiaries";
import { bankLines, bankWhatsAppText, whatsAppLink } from "@/lib/pure-bank-whatsapp";
import { BANK_ROUTES } from "@/lib/bank-routes-admin";
import { copyText } from "@/lib/copy-text";
import { createClient } from "@/lib/supabase/client";

const GROEPEN: BankGroup[] = ["turlit", "zanel", "muxue"];
const VALUTA: TransferCurrency[] = ["EUR", "USD", "GBP", "HKD"];

export function BankDetailsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="tool ic-btn"
        onClick={() => setOpen(true)}
        aria-label="Bank details"
        title="Bank details"
      >
        <Landmark />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          {open ? <BankDetails /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function BankDetails() {
  const [groep, setGroep] = useState<BankGroup>("turlit");
  const cfg = bankInstructions[groep];
  const beschikbaar = VALUTA.filter((v) => cfg.accounts[v]);
  const [valutaKeuze, setValuta] = useState<TransferCurrency>("EUR");
  const valuta = beschikbaar.includes(valutaKeuze) ? valutaKeuze : beschikbaar[0];
  const rekening = cfg.accounts[valuta]!;
  const [klant, setKlant] = useState("");
  const [gekopieerd, setGekopieerd] = useState<string | null>(null);

  // Klanten voor de keuzelijst; RLS laat een admin zijn eigen tenant lezen.
  const klanten = useQuery({
    queryKey: ["bank-details-clients"],
    queryFn: async () => {
      const sb = createClient();
      const { data: adv, error } = await sb
        .from("advertisers")
        .select("tenant_client_code, profile_id")
        .not("tenant_client_code", "is", null);
      if (error) throw error;
      const rijen = (adv ?? []) as { tenant_client_code: string; profile_id: string | null }[];
      const ids = rijen.map((r) => r.profile_id).filter(Boolean) as string[];
      const namen = new Map<string, string>();
      if (ids.length) {
        const { data: pr } = await sb.from("user_profiles").select("id, full_name").in("id", ids);
        for (const p of (pr ?? []) as { id: string; full_name: string | null }[]) namen.set(p.id, (p.full_name ?? "").trim());
      }
      return rijen
        .map((r) => ({ code: r.tenant_client_code, name: (r.profile_id && namen.get(r.profile_id)) || "" }))
        .sort((a, b) => b.code.localeCompare(a.code));
    },
    staleTime: 5 * 60_000,
  });
  const gekozen = klanten.data?.find((k) => k.code === klant) ?? null;

  const regels = useMemo(() => bankLines(rekening.sections), [rekening]);
  const bericht = bankWhatsAppText({
    beneficiary: cfg.beneficiary,
    currency: valuta,
    sections: rekening.sections,
    clientCode: gekozen?.code ?? null,
    name: gekozen?.name.split(" ")[0] ?? null,
  });

  const kopieer = async (sleutel: string, tekst: string, wat: string) => {
    if (await copyText(tekst)) {
      setGekopieerd(sleutel);
      toast.success(`${wat} copied`);
      window.setTimeout(() => setGekopieerd((k) => (k === sleutel ? null : k)), 1500);
    } else toast.error("Copy was blocked — select the text instead.");
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Bank details</DialogTitle>
        <DialogDescription>Pick the bank and currency, then copy a detail or send the whole message.</DialogDescription>
      </DialogHeader>

      <div className="grid gap-3">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
          {GROEPEN.map((g) => (
            <button
              key={g}
              onClick={() => setGroep(g)}
              className={`rounded-lg px-2 py-2 text-xs font-bold ${g === groep ? "bg-background shadow" : "text-muted-foreground"}`}
            >
              {bankInstructions[g].beneficiary}
            </button>
          ))}
        </div>
        <div className="text-[11px] text-muted-foreground">For: {BANK_ROUTES[groep]}</div>

        <div className="flex flex-wrap gap-1.5">
          {beschikbaar.map((v) => (
            <button
              key={v}
              onClick={() => setValuta(v)}
              className={`rounded-full px-3 py-1 text-xs font-bold ${v === valuta ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              {v}
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border">
          <div className="bg-muted/50 px-3 py-2 text-xs font-bold">{rekening.account_name}</div>
          {regels.map((r, i) => {
            const k = `${groep}-${valuta}-${i}`;
            return (
              <button
                key={k}
                type="button"
                onClick={() => kopieer(k, r.value, r.label)}
                className="flex w-full items-center justify-between gap-3 border-t px-3 py-2 text-left hover:bg-muted/40"
              >
                <span className="min-w-0">
                  <span className="block text-[11px] text-muted-foreground">{r.label}</span>
                  <span className="block break-words font-mono text-sm font-semibold">{r.value}</span>
                </span>
                {gekopieerd === k ? <Check className="h-4 w-4 shrink-0 text-emerald-600" /> : <Copy className="h-4 w-4 shrink-0 text-muted-foreground" />}
              </button>
            );
          })}
        </div>

        <label className="grid gap-1">
          <span className="text-xs font-semibold">For a client (optional — puts their name in the message)</span>
          <select value={klant} onChange={(e) => setKlant(e.target.value)} className="h-10 rounded-lg border bg-background px-3 text-sm">
            <option value="">— no client —</option>
            {(klanten.data ?? []).map((k) => (
              <option key={k.code} value={k.code}>
                {k.code}
                {k.name ? ` · ${k.name}` : ""}
              </option>
            ))}
          </select>
        </label>

        <div className="rounded-xl border bg-emerald-50/60 p-3 dark:bg-emerald-950/20">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
            WhatsApp message
          </div>
          <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap font-sans text-xs leading-5">{bericht}</pre>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => kopieer("bericht", bericht, "Message")}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-bold"
          >
            {gekopieerd === "bericht" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copy message
          </button>
          <a
            href={whatsAppLink(bericht)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#25D366] text-sm font-extrabold text-white"
          >
            <MessageCircle className="h-4 w-4" /> Open WhatsApp
          </a>
        </div>
      </div>
    </>
  );
}

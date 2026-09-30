"use client";

// ── SUPPLIER CREDIT, ON THE DASHBOARD ───────────────────────────────
//
// The owner, 29-09: "kunnen we in ons dashboard ook easy on balance
// zien wat we momenteel usd en eur hebben bij rockads en bij seamx."
//
// Until now this lived on two other people's websites. It is the figure
// that decides whether a verified top-up can actually be pushed today,
// and the admin verifying the queue could not see it.
//
// ADMIN AND OWNER ONLY. The route behind it is apiRequireAdmin and it
// names the suppliers — so this component must never be rendered on an
// advertiser or affiliate screen, whatever it is passed.
//
// THE THING THIS PANEL REFUSES TO DO is print a number it is not sure
// of. Four states come back per supplier and all four are shown as
// themselves: read, switched off, could not read, and MOCK. That last
// one matters most — SeamX answers from the mock adapter unless
// SUPPLIER1_MODE is exactly "live", the mock returns USD 5,000 with
// `ok: true`, and this panel is read by the person who decides whether
// to fund an account.

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  FlaskConical,
  Landmark,
  Coins,
  RefreshCw,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils-pure";
import { visibleLines } from "@/lib/pure-supplier-holdings";
import type { SupplierHolding } from "@/lib/pure-supplier-holdings";

type Grand = {
  eur: number;
  usd: number;
  combinedEur: number | null;
  rate: number | null;
  excluded: { supplier: string; why: string }[];
  notConverted: string[];
};

type Payload = {
  suppliers: SupplierHolding[];
  grand?: Grand;
  total: { currency: string; total: number }[];
  totalComplete: boolean;
  readAt: string;
};

const CSS = `
/* ── EEN MATRIX, GEEN STAPEL KAARTEN ───────────────────────────────
   De eigenaar, 29-09: "dit moet 10x mooier en kleiner zodat we bijna
   alle data op 1 mobile scherm kunnen zien."

   Het probleem was de VORM, niet de maat. Elke leverancier had een
   kop plus twee tegels, dus drie leveranciers zijn altijd drie
   schermen -- hoe klein je de letters ook maakt.

   Nu een matrix: leveranciers als rijen, valuta als kolommen. Alles
   past op een half scherm, en je kunt bovendien EUR over de
   leveranciers heen vergelijken, wat met tegels onder elkaar niet
   ging. Kleiner en beter tegelijk, en dat is de enige soort
   verkleining die de moeite waard is. */
.sc{--sc-pad:13px;border:1px solid var(--line);border-radius:14px;
  background:var(--panel);box-shadow:var(--shadow-sm);overflow:hidden}

.sc-head{display:flex;align-items:center;gap:9px;padding:10px var(--sc-pad);
  background:linear-gradient(180deg,var(--primary-tint),transparent)}
.sc-ic{width:26px;height:26px;border-radius:8px;background:var(--panel);
  color:var(--primary-600);display:grid;place-items:center;flex:0 0 auto;
  box-shadow:var(--shadow-sm)}
.sc-ic svg{width:14px;height:14px}
/* De titel duwt de knop naar rechts. Toen de ondertitel eruit ging
   verdween de kolom eromheen, en daarmee het enige element dat de
   knop op afstand hield -- hij schoof tegen de titel aan. */
.sc-head h3{margin:0;font-family:var(--hd);font-weight:800;font-size:.94rem;
  letter-spacing:-.01em;color:var(--ink);line-height:1.2;
  flex:1 1 auto;min-width:0}
/* Geen knop maar een teken. De eigenaar, 30-09: "refresh ook mooier
   subtieler, nu is standaard button." Een omrande knop naast een
   titel trekt evenveel aandacht als de titel; dit is een handeling
   die je zoekt als je hem nodig hebt, niet een die zich aanbiedt.
   Dus: rond, randloos, grijs, en pas een vlakje bij hover. */
.sc-re{flex:0 0 auto;margin-left:auto;display:inline-grid;place-items:center;
  width:30px;height:30px;border:0;background:none;border-radius:99px;
  color:var(--faint);cursor:pointer;transition:.13s}
.sc-re:hover{background:var(--panel-2);color:var(--txt-2)}
.sc-re svg{width:15px;height:15px}
.sc-re[disabled]{opacity:.5;cursor:default}
.sc-re[disabled]:hover{background:none}
/* Draait terwijl hij leest -- dat vervangt het woord "Reading...". */
.sc-re[disabled] svg{animation:sc-spin 1s linear infinite}
@keyframes sc-spin{to{transform:rotate(360deg)}}

/* DE MATRIX. Eerste kolom groeit, valutakolommen zijn even breed en
   rechts uitgelijnd zodat de cijfers onder elkaar staan. */
.sc-grid{width:100%;border-collapse:collapse;font-size:.83rem}
.sc-grid{table-layout:auto}
.sc-grid th,.sc-grid td{padding:7px 10px;text-align:right;
  border-top:1px solid var(--line);vertical-align:middle;white-space:nowrap}
/* De cijferkolommen krijgen precies wat ze nodig hebben; de naam
   krijgt de rest en kort in als die rest klein is.

   width:1% op een td betekent in tabellen "zo smal mogelijk", en
   width:100% op de eerste "al het overschot". Samen met max-width:0
   op die eerste cel krimpt de NAAM in plaats van dat de tabel breder
   wordt dan de kaart.

   Eerst probeerde ik width:auto met max-width:0, en toen loste de
   browser die kolom op naar zijn minimum: 27px, alleen de stip, alle
   namen weg. auto en 100% zijn hier niet uitwisselbaar. */
.sc-grid th:not(:first-child),.sc-grid td:not(:first-child){width:1%}
.sc-grid th:first-child,.sc-grid td:first-child{text-align:left;
  padding-left:var(--sc-pad);width:100%;max-width:0;overflow:hidden}
.sc-grid th:last-child,.sc-grid td:last-child{padding-right:var(--sc-pad)}
.sc-grid thead th{padding-top:6px;padding-bottom:6px;font-size:.62rem;
  font-weight:800;letter-spacing:.07em;text-transform:uppercase;
  color:var(--faint);white-space:nowrap}
/* GEEN eigen vlak voor de bankrijen. De eigenaar, 30-09: "teveel
   background kleuren hier." Hij telde er vier op elkaar -- wit, een
   blauwe tint voor de twee banken, grijs voor de totaalregel en nog
   een blauw voor de euro-regel. Dat een rij onze eigen bank is staat
   er al in woorden; daar hoeft geen tweede signaal bij. */
.sc-grid tbody tr.click{cursor:pointer}
.sc-grid tbody tr.click:hover{background:var(--panel-2)}
.sc-grid tbody tr.open{background:var(--panel-2)}

.sc-who{display:flex;align-items:center;gap:6px;min-width:0}
/* Een zacht vlakje onder het icoon in plaats van een los lijntje.
   Vier zwevende outline-icoontjes lezen als rommel; vier gevulde
   merkjes lezen als een rij. De kleur blijft de staat dragen, nu ook
   in de vulling -- dus subtieler EN duidelijker tegelijk. */
.sc-mark{width:22px;height:22px;flex:0 0 auto;display:grid;place-items:center;
  border-radius:7px;color:var(--win);
  background:color-mix(in srgb,var(--win) 13%,transparent)}
.sc-mark svg{width:13px;height:13px}
.sc-mark.warn{color:var(--warn);background:color-mix(in srgb,var(--warn) 15%,transparent)}
.sc-mark.bad{color:var(--danger);background:color-mix(in srgb,var(--danger) 13%,transparent)}
.sc-mark.idle{color:var(--faint);background:var(--panel-2)}
.sc-name{font-weight:800;font-family:var(--hd);font-size:.85rem;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  /* De naam is de identiteit van de rij en mag NOOIT het eerste zijn
     dat verdwijnt: hij krijgt de ruimte, de rest wijkt. */
  flex:1 1 auto;min-width:0}
.sc-chev{width:13px;height:13px;color:var(--faint);flex:0 0 auto;
  transition:transform .15s}
.sc-chev.ghost{visibility:hidden}
.sc-grid tbody tr.open .sc-chev{transform:rotate(180deg)}
.sc-when{display:block;color:var(--faint);font-size:.63rem;
  margin:1px 0 0 13px;white-space:nowrap}
.sc-amt{font-variant-numeric:tabular-nums;font-weight:700;white-space:nowrap}
.sc-amt.zero{color:var(--faint);font-weight:500}
.sc-amt.none{color:var(--faint);font-weight:500;font-size:.66rem;
  letter-spacing:.01em}
/* Telt niet mee in de voet: doorgestreept en grijs, met de reden in
   de tooltip. Zo hoef je geen regel onder de tabel te lezen om te
   weten dat deze rij niet meedoet. */
.sc-amt.out{color:var(--faint);font-weight:500;text-decoration:line-through;
  text-decoration-thickness:1px;opacity:.75}

/* EEN voet, EEN vlak. De twee regels erin verschillen door hun
   TYPE, niet door hun achtergrond: de tweede is het bedrag waar het
   om gaat, dus die krijgt de kleur en het gewicht. */
.sc-grid tfoot td{border-top:1px solid var(--line);background:var(--panel-2);
  font-weight:800;padding-top:8px;padding-bottom:8px}
.sc-grid tfoot tr:first-child td{border-top:2px solid var(--line-2)}
.sc-grid tfoot .lab{font-size:.62rem;letter-spacing:.07em;
  text-transform:uppercase;color:var(--faint);font-weight:800}
.sc-grid tfoot tr.eur td{border-top:1px dashed var(--line-2);padding-top:7px}
.sc-grid tfoot tr.eur .lab{color:var(--primary-600)}
.sc-grid tfoot tr.eur .sc-amt{color:var(--primary-600);font-size:1.05rem;
  letter-spacing:-.015em}

.sc-tag{font-size:.57rem;font-weight:800;letter-spacing:.05em;
  text-transform:uppercase;border-radius:999px;padding:1px 6px;flex:0 0 auto}
.sc-tag.demo{background:var(--warn-soft);color:var(--warn);border:1px solid var(--line-2)}
.sc-tag.off{background:var(--panel-2);color:var(--faint);border:1px solid var(--line)}
.sc-tag.bad{background:var(--danger-soft);color:var(--danger);border:1px solid var(--line-2)}

.sc-fnote{margin:0;padding:7px var(--sc-pad) 10px;font-size:.68rem;
  color:var(--faint);line-height:1.45;background:var(--panel-2)}
.sc-fnote.bad{color:var(--danger);background:var(--danger-soft)}

.sc-det{padding:0 var(--sc-pad) 12px;display:flex;flex-direction:column;gap:8px;
  background:var(--panel-2)}
.sc-part{display:flex;align-items:baseline;gap:10px;font-size:.8rem}
.sc-part .lbl{color:var(--txt-2)}
.sc-part .amt{margin-left:auto;font-variant-numeric:tabular-nums;font-weight:700}
.sc-sublist{border-top:1px dashed var(--line);padding-top:8px}
.sc-cap{font-size:.62rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;
  color:var(--faint);margin-bottom:4px}
.sc-note{font-size:.76rem;color:var(--txt-2);background:var(--panel);
  border:1px solid var(--line);border-radius:9px;padding:7px 9px;
  display:flex;gap:7px;align-items:flex-start}
.sc-note svg{width:14px;height:14px;flex:0 0 auto;margin-top:1px}
.sc-note.warn{background:var(--warn-soft);border-color:var(--line-2);color:var(--warn)}
.sc-note.bad{background:var(--danger-soft);border-color:var(--line-2);color:var(--danger)}
.sc-skel{height:12px;border-radius:5px;background:var(--panel-2);width:100px;
  display:inline-block;margin:10px var(--sc-pad)}

@media(max-width:430px){
  /* De synctijd kost de meeste breedte en is het minst dringend: op
     een telefoon staat hij in de tooltip van de rij in plaats van
     eronder. Daarmee past de naam naast twee valutakolommen zonder
     dat er iets afvalt. */
  .sc{--sc-pad:11px}
  .sc-grid{font-size:.78rem}
  .sc-grid th,.sc-grid td{padding:6px 7px}
  /* De synctijd kost breedte en staat in de tooltip van de rij. */
  .sc-when{display:none}
  .sc-re{padding:6px 8px}
  .sc-name{font-size:.8rem}
  .sc-amt{font-size:.82rem}
}
`;


/** EUR 1.234,56 with the code in front, so two currencies in a row can
 *  never be mistaken for one another at a glance. */
/** Het getal zonder valutateken -- de code staat al in de kolomkop.
 *  Twee keer "EUR" op een regel is ruis, en de kolom is wat het
 *  bedrag zijn betekenis geeft. */
function fmt(amount: number, currency: string): string {
  return formatCurrency(amount, currency).replace(/^[^\d-]+/, "");
}

/** "synced just now" / "synced at 14:52" / "synced 28 Sep 14:52" --
 *  kort, en nooit preciezer dan het is. */
function whenShort(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  const mins = Math.round((Date.now() - t.getTime()) / 60000);
  if (mins < 1) return "synced just now";
  if (mins < 60) return `synced ${mins} min ago`;
  const sameDay = new Date().toDateString() === t.toDateString();
  const hhmm = t.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return sameDay
    ? `synced at ${hhmm}`
    : `synced ${t.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ${hhmm}`;
}

/**
 * ALLEEN BIJ MOCKCIJFERS. Niet bij "off" en niet bij "error".
 *
 * Gemeten op 390px: de rijen van SeamX en Slash hadden een naam van
 * NUL pixels breed -- hun pil at de hele naamkolom op. En die pil zei
 * precies hetzelfde als wat er al in de valutacellen van diezelfde
 * rij stond: "not connected" en "unreadable".
 *
 * Een leverancier die niets levert vertelt dat dus al twee keer, en
 * de prijs was zijn eigen naam. Nu alleen een pil waar hij iets
 * TOEVOEGT: bij `demo` staan er wel bedragen, en die zien er echt
 * uit terwijl ze het niet zijn. Daar is een waarschuwing het waard.
 */
function StatusTag({ status }: { status: SupplierHolding["status"] }) {
  if (status === "demo") return <span className="sc-tag demo">test data</span>;
  return null;
}

/** Een leverancier als TWEE tabelrijen: de regel zelf, en -- als hij
 *  open staat -- een regel eronder met wat erachter zit. */
function SupplierRows({
  s,
  currencies,
  open,
  onToggle,
}: {
  s: SupplierHolding;
  currencies: string[];
  open: boolean;
  onToggle: () => void;
}) {
  // Een doorklik die niets toont is een klik die mensen afleert. Een
  // wallet-lijst telt alleen als hij iets zegt wat de valutakop niet
  // al zegt -- RockAds noemt zijn euro-wallet "EUR".
  const informative = (l: SupplierHolding["lines"][number]) =>
    l.parts.length > 1 ||
    (l.parts.length === 1 &&
      l.parts[0].label.trim().toUpperCase() !== l.currency);
  const hasDetail =
    !!s.error || s.lines.some((l) => informative(l) || l.heldBack !== null);

  const byCur = new Map(s.lines.map((l) => [l.currency, l.total]));
  // Telt deze rij mee in de totalen eronder? Zo niet, dan hoort dat
  // aan de rij te zien te zijn en niet in een zin onder de tabel.
  const counts = s.status === "ok" || s.status === "off";
  const nothing =
    s.status === "off"
      ? "not connected"
      : s.status === "error"
        ? "unreadable"
        : "—";

  return (
    <>
      <tr
        className={`${s.kind === "bank" ? "bank " : ""}${hasDetail ? "click " : ""}${open ? "open" : ""}`}
        onClick={hasDetail ? onToggle : undefined}
        // Op een telefoon is .sc-when verborgen om breedte te winnen,
        // dus de synctijd moet ergens anders te vinden zijn. Hier, op
        // de rij, waar je hem zoekt.
        title={[
          s.kind === "bank" ? "Our own bank account" : "Credit at a supplier",
          s.readAt ? whenShort(s.readAt) : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      >
        <td>
          <span className="sc-who">
  
            {/* ── EEN ICOON IN PLAATS VAN EEN STIP ──────────────────
                De eigenaar, 30-09: "in plaats van our bank misschien
                een icon in plaats van zo'n rond bolletje? dus in
                plaats van 4 bolletjes 4 icons?"

                Beter dan wat er stond, om een reden die hij niet
                hoefde te noemen: de stip droeg alleen de STAAT, en de
                soort stond er als woorden naast ("our bank"). Nu
                draagt één teken allebei -- de VORM zegt wat het is,
                een winkel voor een leverancier en een bankgebouw voor
                onze eigen rekening, en de KLEUR zegt hoe het ervoor
                staat. Daarmee kan het label "our bank" weg, en dat
                was precies de tekst die om ruimte vocht met de naam. */}
            <span
              className={`sc-mark${
                s.status === "error"
                  ? " bad"
                  : s.status === "demo"
                    ? " warn"
                    : s.status === "off"
                      ? " idle"
                      : ""
              }`}
              aria-hidden="true"
            >
              {/* Landmark voor een bank, Coins voor een leverancier:
                  daar staat KREDIET, geld dat alleen daar besteed kan
                  worden. Store was een winkelpui en dat is RockAds
                  niet; Vault werd op 13 pixels een doosje met een
                  kruis erin. Twee munten blijven op die maat leesbaar
                  als geld. */}
              {s.kind === "bank" ? <Landmark /> : <Coins />}
            </span>
            <span className="sc-name">{s.supplier}</span>
            <StatusTag status={s.status} />
            <ChevronDown className={`sc-chev${hasDetail ? "" : " ghost"}`} />
          </span>
          {/* "our bank" ONDER de naam, niet ernaast. De eigenaar,
              30-09: "our bank vind ik niet mooi geplaatst ofzo."
              Naast de naam vocht het om dezelfde horizontale ruimte
              -- en dat is precies de ruimte waarin de naam al moest
              inkorten. Eronder, op de regel waar de synctijd staat,
              kost het niets.

              De synctijd verdwijnt op een telefoon (hij zit in de
              tooltip van de rij); "our bank" blijft, want dat is geen
              tijdstempel maar wat de rij IS. */}
          {s.readAt ? (
            <span className="sc-when">
              {s.readAt ? whenShort(s.readAt) : null}
            </span>
          ) : null}
        </td>
        {currencies.map((c) => {
          const v = byCur.get(c);
          return (
            <td key={c}>
              {v === undefined ? (
                <span className="sc-amt none">{nothing === "—" ? "—" : nothing}</span>
              ) : (
                <span
                  className={`sc-amt${Math.abs(v) < 0.005 ? " zero" : ""}${
                    counts ? "" : " out"
                  }`}
                  title={
                    counts
                      ? undefined
                      : s.status === "demo"
                        ? "Mock figures — not counted in the total"
                        : "Not counted in the total"
                  }
                >
                  {fmt(v, c)}
                </span>
              )}
            </td>
          );
        })}
      </tr>
      {open ? (
        <tr>
          <td colSpan={currencies.length + 1} style={{ padding: 0 }}>
            <div className="sc-det">

          {s.status === "demo" ? (
            <div className="sc-note warn">
              <FlaskConical />
              <span>
                These are the mock adapter&apos;s figures, not SeamX&apos;s.
                They are the same numbers every time and they are not
                money. Set SUPPLIER1_MODE to &quot;live&quot; to read the
                real balance.
              </span>
            </div>
          ) : null}
          {s.status === "error" && s.error ? (
            <div className="sc-note bad">
              <AlertTriangle />
              <span>{s.error}</span>
            </div>
          ) : null}
          {s.status !== "error" && s.status !== "demo" && s.error ? (
            <div className="sc-note">
              <AlertTriangle />
              <span>{s.error}</span>
            </div>
          ) : null}

          {s.lines.map((l) => (
            <div key={l.currency}>
              {/* What the supplier is holding back. For SeamX this is the
                  DST reserve — the tax they take off our balance before
                  we can spend it. It is the only DST figure either
                  supplier reports, and it is worth seeing beside the
                  gross: a spendable figure well under the balance is
                  why an account cannot be funded for the full amount. */}
              {l.heldBack !== null ? (
                <div className="sc-sublist">
                  <div className="sc-cap">{l.currency}</div>
                  <div className="sc-part">
                    <span className="lbl">Balance</span>
                    <span className="amt">
                      {formatCurrency(l.total, l.currency)}
                    </span>
                  </div>
                  <div className="sc-part">
                    <span className="lbl">Held back (tax reserve / DST)</span>
                    <span className="amt">
                      −{formatCurrency(l.heldBack, l.currency)}
                    </span>
                  </div>
                  <div className="sc-part">
                    <span className="lbl">
                      <b>Spendable now</b>
                    </span>
                    <span className="amt">
                      <b>
                        {formatCurrency(l.available ?? l.total, l.currency)}
                      </b>
                    </span>
                  </div>
                </div>
              ) : null}

              {informative(l) ? (
                <div className="sc-sublist">
                  <div className="sc-cap">
                    {l.currency} — {l.parts.length}{" "}
                    {l.parts.length === 1 ? "wallet" : "wallets"}
                  </div>
                  {l.parts.map((p, i) => (
                    <div className="sc-part" key={`${p.label}-${i}`}>
                      <span className="lbl">{p.label}</span>
                      <span className="amt">
                        {formatCurrency(p.amount, l.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
                    </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

export default function SupplierCredit() {
  const q = useQuery<Payload>({
    queryKey: ["supplier-balances"],
    queryFn: async () => {
      const res = await fetch("/api/supplier-balances", { cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(body?.error || `The balances did not load (${res.status}).`);
      }
      return (await res.json()) as Payload;
    },
    // Two third-party calls per read, so it does not refetch on every
    // window focus — but a minute-old supplier balance is still worth
    // re-reading when somebody comes back to the tab.
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const suppliers = q.data?.suppliers ?? [];
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());

  // De kolommen: elke valuta die ERGENS voorkomt, EUR en USD eerst.
  // Een leverancier die een valuta niet heeft krijgt een streepje in
  // die kolom -- dat is iets anders dan nul, en in een matrix moet
  // dat verschil zichtbaar blijven.
  const currencies = (() => {
    const seen = new Set<string>();
    for (const s of suppliers) {
      for (const l of visibleLines(s.lines)) seen.add(l.currency);
    }
    const rank = (c: string) => (c === "EUR" ? 0 : c === "USD" ? 1 : 2);
    return [...seen].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  })();

  return (
    <div className="sc">
      <style>{CSS}</style>
      {/* ── KOP OP EEN REGEL ──────────────────────────────────────
          De eigenaar, 29-09: "minder tekst zodat refresh mooi naast
          titel kan." De ondertitel was drie regels lang en duwde de
          knop naar beneden. Titel en knop delen nu een rij; de uitleg
          staat eronder in een halve zin.

          En de titel heet niet meer naar de leveranciers alleen: Wise
          staat er sinds vandaag bij, en dat is ONS geld, geen krediet
          bij iemand anders. */}
      {/* Titel EN ondertitel in dezelfde kolom, naast het icoon. De
          ondertitel stond hiervoor als broer van de hele kop en dus
          tegen de linkerrand van de kaart -- dat was de scheve
          uitlijning. */}
      <div className="sc-head">
        <span className="sc-ic">
          <Landmark />
        </span>
        {/* Alleen de titel. De ondertitel zei wat de kaart al toont:
            bedragen per leverancier. "What a top-up can be funded
            from today" is een zin die je één keer leest en daarna
            elke dag overslaat. */}
        <h3>What we hold</h3>
        <button
          type="button"
          className="sc-re"
          onClick={() => q.refetch()}
          disabled={q.isFetching}
          aria-label="Refresh"
          title="Refresh"
        >
          <RefreshCw />
        </button>
      </div>

      {q.isPending ? (
        <span className="sc-skel" />
      ) : q.isError ? (
        <div className="sc-det" style={{ padding: "12px 13px" }}>
          <div className="sc-note bad">
            <AlertTriangle />
            <span>
              {(q.error as Error)?.message ??
                "The supplier balances could not be read."}
            </span>
          </div>
        </div>
      ) : (
        <table className="sc-grid">
          <thead>
            <tr>
              <th />
              {currencies.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <SupplierRows
                key={s.supplier}
                s={s}
                currencies={currencies}
                open={openRows.has(s.supplier)}
                onToggle={() =>
                  setOpenRows((prev) => {
                    const next = new Set(prev);
                    if (next.has(s.supplier)) next.delete(s.supplier);
                    else next.add(s.supplier);
                    return next;
                  })
                }
              />
            ))}
          </tbody>
          {/* ── ALLES BIJ ELKAAR ────────────────────────────────
              De eigenaar: "hieronder ook totaal eur + usd en samen
              converted tot EUR." Als voet van dezelfde tabel, zodat
              de totalen recht onder hun eigen kolom staan -- dat is
              het hele voordeel van een matrix boven losse tegels. */}
          {q.data?.grand ? (
            <tfoot>
              <tr>
                <td className="lab">Together</td>
                {currencies.map((c) => (
                  <td key={c}>
                    <span className="sc-amt">
                      {c === "EUR"
                        ? fmt(q.data!.grand!.eur, "EUR")
                        : c === "USD"
                          ? fmt(q.data!.grand!.usd, "USD")
                          : "—"}
                    </span>
                  </td>
                ))}
              </tr>
              {q.data.grand.combinedEur !== null ? (
                <tr className="eur">
                  <td className="lab">All of it, in euro</td>
                  <td colSpan={currencies.length}>
                    <span
                      className="sc-amt"
                      title={
                        q.data.grand.rate
                          ? `USD converted at ${q.data.grand.rate.toFixed(4)}`
                          : undefined
                      }
                    >
                      EUR {fmt(q.data.grand.combinedEur, "EUR")}
                    </span>
                  </td>
                </tr>
              ) : null}
            </tfoot>
          ) : null}
        </table>
      )}

      {/* ── GEEN VOETNOOT MEER ────────────────────────────────
          De eigenaar, 29-09: "USD at 0.8780 · SeamX (test data) not
          counted -- deze tekst onnodig."

          Weg, maar niet de INFORMATIE. Die stond in een zin onder de
          tabel en hoort naast het cijfer waar hij over gaat:

          - dat SeamX niet meetelt is nu te zien AAN de rij zelf --
            zijn bedragen staan doorgestreept en grijs, met de reden
            in de tooltip. Een regel tekst onderaan lezen om te weten
            dat de rij erboven niet meedoet is een omweg.
          - de koers zit in de tooltip van het omgerekende bedrag,
            want dat is het enige cijfer waar hij iets over zegt.

          Wat er WEL een zin waard blijft is een leverancier die niet
          ANTWOORDDE: dan ontbreekt er geld dat we niet kunnen zien,
          en dat is geen detail van een rij maar een gat in het
          totaal. */}
      {/* GEEN ZIN MEER OVER EEN LEVERANCIER DIE NIET ANTWOORDDE.
          De eigenaar, 30-09: "we zien toch unreadable, is genoeg."

          Klopt, en de matrix is de reden. In de oude gestapelde vorm
          stond een mislukte lees ergens halverwege de kaart en kon je
          hem missen; toen was een regel onderaan terecht. Nu staat
          "unreadable" in elke valutakolom van die rij, met een rode
          stip en een pil, recht boven de totaalregel waar hij niet in
          meetelt. Een zin eronder zegt hetzelfde een vierde keer. */}
    </div>
  );
}

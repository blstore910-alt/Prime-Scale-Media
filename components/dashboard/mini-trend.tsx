"use client";

// ── EEN GRAFIEKJE DAT NIET SCHREEUWT ────────────────────────────────
//
// De eigenaar, 30-09: "deze stijl van balkjes bij de metrics vind ik
// echt lelijk, maak er iets anders wows van", en: "als er geen
// currencys of iets extra is laat gewoon leeg, haal al die teksten
// weg."
//
// ── WAAROM DE STAAFJES ZO LELIJK WAREN ────────────────────────────
//
// Niet de kleur en niet de maat. Het waren er TE WEINIG. Zes kaarten
// tekenden een `BarChart` met `maxBarSize:32`, en op "Today" heeft die
// reeks vaak precies EEN punt. Een staafdiagram met een enkele staaf
// is geen grafiek -- het is een blauwe rechthoek van 32 pixels breed
// in een vak van 96 hoog, en die leest als een fout in de opmaak.
// Bovendien tekende hij ook de staaf van de valuta die 0 was, dus
// stond er een volle balk naast een onzichtbare.
//
// ── WAT ER NU STAAT ───────────────────────────────────────────────
//
// Een vloeiend vlak met een verlopende vulling, een lijn van twee
// pixels erbovenop, en een stip op het laatste punt. Geen raster, geen
// assen, geen kader. Dat werkt bij twintig punten en het werkt bij
// twee, want een lijn met een stip is bij elke lengte een vorm.
//
// En bij EEN punt tekent hij niks. Een trend van een enkel getal
// bestaat niet, en de kaart heeft dat getal al groot bovenaan staan.
//
// ── EEN REEKS DIE NUL IS WORDT NIET GETEKEND ──────────────────────
//
// Per valuta apart bekeken. Stonden er alleen euro's binnen, dan komt
// de dollarlijn er niet bij -- geen platte lijn op de bodem die eruit
// ziet als "gemeten en nul". Dat is dezelfde regel als overal in deze
// app: een nul en een leegte zijn niet hetzelfde, en van de twee is de
// leegte hier het eerlijke antwoord.
//
// ── EEN GEDEELD BESTAND, GEEN ZES ─────────────────────────────────
//
// De zes kaarten hadden elk hun eigen negentig regels grafiekopmaak,
// verschoven ten opzichte van elkaar. Daarom stond dit verzoek er ook
// als "de metrics" en niet als "die ene kaart". Een volgende wijziging
// aan de stijl is nu een wijziging.

import { Area, AreaChart, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatCurrency } from "@/lib/utils-pure";

export type TrendPoint = {
  label: string;
  usd_amount: number;
  eur_amount: number;
  usd_count: number;
  eur_count: number;
  count: number;
};

const CHART_CONFIG = {
  eur_amount: { label: "EUR", color: "var(--chart-1)" },
  usd_amount: { label: "USD", color: "var(--chart-2)" },
} satisfies ChartConfig;

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(Math.floor(value));
}

/** Heeft deze valuta ook echt iets gedaan in de reeks? Op het BEDRAG
 *  kijken en niet op de telling: een rij met een telling maar zonder
 *  bedrag levert een platte lijn op, en dat is het ding dat we juist
 *  niet willen tekenen. */
function hasMovement(rows: TrendPoint[], key: "usd_amount" | "eur_amount") {
  return rows.some((r) => Number(r[key]) > 0);
}

export function MiniTrend({
  series,
  /** false op het dashboard van een medewerker-admin: daar staan
   *  aantallen en geen bedragen, dus een bedragengrafiek hoort er niet. */
  amounts = true,
}: {
  series: TrendPoint[] | null | undefined;
  amounts?: boolean;
}) {
  const rows = series ?? [];

  const showUsd = amounts && hasMovement(rows, "usd_amount");
  const showEur = amounts && hasMovement(rows, "eur_amount");

  // Onder de twee punten is er geen verloop om te laten zien. Niks
  // tekenen is dan beter dan een vorm die suggereert dat er iets te
  // zien valt -- en het is precies wat de eigenaar vroeg: laat leeg.
  if (rows.length < 2 || (!showUsd && !showEur)) return null;

  return (
    <ChartContainer
      config={CHART_CONFIG}
      className="mt-2 h-16 w-full aspect-auto"
    >
      <AreaChart
        data={rows}
        margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
      >
        <defs>
          {/* Het verloop is wat het een vlak maakt in plaats van een
              gekleurde plaat: vol aan de bovenkant, weg naar de bodem. */}
          <linearGradient id="mt-eur" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-eur_amount)" stopOpacity={0.34} />
            <stop offset="100%" stopColor="var(--color-eur_amount)" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="mt-usd" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-usd_amount)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--color-usd_amount)" stopOpacity={0.02} />
          </linearGradient>
        </defs>

        {/* Verborgen, maar hij doet wel iets: de bodem op 0 vastzetten.
            Zonder dit schaalt recharts op de laagste waarde in de reeks
            en ziet een stijging van 74 naar 75 euro eruit als een
            verdubbeling. */}
        <YAxis hide domain={[0, "dataMax"]} />

        <ChartTooltip
          cursor={false}
          content={(props) => {
            const point = props.payload?.[0]?.payload as TrendPoint | undefined;
            if (!point || point.count <= 0) return null;
            return (
              <ChartTooltipContent
                active={props.active}
                payload={props.payload}
                label={props.label}
                hideIndicator
                labelFormatter={(_, payload) =>
                  (payload?.[0]?.payload as TrendPoint | undefined)?.label ?? ""
                }
                formatter={(value, name, item) => {
                  const p = item.payload as TrendPoint;
                  const isUsd = name === "usd_amount";
                  const currency = isUsd ? "USD" : "EUR";
                  const count = isUsd ? p.usd_count : p.eur_count;
                  return (
                    <div className="flex w-full items-center justify-between gap-4 font-semibold">
                      <span className="text-muted-foreground">{currency}</span>
                      <span className="font-mono tabular-nums">
                        {formatCurrency(Number(value) || 0, currency)} (
                        {formatNumber(count)})
                      </span>
                    </div>
                  );
                }}
              />
            );
          }}
        />

        {showEur ? (
          <Area
            dataKey="eur_amount"
            type="monotone"
            stroke="var(--color-eur_amount)"
            strokeWidth={2}
            fill="url(#mt-eur)"
            // De stip staat op het LAATSTE punt en verder nergens: dat
            // is waar het nu staat, en dat is het enige punt waar je
            // een kaart als deze voor opent.
            dot={false}
            activeDot={{ r: 3.5, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        ) : null}
        {showUsd ? (
          <Area
            dataKey="usd_amount"
            type="monotone"
            stroke="var(--color-usd_amount)"
            strokeWidth={2}
            fill="url(#mt-usd)"
            dot={false}
            activeDot={{ r: 3.5, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        ) : null}
      </AreaChart>
    </ChartContainer>
  );
}

// ── DEZELFDE VORM, MAAR VOOR MENSEN IN PLAATS VAN GELD ─────────────
//
// De aanmeldingenkaart telt adverteerders en affiliates en heeft geen
// valuta. Dat is een eigen component en geen vlag op de bovenstaande,
// om een reden die in deze app al vaker geld heeft gekost: een
// component die twee dingen kan met een schakelaar ertussen krijgt
// vroeg of laat een tooltip die euro's zet bij een aantal mensen.
// Twee componenten die er hetzelfde uitzien is hier goedkoper dan een
// die twee betekenissen draagt.

export type CountTrendPoint = {
  label: string;
  advertisers_count: number;
  affiliates_count: number;
  count: number;
};

const COUNT_CONFIG = {
  advertisers_count: { label: "Advertisers", color: "var(--chart-1)" },
  affiliates_count: { label: "Affiliates", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function MiniTrendCounts({
  series,
}: {
  series: CountTrendPoint[] | null | undefined;
}) {
  const rows = series ?? [];
  const showAdv = rows.some((r) => Number(r.advertisers_count) > 0);
  const showAff = rows.some((r) => Number(r.affiliates_count) > 0);

  if (rows.length < 2 || (!showAdv && !showAff)) return null;

  return (
    <ChartContainer
      config={COUNT_CONFIG}
      className="mt-2 h-16 w-full aspect-auto"
    >
      <AreaChart data={rows} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="mt-adv" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-advertisers_count)" stopOpacity={0.34} />
            <stop offset="100%" stopColor="var(--color-advertisers_count)" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="mt-aff" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-affiliates_count)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--color-affiliates_count)" stopOpacity={0.02} />
          </linearGradient>
        </defs>

        {/* Aantallen zijn hele mensen. De bodem op 0 en de top op het
            hoogste punt, zodat een sprong van 1 naar 2 er niet uitziet
            als een sprong van niets naar alles. */}
        <YAxis hide domain={[0, "dataMax"]} />

        <ChartTooltip
          cursor={false}
          content={(props) => {
            const point = props.payload?.[0]?.payload as
              | CountTrendPoint
              | undefined;
            if (!point || point.count <= 0) return null;
            return (
              <ChartTooltipContent
                active={props.active}
                payload={props.payload}
                label={props.label}
                hideIndicator
                labelFormatter={(_, payload) =>
                  (payload?.[0]?.payload as CountTrendPoint | undefined)
                    ?.label ?? ""
                }
                formatter={(value, name) => (
                  <div className="flex w-full items-center justify-between gap-4 font-semibold">
                    <span className="text-muted-foreground">
                      {name === "advertisers_count" ? "Advertisers" : "Affiliates"}
                    </span>
                    <span className="font-mono tabular-nums">
                      {formatNumber(Number(value) || 0)}
                    </span>
                  </div>
                )}
              />
            );
          }}
        />

        {showAdv ? (
          <Area
            dataKey="advertisers_count"
            type="monotone"
            stroke="var(--color-advertisers_count)"
            strokeWidth={2}
            fill="url(#mt-adv)"
            dot={false}
            activeDot={{ r: 3.5, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        ) : null}
        {showAff ? (
          <Area
            dataKey="affiliates_count"
            type="monotone"
            stroke="var(--color-affiliates_count)"
            strokeWidth={2}
            fill="url(#mt-aff)"
            dot={false}
            activeDot={{ r: 3.5, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        ) : null}
      </AreaChart>
    </ChartContainer>
  );
}

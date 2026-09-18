"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import {
  getRockadsAdAccounts,
  getRockadsStatus,
  getRockadsWallets,
} from "@/actions/rockads-actions";

/**
 * What a new supplier's API can see, and what it cannot.
 *
 * ADMIN SURFACE ONLY. It shows the commission we pay the supplier — our
 * cost — and it names the supplier. Neither may appear anywhere an
 * advertiser or an affiliate can reach, including in the JSON behind
 * their page. This component lives under /settings, which is admin-gated.
 *
 * Nothing here can write. The adapter has no deposit and no withdraw, on
 * purpose: a flag is not a safety measure, and while we are testing it
 * must be impossible for something to happen to a real ad account by
 * accident.
 */
const money = (n: number, cur: string) =>
  `${cur === "USD" ? "$" : cur === "EUR" ? "€" : cur + " "}${n.toLocaleString(
    "en-US",
    { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  )}`;

export default function RockadsPanel() {
  const status = useQuery({
    queryKey: ["rockads-status"],
    queryFn: () => getRockadsStatus(),
    staleTime: 60_000,
  });
  const live = status.data?.ok ? status.data.data : null;
  const connected = !!live?.credentialsSet && live.walletsStatus === 200;

  const wallets = useQuery({
    queryKey: ["rockads-wallets"],
    enabled: connected,
    staleTime: 60_000,
    queryFn: () => getRockadsWallets(),
  });
  const accounts = useQuery({
    queryKey: ["rockads-accounts"],
    enabled: connected,
    staleTime: 60_000,
    queryFn: () => getRockadsAdAccounts(),
  });

  return (
    <div
      className="psmview rkwrap"
      style={{ display: "grid", gap: 14, minWidth: 0 }}
    >
      <style>{CSS}</style>

      <div className="phead">
        <div className="ptxt">
          {/* NAMED. There are two suppliers now and the other one's
              connectivity lives in the card above, so a panel called
              "Supplier API" is ambiguous the moment you have both. */}
          <h2>RockAds (supplier)</h2>
          {/* 34 characters is the budget — a longer subtitle is cut
              mid-word on a phone. The full sentence lives at the foot of
              the panel, where there is room for it. */}
          <p>Read-only. It cannot write.</p>
        </div>
        <div className="actrow">
          <button
            className="btn ghost sm"
            disabled={status.isFetching}
            onClick={() => {
              void status.refetch();
              void wallets.refetch();
              void accounts.refetch();
            }}
          >
            <RefreshCw
              className={status.isFetching ? "animate-spin" : undefined}
            />
            Check again
          </button>
        </div>
      </div>

      {status.isLoading ? (
        <div className="card" style={{ padding: 28, textAlign: "center" }}>
          <Loader2 className="animate-spin" style={{ width: 20, height: 20 }} />
        </div>
      ) : !status.data?.ok ? (
        <div className="card">
          <p className="err" style={{ margin: 0 }}>
            {status.data?.error ?? "Couldn't check the supplier API."}
          </p>
        </div>
      ) : !live?.credentialsSet ? (
        /* The one state worth saying plainly: it is not that the supplier
           has nothing, it is that we never asked. */
        <div className="card">
          <p style={{ margin: 0, fontWeight: 650 }}>Not connected.</p>
          <p className="muted" style={{ margin: "6px 0 0", fontSize: ".9rem" }}>
            {live?.said}
          </p>
          {/* WHICH ONE. A tick per variable, so a typo in one name or a
              value saved to the wrong Vercel environment is visible at a
              glance instead of being four possibilities behind one
              sentence. */}
          <ul className="rkenv">
            <li className={live?.keySet ? "on" : "off"}>
              ROCKADS_API_KEY {live?.keySet ? "reached this deployment" : "did not"}
            </li>
            <li className={live?.secretSet ? "on" : "off"}>
              ROCKADS_API_SECRET{" "}
              {live?.secretSet ? "reached this deployment" : "did not"}
            </li>
          </ul>
          <p className="muted" style={{ margin: "8px 0 0", fontSize: ".82rem" }}>
            If you have set them: check the Environment they were saved to
            (they must be on Production), check the spelling, and redeploy —
            a deployment that already existed does not pick up new
            variables.
          </p>
        </div>
      ) : (
        <>
          <div className="rkt">
            <div className="rk">
              <b>{live.accountCount}</b>
              <span>Ad accounts</span>
            </div>
            <div className="rk">
              <b>{live.walletCount}</b>
              <span>Credit accounts</span>
            </div>
            <div className="rk">
              <b>{live.currencies.join(" · ") || "—"}</b>
              <span>Currencies</span>
            </div>
          </div>

          {live.said ? (
            <div className="card">
              <p className="err" style={{ margin: 0, fontSize: ".9rem" }}>
                {live.said}
              </p>
            </div>
          ) : null}

          {/* Their credit, which is what a top-up spends. */}
          <div className="card">
            <h3 style={{ margin: "0 0 8px", fontSize: ".95rem" }}>
              Credit we hold with them
            </h3>
            {wallets.isLoading ? (
              <p className="muted" style={{ margin: 0 }}>
                Asking…
              </p>
            ) : !wallets.data?.ok ? (
              <p className="err" style={{ margin: 0 }}>
                {wallets.data?.error}
              </p>
            ) : wallets.data.data.wallets.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                They report no credit accounts.
              </p>
            ) : (
              <div className="rkrows">
                {wallets.data.data.wallets.map((w) => (
                  <div key={w.id} className="rkrow">
                    <div>
                      <b>{w.name || w.currency}</b>
                      <div className="muted" style={{ fontSize: ".78rem" }}>
                        Transfer reference {w.code}
                      </div>
                    </div>
                    <span className="mono">{money(w.balance, w.currency)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* The accounts, and what each one costs US. */}
          <div className="card">
            <h3 style={{ margin: "0 0 4px", fontSize: ".95rem" }}>
              Their ad accounts
            </h3>
            <p
              className="muted"
              style={{ margin: "0 0 8px", fontSize: ".8rem", lineHeight: 1.45 }}
            >
              What each one costs us. Admins only.
            </p>
            {accounts.isLoading ? (
              <p className="muted" style={{ margin: 0 }}>
                Asking…
              </p>
            ) : !accounts.data?.ok ? (
              <p className="err" style={{ margin: 0 }}>
                {accounts.data?.error}
              </p>
            ) : accounts.data.data.accounts.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                They report no ad accounts on this key.
              </p>
            ) : (
              <div className="rkrows">
                {accounts.data.data.accounts.map((a) => (
                  <div key={a.id} className="rkrow">
                    <div style={{ minWidth: 0 }}>
                      <b>{a.name || a.aliasName || a.id}</b>
                      {/* Only what means something. Their platform id is a
                          UUID, not the 1/3/4 the docs promise, so when we
                          cannot name the platform we say nothing rather
                          than printing the id where a name belongs. */}
                      <div className="muted" style={{ fontSize: ".78rem" }}>
                        {[
                          a.platform,
                          a.status,
                          a.supplierCommission
                            ? `costs us ${a.supplierCommission.rate}%`
                            : "cost not reported",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                    <span className="mono">{money(a.balance, a.currency)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="muted" style={{ margin: 0, fontSize: ".8rem" }}>
            Funding an account through their API is deliberately not built.
            It moves real credit, and while we are testing that has to be
            impossible rather than merely switched off.
          </p>
        </>
      )}
    </div>
  );
}

const CSS = `
/* NOTHING HERE MAY BE WIDER THAN ITS PHONE. Three fixed columns could not
   shrink, so the third tile sat off the right edge and every line beside
   it ran past the screen. auto-fit means three across on a laptop and two
   on a phone, and every box is allowed to be narrower than its contents so
   the TEXT gives way instead of the layout. */
.rkwrap{min-width:0;overflow-x:hidden}
.rkt{display:grid;grid-template-columns:repeat(auto-fit,minmax(104px,1fr));
  gap:8px;min-width:0}
.rk{background:var(--panel);border:1px solid var(--line);border-radius:12px;
  padding:9px 11px;min-width:0;overflow:hidden}
.rk b{display:block;font-family:var(--hd);font-size:1.05rem;font-weight:800;
  letter-spacing:-.02em;overflow:hidden;text-overflow:ellipsis;
  white-space:nowrap}
.rk span{display:block;font-size:.62rem;color:var(--txt-2);
  text-transform:uppercase;letter-spacing:.05em;font-weight:800;margin-top:2px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rkrows{display:flex;flex-direction:column;gap:6px;min-width:0}
.rkrow{display:flex;align-items:center;justify-content:space-between;gap:10px;
  padding:8px 0;border-top:1px solid var(--line);min-width:0}
.rkrow:first-child{border-top:0}
.rkrow > div{min-width:0}
.rkrow b{font-size:.9rem;font-weight:650;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap;display:block}
/* The second line under a name is the one that ran off: a long account
   name plus a platform plus a status plus a percentage. It clips. */
.rkrow .muted{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rkrow .mono{font-weight:700;white-space:nowrap;flex:0 0 auto}
.rkhead p{overflow-wrap:anywhere}
.rkenv{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:4px;
  font-size:.82rem}
.rkenv li{display:flex;align-items:center;gap:7px}
.rkenv li::before{content:"";width:7px;height:7px;border-radius:50%;
  flex:0 0 auto}
.rkenv li.on{color:var(--win)}
.rkenv li.on::before{background:var(--win)}
.rkenv li.off{color:var(--danger)}
.rkenv li.off::before{background:var(--danger)}
`;

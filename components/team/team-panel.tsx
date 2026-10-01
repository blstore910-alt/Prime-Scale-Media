"use client";

// ── HET TEAM ────────────────────────────────────────────────────────
//
// Multi-user fase 3. Zie docs/TEAM_ACCOUNTS.md en actions/team-actions.ts.
//
// Twee gezichten, afhankelijk van wie kijkt:
//
//   de EIGENAAR  ziet zijn leden, de openstaande uitnodigingen, en kan
//                een collega uitnodigen of weer verwijderen;
//   een TEAMLID  ziet alleen bij wie hij meekijkt, en in welke rol. Hij
//                kan niemand toevoegen -- dat is aan de eigenaar.
//
// ── DE LINK STAAT ER ALTIJD BIJ ───────────────────────────────────
//
// Na het uitnodigen toont het scherm de link om te kopieren, ook als de
// mail wel ging. Een mail kan in spam belanden of bij een adres dat
// niemand leest; de eigenaar kan hem dan zelf doorsturen.
//
// ── HET ONTWERP ────────────────────────────────────────────────────
//
// De eigenaar, 01-10: "maak team design meer pro en wow". Drie kaarten
// in plaats van een: wat een collega WEL en NIET kan (dat is de vraag
// die iemand stelt voor hij iemand uitnodigt), het uitnodigen zelf, en
// wie er al bij is. De rechten staan als vinkjes en kruisjes, niet als
// zin: een eigenaar moet in een oogopslag zien dat geld veilig is.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useT } from "@/hooks/use-t";
import { copyText } from "@/lib/copy-text";
import {
  cancelTeamInvite,
  inviteTeamMember,
  listTeam,
  removeTeamMember,
  setTeamMemberPermissions,
} from "@/actions/team-actions";

// De rechten per lid (plak 184), in de volgorde waarin een klant ze
// denkt: geld erin, geld rond, geld eruit, papierwerk.
const RECHTEN = ["topup", "exchange", "request", "fund", "withdraw", "pay", "company"] as const;

const CSS = `
.tm{display:flex;flex-direction:column;gap:14px}
.tm .tcard{position:relative;background:var(--panel);border:1px solid var(--line);
  border-radius:18px;padding:18px;box-shadow:0 10px 30px -22px rgba(30,42,90,.35)}
.tm .hero{overflow:hidden;background:
  radial-gradient(120% 140% at 0% 0%,rgba(91,141,255,.16),transparent 55%),
  radial-gradient(120% 140% at 100% 100%,rgba(139,92,246,.14),transparent 55%),var(--panel)}
.tm .hero-top{display:flex;align-items:center;gap:12px}
.tm .glyph{width:44px;height:44px;border-radius:14px;flex:0 0 auto;display:grid;place-items:center;
  color:#fff;background:linear-gradient(135deg,#5B8DFF,#8B5CF6);
  box-shadow:0 8px 22px -8px rgba(91,141,255,.75)}
.tm .glyph svg{width:22px;height:22px;stroke:currentColor;fill:none;stroke-width:2;
  stroke-linecap:round;stroke-linejoin:round}
.tm .hero h3{margin:0;font-size:1.02rem;font-weight:800;color:var(--ink);letter-spacing:-.01em}
.tm .hero p{margin:2px 0 0;font-size:.8rem;color:var(--txt-2);line-height:1.45}
.tm .rights{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}
.tm .rcol{border-radius:14px;padding:10px 12px;background:var(--panel);border:1px solid var(--line)}
.tm .rcol h4{margin:0 0 6px;font-size:.62rem;font-weight:800;letter-spacing:.08em;
  text-transform:uppercase;color:var(--faint)}
.tm .rcol ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:5px}
.tm .rcol li{display:flex;align-items:center;gap:7px;font-size:.8rem;color:var(--ink);font-weight:600}
.tm .dot{width:18px;height:18px;border-radius:99px;display:grid;place-items:center;flex:0 0 auto;
  font-size:.66rem;font-weight:900}
.tm .dot.yes{background:rgba(16,185,129,.14);color:#059669}
.tm .dot.no{background:rgba(239,68,68,.12);color:#dc2626}
.tm .lbl{font-size:.64rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;
  color:var(--faint);margin:0 0 8px;display:flex;align-items:center;gap:8px}
.tm .lbl .n{font-size:.62rem;padding:1px 7px;border-radius:99px;background:var(--panel-2);color:var(--txt-2)}
.tm .inv{display:flex;gap:8px}
.tm .field{position:relative;flex:1 1 auto;min-width:0}
.tm .field svg{position:absolute;left:11px;top:50%;transform:translateY(-50%);width:16px;height:16px;
  stroke:var(--faint);fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.tm .field input{width:100%;box-sizing:border-box;font:inherit;font-size:.9rem;padding:11px 12px 11px 34px;
  border:1px solid var(--line-2);border-radius:12px;background:var(--panel);color:var(--ink);
  transition:border-color .15s,box-shadow .15s}
.tm .field input:focus{outline:0;border-color:var(--primary);box-shadow:0 0 0 4px var(--primary-tint)}
.tm .go{font:inherit;font-weight:800;font-size:.86rem;padding:0 16px;border-radius:12px;border:0;
  color:#fff;cursor:pointer;background:linear-gradient(135deg,#5B8DFF,#8B5CF6);
  box-shadow:0 8px 20px -10px rgba(91,141,255,.9);flex:0 0 auto}
.tm .go:disabled{opacity:.45;cursor:default;box-shadow:none}
.tm .link{display:flex;align-items:center;gap:8px;margin-top:12px;padding:8px 8px 8px 12px;
  border-radius:12px;background:var(--panel-2);border:1px dashed var(--line-2)}
.tm .link code{flex:1 1 auto;min-width:0;font-size:.74rem;color:var(--ink);white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis;font-family:ui-monospace,monospace}
.tm .link button{font:inherit;font-size:.76rem;font-weight:800;padding:6px 10px;border-radius:9px;
  border:1px solid var(--line-2);background:var(--panel);color:var(--primary-600);cursor:pointer}
.tm .hint{font-size:.74rem;color:var(--faint);margin:6px 2px 0}
.tm .row{display:flex;align-items:center;gap:11px;padding:11px 0;border-top:1px solid var(--line)}
.tm .row:first-of-type{border-top:0;padding-top:2px}
.tm .av{width:38px;height:38px;border-radius:99px;flex:0 0 auto;display:grid;place-items:center;
  font-size:.78rem;font-weight:800;color:#fff;background:linear-gradient(135deg,#5B8DFF,#8B5CF6)}
.tm .av.alt{background:linear-gradient(135deg,#0ea5e9,#6366f1)}
.tm .av.wait{background:var(--panel-2);color:var(--faint);border:1.5px dashed var(--line-2)}
.tm .who{min-width:0;flex:1 1 auto}
.tm .who b{display:block;font-weight:700;font-size:.9rem;color:var(--ink);white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis}
.tm .who span{display:block;font-size:.75rem;color:var(--faint);white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis}
.tm .rol{font-size:.62rem;font-weight:800;letter-spacing:.07em;text-transform:uppercase;
  padding:4px 9px;border-radius:99px;background:var(--panel-2);color:var(--txt-2);flex:0 0 auto}
.tm .rol.owner{color:#fff;background:linear-gradient(135deg,#5B8DFF,#8B5CF6)}
.tm .x{font:inherit;font-size:.76rem;font-weight:700;padding:6px 10px;border-radius:9px;
  border:1px solid var(--line-2);background:var(--panel);color:var(--danger);cursor:pointer;flex:0 0 auto}
.tm .x:disabled{opacity:.5;cursor:default}
.tm .empty{font-size:.8rem;color:var(--faint);margin:8px 0 0}
.tm .err{font-size:.8rem;color:var(--danger);margin:0}
.tm .sk{height:38px;border-radius:12px;background:var(--panel-2);margin:6px 0;
  animation:tmPulse 1.2s ease-in-out infinite}
@keyframes tmPulse{50%{opacity:.55}}
.tm .perms{display:flex;flex-wrap:wrap;gap:6px;margin:-2px 0 10px 49px}
.tm .perm{display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:.74rem;font-weight:700;
  padding:6px 10px;border-radius:99px;cursor:pointer;border:1px solid var(--line-2);
  background:var(--panel);color:var(--txt-2);transition:background .15s,color .15s,border-color .15s}
.tm .perm .box{width:14px;height:14px;border-radius:4px;border:1.5px solid var(--line-2);display:grid;
  place-items:center;font-size:.6rem;color:#fff}
.tm .perm.on{background:var(--primary-tint);border-color:var(--primary);color:var(--primary-600)}
.tm .perm.on .box{background:linear-gradient(135deg,#5B8DFF,#8B5CF6);border-color:transparent}
.tm .perm:disabled{opacity:.6;cursor:default}
.tm .permhint{margin:-4px 0 10px 49px;font-size:.72rem;color:var(--faint)}
@media (max-width:420px){.tm .rights{grid-template-columns:1fr}.tm .perms,.tm .permhint{margin-left:0}}
`;

const initials = (s: string | null | undefined) =>
  String(s ?? "")
    .replace(/@.*/, "")
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0))
    .join("")
    .toUpperCase() || "?";

function UsersGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function Rights() {
  const { t } = useT();
  return (
    <div className="rights">
      <div className="rcol">
        <h4>{t("label.teamAlways")}</h4>
        <ul>
          <li><span className="dot yes">✓</span>{t("team.canBalances")}</li>
          <li><span className="dot yes">✓</span>{t("team.canAccounts")}</li>
          <li><span className="dot yes">✓</span>{t("team.canInvoices")}</li>
        </ul>
      </div>
      <div className="rcol">
        <h4>{t("label.teamIfTicked")}</h4>
        <ul>
          <li><span className="dot yes">+</span>{t("team.tickMoney")}</li>
          <li><span className="dot yes">+</span>{t("team.tickRequests")}</li>
          <li><span className="dot no">✕</span>{t("team.notTeam")}</li>
        </ul>
      </div>
    </div>
  );
}

export default function TeamPanel({
  teamRole,
  accountCode,
}: {
  /** Gezet als DEZE gebruiker een teamlid is; leeg voor de eigenaar. */
  teamRole?: string | null;
  accountCode?: string | null;
}) {
  const { t } = useT();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<string | null>(null);

  // ── EEN TEAMLID ZIET ALLEEN WAAR HIJ STAAT ─────────────────────
  if (teamRole) {
    return (
      <div className="tm">
        <style>{CSS}</style>
        <div className="tcard hero">
          <div className="hero-top">
            <div className="glyph"><UsersGlyph /></div>
            <div>
              <h3>{accountCode ?? t("team.title")}</h3>
              <p>
                {t("team.memberIntro", {
                  account: accountCode ?? "",
                  role:
                    teamRole === "manager"
                      ? t("label.roleManager")
                      : t("label.roleViewer"),
                })}
              </p>
            </div>
          </div>
          <Rights />
        </div>
      </div>
    );
  }

  return <EigenaarsTeam {...{ qc, email, setEmail, link, setLink }} />;
}

function EigenaarsTeam({
  qc,
  email,
  setEmail,
  link,
  setLink,
}: {
  qc: ReturnType<typeof useQueryClient>;
  email: string;
  setEmail: (v: string) => void;
  link: string | null;
  setLink: (v: string | null) => void;
}) {
  const { t } = useT();
  const team = useQuery({
    queryKey: ["team"],
    queryFn: async () => {
      const res = await listTeam();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  const vernieuw = () => void qc.invalidateQueries({ queryKey: ["team"] });

  const nodig = useMutation({
    mutationFn: async () => {
      const res = await inviteTeamMember(email);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (d) => {
      setLink(d.link);
      setEmail("");
      toast.success(d.emailSent ? t("team.sent") : t("team.sentNoMail"));
      vernieuw();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const weg = useMutation({
    mutationFn: async (id: string) => {
      const res = await removeTeamMember(id);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success(t("team.removed"));
      vernieuw();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const rechten = useMutation({
    mutationFn: async (v: { id: string; permissions: string[] }) => {
      const res = await setTeamMemberPermissions(v.id, v.permissions);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      toast.success(t("team.rightsSaved"));
      vernieuw();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const intrekken = useMutation({
    mutationFn: async (id: string) => {
      const res = await cancelTeamInvite(id);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success(t("team.cancelled"));
      vernieuw();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const members = team.data?.members ?? [];
  const invites = team.data?.invites ?? [];

  return (
    <div className="tm">
      <style>{CSS}</style>

      <div className="tcard hero">
        <div className="hero-top">
          <div className="glyph"><UsersGlyph /></div>
          <div>
            <h3>{t("team.title")}</h3>
            <p>{t("team.ownerIntro")}</p>
          </div>
        </div>
        <Rights />
      </div>

      <div className="tcard">
        <div className="lbl">{t("label.inviteColleague")}</div>
        <form
          className="inv"
          onSubmit={(e) => {
            e.preventDefault();
            if (!nodig.isPending && email.trim()) nodig.mutate();
          }}
        >
          <div className="field">
            <svg viewBox="0 0 24 24" aria-hidden>
              <rect width="20" height="16" x="2" y="4" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("team.placeholder")}
              aria-label={t("label.inviteColleague")}
            />
          </div>
          <button type="submit" className="go" disabled={nodig.isPending || !email.trim()}>
            {nodig.isPending ? t("btn.sending") : t("btn.invite")}
          </button>
        </form>
        {link ? (
          <>
            <div className="link">
              <code>{link}</code>
              <button
                type="button"
                onClick={async () => {
                  const ok = await copyText(link);
                  if (ok) toast.success(t("team.linkCopied"));
                  else toast.error(t("team.copyFailed"));
                }}
              >
                {t("btn.copyLink")}
              </button>
            </div>
            <p className="hint">{t("team.linkHint")}</p>
          </>
        ) : null}
      </div>

      <div className="tcard">
        {team.isPending ? (
          <>
            <div className="sk" />
            <div className="sk" />
          </>
        ) : team.isError ? (
          <p className="err">
            {(team.error as Error).message} {t("team.notEmpty")}
          </p>
        ) : (
          <>
            <div className="lbl">
              {t("label.members")} <span className="n">{members.length}</span>
            </div>
            {members.map((m, i) => (
              <div key={m.id}>
              <div className="row">
                <div className={`av${i % 2 ? " alt" : ""}`}>{initials(m.name ?? m.email)}</div>
                <div className="who">
                  <b>
                    {m.name ?? m.email ?? "—"}
                    {m.isYou ? ` ${t("team.you")}` : ""}
                  </b>
                  <span>{m.email ?? ""}</span>
                </div>
                <span className={`rol${m.role === "owner" ? " owner" : ""}`}>
                  {m.role === "owner"
                    ? t("label.roleOwner")
                    : (m.permissions ?? []).length
                      ? t("label.roleMember")
                      : t("label.roleViewer")}
                </span>
                {m.role !== "owner" ? (
                  <button
                    className="x"
                    disabled={weg.isPending}
                    onClick={() => weg.mutate(m.id)}
                  >
                    {t("btn.remove")}
                  </button>
                ) : null}
              </div>
              {m.role !== "owner" ? (
                <>
                  <div className="perms">
                    {RECHTEN.map((r) => {
                      const aan = (m.permissions ?? []).includes(r);
                      return (
                        <button
                          key={r}
                          type="button"
                          className={`perm${aan ? " on" : ""}`}
                          aria-pressed={aan}
                          disabled={rechten.isPending}
                          onClick={() =>
                            rechten.mutate({
                              id: m.id,
                              permissions: aan
                                ? (m.permissions ?? []).filter((x) => x !== r)
                                : [...(m.permissions ?? []), r],
                            })
                          }
                        >
                          <span className="box">{aan ? "✓" : ""}</span>
                          {t(`team.perm.${r}` as Parameters<typeof t>[0])}
                        </button>
                      );
                    })}
                  </div>
                  {!(m.permissions ?? []).length ? (
                    <p className="permhint">{t("team.onlyViewing")}</p>
                  ) : null}
                </>
              ) : null}
              </div>
            ))}
            {members.length <= 1 && !invites.length ? (
              <p className="empty">{t("team.onlyYou")}</p>
            ) : null}

            {invites.length ? (
              <>
                <div className="lbl" style={{ marginTop: 14 }}>
                  {t("label.waitingToAccept")} <span className="n">{invites.length}</span>
                </div>
                {invites.map((i) => (
                  <div key={i.id} className="row">
                    <div className="av wait">{initials(i.email)}</div>
                    <div className="who">
                      <b>{i.email}</b>
                      <span>
                        {i.role === "manager" ? t("label.roleManager") : t("label.roleViewer")} ·{" "}
                        {t("team.until", { date: new Date(i.expiresAt).toLocaleDateString() })}
                      </span>
                    </div>
                    <button
                      className="x"
                      disabled={intrekken.isPending}
                      onClick={() => intrekken.mutate(i.id)}
                    >
                      {t("btn.cancel")}
                    </button>
                  </div>
                ))}
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

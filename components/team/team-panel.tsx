"use client";

// ── HET TEAM, IN SETTINGS ───────────────────────────────────────────
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

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  cancelTeamInvite,
  inviteTeamMember,
  listTeam,
  removeTeamMember,
} from "@/actions/team-actions";

const CSS = `
.team{display:flex;flex-direction:column;gap:12px}
.team .row{display:flex;align-items:center;gap:10px;padding:10px 0;
  border-top:1px solid var(--line)}
.team .row:first-child{border-top:0}
.team .who{min-width:0;flex:1 1 auto}
.team .who b{display:block;font-weight:700;color:var(--ink);white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis}
.team .who span{display:block;font-size:.76rem;color:var(--faint);white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis}
.team .rol{font-size:.64rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;
  padding:3px 8px;border-radius:99px;background:var(--panel-2);color:var(--txt-2);flex:0 0 auto}
.team .rol.owner{background:var(--primary-tint);color:var(--primary-600)}
.team .x{font:inherit;font-size:.78rem;font-weight:700;padding:5px 10px;border-radius:9px;
  border:1px solid var(--line-2);background:var(--panel);color:var(--danger);cursor:pointer;flex:0 0 auto}
.team .x:disabled{opacity:.5;cursor:default}
.team .inv{display:flex;gap:8px}
.team .inv input{flex:1 1 auto;min-width:0;font:inherit;font-size:.9rem;padding:9px 11px;
  border:1px solid var(--line-2);border-radius:10px;background:var(--panel);color:var(--ink)}
.team .inv input:focus{outline:0;border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-tint)}
.team .link{font-size:.78rem;word-break:break-all;padding:9px 11px;border-radius:10px;
  background:var(--panel-2);color:var(--ink);font-family:ui-monospace,monospace}
.team .cap{font-size:.8rem;color:var(--txt-2);margin:0}
.team .sub{font-size:.66rem;font-weight:800;letter-spacing:.07em;text-transform:uppercase;
  color:var(--faint);margin-top:4px}
`;

export default function TeamPanel({
  teamRole,
  accountCode,
}: {
  /** Gezet als DEZE gebruiker een teamlid is; leeg voor de eigenaar. */
  teamRole?: string | null;
  accountCode?: string | null;
}) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<string | null>(null);

  // ── EEN TEAMLID ZIET ALLEEN WAAR HIJ STAAT ─────────────────────
  if (teamRole) {
    return (
      <div className="team">
        <style>{CSS}</style>
        <p className="cap">
          You are on <b>{accountCode ?? "this"}</b>&apos;s account as a{" "}
          <b>{teamRole}</b>. You can see balances, ad accounts and invoices;
          only the account owner can move money or change the team.
        </p>
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
      toast.success(
        d.emailSent
          ? "Invitation sent — the link is below too."
          : "Invitation created, but the email didn't go. Copy the link below.",
      );
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
      toast.success("Removed from the team");
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
      toast.success("Invitation cancelled");
      vernieuw();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="team">
      <style>{CSS}</style>
      <p className="cap">
        Let a colleague see this account — balances, ad accounts and
        invoices. They cannot move money.
      </p>

      <div className="inv">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="colleague@company.com"
          aria-label="Colleague's email"
        />
        <button
          className="btn"
          disabled={nodig.isPending || !email.trim()}
          onClick={() => nodig.mutate()}
        >
          {nodig.isPending ? "Sending…" : "Invite"}
        </button>
      </div>

      {link ? (
        <div>
          <div className="sub">Invitation link</div>
          <div className="link">{link}</div>
        </div>
      ) : null}

      {team.isPending ? (
        <p className="cap">Loading…</p>
      ) : team.isError ? (
        <p className="cap" style={{ color: "var(--danger)" }}>
          {(team.error as Error).message} This is not an empty team.
        </p>
      ) : (
        <>
          <div className="sub">Members</div>
          <div>
            {(team.data?.members ?? []).map((m) => (
              <div key={m.id} className="row">
                <div className="who">
                  <b>
                    {m.name ?? m.email ?? "—"}
                    {m.isYou ? " (you)" : ""}
                  </b>
                  <span>{m.email ?? ""}</span>
                </div>
                <span className={`rol${m.role === "owner" ? " owner" : ""}`}>
                  {m.role}
                </span>
                {m.role !== "owner" ? (
                  <button
                    className="x"
                    disabled={weg.isPending}
                    onClick={() => weg.mutate(m.id)}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            ))}
          </div>

          {(team.data?.invites ?? []).length ? (
            <>
              <div className="sub">Waiting to accept</div>
              <div>
                {team.data!.invites.map((i) => (
                  <div key={i.id} className="row">
                    <div className="who">
                      <b>{i.email}</b>
                      <span>
                        {i.role} · until {new Date(i.expiresAt).toLocaleDateString()}
                      </span>
                    </div>
                    <button
                      className="x"
                      disabled={intrekken.isPending}
                      onClick={() => intrekken.mutate(i.id)}
                    >
                      Cancel
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

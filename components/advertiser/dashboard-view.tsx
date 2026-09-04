"use client";

import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { PLATFORMS } from "@/lib/constants";
import { Wallet as WalletType } from "@/lib/types/wallet";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import {
  ArrowRight,
  Clock,
  Monitor,
  Plus,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import WalletExchangeDialog from "@/components/wallet/wallet-exchange-dialog";
import WalletTopupDialog from "@/components/wallet/wallet-topup-dialog";

dayjs.extend(relativeTime);

type AcctRow = {
  id: string;
  name: string | null;
  platform: string | null;
  status: string | null;
  fee: number | null;
};
type SubRow = {
  amount: number | null;
  status: string | null;
  next_payment_date: string | null;
};

const fmt = (v: number | string | null | undefined, currency: "EUR" | "USD") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(v ?? 0));

const platformLabel = (p: string | null) =>
  PLATFORMS.find((x) => x.value === p)?.label ?? p ?? "—";

export default function AdvertiserDashboardView() {
  const { profile } = useAppContext();
  const advertiserId = profile?.advertiser?.[0]?.id ?? null;
  const tenantId = profile?.tenant_id ?? null;
  const firstName = ((profile?.full_name as string) ?? "there").split(" ")[0];

  const [topupOpen, setTopupOpen] = useState(false);
  const [exchangeOpen, setExchangeOpen] = useState(false);

  const { data: wallet } = useQuery<WalletType | null>({
    queryKey: ["wallet", advertiserId],
    enabled: !!advertiserId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("wallets")
        .select("*")
        .eq("advertiser_id", advertiserId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as WalletType | null;
    },
  });

  const { data: accounts } = useQuery<AcctRow[]>({
    queryKey: ["dash-accounts", advertiserId],
    enabled: !!advertiserId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("ad_accounts")
        .select("id, name, platform, status, fee")
        .eq("advertiser_id", advertiserId);
      if (error) throw error;
      return (data ?? []) as AcctRow[];
    },
  });

  const { data: subscription } = useQuery<SubRow | null>({
    queryKey: ["dash-subscription", advertiserId, tenantId],
    enabled: !!advertiserId && !!tenantId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("subscriptions")
        .select("amount, status, next_payment_date")
        .eq("advertiser_id", advertiserId)
        .eq("tenant_id", tenantId)
        .order("start_date", { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data?.[0] ?? null) as SubRow | null;
    },
  });

  const activeCount = (accounts ?? []).filter(
    (a) => a.status === "active",
  ).length;
  const totalCount = (accounts ?? []).length;
  const preview = (accounts ?? []).slice(0, 3);

  const eur = Number(wallet?.eur_balance ?? 0);
  const usd = Number(wallet?.usd_balance ?? 0);

  const feeDue =
    subscription?.amount && subscription?.next_payment_date
      ? {
          amount: Number(subscription.amount),
          when: dayjs(subscription.next_payment_date),
        }
      : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="phead">
        <div>
          <h1>Welcome back, {firstName}</h1>
          <p>Here&apos;s how your account is doing.</p>
        </div>
      </div>

      {feeDue && (
        <div className="alert">
          <span className="ai">
            <Clock />
          </span>
          <div className="atx">
            <b>Monthly fee {fmt(feeDue.amount, "EUR")}</b>
            <span> · due {feeDue.when.fromNow()}</span>
          </div>
          <Link className="btn sm" href="/my-subscription">
            Pay now
          </Link>
        </div>
      )}

      <div className="stats">
        <Link className="stat" href="/accounts">
          <div className="k">
            <span className="ci b">
              <Monitor />
            </span>{" "}
            Active ad accounts
          </div>
          <div className="v">{activeCount}</div>
        </Link>
        <Link className="stat" href="/wallet">
          <div className="k">
            <span className="ci t">
              <Wallet />
            </span>{" "}
            EUR balance
          </div>
          <div className="v">{fmt(eur, "EUR")}</div>
        </Link>
        <Link className="stat" href="/wallet">
          <div className="k">
            <span className="ci p">
              <Wallet />
            </span>{" "}
            USD balance
          </div>
          <div className="v">{fmt(usd, "USD")}</div>
        </Link>
        <Link className="stat" href="/my-subscription">
          <div className="k">
            <span className="ci g">
              <ShieldCheck />
            </span>{" "}
            Subscription
          </div>
          <div className="v" style={{ textTransform: "capitalize" }}>
            {subscription?.status ?? "—"}
          </div>
        </Link>
      </div>

      <div className="card">
        <div className="phead" style={{ alignItems: "center" }}>
          <h2>Your ad accounts</h2>
          <Link className="btn ghost sm" href="/accounts">
            View all <ArrowRight />
          </Link>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))",
            gap: 12,
            marginTop: 14,
          }}
        >
          {preview.length ? (
            preview.map((a) => (
              <Link key={a.id} href="/accounts" className="acard">
                <div className="top">
                  <span className="pfi">
                    <Monitor />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div className="nm">{a.name || "Ad account"}</div>
                    <div className="sub">{platformLabel(a.platform)}</div>
                  </div>
                </div>
                <div className="kv">
                  <span>Status</span>
                  <b style={{ textTransform: "capitalize" }}>
                    {a.status ?? "—"}
                  </b>
                </div>
                <div className="kv">
                  <span>Fee</span>
                  <b>{a.fee ?? 0}%</b>
                </div>
              </Link>
            ))
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              No ad accounts yet.{" "}
              <Link href="/accounts" style={{ color: "var(--primary-600)" }}>
                Request your first one
              </Link>
              .
            </p>
          )}
        </div>
        {totalCount > 3 && (
          <p className="muted" style={{ margin: "12px 0 0", fontSize: ".85rem" }}>
            Showing 3 of {totalCount}.
          </p>
        )}
      </div>

      <div className="phead" style={{ marginTop: 2 }}>
        <h2>Your wallets</h2>
        <Link className="btn ghost sm" href="/wallet">
          Open wallet <ArrowRight />
        </Link>
      </div>
      <div className="grid2">
        <div className="wallet eur">
          <div className="wsh" />
          <div className="wl">EUR wallet</div>
          <div className="wv">{fmt(eur, "EUR")}</div>
          <div className="wavail">
            <b>{fmt(eur, "EUR")}</b> available
          </div>
          <div className="wa">
            <button
              className="wbtn"
              onClick={() => setTopupOpen(true)}
              disabled={!wallet}
            >
              <Plus /> Top up
            </button>
            <button
              className="wbtn gh"
              onClick={() => setExchangeOpen(true)}
              disabled={!wallet}
            >
              Exchange
            </button>
          </div>
        </div>
        <div className="wallet usd">
          <div className="wsh" />
          <div className="wl">USD wallet</div>
          <div className="wv">{fmt(usd, "USD")}</div>
          <div className="wavail">
            <b>{fmt(usd, "USD")}</b> available
          </div>
          <div className="wa">
            <button
              className="wbtn"
              onClick={() => setTopupOpen(true)}
              disabled={!wallet}
            >
              <Plus /> Top up
            </button>
            <button
              className="wbtn gh"
              onClick={() => setExchangeOpen(true)}
              disabled={!wallet}
            >
              Exchange
            </button>
          </div>
        </div>
      </div>

      <WalletTopupDialog
        open={topupOpen}
        onOpenChange={setTopupOpen}
        walletId={wallet?.id ?? null}
        referenceNo={wallet?.reference_no ?? null}
        minTopup={wallet?.min_topup as number}
      />
      <WalletExchangeDialog
        open={exchangeOpen}
        onOpenChange={setExchangeOpen}
        walletId={wallet?.id ?? null}
        usdBalance={usd}
        eurBalance={eur}
      />
    </div>
  );
}

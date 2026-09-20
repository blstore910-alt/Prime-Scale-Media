import React from "react";
import Link from "next/link";
import {
  BookOpen,
  Mail,
  MessageCircle,
  ShieldCheck,
  Wallet,
} from "lucide-react";

export default function Help() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10 space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">Help &amp; support</h1>
        <p className="text-muted-foreground">
          Common questions and where to go next.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Common tasks</h2>
        <div className="grid gap-3">
          <HelpCard
            icon={Wallet}
            title="How do I top up my wallet?"
            // "within one business day" is a service level nothing
            // measures, alerts on or escalates — there is no timer on the
            // verify queue anywhere in the app. Saying what we do instead
            // of what we guarantee costs nothing and is true.
            body="Go to Wallet → Add Balance. Choose currency and account group, transfer using the exact reference shown, then submit the amount. We check it against the bank and credit it by hand — message us if it has not appeared."
          />
          <HelpCard
            icon={ShieldCheck}
            title="How do I keep my account safe?"
            body="Use a 12+ character password. Enable push notifications so you see admin actions in real time. If you lose a device, sign out everywhere: Settings for advertisers and affiliates, Profile for admins."
          />
          <HelpCard
            icon={BookOpen}
            title="Where do I see what changed?"
            body='Your last 20 actions are listed under Settings (advertisers and affiliates) or Profile (admins). The owner can see everything under Audit Log.'
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Still stuck?</h2>
        <div className="rounded-lg border p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">
              Email your tenant admin — they can look up your account in the
              admin panel.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">
              For urgent issues (login broken, wallet balance wrong), your
              admin has an incident runbook.
            </span>
          </div>
        </div>
      </section>

      <section className="text-xs text-muted-foreground">
        <Link href="/profile" className="hover:underline">
          Back to profile →
        </Link>
      </section>
    </main>
  );
}

function HelpCard({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border p-4 flex gap-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted shrink-0">
        <Icon className="h-4 w-4" />
      </div>
      <div className="space-y-1">
        <p className="font-medium text-sm">{title}</p>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

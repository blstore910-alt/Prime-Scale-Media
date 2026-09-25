type AdAccountRequestAdvertiserProfile = {
  full_name: string | null;
  email: string | null;
};

type AdAccountRequestAdvertiser = {
  id: string;
  tenant_client_code: string | null;
  profile: AdAccountRequestAdvertiserProfile | null;
};

export type AdAccountRequest = {
  id: string;
  advertiser_id: string | null;
  tenant_id: string | null;
  created_at: string;
  // Present on the table (it is in the _touch_updated_at trigger list) but
  // optional here because the live schema is hand-authored; checkVersion
  // tolerates it being absent and simply skips the guard.
  updated_at?: string | null;
  platform: string | null;
  currency: string | null;
  timezone: string | null;
  website_url: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  status: string | null;
  rejection_reason: string | null;
  email: string | null;
  // What the request cost and what came back when it was turned down.
  // Optional for the same reason updated_at is: these five are added by a
  // migration that is pasted by hand, and the customer's Requests list
  // reads them with select("*") -- so where the migration has not landed
  // they are simply undefined and the refund line does not render,
  // instead of the screen breaking on a column that is not there.
  charged_amount?: number | string | null;
  charged_currency?: string | null;
  charged_at?: string | null;
  refunded_amount?: number | string | null;
  refunded_at?: string | null;
  advertiser?: AdAccountRequestAdvertiser | null;
};

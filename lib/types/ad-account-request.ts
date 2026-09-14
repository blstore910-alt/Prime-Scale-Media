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
  advertiser?: AdAccountRequestAdvertiser | null;
};

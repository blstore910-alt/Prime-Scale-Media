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

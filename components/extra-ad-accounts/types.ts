export type ExtraAdAccountAdvertiserProfile =
  | { full_name: string | null }
  | { full_name: string | null }[]
  | null;

export type ExtraAdAccountAdvertiser = {
  tenant_client_code: string | null;
  profile: ExtraAdAccountAdvertiserProfile;
} | null;

export type ExtraAdAccount = {
  id: string;
  advertiser_id: string;
  tenant_id: string;
  amount: number | string | null;
  created_at: string;
  updated_at: string;
  advertiser?: ExtraAdAccountAdvertiser;
};

export type ExtraAdAccountsQueryParams = {
  page?: number;
  perPage?: number;
};

export interface Company {
  id: string;
  created_at: string;
  name: string | null;
  official_email: string | null;
  phone: string | null;
  website_url: string | null;
  vat_no: string | null;
  registration_no: string | null;
  address: string | null;
  country: string | null;
  state: string | null;
  zipcode: string | null;
  advertiser_id: string | null;
  tenant_id: string;
  user_profile_id: string;
  is_vat_registered: boolean | null;
}

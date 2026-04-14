import { Advertiser } from "./advertiser";
import { Company } from "./company";

export type InvoiceItem = {
  tax: number;
  name: string;
  rate: number;
  amount: number;
  quantity: number;
  currency: string;
};

export type Invoice = {
  id: string;
  created_at: string;
  updated_at: string;
  number: number;
  tenant_id: string;
  company_id: string | null;
  items: InvoiceItem[] | null;
  sub_total: number | null;
  total: number | null;
  advertiser_id: string | null;
  status: string | null;
  paid_at: string | null;
  type: string | null;
};

export type InvoiceWithRelations = Invoice & {
  company?: Company | null;
  advertiser?: Advertiser | null;
};

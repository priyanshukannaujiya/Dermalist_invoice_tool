export interface CreatorProfile {
  id?: number | null;
  name: string;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  pan?: string | null;
  upi_id?: string | null;
  bank_account?: string | null;
  ifsc?: string | null;
  account_holder?: string | null;
  bank_name?: string | null;
  is_msme?: boolean;
  msme_registration_no?: string | null;
}

export interface InvoiceDraft {
  invoice_number: string;
  invoice_date: string;
  payment_terms: string;
  service_description: string;
  quantity: number;
  unit_price: number;
  taxable_value: number;
  discount: number;
  subtotal_less_discount: number;
  balance_due: number;
  video_link?: string;
  creator: CreatorProfile;
  creatorMatched?: boolean;
  raw_prompt?: string;
}

export interface InvoiceTransaction {
  date: string; // yyyy-MM-dd
  history: string;
  originalCurrency: number | null;
  usd: number | null;
  usdRate: number | null;
  brl: number | null;
  installment: string;
  value: number;
  source: { page: number; line: number };
  warnings: string[];
}

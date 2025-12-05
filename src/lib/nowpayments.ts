// src/lib/nowpayments.ts
const API_BASE = "https://api.nowpayments.io/v1";

export type CreateInvoiceInput = {
  price_amount: number;       // en USD
  price_currency: string;     // "usd"
  order_id: string;           // nuestro ID de orden
  order_description?: string;
  success_url?: string;
  cancel_url?: string;
  ipn_callback_url?: string;
  // pay_currency?: string;   // opcional: BTC, USDT, etc (si quieres forzar)
};

export async function npFetch(path: string, init: RequestInit = {}) {
  const apiKey = process.env.NOWPAYMENTS_API_KEY!;
  const headers = new Headers(init.headers || {});
  headers.set("x-api-key", apiKey);
  headers.set("Content-Type", "application/json");
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`NowPayments ${path} ${res.status}: ${txt}`);
  }
  return res.json();
}

export async function createInvoice(input: CreateInvoiceInput) {
  return npFetch("/invoice", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// Verifica IPN (HMAC SHA-512 del body con NOWPAYMENTS_IPN_SECRET)
export function verifyIpnSignature(rawBody: string, signatureHeader: string | null | undefined) {
  const secret = process.env.NOWPAYMENTS_IPN_SECRET || "";
  if (!secret || !signatureHeader) return false;

  // HMAC SHA-512
  const crypto = require("crypto");
  const h = crypto.createHmac("sha512", secret).update(rawBody, "utf8").digest("hex");
  return h === signatureHeader;
}

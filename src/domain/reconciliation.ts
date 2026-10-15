import type { InvoiceTransaction } from "./transaction";

export interface ReconciliationResult {
  positiveTotal: number;
  negativeTotal: number;
  netTotal: number;
  controlTotal: number | null;
  difference: number | null;
  isBalanced: boolean;
}

function toCents(value: number): number {
  const absolute = Math.abs(value);
  // Compensa a representação binária nos meios centavos; créditos usam a mesma regra.
  return Math.sign(value) * Math.round((absolute + absolute * Number.EPSILON) * 100);
}

export function reconcileInvoice(
  transactions: InvoiceTransaction[],
  controlTotal: number | null,
  tolerance = 0.01,
): ReconciliationResult {
  let positiveCents = 0;
  let negativeCents = 0;
  let hasInvalidValue = false;

  for (const transaction of transactions) {
    if (!Number.isFinite(transaction.value)) {
      hasInvalidValue = true;
      continue;
    }

    const cents = toCents(transaction.value);
    if (cents > 0) positiveCents += cents;
    else negativeCents += cents;
  }

  const netCents = positiveCents + negativeCents;
  const differenceCents = !hasInvalidValue && controlTotal !== null && Number.isFinite(controlTotal)
    ? netCents - toCents(controlTotal)
    : null;

  return {
    positiveTotal: positiveCents / 100,
    negativeTotal: negativeCents / 100,
    netTotal: netCents / 100,
    controlTotal,
    difference: differenceCents === null ? null : differenceCents / 100,
    isBalanced: differenceCents !== null && Math.abs(differenceCents) <= toCents(tolerance),
  };
}

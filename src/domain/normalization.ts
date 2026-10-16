export function parseBrDecimal(input: string): number | null {
  const normalized = input.replace(/[\u00a0\u202f]/g, "").trim();
  if (!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?-?$/.test(normalized)) {
    return null;
  }
  if (normalized.startsWith("-") && normalized.endsWith("-")) {
    return null;
  }

  const negative = normalized.startsWith("-") || normalized.endsWith("-");
  const magnitude = Number(normalized.replace(/[-.]/g, "").replace(",", "."));
  return Number.isFinite(magnitude) ? (negative ? -magnitude : magnitude) : null;
}

export function inferTransactionDate(dayMonth: string, referenceDate: Date): string {
  if (!/^\d{2}\/\d{2}$/.test(dayMonth) || !Number.isFinite(referenceDate.getTime())) {
    throw new RangeError("Data ou referência inválida");
  }

  const day = Number(dayMonth.slice(0, 2));
  const month = Number(dayMonth.slice(3, 5));
  let year = referenceDate.getUTCFullYear();
  // A referência e a candidata usam UTC, inclusive na virada de mês/ano.
  if (Date.UTC(year, month - 1, day) > referenceDate.getTime()) {
    year -= 1;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new RangeError("Data do lançamento inválida");
  }

  return date.toISOString().slice(0, 10);
}

export function extractInstallment(history: string): {
  history: string;
  installment: string;
} {
  const match = /(\d{1,2})\/(\d{1,2})\s*$/.exec(history);
  // Uma barra colada à sequência numérica indica caminho ambíguo, não parcela.
  if (!match || /\/\d*$/.test(history.slice(0, match.index))) {
    return { history, installment: "1/1" };
  }
  const current = Number(match[1]);
  const total = Number(match[2]);
  if (current < 1 || current > total) {
    return { history, installment: "1/1" };
  }

  return {
    history: history.slice(0, match.index).trimEnd(),
    installment: `${current}/${total}`,
  };
}

export function chooseTransactionValue(
  brl: number | null,
  originalCurrency: number | null,
): number | null {
  return brl ?? originalCurrency;
}

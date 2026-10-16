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
  const candidate = terminalInstallmentCandidate(history);
  if (!candidate || !candidate.valid) {
    return { history, installment: "1/1" };
  }

  return {
    history: history.slice(0, candidate.index).trimEnd(),
    installment: `${candidate.current}/${candidate.total}`,
  };
}

export function hasInvalidInstallmentSuffix(history: string): boolean {
  return terminalInstallmentCandidate(history)?.valid === false;
}

function terminalInstallmentCandidate(history: string): {
  index: number;
  current: number;
  total: number;
  valid: boolean;
} | null {
  const terminal = history.trimEnd();
  const slashIndex = terminal.lastIndexOf("/");
  if (slashIndex < 0) return null;
  const totalText = terminal.slice(slashIndex + 1);
  if (!/^\d*$/.test(totalText)) return null;
  const currentRun = /(\d+)$/.exec(terminal.slice(0, slashIndex))?.[1];
  if (!currentRun) return null;
  const currentText = currentRun.slice(-2);
  const index = slashIndex - currentText.length;
  // Uma barra colada à sequência numérica indica caminho ambíguo, não parcela.
  if (/\/\d*$/.test(terminal.slice(0, index))) return null;
  const current = Number(currentText);
  const total = Number(totalText);
  const valid = totalText.length >= 1 && totalText.length <= 2 && current >= 1 && current <= total;
  return { index, current, total, valid };
}

export function chooseTransactionValue(
  brl: number | null,
  originalCurrency: number | null,
): number | null {
  return brl ?? originalCurrency;
}

export const money = (value: number | null | undefined): string =>
  value === null || value === undefined ? '—' : `$${value.toFixed(2)}`;

export const round2 = (value: number): number => Math.round(value * 100) / 100;

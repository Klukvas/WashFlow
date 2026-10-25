/** Decimal strings are converted to integer minor units before arithmetic. */
export function moneyCents(amount: string | number): bigint {
  const text = String(amount);
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new Error('Invalid money amount');
  const cents =
    BigInt(match[2]) * 100n + BigInt((match[3] ?? '').padEnd(2, '0'));
  return match[1] ? -cents : cents;
}
export function decimalMoney(cents: bigint): string {
  const absolute = cents < 0n ? -cents : cents;
  return `${cents < 0n ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}
export function displayMoney(amount: string | number): string {
  return `${decimalMoney(moneyCents(amount))} ₴`;
}

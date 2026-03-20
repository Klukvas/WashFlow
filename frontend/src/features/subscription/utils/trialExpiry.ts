/**
 * Checks whether a trial has expired based on the trialEndsAt timestamp.
 * Uses millisecond-precision comparison (same logic for both gate and UI).
 */
export function isTrialExpired(trialEndsAt: string): boolean {
  const end = new Date(trialEndsAt);
  if (isNaN(end.getTime())) return false;
  return end < new Date();
}

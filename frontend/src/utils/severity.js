/**
 * Normalizes any incident severity value into one of the canonical keys
 * used by every severity -> style lookup table in the app: HIGH, MEDIUM,
 * LOW, or UNKNOWN.
 *
 * Incidents can arrive with severity as null/undefined, wrong casing
 * ("high" vs "HIGH"), or a raw numeric model label (0/1/2). Any lookup
 * table indexed directly by the raw value can return undefined for an
 * unrecognized shape, and accessing a property on that (e.g. `.bg`) crashes
 * the whole list/map layer. Always route severity through this function
 * before indexing a style map, and always keep an UNKNOWN entry in that
 * map as the fallback - never assume the key exists.
 */
export function normalizeSeverityKey(severity) {
  const raw = String(severity ?? '').trim().toUpperCase();

  if (raw === 'HIGH' || raw === '2') return 'HIGH';
  if (raw === 'MEDIUM' || raw === '1') return 'MEDIUM';
  if (raw === 'LOW' || raw === '0') return 'LOW';
  return 'UNKNOWN';
}

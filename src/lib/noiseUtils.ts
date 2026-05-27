// ASR noise simulation (Item 5). Perturbs caller utterances to mimic common
// voice-recognition errors — misheard digits in ZIP codes, dates, and policy
// numbers. The agent must confirm/repeat critical details to pass the
// confirms_critical_details rubric check.
//
// Perturbation is deterministic (hash-based) so the same utterance always
// produces the same garbled output, keeping runs reproducible.

/** Shift one digit by +1 (wrapping 9→0) at a deterministic position. */
function shiftDigit(s: string, positionSeed: number): string {
  const digits: number[] = [];
  for (let i = 0; i < s.length; i++) {
    if (/\d/.test(s[i])) digits.push(i);
  }
  if (digits.length === 0) return s;
  const target = digits[positionSeed % digits.length];
  const chars = s.split("");
  chars[target] = String((parseInt(s[target]) + 1) % 10);
  return chars.join("");
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Apply lightweight ASR-style noise to a caller utterance. Targets:
 *   - 5-digit ZIP codes        → perturb one digit
 *   - 4-digit year mentions    → perturb one digit
 *   - Bare date fragments      → perturb one digit
 *   - VIN-like uppercase seqs  → transpose two adjacent chars
 *
 * Only about half of utterances are perturbed (based on hash parity), so the
 * conversation isn't uniformly garbled — just realistic-level noise.
 */
export function perturbUtterance(text: string): string {
  const seed = hashStr(text);
  // Only perturb ~50% of utterances to avoid every line being garbled.
  if (seed % 2 === 0) return text;

  return text
    // ZIP codes: "94110" → "04110"
    .replace(/\b(\d{5})\b/, (zip) => shiftDigit(zip, seed % 5))
    // 4-digit years: "2024" → "2025"
    .replace(/\b(20\d{2})\b/, (yr) => shiftDigit(yr, (seed + 2) % 4))
    // Short date fragments like "3pm", "3/15"
    .replace(/\b(\d{1,2}(?:pm|am|\/\d{1,2}))\b/i, (d) => shiftDigit(d, (seed + 1) % 3))
    // VIN: transpose two adjacent alpha-num chars (misread character pairs)
    .replace(/\b([A-Z0-9]{8,})\b/, (vin) => {
      const chars = vin.split("");
      const i = (seed + 3) % (chars.length - 1);
      [chars[i], chars[i + 1]] = [chars[i + 1], chars[i]];
      return chars.join("");
    });
}

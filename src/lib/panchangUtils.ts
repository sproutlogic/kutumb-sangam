/**
 * Client-side tithi computation (Meeus simplified, accurate to ~0.5°).
 * Shared between EcoPanchangStrip and Dashboard — single source of truth.
 */

export function computeTithiIdToday(): number {
  const now = new Date();
  const JD = now.getTime() / 86400000 + 2440587.5;
  const T = (JD - 2451545.0) / 36525;

  const deg = (x: number) => (((x % 360) + 360) % 360);
  const rad = (x: number) => x * Math.PI / 180;

  const L0 = deg(280.46646 + 36000.76983 * T);
  const M  = deg(357.52911 + 35999.05029 * T);
  const Mr = rad(M);
  const C  = 1.914602 * Math.sin(Mr) + 0.019993 * Math.sin(2 * Mr) + 0.000289 * Math.sin(3 * Mr);
  const sunLonTrop = deg(L0 + C);

  const Lm = deg(218.3165  + 481267.8813   * T);
  const Mm = deg(134.96298 + 477198.867398 * T);
  const D  = deg(297.85036 + 445267.111480 * T);
  const F  = deg(93.27191  + 483202.017538 * T);
  const moonCorr =
    6.289  * Math.sin(rad(Mm)) +
    1.274  * Math.sin(rad(2 * D - Mm)) +
    0.658  * Math.sin(rad(2 * D)) -
    0.214  * Math.sin(rad(2 * Mm)) -
    0.186  * Math.sin(rad(M)) -
    0.114  * Math.sin(rad(2 * F));
  const moonLonTrop = deg(Lm + moonCorr);

  const yearsSince2000 = (JD - 2451545.0) / 365.25;
  const ayanamsha = 23.85 + 0.0137 * yearsSince2000;

  const sunLon  = deg(sunLonTrop  - ayanamsha);
  const moonLon = deg(moonLonTrop - ayanamsha);

  const elongation = deg(moonLon - sunLon);
  return Math.floor(elongation / 12) + 1; // 1–30
}

export type Paksha = 'shukla' | 'krishna';

export function getPaksha(tithiId: number): Paksha {
  return tithiId <= 15 ? 'shukla' : 'krishna';
}

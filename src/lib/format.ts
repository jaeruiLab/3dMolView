const MINUS = "\u2212";

/**
 * Fixed-decimal number for display, with a typographic minus sign.
 * Returns null for missing values so callers can render the "not available" dash.
 */
export function formatFixed(value: number | null | undefined, decimals: number): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const text = Math.abs(value).toFixed(decimals);
  // Avoid "−0.0" for tiny negative values.
  return value < 0 && Number(text) !== 0 ? `${MINUS}${text}` : text;
}

/** Integer counts (donors, acceptors, …). */
export function formatInteger(value: number | null | undefined): string | null {
  return formatFixed(value, 0);
}

/**
 * Upper-case the first letter of each word that is entirely lower case.
 * Words that already carry case information ("D-Glucose", "pH", "DNA") are left alone,
 * and stereo/locant prefixes keep their case.
 */
export function titleCase(name: string): string {
  return name
    .split(" ")
    .map((word) => (word === word.toLowerCase() ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}

/** File-system-safe file stem from a compound name. */
export function toFileStem(name: string): string {
  const stem = name
    .trim()
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return stem.length > 0 ? stem.slice(0, 80) : "molecule";
}

const timestampFormat = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatTimestamp(date: Date): string {
  return timestampFormat.format(date);
}

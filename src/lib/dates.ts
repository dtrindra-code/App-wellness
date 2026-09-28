// Local-date helpers. All app dates are "YYYY-MM-DD" in the user's timezone.

const pad = (n: number) => String(n).padStart(2, '0');

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function today(): string {
  return toISO(new Date());
}

export function addDays(s: string, n: number): string {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86_400_000);
}

/** 0 = Monday … 6 = Sunday. */
export function weekday(s: string): number {
  return (parseISO(s).getDay() + 6) % 7;
}

export function mondayOf(s: string): string {
  return addDays(s, -weekday(s));
}

export function range(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

const DAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const DAYS_SHORT = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export const dayName = (s: string) => DAYS[weekday(s)];
export const dayShort = (s: string) => DAYS_SHORT[weekday(s)];

/** "mer. 30 sept." */
export function fmtShort(s: string): string {
  const d = parseISO(s);
  return `${DAYS_SHORT[weekday(s)]}. ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "30 sept." */
export function fmtDayMonth(s: string): string {
  const d = parseISO(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "mercredi 30 septembre" style, for headers. */
export function fmtLong(s: string): string {
  const d = parseISO(s);
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

import { format, formatDistanceToNowStrict } from 'date-fns';
import { nb } from 'date-fns/locale';

export const fmt = (n: number) => n.toLocaleString('nb-NO');
export const fmtNok = (n: number) => `${n.toLocaleString('nb-NO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} kr`;
export const fmtDate = (iso: string) => format(new Date(iso), "d. MMM yyyy 'kl.' HH:mm", { locale: nb });
export const fmtAgo = (iso: string) => formatDistanceToNowStrict(new Date(iso), { locale: nb, addSuffix: true });
const osloDate = (date: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' }).format(date);
export const claimedToday = (iso: string | null) => !!iso && iso.slice(0, 10) === osloDate(new Date());
export const fmtClock = (s: number) => {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (x: number) => String(x).padStart(2, '0');
  return d > 0 ? `${d}d ${p(h)}t ${p(m)}m` : `${p(h)}:${p(m)}:${p(sec)}`;
};
export const isToday = (iso: string) => osloDate(new Date(iso)) === osloDate(new Date());
export const isThisWeek = (iso: string) => {
  const today = osloDate(new Date());
  const monday = new Date(`${today}T12:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  const day = osloDate(new Date(iso));
  return day >= monday.toISOString().slice(0, 10) && day <= today;
};
export const fmtPointsValue = (pts: number) => `ca. ${(pts / 100).toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr demoverdi`;

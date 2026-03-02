import { format, formatDistanceToNow, parseISO } from 'date-fns';
import type { Locale } from 'date-fns';
import { enUS, uk } from 'date-fns/locale';

const locales: Record<string, Locale> = {
  en: enUS,
  uk: uk,
};

function getLocale(): Locale {
  const lang = localStorage.getItem('i18nextLng') ?? 'en';
  return locales[lang] ?? enUS;
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'PP', { locale: getLocale() });
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'PPp', { locale: getLocale() });
}

export function formatTime(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'HH:mm', { locale: getLocale() });
}

export function formatRelative(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return formatDistanceToNow(d, { addSuffix: true, locale: getLocale() });
}

export function formatCurrency(amount: number, currency = 'UAH'): string {
  return new Intl.NumberFormat('uk-UA', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

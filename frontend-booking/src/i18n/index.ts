import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en/public-booking.json';
import uk from './locales/uk/public-booking.json';

const defaultLang =
  (import.meta.env.VITE_DEFAULT_LANG as string | undefined) ?? 'en';

const savedLang = localStorage.getItem('booking-lang') ?? defaultLang;

i18n.use(initReactI18next).init({
  resources: {
    en: { 'public-booking': en },
    uk: { 'public-booking': uk },
  },
  lng: savedLang,
  fallbackLng: 'en',
  defaultNS: 'public-booking',
  ns: ['public-booking'],
  interpolation: {
    escapeValue: true,
  },
});

i18n.on('languageChanged', (lng) => {
  localStorage.setItem('booking-lang', lng);
});

export default i18n;

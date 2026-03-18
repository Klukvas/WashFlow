import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en_common from './locales/en/common.json';
import en_auth from './locales/en/auth.json';
import en_orders from './locales/en/orders.json';
import en_nav from './locales/en/nav.json';
import en_services from './locales/en/services.json';
import en_branches from './locales/en/branches.json';
import en_clients from './locales/en/clients.json';
import en_dashboard from './locales/en/dashboard.json';
import en_analytics from './locales/en/analytics.json';
import en_audit from './locales/en/audit.json';
import en_vehicles from './locales/en/vehicles.json';
import en_workPosts from './locales/en/work-posts.json';
import en_workforce from './locales/en/workforce.json';
import en_publicBooking from './locales/en/public-booking.json';
import en_howTo from './locales/en/how-to.json';
import en_subscription from './locales/en/subscription.json';
import en_roles from './locales/en/roles.json';
import en_landing from './locales/en/landing.json';
import uk_common from './locales/uk/common.json';
import uk_auth from './locales/uk/auth.json';
import uk_orders from './locales/uk/orders.json';
import uk_nav from './locales/uk/nav.json';
import uk_services from './locales/uk/services.json';
import uk_branches from './locales/uk/branches.json';
import uk_clients from './locales/uk/clients.json';
import uk_dashboard from './locales/uk/dashboard.json';
import uk_analytics from './locales/uk/analytics.json';
import uk_audit from './locales/uk/audit.json';
import uk_vehicles from './locales/uk/vehicles.json';
import uk_workPosts from './locales/uk/work-posts.json';
import uk_workforce from './locales/uk/workforce.json';
import uk_publicBooking from './locales/uk/public-booking.json';
import uk_howTo from './locales/uk/how-to.json';
import uk_subscription from './locales/uk/subscription.json';
import uk_roles from './locales/uk/roles.json';
import uk_landing from './locales/uk/landing.json';

const resources = {
  en: {
    common: en_common,
    auth: en_auth,
    orders: en_orders,
    nav: en_nav,
    services: en_services,
    branches: en_branches,
    clients: en_clients,
    dashboard: en_dashboard,
    analytics: en_analytics,
    audit: en_audit,
    vehicles: en_vehicles,
    'work-posts': en_workPosts,
    workforce: en_workforce,
    'public-booking': en_publicBooking,
    'how-to': en_howTo,
    subscription: en_subscription,
    roles: en_roles,
    landing: en_landing,
  },
  uk: {
    common: uk_common,
    auth: uk_auth,
    orders: uk_orders,
    nav: uk_nav,
    services: uk_services,
    branches: uk_branches,
    clients: uk_clients,
    dashboard: uk_dashboard,
    analytics: uk_analytics,
    audit: uk_audit,
    vehicles: uk_vehicles,
    'work-posts': uk_workPosts,
    workforce: uk_workforce,
    'public-booking': uk_publicBooking,
    'how-to': uk_howTo,
    subscription: uk_subscription,
    roles: uk_roles,
    landing: uk_landing,
  },
};

const savedLang = localStorage.getItem('i18nextLng') ?? 'en';

i18n.use(initReactI18next).init({
  resources,
  lng: savedLang,
  fallbackLng: 'en',
  defaultNS: 'common',
  ns: [
    'common',
    'auth',
    'orders',
    'nav',
    'services',
    'branches',
    'clients',
    'dashboard',
    'analytics',
    'audit',
    'vehicles',
    'work-posts',
    'workforce',
    'public-booking',
    'how-to',
    'subscription',
    'roles',
    'landing',
  ],
  interpolation: {
    escapeValue: true,
  },
});

i18n.on('languageChanged', (lng) => {
  localStorage.setItem('i18nextLng', lng);
});

export default i18n;

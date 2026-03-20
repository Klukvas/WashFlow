import { Helmet } from 'react-helmet-async';

interface SeoProps {
  title?: string;
  description?: string;
  path?: string;
  image?: string;
}

const BASE_URL = 'https://washflow.com';
const DEFAULT_TITLE = 'WashFlow — Car Wash Management Platform';
const DEFAULT_DESC =
  'Streamline your car wash operations. Orders, scheduling, clients, analytics, and online booking — all in one platform.';

export function Seo({ title, description, path = '/', image }: SeoProps) {
  const pageTitle = title ? `${title} | WashFlow` : DEFAULT_TITLE;
  const pageDesc = description ?? DEFAULT_DESC;
  const url = `${BASE_URL}${path}`;
  const ogImage = image ?? `${BASE_URL}/screenshots/orders.png`;

  return (
    <Helmet>
      <title>{pageTitle}</title>
      <meta name="description" content={pageDesc} />
      <link rel="canonical" href={url} />

      <meta property="og:title" content={pageTitle} />
      <meta property="og:description" content={pageDesc} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={ogImage} />

      <meta name="twitter:title" content={pageTitle} />
      <meta name="twitter:description" content={pageDesc} />
      <meta name="twitter:image" content={ogImage} />
    </Helmet>
  );
}

import { Helmet } from 'react-helmet-async';

interface SeoProps {
  title?: string;
  description?: string;
  path?: string;
  image?: string;
  lang?: 'en' | 'uk';
  alternates?: { hreflang: string; href: string }[];
  article?: {
    publishedTime: string;
    modifiedTime?: string;
    author?: string;
  };
  breadcrumbs?: { name: string; url: string }[];
}

const BASE_URL = 'https://washflow.com';
const DEFAULT_TITLE = 'WashFlow — Car Wash Management Platform';
const DEFAULT_DESC =
  'Streamline your car wash operations. Orders, scheduling, clients, analytics, and online booking — all in one platform.';

function buildArticleSchema(
  article: NonNullable<SeoProps['article']>,
  pageTitle: string,
  url: string,
  ogImage: string,
): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: pageTitle,
    datePublished: article.publishedTime,
    ...(article.modifiedTime ? { dateModified: article.modifiedTime } : {}),
    ...(article.author
      ? { author: { '@type': 'Person', name: article.author } }
      : {}),
    image: ogImage,
    url,
    publisher: {
      '@type': 'Organization',
      name: 'WashFlow',
      url: BASE_URL,
    },
  });
}

function buildBreadcrumbSchema(
  breadcrumbs: NonNullable<SeoProps['breadcrumbs']>,
): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: crumb.url,
    })),
  });
}

function findXDefault(
  alternates: NonNullable<SeoProps['alternates']>,
): string | undefined {
  const en = alternates.find((a) => a.hreflang === 'en');
  return en?.href;
}

export function Seo({
  title,
  description,
  path = '/',
  image,
  lang,
  alternates,
  article,
  breadcrumbs,
}: SeoProps) {
  const pageTitle = title ? `${title} | WashFlow` : DEFAULT_TITLE;
  const pageDesc = description ?? DEFAULT_DESC;
  const url = `${BASE_URL}${path}`;
  const ogImage = image ?? `${BASE_URL}/screenshots/orders.png`;

  const xDefault = alternates ? findXDefault(alternates) : undefined;

  return (
    <Helmet>
      {lang && <html lang={lang} />}

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

      {alternates?.map((alt) => (
        <link
          key={alt.hreflang}
          rel="alternate"
          hrefLang={alt.hreflang}
          href={alt.href}
        />
      ))}
      {xDefault && (
        <link rel="alternate" hrefLang="x-default" href={xDefault} />
      )}

      {article && (
        <script type="application/ld+json">
          {buildArticleSchema(article, pageTitle, url, ogImage)}
        </script>
      )}

      {breadcrumbs && breadcrumbs.length > 0 && (
        <script type="application/ld+json">
          {buildBreadcrumbSchema(breadcrumbs)}
        </script>
      )}
    </Helmet>
  );
}

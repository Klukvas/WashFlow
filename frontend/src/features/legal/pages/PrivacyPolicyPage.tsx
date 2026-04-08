import { Seo } from '@/shared/components/Seo';

export function PrivacyPolicyPage() {
  return (
    <>
      <Seo
        title="Privacy Policy"
        description="How WashFlow collects, uses, and protects your personal data."
        path="/legal/privacy"
      />

      <h1>Privacy Policy</h1>
      <div className="legal-meta">
        <p>
          <strong>Effective Date:</strong> 8 April 2026
        </p>
        <p>
          <strong>Last Updated:</strong> 8 April 2026
        </p>
      </div>

      <p>
        This Privacy Policy explains how{' '}
        <strong>Individual Entrepreneur Andrii Volodymyrovych Pavlenko</strong>{' '}
        (ФОП Павленко Андрій Володимирович), registered in Ukraine and trading
        as <strong>WashFlow</strong> ("we", "us", "our"), collects, uses,
        stores, and protects personal data when you use our service available at{' '}
        <a href="https://washflow.solutions">washflow.solutions</a> ("Service").
        We are the data controller responsible for your personal data under
        applicable data protection law, including the General Data Protection
        Regulation (GDPR) where it applies.
      </p>

      <h2>1. Information We Collect</h2>

      <h3>1.1 Account information</h3>
      <p>When you register for WashFlow, we collect:</p>
      <ul>
        <li>Your email address and password (stored as a one-way hash);</li>
        <li>Your full name and the name of your business;</li>
        <li>Your role and permissions within your organisation;</li>
        <li>Preferred language and timezone.</li>
      </ul>

      <h3>1.2 Business data you provide</h3>
      <p>
        As a multi-tenant SaaS for car wash operations, the Service stores
        business records that you and your team create, including: orders,
        services, work posts, branches, employees, clients, vehicles, bookings,
        schedules, and payments. This data belongs to your organisation and is
        isolated from other tenants.
      </p>

      <h3>1.3 Billing data</h3>
      <p>
        Payments are processed by <strong>Paddle.com Market Limited</strong>,
        acting as the Merchant of Record. When you purchase a subscription,
        Paddle collects and processes your billing information (name, billing
        address, tax identifiers, payment instrument) directly. We do not store
        or see your full card number. We only receive limited metadata from
        Paddle: subscription status, plan, billing period, last four digits of
        the payment instrument, and transaction identifiers.
      </p>
      <p>
        For details, see Paddle's privacy policy at{' '}
        <a
          href="https://www.paddle.com/legal/privacy"
          target="_blank"
          rel="noopener noreferrer"
        >
          paddle.com/legal/privacy
        </a>
        .
      </p>

      <h3>1.4 Usage and technical data</h3>
      <p>
        We automatically collect technical information when you use the Service:
        IP address, browser type and version, device type, operating system,
        referring URL, pages visited, timestamps, and crash reports. This data
        is used for security, fraud prevention, performance monitoring, and
        service improvement.
      </p>

      <h3>1.5 Cookies and similar technologies</h3>
      <p>
        We use strictly necessary cookies to keep you signed in and to secure
        your session. We do not use third-party advertising cookies. You can
        control cookies in your browser settings, but disabling essential
        cookies will prevent the Service from functioning.
      </p>

      <h2>2. How We Use Your Data</h2>
      <p>We process personal data for the following purposes:</p>
      <ul>
        <li>To provide, operate, and maintain the Service;</li>
        <li>To authenticate you and secure your account;</li>
        <li>To process subscriptions and communicate billing events;</li>
        <li>To respond to support requests you submit through the Service;</li>
        <li>
          To send transactional emails (password reset, invoices, security
          alerts);
        </li>
        <li>
          To detect, prevent, and investigate fraud, abuse, and security
          incidents;
        </li>
        <li>
          To comply with our legal and tax obligations under the laws of Ukraine
          and other applicable jurisdictions;
        </li>
        <li>
          To improve the Service through aggregated, anonymised analytics.
        </li>
      </ul>

      <h2>3. Legal Basis for Processing (GDPR)</h2>
      <p>Where GDPR applies, we rely on the following legal bases:</p>
      <ul>
        <li>
          <strong>Contract</strong> — processing necessary to deliver the
          Service you subscribed to;
        </li>
        <li>
          <strong>Legal obligation</strong> — processing required to comply with
          tax, accounting, and anti-fraud laws;
        </li>
        <li>
          <strong>Legitimate interests</strong> — securing the Service,
          preventing abuse, and improving functionality;
        </li>
        <li>
          <strong>Consent</strong> — where required (e.g. for non-essential
          communications), which you may withdraw at any time.
        </li>
      </ul>

      <h2>4. Sharing Your Data</h2>
      <p>
        We share personal data only with the following categories of recipients:
      </p>
      <ul>
        <li>
          <strong>Paddle.com Market Limited</strong> — payment processing and
          subscription management (Merchant of Record);
        </li>
        <li>
          <strong>Infrastructure providers</strong> — cloud hosting, database,
          and CDN providers who store and transmit data on our behalf under
          binding data processing agreements;
        </li>
        <li>
          <strong>Email delivery providers</strong> — for sending transactional
          emails;
        </li>
        <li>
          <strong>Error tracking and monitoring services</strong> — to detect
          and diagnose technical issues;
        </li>
        <li>
          <strong>Legal authorities</strong> — where we are legally required to
          disclose data to courts, tax authorities, or law enforcement.
        </li>
      </ul>
      <p>
        We do not sell, rent, or trade your personal data to third parties for
        marketing purposes.
      </p>

      <h2>5. International Data Transfers</h2>
      <p>
        Some of our service providers operate outside Ukraine and the European
        Economic Area (EEA). Where such transfers occur, we rely on appropriate
        safeguards such as the European Commission's Standard Contractual
        Clauses or equivalent mechanisms recognised under applicable law.
      </p>

      <h2>6. Data Retention</h2>
      <p>
        We retain your personal data only for as long as necessary to fulfil the
        purposes described in this Policy:
      </p>
      <ul>
        <li>
          Account and business data — while your subscription is active and for
          up to 90 days after cancellation, after which it is permanently
          deleted unless you export it;
        </li>
        <li>
          Billing records and invoices — retained for a minimum of six (6) years
          to comply with Ukrainian tax and accounting law;
        </li>
        <li>Security logs — retained for up to 12 months;</li>
        <li>Backups — rotated out within 30 days.</li>
      </ul>

      <h2>7. Your Rights</h2>
      <p>Subject to applicable law, you have the right to:</p>
      <ul>
        <li>Access the personal data we hold about you;</li>
        <li>Correct inaccurate or incomplete personal data;</li>
        <li>
          Request deletion of your personal data ("right to be forgotten");
        </li>
        <li>Restrict or object to certain processing;</li>
        <li>
          Receive a copy of your personal data in a portable, machine-readable
          format;
        </li>
        <li>
          Withdraw consent at any time where processing is based on consent;
        </li>
        <li>Lodge a complaint with a supervisory authority.</li>
      </ul>
      <p>
        To exercise any of these rights, contact us at{' '}
        <a href="mailto:fluxlab@flux-lab.dev">fluxlab@flux-lab.dev</a>. We will
        respond within 30 days.
      </p>

      <h2>8. Data Security</h2>
      <p>
        We implement industry-standard technical and organisational measures to
        protect personal data, including encryption in transit (TLS), encryption
        at rest for sensitive fields, hashed passwords, role-based access
        control, audit logging, and regular security reviews. Despite our
        efforts, no system is perfectly secure. We will notify you and the
        relevant authorities of any data breach in accordance with applicable
        law.
      </p>

      <h2>9. Children's Privacy</h2>
      <p>
        The Service is intended for business use and is not directed to
        individuals under the age of 16. We do not knowingly collect personal
        data from children. If you believe a child has provided us with personal
        data, please contact us so we can delete it.
      </p>

      <h2>10. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. When we make
        material changes, we will notify account holders by email and update the
        "Last Updated" date at the top of this page. Continued use of the
        Service after such changes constitutes acceptance of the updated Policy.
      </p>

      <h2>11. Contact</h2>
      <p>
        If you have any questions about this Privacy Policy or how we handle
        your personal data, please contact:
      </p>
      <p>
        <strong>Individual Entrepreneur Andrii Volodymyrovych Pavlenko</strong>
        <br />
        ФОП Павленко Андрій Володимирович
        <br />
        Ukraine
        <br />
        Email: <a href="mailto:fluxlab@flux-lab.dev">fluxlab@flux-lab.dev</a>
      </p>
    </>
  );
}

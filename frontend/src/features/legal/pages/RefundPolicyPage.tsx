import { Seo } from '@/shared/components/Seo';

export function RefundPolicyPage() {
  return (
    <>
      <Seo
        title="Refund Policy"
        description="WashFlow refund and cancellation policy."
        path="/legal/refund"
      />

      <h1>Refund Policy</h1>
      <div className="legal-meta">
        <p><strong>Effective Date:</strong> 8 April 2026</p>
        <p><strong>Last Updated:</strong> 8 April 2026</p>
      </div>

      <p>
        This Refund Policy applies to all paid subscriptions to{' '}
        <strong>WashFlow</strong>, a service provided by{' '}
        <strong>Individual Entrepreneur Andrii Oleksandrovych Pavlenko</strong>{' '}
        (ФОП Павленко Андрій Олександрович), registered in Ukraine. Payments
        for the Service are processed by{' '}
        <strong>Paddle.com Market Limited</strong>, acting as the Merchant of
        Record.
      </p>

      <h2>1. General Policy — No Refunds</h2>
      <p>
        All subscription fees paid for the Service are{' '}
        <strong>non-refundable</strong>. This includes monthly and annual
        subscriptions, as well as optional add-ons (additional branches,
        work posts, users, and services).
      </p>
      <p>
        By subscribing to WashFlow, you acknowledge and agree that, to the
        extent permitted by law, you waive any right to a refund for any
        unused portion of your subscription period.
      </p>

      <h2>2. Cancel Anytime</h2>
      <p>
        You may cancel your subscription at any time through your account
        dashboard. Cancellation is effective at the end of the current
        billing period — you will continue to have full access to the
        Service until that date, and no further charges will be made for
        subsequent billing periods.
      </p>
      <p>For example:</p>
      <ul>
        <li>If you are on a monthly plan and cancel on day 5 of a billing month, you will retain access for the remainder of that month and will not be charged again.</li>
        <li>If you are on an annual plan and cancel after 3 months, you will retain access for the remaining 9 months of the paid year and will not be charged again.</li>
      </ul>

      <h2>3. Free Trial</h2>
      <p>
        New customers may be eligible for a free trial period. During the
        trial, no payment is collected and no charges are made. If you do
        not subscribe to a paid plan at the end of the trial, your account
        will be downgraded or closed — no refund is applicable because no
        payment was taken.
      </p>

      <h2>4. Exceptions</h2>
      <p>
        We may, at our sole discretion, issue a refund in the following
        exceptional circumstances:
      </p>
      <ul>
        <li>
          <strong>Duplicate charges</strong> — if you were billed more than
          once for the same billing period due to a technical error on our
          side or Paddle's side;
        </li>
        <li>
          <strong>Unauthorised charges</strong> — if your account or payment
          method was used without your permission, subject to verification;
        </li>
        <li>
          <strong>Failure to deliver</strong> — if a prolonged service
          outage materially prevented you from using the Service and we are
          unable to restore access within a reasonable time;
        </li>
        <li>
          <strong>Statutory rights</strong> — where mandatory consumer
          protection law in your jurisdiction (for example, the 14-day
          right of withdrawal under EU consumer law, where applicable to
          digital services) grants you a refund right that cannot be
          waived.
        </li>
      </ul>
      <p>
        To request a refund under any of these exceptions, contact us at{' '}
        <a href="mailto:fluxlab@flux-lab.dev">fluxlab@flux-lab.dev</a> within{' '}
        <strong>30 days</strong> of the relevant charge, including your
        account email, the transaction ID from your Paddle invoice, and a
        description of the issue. We will review your request and respond
        within 14 days.
      </p>

      <h2>5. How Refunds Are Processed</h2>
      <p>
        Approved refunds are issued by Paddle to the original payment
        method used at checkout. Depending on your bank or card issuer,
        refunds typically appear on your statement within 5–10 business
        days after approval. We have no control over the exact timing of
        the credit.
      </p>

      <h2>6. Chargebacks</h2>
      <p>
        Before initiating a chargeback with your bank or card issuer,
        please contact us first at{' '}
        <a href="mailto:fluxlab@flux-lab.dev">fluxlab@flux-lab.dev</a>. In
        most cases we can resolve billing disputes directly and faster than
        the chargeback process. Unjustified chargebacks may result in
        immediate termination of your account and loss of access to your
        data, without refund, and without prejudice to any claim we may
        have against you.
      </p>

      <h2>7. Changes to This Policy</h2>
      <p>
        We may update this Refund Policy from time to time. The updated
        version will be posted on this page with a new "Last Updated" date.
        Changes apply only to purchases made after the effective date of
        the update. Purchases made before that date will continue to be
        governed by the policy in effect at the time of purchase.
      </p>

      <h2>8. Contact</h2>
      <p>
        For any refund-related questions or requests, please contact:
      </p>
      <p>
        <strong>Individual Entrepreneur Andrii Oleksandrovych Pavlenko</strong>
        <br />
        ФОП Павленко Андрій Олександрович
        <br />
        Ukraine
        <br />
        Email: <a href="mailto:fluxlab@flux-lab.dev">fluxlab@flux-lab.dev</a>
      </p>
    </>
  );
}

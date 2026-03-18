import {
  passwordResetTemplate,
  accountLockedTemplate,
  orderConfirmationTemplate,
  statusUpdateTemplate,
  bookingReminderTemplate,
} from './email-templates';
import {
  OrderConfirmationData,
  StatusUpdateData,
  BookingReminderData,
} from './email.types';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Assert that the output is a complete HTML document wrapping the body. */
function expectValidHtmlShell(html: string): void {
  expect(html).toContain('<!DOCTYPE html>');
  expect(html).toContain('<html lang="en">');
  expect(html).toContain('</html>');
  expect(html).toContain('WashFlow');
}

// ---------------------------------------------------------------------------
// passwordResetTemplate
// ---------------------------------------------------------------------------

describe('passwordResetTemplate', () => {
  const RESET_URL = 'https://app.washflow.io/reset?token=abc123';
  const USER_NAME = 'Alice';

  let result: string;

  beforeEach(() => {
    result = passwordResetTemplate(RESET_URL, USER_NAME);
  });

  it('returns a complete HTML document', () => {
    expectValidHtmlShell(result);
  });

  it('includes the userName in the greeting', () => {
    expect(result).toContain(`Hi ${USER_NAME}`);
  });

  it('uses resetUrl as the href on the CTA button', () => {
    expect(result).toContain(`href="${RESET_URL}"`);
  });

  it('includes the resetUrl as a plain-text fallback link', () => {
    // The URL appears both as href and as visible text
    const occurrences = result.split(RESET_URL).length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it('mentions the 1-hour expiry', () => {
    expect(result).toContain('1 hour');
  });

  it('renders the "Reset Password" button label', () => {
    expect(result).toContain('Reset Password');
  });

  it('works with a URL that contains special query characters', () => {
    const specialUrl = 'https://example.com/reset?token=x&next=%2Fdashboard';
    const html = passwordResetTemplate(specialUrl, 'Bob');
    expect(html).toContain(specialUrl);
  });

  it('works with a userName that contains Unicode characters', () => {
    const html = passwordResetTemplate(RESET_URL, 'Олексій');
    expect(html).toContain('Олексій');
  });

  it('works with an empty userName string', () => {
    const html = passwordResetTemplate(RESET_URL, '');
    expect(html).toContain('Hi ,');
  });
});

// ---------------------------------------------------------------------------
// accountLockedTemplate
// ---------------------------------------------------------------------------

describe('accountLockedTemplate', () => {
  const USER_NAME = 'Charlie';

  let result: string;

  beforeEach(() => {
    result = accountLockedTemplate(USER_NAME);
  });

  it('returns a complete HTML document', () => {
    expectValidHtmlShell(result);
  });

  it('includes the userName in the greeting', () => {
    expect(result).toContain(`Hi ${USER_NAME}`);
  });

  it('states the 30-minute unlock window', () => {
    expect(result).toContain('30 minutes');
  });

  it('mentions 5 failed login attempts', () => {
    expect(result).toContain('5 failed login attempts');
  });

  it('renders the "Account Locked" heading', () => {
    expect(result).toContain('Account Locked');
  });

  it('advises contacting support', () => {
    expect(result).toContain('contact support');
  });

  it('works with a userName that contains Unicode characters', () => {
    const html = accountLockedTemplate('Дмитро');
    expect(html).toContain('Дмитро');
  });

  it('works with an empty userName string', () => {
    const html = accountLockedTemplate('');
    expect(html).toContain('Hi ,');
  });
});

// ---------------------------------------------------------------------------
// orderConfirmationTemplate
// ---------------------------------------------------------------------------

describe('orderConfirmationTemplate', () => {
  const BASE_DATA: OrderConfirmationData = {
    orderNumber: 'ORD-001',
    clientName: 'Diana',
    vehicleInfo: 'Toyota Camry 2022',
    scheduledDate: '2026-03-20 10:00',
    totalPrice: '$49.99',
    services: ['Exterior Wash', 'Interior Vacuum', 'Wax Coating'],
  };

  let result: string;

  beforeEach(() => {
    result = orderConfirmationTemplate(BASE_DATA);
  });

  it('returns a complete HTML document', () => {
    expectValidHtmlShell(result);
  });

  it('includes the clientName in the greeting', () => {
    expect(result).toContain(`Hi ${BASE_DATA.clientName}`);
  });

  it('renders the orderNumber', () => {
    expect(result).toContain(BASE_DATA.orderNumber);
  });

  it('renders the vehicleInfo', () => {
    expect(result).toContain(BASE_DATA.vehicleInfo);
  });

  it('renders the scheduledDate', () => {
    expect(result).toContain(BASE_DATA.scheduledDate);
  });

  it('renders the totalPrice', () => {
    expect(result).toContain(BASE_DATA.totalPrice);
  });

  it('renders every service as a list item', () => {
    for (const service of BASE_DATA.services) {
      expect(result).toContain(`<li`);
      expect(result).toContain(service);
    }
  });

  it('renders the "Order Confirmed" heading', () => {
    expect(result).toContain('Order Confirmed');
  });

  it('renders a Services section heading', () => {
    expect(result).toContain('Services');
  });

  describe('with an empty services array', () => {
    it('renders without any <li> elements', () => {
      const html = orderConfirmationTemplate({ ...BASE_DATA, services: [] });
      // The <ul> wrapper still appears but contains no <li> items
      expect(html).toContain('<ul');
      expect(html).not.toContain('<li');
    });

    it('still renders all other fields correctly', () => {
      const html = orderConfirmationTemplate({ ...BASE_DATA, services: [] });
      expect(html).toContain(BASE_DATA.orderNumber);
      expect(html).toContain(BASE_DATA.vehicleInfo);
      expect(html).toContain(BASE_DATA.totalPrice);
    });
  });

  it('works with a single service', () => {
    const html = orderConfirmationTemplate({
      ...BASE_DATA,
      services: ['Full Detail'],
    });
    expect(html).toContain('Full Detail');
  });

  it('works with special characters in clientName', () => {
    const html = orderConfirmationTemplate({
      ...BASE_DATA,
      clientName: "O'Reilly & Sons",
    });
    expect(html).toContain('O&#39;Reilly &amp; Sons');
  });

  it('works with Unicode in vehicleInfo', () => {
    const html = orderConfirmationTemplate({
      ...BASE_DATA,
      vehicleInfo: 'Тойота Камрі 2022',
    });
    expect(html).toContain('Тойота Камрі 2022');
  });
});

// ---------------------------------------------------------------------------
// statusUpdateTemplate
// ---------------------------------------------------------------------------

describe('statusUpdateTemplate', () => {
  const BASE_DATA: StatusUpdateData = {
    orderNumber: 'ORD-042',
    clientName: 'Eve',
    vehicleInfo: 'Honda Civic 2021',
    newStatus: 'IN_PROGRESS',
  };

  let result: string;

  beforeEach(() => {
    result = statusUpdateTemplate(BASE_DATA);
  });

  it('returns a complete HTML document', () => {
    expectValidHtmlShell(result);
  });

  it('includes the clientName in the greeting', () => {
    expect(result).toContain(`Hi ${BASE_DATA.clientName}`);
  });

  it('renders the orderNumber', () => {
    expect(result).toContain(BASE_DATA.orderNumber);
  });

  it('renders the vehicleInfo', () => {
    expect(result).toContain(BASE_DATA.vehicleInfo);
  });

  it('renders the newStatus', () => {
    expect(result).toContain(BASE_DATA.newStatus);
  });

  it('renders the "Order Status Update" heading', () => {
    expect(result).toContain('Order Status Update');
  });

  it('renders the status inside a badge span', () => {
    // Status is displayed inside a <span> styled as a badge
    expect(result).toContain('<span');
    expect(result).toContain(BASE_DATA.newStatus);
  });

  it('works with different status values', () => {
    const statuses = ['PENDING', 'COMPLETED', 'CANCELLED', 'IN_PROGRESS'];
    for (const newStatus of statuses) {
      const html = statusUpdateTemplate({ ...BASE_DATA, newStatus });
      expect(html).toContain(newStatus);
    }
  });

  it('works with Unicode in clientName', () => {
    const html = statusUpdateTemplate({ ...BASE_DATA, clientName: 'Іванка' });
    expect(html).toContain('Іванка');
  });
});

// ---------------------------------------------------------------------------
// bookingReminderTemplate
// ---------------------------------------------------------------------------

describe('bookingReminderTemplate', () => {
  const BASE_DATA: BookingReminderData = {
    orderNumber: 'ORD-099',
    clientName: 'Frank',
    scheduledDate: '2026-03-21 14:00',
    branchName: 'Downtown Branch',
    branchAddress: '123 Main St, Kyiv',
  };

  let result: string;

  beforeEach(() => {
    result = bookingReminderTemplate(BASE_DATA);
  });

  it('returns a complete HTML document', () => {
    expectValidHtmlShell(result);
  });

  it('includes the clientName in the greeting', () => {
    expect(result).toContain(`Hi ${BASE_DATA.clientName}`);
  });

  it('renders the orderNumber', () => {
    expect(result).toContain(BASE_DATA.orderNumber);
  });

  it('renders the scheduledDate', () => {
    expect(result).toContain(BASE_DATA.scheduledDate);
  });

  it('renders the branchName', () => {
    expect(result).toContain(BASE_DATA.branchName);
  });

  it('renders the branchAddress when provided', () => {
    expect(result).toContain(BASE_DATA.branchAddress as string);
  });

  it('renders the "Booking Reminder" heading', () => {
    expect(result).toContain('Booking Reminder');
  });

  it('includes the address row label when branchAddress is present', () => {
    expect(result).toContain('Address');
  });

  describe('without branchAddress', () => {
    let noAddressResult: string;

    beforeEach(() => {
      noAddressResult = bookingReminderTemplate({
        orderNumber: 'ORD-100',
        clientName: 'Grace',
        scheduledDate: '2026-03-22 09:00',
        branchName: 'North Branch',
      });
    });

    it('does not render the Address label', () => {
      expect(noAddressResult).not.toContain('>Address<');
    });

    it('still renders orderNumber, scheduledDate and branchName', () => {
      expect(noAddressResult).toContain('ORD-100');
      expect(noAddressResult).toContain('2026-03-22 09:00');
      expect(noAddressResult).toContain('North Branch');
    });

    it('does not include a border-bottom on the branch row when address is absent', () => {
      // When branchAddress is absent the branch <td> should not carry the
      // border-bottom inline style that separates rows.
      // We check the absence of "border-bottom" immediately after branchName.
      expect(noAddressResult).not.toContain(
        'border-bottom:1px solid #e5e7eb;">North Branch',
      );
    });
  });

  it('works with branchAddress set to undefined explicitly', () => {
    const html = bookingReminderTemplate({
      ...BASE_DATA,
      branchAddress: undefined,
    });
    expect(html).not.toContain('>Address<');
    expect(html).toContain(BASE_DATA.branchName);
  });

  it('works with Unicode in clientName and branchName', () => {
    const html = bookingReminderTemplate({
      ...BASE_DATA,
      clientName: 'Наталія',
      branchName: 'Центральна філія',
    });
    expect(html).toContain('Наталія');
    expect(html).toContain('Центральна філія');
  });
});

import {
  OrderConfirmationData,
  StatusUpdateData,
  BookingReminderData,
} from './email.types';

/** Escape user-provided strings to prevent HTML injection in email templates. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const BRAND_COLOR = '#2563eb';
const BRAND_COLOR_DARK = '#1d4ed8';
const TEXT_COLOR = '#1f2937';
const MUTED_COLOR = '#6b7280';
const BORDER_COLOR = '#e5e7eb';
const BG_COLOR = '#f9fafb';

function baseLayout(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>WashFlow</title>
</head>
<body style="margin:0;padding:0;background-color:${BG_COLOR};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BG_COLOR};">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color:${BRAND_COLOR};padding:24px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">WashFlow</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid ${BORDER_COLOR};text-align:center;">
              <p style="margin:0;color:${MUTED_COLOR};font-size:12px;line-height:1.5;">
                &copy; ${new Date().getFullYear()} WashFlow. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function passwordResetTemplate(
  resetUrl: string,
  userName: string,
): string {
  const content = `
    <h2 style="margin:0 0 16px;color:${TEXT_COLOR};font-size:20px;font-weight:600;">Password Reset Request</h2>
    <p style="margin:0 0 16px;color:${TEXT_COLOR};font-size:14px;line-height:1.6;">
      Hi ${escapeHtml(userName)},
    </p>
    <p style="margin:0 0 24px;color:${TEXT_COLOR};font-size:14px;line-height:1.6;">
      We received a request to reset your password. Click the button below to create a new password. This link will expire in 1 hour.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
      <tr>
        <td style="border-radius:6px;background-color:${BRAND_COLOR};">
          <a href="${resetUrl}" target="_blank" style="display:inline-block;padding:12px 32px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">
            Reset Password
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;color:${MUTED_COLOR};font-size:12px;line-height:1.5;">
      If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
    </p>
    <p style="margin:0;color:${MUTED_COLOR};font-size:12px;line-height:1.5;">
      If the button doesn't work, copy and paste this URL into your browser:<br />
      <a href="${resetUrl}" style="color:${BRAND_COLOR_DARK};word-break:break-all;">${resetUrl}</a>
    </p>`;

  return baseLayout(content);
}

export function accountLockedTemplate(userName: string): string {
  const content = `
    <h2 style="margin:0 0 16px;color:${TEXT_COLOR};font-size:20px;font-weight:600;">Account Locked</h2>
    <p style="margin:0 0 16px;color:${TEXT_COLOR};font-size:14px;line-height:1.6;">
      Hi ${escapeHtml(userName)},
    </p>
    <p style="margin:0 0 16px;color:${TEXT_COLOR};font-size:14px;line-height:1.6;">
      Your account has been temporarily locked due to 5 failed login attempts. This is a security measure to protect your account.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;width:100%;">
      <tr>
        <td style="background-color:#fef2f2;border-left:4px solid #ef4444;padding:16px;border-radius:0 6px 6px 0;">
          <p style="margin:0;color:#991b1b;font-size:14px;font-weight:600;">
            Your account will automatically unlock in 30 minutes.
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;color:${TEXT_COLOR};font-size:14px;line-height:1.6;">
      If this wasn't you, we recommend resetting your password immediately after your account unlocks.
    </p>
    <p style="margin:0;color:${MUTED_COLOR};font-size:12px;line-height:1.5;">
      If you continue to experience issues, please contact support.
    </p>`;

  return baseLayout(content);
}

export function orderConfirmationTemplate(data: OrderConfirmationData): string {
  const servicesList = data.services
    .map(
      (s) =>
        `<li style="padding:4px 0;color:${TEXT_COLOR};font-size:14px;">${escapeHtml(s)}</li>`,
    )
    .join('');

  const content = `
    <h2 style="margin:0 0 16px;color:${TEXT_COLOR};font-size:20px;font-weight:600;">Order Confirmed</h2>
    <p style="margin:0 0 16px;color:${TEXT_COLOR};font-size:14px;line-height:1.6;">
      Hi ${escapeHtml(data.clientName)},
    </p>
    <p style="margin:0 0 24px;color:${TEXT_COLOR};font-size:14px;line-height:1.6;">
      Your order has been confirmed. Here are the details:
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;border:1px solid ${BORDER_COLOR};border-radius:6px;overflow:hidden;">
      <tr>
        <td style="padding:12px 16px;background-color:${BG_COLOR};border-bottom:1px solid ${BORDER_COLOR};font-size:13px;color:${MUTED_COLOR};font-weight:600;width:140px;">Order #</td>
        <td style="padding:12px 16px;border-bottom:1px solid ${BORDER_COLOR};font-size:14px;color:${TEXT_COLOR};">${escapeHtml(data.orderNumber)}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;background-color:${BG_COLOR};border-bottom:1px solid ${BORDER_COLOR};font-size:13px;color:${MUTED_COLOR};font-weight:600;">Vehicle</td>
        <td style="padding:12px 16px;border-bottom:1px solid ${BORDER_COLOR};font-size:14px;color:${TEXT_COLOR};">${escapeHtml(data.vehicleInfo)}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;background-color:${BG_COLOR};border-bottom:1px solid ${BORDER_COLOR};font-size:13px;color:${MUTED_COLOR};font-weight:600;">Scheduled</td>
        <td style="padding:12px 16px;border-bottom:1px solid ${BORDER_COLOR};font-size:14px;color:${TEXT_COLOR};">${escapeHtml(data.scheduledDate)}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;background-color:${BG_COLOR};font-size:13px;color:${MUTED_COLOR};font-weight:600;">Total</td>
        <td style="padding:12px 16px;font-size:14px;color:${TEXT_COLOR};font-weight:600;">${escapeHtml(data.totalPrice)}</td>
      </tr>
    </table>
    <h3 style="margin:0 0 8px;color:${TEXT_COLOR};font-size:16px;font-weight:600;">Services</h3>
    <ul style="margin:0 0 24px;padding-left:20px;">
      ${servicesList}
    </ul>
    <p style="margin:0;color:${MUTED_COLOR};font-size:12px;line-height:1.5;">
      If you have any questions about your order, please contact us.
    </p>`;

  return baseLayout(content);
}

export function statusUpdateTemplate(data: StatusUpdateData): string {
  const content = `
    <h2 style="margin:0 0 16px;color:${TEXT_COLOR};font-size:20px;font-weight:600;">Order Status Update</h2>
    <p style="margin:0 0 16px;color:${TEXT_COLOR};font-size:14px;line-height:1.6;">
      Hi ${escapeHtml(data.clientName)},
    </p>
    <p style="margin:0 0 24px;color:${TEXT_COLOR};font-size:14px;line-height:1.6;">
      The status of your order has been updated.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;border:1px solid ${BORDER_COLOR};border-radius:6px;overflow:hidden;">
      <tr>
        <td style="padding:12px 16px;background-color:${BG_COLOR};border-bottom:1px solid ${BORDER_COLOR};font-size:13px;color:${MUTED_COLOR};font-weight:600;width:140px;">Order #</td>
        <td style="padding:12px 16px;border-bottom:1px solid ${BORDER_COLOR};font-size:14px;color:${TEXT_COLOR};">${escapeHtml(data.orderNumber)}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;background-color:${BG_COLOR};border-bottom:1px solid ${BORDER_COLOR};font-size:13px;color:${MUTED_COLOR};font-weight:600;">Vehicle</td>
        <td style="padding:12px 16px;border-bottom:1px solid ${BORDER_COLOR};font-size:14px;color:${TEXT_COLOR};">${escapeHtml(data.vehicleInfo)}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;background-color:${BG_COLOR};font-size:13px;color:${MUTED_COLOR};font-weight:600;">New Status</td>
        <td style="padding:12px 16px;font-size:14px;color:${TEXT_COLOR};">
          <span style="display:inline-block;padding:4px 12px;background-color:${BRAND_COLOR};color:#ffffff;border-radius:12px;font-size:12px;font-weight:600;">
            ${escapeHtml(data.newStatus)}
          </span>
        </td>
      </tr>
    </table>
    <p style="margin:0;color:${MUTED_COLOR};font-size:12px;line-height:1.5;">
      If you have any questions about your order, please contact us.
    </p>`;

  return baseLayout(content);
}

export function bookingReminderTemplate(data: BookingReminderData): string {
  const addressRow = data.branchAddress
    ? `<tr>
        <td style="padding:12px 16px;background-color:${BG_COLOR};font-size:13px;color:${MUTED_COLOR};font-weight:600;">Address</td>
        <td style="padding:12px 16px;font-size:14px;color:${TEXT_COLOR};">${escapeHtml(data.branchAddress)}</td>
      </tr>`
    : '';

  const content = `
    <h2 style="margin:0 0 16px;color:${TEXT_COLOR};font-size:20px;font-weight:600;">Booking Reminder</h2>
    <p style="margin:0 0 16px;color:${TEXT_COLOR};font-size:14px;line-height:1.6;">
      Hi ${escapeHtml(data.clientName)},
    </p>
    <p style="margin:0 0 24px;color:${TEXT_COLOR};font-size:14px;line-height:1.6;">
      This is a friendly reminder about your upcoming appointment.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;border:1px solid ${BORDER_COLOR};border-radius:6px;overflow:hidden;">
      <tr>
        <td style="padding:12px 16px;background-color:${BG_COLOR};border-bottom:1px solid ${BORDER_COLOR};font-size:13px;color:${MUTED_COLOR};font-weight:600;width:140px;">Order #</td>
        <td style="padding:12px 16px;border-bottom:1px solid ${BORDER_COLOR};font-size:14px;color:${TEXT_COLOR};">${escapeHtml(data.orderNumber)}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;background-color:${BG_COLOR};border-bottom:1px solid ${BORDER_COLOR};font-size:13px;color:${MUTED_COLOR};font-weight:600;">Scheduled</td>
        <td style="padding:12px 16px;border-bottom:1px solid ${BORDER_COLOR};font-size:14px;color:${TEXT_COLOR};">${escapeHtml(data.scheduledDate)}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;background-color:${BG_COLOR};${data.branchAddress ? `border-bottom:1px solid ${BORDER_COLOR};` : ''}font-size:13px;color:${MUTED_COLOR};font-weight:600;">Branch</td>
        <td style="padding:12px 16px;${data.branchAddress ? `border-bottom:1px solid ${BORDER_COLOR};` : ''}font-size:14px;color:${TEXT_COLOR};">${escapeHtml(data.branchName)}</td>
      </tr>
      ${addressRow}
    </table>
    <p style="margin:0;color:${MUTED_COLOR};font-size:12px;line-height:1.5;">
      If you need to reschedule or cancel, please contact us in advance.
    </p>`;

  return baseLayout(content);
}

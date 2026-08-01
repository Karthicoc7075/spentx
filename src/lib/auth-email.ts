import { sendResendEmail } from "@/lib/resend";

function authEmailLayout(title: string, body: string, actionLabel: string, actionUrl: string) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.5; color: #0f172a; max-width: 560px; margin: 0 auto; padding: 24px;">
      <p style="font-size: 13px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #6366f1; margin: 0 0 8px;">SpentX</p>
      <h1 style="font-size: 24px; font-weight: 700; margin: 0 0 12px;">${title}</h1>
      <p style="font-size: 15px; color: #475569; margin: 0 0 24px;">${body}</p>
      <a href="${actionUrl}" style="display: inline-block; background: #6366f1; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 20px; border-radius: 10px;">${actionLabel}</a>
      <p style="font-size: 12px; color: #94a3b8; margin: 28px 0 0;">If the button does not work, copy this link into your browser:<br /><a href="${actionUrl}" style="color: #6366f1; word-break: break-all;">${actionUrl}</a></p>
    </div>
  `;
}

export async function sendVerificationEmail(email: string, actionLink: string) {
  const html = authEmailLayout(
    "Verify your email",
    "Confirm your email address to activate your SpentX account.",
    "Verify email",
    actionLink,
  );

  return sendResendEmail({
    to: email,
    subject: "Verify your SpentX email",
    html,
    text: `Verify your SpentX email: ${actionLink}`,
  });
}

export async function sendPasswordResetEmail(email: string, actionLink: string) {
  const html = authEmailLayout(
    "Reset your password",
    "We received a request to reset your SpentX password. This link expires soon.",
    "Reset password",
    actionLink,
  );

  return sendResendEmail({
    to: email,
    subject: "Reset your SpentX password",
    html,
    text: `Reset your SpentX password: ${actionLink}`,
  });
}
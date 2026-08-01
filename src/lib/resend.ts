type SendResendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
};

export function getResendFromEmail() {
  return process.env.RESEND_FROM_EMAIL || "SpentX <onboarding@resend.dev>";
}

export async function sendResendEmail(input: SendResendEmailInput) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    throw new Error(
      "RESEND_API_KEY is not configured. Add it to .env.local from resend.com → API Keys.",
    );
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: getResendFromEmail(),
      to: Array.isArray(input.to) ? input.to : [input.to],
      subject: input.subject,
      html: input.html,
      ...(input.text ? { text: input.text } : {}),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Resend API error: ${errorText}`);
  }

  return response.json() as Promise<{ id: string }>;
}
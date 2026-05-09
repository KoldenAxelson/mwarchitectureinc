import type { APIRoute } from "astro";

/**
 * MW Architecture — contact form handler.
 *
 * Lives inside the Astro app (deployed by @astrojs/cloudflare as part of
 * the same Worker) so it shares the site's origin — no CORS, no separate
 * deploy, no separate URL to wire up. Reads its secrets from the Worker
 * runtime env.
 *
 * Required secrets (set via `wrangler secret put`):
 *   RESEND_API_KEY    Resend API key
 *   FROM_EMAIL        Verified sender (must match a Resend-verified domain)
 *   TO_EMAIL_1        Primary recipient
 *   TO_EMAIL_2        Secondary recipient
 */
export const prerender = false;

interface Env {
  RESEND_API_KEY: string;
  FROM_EMAIL: string;
  TO_EMAIL_1: string;
  TO_EMAIL_2: string;
}

interface Submission {
  name: string;
  email: string;
  phone?: string;
  projectType: string;
  message: string;
}

const PROJECT_TYPES = ["Residential", "Commercial", "Multi-family", "Other"];

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function validate(
  body: unknown
): { ok: true; data: Submission } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid payload" };
  }
  const b = body as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const email = typeof b.email === "string" ? b.email.trim() : "";
  const phone = typeof b.phone === "string" ? b.phone.trim() : undefined;
  const projectType =
    typeof b.projectType === "string" ? b.projectType.trim() : "";
  const message = typeof b.message === "string" ? b.message.trim() : "";

  if (name.length < 2 || name.length > 200)
    return { ok: false, error: "Name required" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
    return { ok: false, error: "Valid email required" };
  if (message.length < 10 || message.length > 5000)
    return { ok: false, error: "Message too short or too long" };
  if (!PROJECT_TYPES.includes(projectType))
    return { ok: false, error: "Invalid project type" };
  if (phone && (phone.length > 40 || /[<>]/.test(phone)))
    return { ok: false, error: "Invalid phone" };

  return { ok: true, data: { name, email, phone, projectType, message } };
}

function buildEmail(s: Submission, host: string) {
  const subject = `Website inquiry — ${s.projectType} (${s.name})`;
  const text = [
    `Name: ${s.name}`,
    `Email: ${s.email}`,
    s.phone ? `Phone: ${s.phone}` : null,
    `Project type: ${s.projectType}`,
    "",
    "Message:",
    s.message,
    "",
    `— Submitted from ${host}`,
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family: system-ui, sans-serif; line-height: 1.5; color: #222;">
      <h2 style="margin:0 0 16px;color:#243328;">New website inquiry</h2>
      <table style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:4px 12px 4px 0;color:#84807a;">Name</td><td>${escapeHtml(s.name)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#84807a;">Email</td><td><a href="mailto:${escapeHtml(s.email)}">${escapeHtml(s.email)}</a></td></tr>
        ${s.phone ? `<tr><td style="padding:4px 12px 4px 0;color:#84807a;">Phone</td><td>${escapeHtml(s.phone)}</td></tr>` : ""}
        <tr><td style="padding:4px 12px 4px 0;color:#84807a;">Type</td><td>${escapeHtml(s.projectType)}</td></tr>
      </table>
      <h3 style="margin:24px 0 8px;color:#111;">Message</h3>
      <div style="white-space:pre-wrap;border-left:3px solid #c97354;padding:6px 12px;color:#222;">${escapeHtml(s.message)}</div>
      <p style="margin-top:24px;font-size:12px;color:#84807a;">Submitted from ${escapeHtml(host)}</p>
    </div>
  `;
  return { subject, text, html };
}

async function sendViaResend(
  env: Env,
  to: string[],
  email: ReturnType<typeof buildEmail>,
  replyTo: string
) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `MW Architecture <${env.FROM_EMAIL}>`,
      to,
      reply_to: replyTo,
      subject: email.subject,
      text: email.text,
      html: email.html,
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Resend ${res.status}: ${detail.slice(0, 300)}`);
  }
  return res.json();
}

export const POST: APIRoute = async ({ request, locals }) => {
  // Cloudflare adapter exposes Worker env at locals.runtime.env. The cast
  // is unavoidable until the project runs `wrangler types` to generate
  // CloudflareEnv with the secret names typed.
  const env = (locals as any).runtime?.env as Env | undefined;
  if (!env || !env.RESEND_API_KEY) {
    return json({ error: "Server not configured" }, 500);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const result = validate(payload);
  if (!result.ok) return json({ error: result.error }, 400);

  const recipients = [env.TO_EMAIL_1, env.TO_EMAIL_2].filter(Boolean);
  if (recipients.length === 0) {
    return json({ error: "No recipients configured" }, 500);
  }

  const host = new URL(request.url).host;
  const email = buildEmail(result.data, host);

  try {
    await sendViaResend(env, recipients, email, result.data.email);
  } catch (err) {
    console.error("Resend send failed:", err);
    return json(
      { error: "Could not send message. Please email us directly." },
      502
    );
  }

  return json({ ok: true }, 200);
};

// Reject anything that isn't POST so the route doesn't accidentally
// 404 confusingly when probed.
export const ALL: APIRoute = async () =>
  json({ error: "Method not allowed" }, 405);

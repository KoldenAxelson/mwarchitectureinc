/**
 * MW Architecture — contact form Worker.
 *
 * Receives a JSON POST from the Astro site's contact form, validates it,
 * then asks Resend to deliver an email to both principals.
 *
 * Env (set via `wrangler secret put` or the dashboard):
 *   RESEND_API_KEY    Resend API key (https://resend.com/api-keys)
 *   FROM_EMAIL        Verified sender, e.g. contact@mwarchitectureinc.com
 *   TO_EMAIL_1        Primary recipient (Moritz)
 *   TO_EMAIL_2        Secondary recipient (Wade)
 *   ALLOWED_ORIGINS   Comma-separated list of origins permitted to POST
 */

interface Env {
  RESEND_API_KEY: string;
  FROM_EMAIL: string;
  TO_EMAIL_1: string;
  TO_EMAIL_2: string;
  ALLOWED_ORIGINS: string;
}

interface Submission {
  name: string;
  email: string;
  phone?: string;
  projectType: string;
  message: string;
}

const PROJECT_TYPES = ["Residential", "Commercial", "Multi-family", "Other"];

function corsHeaders(origin: string | null, allowed: string[]): HeadersInit {
  // If the origin is on our allow-list, echo it back; otherwise no CORS
  // (which causes the browser to block — the desired behavior for unknown
  // sources). We don't use "*" because we want to allow credentials-free
  // POSTs only from sites we control.
  const ok = origin && allowed.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : allowed[0] ?? "",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function jsonResponse(
  body: unknown,
  status: number,
  cors: HeadersInit
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

/** Pure-JS escape for safe HTML email rendering. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function validate(body: unknown): { ok: true; data: Submission } | { ok: false; error: string } {
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

  if (name.length < 2 || name.length > 200) return { ok: false, error: "Name required" };
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

function buildEmail(s: Submission, originHost: string) {
  const subject = `Website inquiry — ${s.projectType} (${s.name})`;
  const lines = [
    `Name: ${s.name}`,
    `Email: ${s.email}`,
    s.phone ? `Phone: ${s.phone}` : null,
    `Project type: ${s.projectType}`,
    "",
    "Message:",
    s.message,
    "",
    `— Submitted from ${originHost}`,
  ].filter(Boolean);
  const text = lines.join("\n");

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
      <div style="white-space:pre-wrap;border-left:3px solid #a1c2a1;padding:6px 12px;color:#222;">${escapeHtml(s.message)}</div>
      <p style="margin-top:24px;font-size:12px;color:#84807a;">Submitted from ${escapeHtml(originHost)}</p>
    </div>
  `;
  return { subject, text, html };
}

async function sendViaResend(env: Env, to: string[], email: ReturnType<typeof buildEmail>, replyTo: string) {
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

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get("Origin");
    const allowed = (env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const cors = corsHeaders(origin, allowed);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405, cors);
    }

    if (origin && !allowed.includes(origin)) {
      return jsonResponse({ error: "Origin not allowed" }, 403, cors);
    }

    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400, cors);
    }

    const result = validate(payload);
    if (!result.ok) {
      return jsonResponse({ error: result.error }, 400, cors);
    }

    const recipients = [env.TO_EMAIL_1, env.TO_EMAIL_2].filter(Boolean);
    if (recipients.length === 0) {
      console.error("No TO_EMAIL_* configured");
      return jsonResponse({ error: "Server not configured" }, 500, cors);
    }

    const email = buildEmail(result.data, origin || "direct");

    try {
      await sendViaResend(env, recipients, email, result.data.email);
    } catch (err) {
      console.error("Resend send failed:", err);
      return jsonResponse(
        { error: "Could not send message. Please email us directly." },
        502,
        cors
      );
    }

    return jsonResponse({ ok: true }, 200, cors);
  },
};

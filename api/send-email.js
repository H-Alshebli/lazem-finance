import nodemailer from "nodemailer";

const required = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "MAIL_FROM",
];

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildHtml({
  title,
  body,
  requestTitle,
  statusLabel,
  actorName,
  requestUrl,
}) {
  return `
    <div style="font-family:Arial,sans-serif;background:#f6f8fb;padding:24px;color:#111827">
      <div style="max-width:620px;margin:auto;background:#ffffff;border-radius:14px;border:1px solid #e5e7eb;overflow:hidden">
        <div style="background:#0b1220;color:#ffffff;padding:18px 22px">
          <div style="font-size:18px;font-weight:700">${escapeHtml(title || "Lazem Finance Notification")}</div>
          <div style="font-size:12px;color:#cbd5e1;margin-top:4px">Lazem Finance Portal</div>
        </div>

        <div style="padding:22px">
          ${requestTitle ? `<p style="margin:0 0 10px"><strong>Request:</strong> ${escapeHtml(requestTitle)}</p>` : ""}
          ${statusLabel ? `<p style="margin:0 0 10px"><strong>Status:</strong> ${escapeHtml(statusLabel)}</p>` : ""}
          ${actorName ? `<p style="margin:0 0 10px"><strong>By:</strong> ${escapeHtml(actorName)}</p>` : ""}

          <p style="line-height:1.6;margin:12px 0 0">${escapeHtml(body || "").replaceAll("\n", "<br/>")}</p>

          ${
            requestUrl
              ? `
              <div style="margin-top:24px">
                <a href="${escapeHtml(requestUrl)}"
                  style="display:inline-block;background:#0b1220;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700">
                  Open Request
                </a>
              </div>
            `
              : ""
          }

          <p style="font-size:12px;color:#6b7280;margin-top:22px">
            Please open the Lazem Finance Portal to review or take action.
          </p>
        </div>
      </div>
    </div>`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length) {
    return res.status(500).json({
      ok: false,
      error: `Missing email environment variables: ${missing.join(", ")}`,
    });
  }

  const {
    to = [],
    subject,
    title,
    body,
    requestTitle,
    statusLabel,
    actorName,
    requestUrl,
  } = req.body || {};

  const recipients = Array.isArray(to) ? to : String(to || "").split(",");

  const cleanRecipients = [
    ...new Set(recipients.map((x) => String(x).trim()).filter(Boolean)),
  ];

  if (!cleanRecipients.length) {
    return res.status(400).json({
      ok: false,
      error: "No recipients provided",
    });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || "false") === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to: cleanRecipients.join(","),
      subject: subject || title || "Lazem Finance Notification",
      text: `${title || "Lazem Finance Notification"}\n\n${body || ""}\n\n${requestUrl || ""}`,
      html: buildHtml({
        title,
        body,
        requestTitle,
        statusLabel,
        actorName,
        requestUrl,
      }),
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("send-email failed:", error);

    return res.status(500).json({
      ok: false,
      error: error.message || "Email failed",
    });
  }
}
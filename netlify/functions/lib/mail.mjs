import nodemailer from "nodemailer";

// Email sending. Prefers Resend (RESEND_API_KEY + MAIL_FROM on your own domain);
// falls back to Gmail with an app password (GMAIL_USER + GMAIL_APP_PASSWORD).
let transport = null, testOutbox = null;
export function setTestOutbox(box) { testOutbox = box; }
const hasResend = () => !!process.env.RESEND_API_KEY;
const hasGmail = () => !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
export const mailReady = () => !!testOutbox || hasResend() || hasGmail();

export async function sendMail({ to, subject, text, html }) {
  if (testOutbox) { testOutbox.push({ to, subject, text, html }); return true; }
  if (hasResend()) {
    const from = process.env.MAIL_FROM || "School Book Covers <onboarding@resend.dev>";
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text, html, reply_to: process.env.MAIL_REPLY_TO || "coetzerdominique25@gmail.com" }),
    });
    if (!r.ok) throw new Error("Resend " + r.status + " " + (await r.text()).slice(0, 200));
    return true;
  }
  if (!hasGmail()) return false;
  transport ||= nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true,
    auth: { user: process.env.GMAIL_USER, pass: String(process.env.GMAIL_APP_PASSWORD).replace(/\s+/g, "") },
  });
  await transport.sendMail({ from: `"School Book Covers" <${process.env.GMAIL_USER}>`, to, subject, text, html });
  return true;
}

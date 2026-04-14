import nodemailer from "nodemailer";

/**
 * Sends an email using Brevo SMTP.
 * @param {Object} options
 * @param {string} options.to - Recipient email address.`
 * @param {string} options.subject - Email subject.
 * @param {string} options.html - HTML content of the email.
 * @param {string} [options.text] - Optional plain text content.
 * @returns {Promise<void>}
 */

type Payload = {
  to: string;
  subject: string;
  html?: string;
  text: string;
};
export async function sendEmail({ to, subject, html, text }: Payload) {
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp-relay.brevo.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.BREVO_SMTP_USER,
        pass: process.env.BREVO_SMTP_PASS,
      },
    });

    const info = await transporter.sendMail({
      from: `"PSM Dashboard" <${process.env.FROM_EMAIL}>`,
      to,
      subject,
      text,
      html,
    });

    return info;
  } catch (error) {
    console.error("❌ Error sending email:", error);
    throw error;
  }
}

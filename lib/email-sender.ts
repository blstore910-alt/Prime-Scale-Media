import nodemailer from "nodemailer";
import { safeErrorMessage } from "@/lib/pure-error";

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
      // The name people see in their inbox. "PSM Dashboard" read as a
      // system; this is the company they signed up with.
      from: `"Prime Scale Media" <${process.env.FROM_EMAIL}>`,
      to,
      subject,
      text,
      html,
    });

    return info;
  } catch (error) {
    console.error("Error sending email:", safeErrorMessage(error));
    throw error;
  }
}

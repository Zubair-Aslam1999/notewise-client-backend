// backend/utils/sendEmail.js
const sgMail = require("@sendgrid/mail");

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function sendEmail({ to, subject, html }) {
  const msg = {
    to,
    from: {
      name: "NoteWise",
      email: process.env.EMAIL_FROM,
    },
    subject,
    html,
  };

  try {
    await sgMail.send(msg);
    console.log("📨 Email sent successfully to:", to);
  } catch (error) {
    console.error("❌ SendGrid Error:", error.response?.body || error.message);
    throw new Error("Failed to send email");
  }
}

module.exports = sendEmail;

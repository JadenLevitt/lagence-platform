/**
 * Shared Email Service
 *
 * Centralized Resend API wrapper for all email operations across the platform.
 * Replaces inline fetch() calls in routes.ts and chat-server.js.
 */

/**
 * Send an email via the Resend API.
 *
 * @param {Object} options
 * @param {string|string[]} options.to - Recipient email(s)
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML body
 * @param {string} [options.from] - Sender email (defaults to RESEND_FROM_EMAIL env var)
 * @returns {Promise<{id: string}>} Resend message ID
 */
async function sendEmail({ to, subject, html, from }) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = from || process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

  if (!apiKey) {
    console.log('[email-service] RESEND_API_KEY not configured, skipping email send');
    return { id: null, skipped: true };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: fromEmail,
      to: Array.isArray(to) ? to : [to],
      subject,
      html
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Resend API error: ${err.message || response.statusText}`);
  }

  return response.json();
}

/**
 * Check if email sending is configured.
 */
function isEmailConfigured() {
  return !!(process.env.RESEND_API_KEY);
}

module.exports = { sendEmail, isEmailConfigured };

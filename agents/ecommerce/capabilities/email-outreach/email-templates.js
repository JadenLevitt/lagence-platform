/**
 * Email Templates - Template functions for outreach emails
 *
 * Each template has a risk level that determines auto-send behavior:
 * - 'low': auto-send to known contacts with standard fields
 * - 'high': require user approval before sending
 */

const TEMPLATES = {
  missing_data_request: {
    risk: 'low',
    subject: ({ styleCount }) =>
      `[L'AGENCE] Data Request: ${styleCount} style(s) missing information`,
    body: ({ contactName, missingFields, styleNumbers }) => `
<div style="font-family: Arial, sans-serif; max-width: 600px;">
  <h2 style="color: #000;">Hi ${contactName},</h2>
  <p>Emma (L'AGENCE e-commerce agent) identified missing data for
     <strong>${styleNumbers.length} style(s)</strong> during tech pack processing.</p>

  <h3 style="color: #333;">Missing Fields</h3>
  <ul>
    ${missingFields.map(f => `<li>${f}</li>`).join('')}
  </ul>

  <h3 style="color: #333;">Style Numbers</h3>
  <p style="font-family: monospace; background: #f5f5f5; padding: 8px;">
    ${styleNumbers.join(', ')}
  </p>

  <p>Could you provide this data or point me to the right source?</p>

  <p style="color: #666; font-size: 12px; margin-top: 24px;">
    — Emma (E-commerce Agent)<br/>
    <em>This is an automated request from the L'AGENCE Platform</em>
  </p>
</div>`
  },

  followup: {
    risk: 'low',
    subject: ({ originalSubject }) =>
      `Re: ${originalSubject}`,
    body: ({ contactName, daysSince, missingFields, styleNumbers }) => `
<div style="font-family: Arial, sans-serif; max-width: 600px;">
  <h2 style="color: #000;">Hi ${contactName},</h2>
  <p>Just following up on the data request from ${daysSince} day(s) ago.
     We're still missing the following for ${styleNumbers.length} style(s):</p>

  <ul>
    ${missingFields.map(f => `<li>${f}</li>`).join('')}
  </ul>

  <p>Any updates on this?</p>

  <p style="color: #666; font-size: 12px; margin-top: 24px;">
    — Emma (E-commerce Agent)
  </p>
</div>`
  },

  general_inquiry: {
    risk: 'high',
    subject: ({ topic }) =>
      `[L'AGENCE] Question: ${topic}`,
    body: ({ contactName, message }) => `
<div style="font-family: Arial, sans-serif; max-width: 600px;">
  <h2 style="color: #000;">Hi ${contactName},</h2>
  <p>${message}</p>

  <p style="color: #666; font-size: 12px; margin-top: 24px;">
    — Emma (E-commerce Agent)<br/>
    <em>This is an automated request from the L'AGENCE Platform</em>
  </p>
</div>`
  }
};

/**
 * Render a template with the given context.
 *
 * @param {string} templateId - Template key from TEMPLATES
 * @param {Object} context - Data to interpolate into the template
 * @returns {{subject: string, html: string, risk: string}}
 */
function renderTemplate(templateId, context) {
  const template = TEMPLATES[templateId];
  if (!template) throw new Error(`Unknown email template: ${templateId}`);

  return {
    subject: template.subject(context),
    html: template.body(context),
    risk: template.risk
  };
}

/**
 * Get available template IDs.
 */
function getAvailableTemplates() {
  return Object.keys(TEMPLATES);
}

module.exports = { TEMPLATES, renderTemplate, getAvailableTemplates };

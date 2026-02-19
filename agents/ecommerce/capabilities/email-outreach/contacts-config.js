/**
 * Contacts Config - Team directory and field-to-team mapping
 *
 * This is the initial seed configuration. The DB `team_contacts` table
 * is the runtime source of truth (populated from this config on first run).
 */

const DEFAULT_CONTACTS = [
  {
    team_name: 'production',
    contact_name: 'Production Team',
    email: '',
    data_domains: ['fabric_coo', 'care_instructions', 'filling', 'material_category', 'coo', 'lining_content']
  },
  {
    team_name: 'design',
    contact_name: 'Design Team',
    email: '',
    data_domains: ['closures', 'shoulder_pads', 'pockets', 'lining', 'standard_product_length', 'rtw_fit']
  },
  {
    team_name: 'editorial',
    contact_name: 'Editorial Team',
    email: '',
    data_domains: ['product_descriptions', 'seo_content', 'occasion']
  }
];

/**
 * Map field names (as they appear in extraction output) to data domains.
 * Used to automatically determine which team to contact for missing data.
 */
const FIELD_TO_DOMAIN = {
  'FABRIC COO': 'fabric_coo',
  'CARE INSTRUCTIONS': 'care_instructions',
  'FILLING (OUTERWEAR)': 'filling',
  'MATERIAL CATEGORY': 'material_category',
  'COO': 'coo',
  'LINING CONTENT': 'lining_content',
  'CLOSURES': 'closures',
  'SHOULDER PADS': 'shoulder_pads',
  'POCKETS': 'pockets',
  'LINING': 'lining',
  'STANDARD PRODUCT LENGTH': 'standard_product_length',
  'RTW FIT': 'rtw_fit',
  'OCCASION (DRESSES ONLY)': 'occasion'
};

/**
 * Get the team responsible for a given field name.
 * Returns team_name or null if no mapping found.
 */
function getTeamForField(fieldName) {
  const domain = FIELD_TO_DOMAIN[fieldName];
  if (!domain) return null;

  for (const contact of DEFAULT_CONTACTS) {
    if (contact.data_domains.includes(domain)) {
      return contact.team_name;
    }
  }

  return null;
}

/**
 * Group missing fields by the team that owns them.
 *
 * @param {string[]} missingFields - Array of field names with missing data
 * @returns {Object<string, string[]>} Map of team_name → [field_names]
 */
function groupFieldsByTeam(missingFields) {
  const grouped = {};

  for (const field of missingFields) {
    const team = getTeamForField(field) || 'unknown';
    if (!grouped[team]) grouped[team] = [];
    grouped[team].push(field);
  }

  return grouped;
}

module.exports = { DEFAULT_CONTACTS, FIELD_TO_DOMAIN, getTeamForField, groupFieldsByTeam };

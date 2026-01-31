/**
 * EXTRACTION CONFIG - Source of truth for field definitions
 *
 * IMPORTANT: Field names must EXACTLY match the column headers in the input CSV!
 * The input CSV already has all these columns - we fill them in, not add new ones.
 */

// Column names exactly as they appear in the input CSV
const FIELD_DEFINITIONS = [
  // ========== FROM INPUT CSV (pass-through, already filled) ==========
  {
    field_name: "ITEM ID",
    source: "input_csv",
    extraction_logic: "Pulled directly from Full Circle - already in input CSV"
  },
  {
    field_name: "FC NAME",
    source: "input_csv",
    extraction_logic: "Pulled directly from Full Circle - already in input CSV"
  },
  {
    field_name: "FC COLOR",
    source: "input_csv",
    extraction_logic: "Pulled directly from Full Circle - already in input CSV"
  },
  {
    field_name: "COO",
    source: "input_csv",
    extraction_logic: "Pulled directly from Full Circle - already in input CSV"
  },

  // ========== FROM SEPARATE CSV (keep existing value, don't extract) ==========
  {
    field_name: "MATERIAL CATEGORY",
    source: "separate_csv",
    extraction_logic: "Information from separate CSV, not Gerber - keep existing value"
  },
  {
    field_name: "FILLING (OUTERWEAR)",
    source: "separate_csv",
    extraction_logic: "Information from separate CSV, not Gerber - keep existing value"
  },
  {
    field_name: "FABRIC COO",
    source: "separate_csv",
    extraction_logic: "Information from separate CSV - keep existing value"
  },
  {
    field_name: "CARE INSTRUCTIONS",
    source: "separate_csv",
    extraction_logic: "Information from separate CSV - keep existing value"
  },

  // ========== EXTRACTED FROM TECH PACK BY CLAUDE ==========
  {
    field_name: "HPS / RISE",
    source: "tech_pack",
    extraction_logic: "Return answer like '22'. Find in tech pack Measurements section, SPEC page, look at the bold column (size 4). For tops this is HPS (High Point Shoulder to hem). For bottoms this is Rise.",
    examples: "22, 24.5, 18"
  },
  {
    field_name: "SLEEVE LENGTH / INSEAM",
    source: "tech_pack",
    extraction_logic: "Return answer like '22'. Find in tech pack Measurements section, SPEC page, bold column. For tops this is sleeve length. For bottoms this is inseam.",
    examples: "22, 32, 26.5"
  },
  {
    field_name: "LINING CONTENT",
    source: "tech_pack",
    extraction_logic: "Return answer like '100% Polyester'. Find in BOM (Bill of Materials) section, look for interlining/lining fabric content. If no lining, return empty string.",
    examples: "100% Polyester, 100% Cupro, 97% Polyester 3% Spandex"
  },
  {
    field_name: "LEG OPENING",
    source: "tech_pack",
    extraction_logic: "Return answer like '22'. Find in Measurements section, SPEC page, bold column. Only applicable for pants/bottoms. If not a bottom, return empty string.",
    examples: "14, 16.5, 22"
  },
  {
    field_name: "SHOULDER PADS",
    source: "tech_pack",
    extraction_logic: "Return 'Yes' or 'No'. Check BOM (Bill of Materials) for any reference to shoulder pads.",
    examples: "Yes, No"
  },
  {
    field_name: "LINING",
    source: "tech_pack",
    extraction_logic: "Return 'Yes' or 'No'. Check BOM (Bill of Materials) for any reference to lining fabric.",
    examples: "Yes, No"
  },
  {
    field_name: "POCKETS",
    source: "tech_pack",
    extraction_logic: "Return 'Yes' or 'No'. Check BOM and visual inspection of garment sketches/photos for pockets.",
    examples: "Yes, No"
  },
  {
    field_name: "CLOSURES",
    source: "tech_pack",
    extraction_logic: "Return one of: 'Zip', 'Hook & Eye', 'Buttons', 'None', 'Tie Belt', 'Snap Buttons', 'Frogs', 'Belt', 'Hook & Bar'. Check BOM and visual inspection.",
    examples: "Zip, Buttons, Hook & Eye, None"
  },
  {
    field_name: "STANDARD PRODUCT LENGTH",
    source: "tech_pack",
    extraction_logic: "Return one of: 'Cropped', 'Regular', or 'Long'. Determine via visual inspection of the garment photos/sketches.",
    examples: "Cropped, Regular, Long"
  },
  {
    field_name: "RTW FIT",
    source: "tech_pack",
    extraction_logic: "Return one of: 'Regular', 'Fitted', 'Relaxed', or 'Oversized'. Determine via visual inspection of the garment fit.",
    examples: "Regular, Fitted, Relaxed, Oversized"
  },
  {
    field_name: "SLEEVE LENGTH",
    source: "tech_pack",
    extraction_logic: "Return one of: 'Strapless', 'Sleeveless', 'Short Sleeve', '3/4 Sleeve', 'Long Sleeve', or 'One Shoulder'. Determine via visual inspection.",
    examples: "Long Sleeve, Sleeveless, Short Sleeve"
  },
  {
    field_name: "RISE",
    source: "tech_pack",
    extraction_logic: "Return one of: 'Low', 'Mid', 'High', or 'Ultra-High'. For pants/bottoms only. Low = under 9 inches, Mid = 9-10.5 inches, High = 10.5-12 inches, Ultra-High = over 12 inches. If not a bottom, return empty string.",
    examples: "Low, Mid, High, Ultra-High"
  },
  {
    field_name: "PANT FIT",
    source: "tech_pack",
    extraction_logic: "Return one of: 'Skinny', 'Straight', 'Flare/Bootcut', 'Wide/Relaxed', or 'Maternity'. For pants only. If not pants, return empty string.",
    examples: "Skinny, Straight, Wide/Relaxed"
  },
  {
    field_name: "DRESS/SKIRT LENGTH",
    source: "tech_pack",
    extraction_logic: "Return one of: 'Mini', 'Midi', or 'Maxi'. For dresses and skirts only. If not a dress/skirt, return empty string.",
    examples: "Mini, Midi, Maxi"
  },
  {
    field_name: "OCCASION (DRESSES ONLY)",
    source: "tech_pack",
    extraction_logic: "Return one of: 'Daytime', 'Workwear', 'Evening', 'Vacation', 'Cocktail', or 'Wedding'. For dresses only. If not a dress, return empty string.",
    examples: "Daytime, Workwear, Evening, Cocktail"
  }
];

/**
 * Build the Claude extraction prompt from field definitions
 */
function buildExtractionPrompt() {
  const techPackFields = FIELD_DEFINITIONS.filter(f => f.source === 'tech_pack');

  let fieldList = techPackFields.map((f, i) => {
    let instruction = `${i + 1}. "${f.field_name}" - ${f.extraction_logic}`;
    if (f.examples) {
      instruction += ` Examples: ${f.examples}`;
    }
    return instruction;
  }).join('\n');

  return `Extract data from this L'AGENCE tech pack PDF. Return ONLY a JSON object - no other text.

EXTRACTION GUIDELINES:
- Measurements: Look in SPEC/Measurements section, use the BOLD column (size 4)
- Materials: Check the BOM (Bill of Materials) section
- Visual attributes: Examine garment photos and sketches
- If not applicable or not found: use empty string ""
- NEVER use "N/A" - use "" instead

FIELDS TO EXTRACT:
${fieldList}

RESPONSE FORMAT - Return ONLY this JSON structure, starting with { and ending with }:
{
  "HPS / RISE": {"value": "22", "logic": "Found in SPEC page", "needs_review": false},
  "SLEEVE LENGTH / INSEAM": {"value": "24", "logic": "From measurements", "needs_review": false},
  "LINING CONTENT": {"value": "100% Polyester", "logic": "Found in BOM", "needs_review": false},
  "LEG OPENING": {"value": "", "logic": "Not a bottom", "needs_review": false},
  "SHOULDER PADS": {"value": "No", "logic": "Not in BOM", "needs_review": false},
  "LINING": {"value": "Yes", "logic": "Lining in BOM", "needs_review": false},
  "POCKETS": {"value": "No", "logic": "None visible", "needs_review": false},
  "CLOSURES": {"value": "Buttons", "logic": "Visible in sketch", "needs_review": false},
  "STANDARD PRODUCT LENGTH": {"value": "Regular", "logic": "Visual inspection", "needs_review": false},
  "RTW FIT": {"value": "Fitted", "logic": "Visual inspection", "needs_review": false},
  "SLEEVE LENGTH": {"value": "Long Sleeve", "logic": "Visual inspection", "needs_review": false},
  "RISE": {"value": "", "logic": "Not a bottom", "needs_review": false},
  "PANT FIT": {"value": "", "logic": "Not pants", "needs_review": false},
  "DRESS/SKIRT LENGTH": {"value": "", "logic": "Not a dress/skirt", "needs_review": false},
  "OCCASION (DRESSES ONLY)": {"value": "", "logic": "Not a dress", "needs_review": false}
}

CRITICAL: Your response must start with { and end with } - no explanatory text before or after.`;
}

/**
 * Get fields that come from input CSV (pass-through)
 */
function getInputCsvFields() {
  return FIELD_DEFINITIONS.filter(f => f.source === 'input_csv');
}

/**
 * Get fields that Claude should extract from tech pack
 */
function getTechPackFields() {
  return FIELD_DEFINITIONS.filter(f => f.source === 'tech_pack');
}

/**
 * Get fields from separate CSV (keep existing)
 */
function getSeparateCsvFields() {
  return FIELD_DEFINITIONS.filter(f => f.source === 'separate_csv');
}

/**
 * Get all field definitions
 */
function getAllFieldDefinitions() {
  return FIELD_DEFINITIONS;
}

module.exports = {
  FIELD_DEFINITIONS,
  buildExtractionPrompt,
  getInputCsvFields,
  getTechPackFields,
  getSeparateCsvFields,
  getAllFieldDefinitions
};

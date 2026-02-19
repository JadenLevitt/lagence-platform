/**
 * Document Types - Defines supported PDF document types, detection heuristics,
 * and type-specific extraction prompts.
 */

const DOCUMENT_TYPES = {
  line_sheet: {
    label: 'Line Sheet',
    detect_keywords: ['line sheet', 'wholesale', 'price list', 'collection', 'season'],
    extraction_prompt: `Extract product information from this L'AGENCE line sheet. Return ONLY a JSON object with an array of products found.

For each product, extract:
- style_number: The style/item number
- name: Product name
- color: Color name(s)
- wholesale_price: Wholesale price if shown
- retail_price: Retail/MSRP price if shown
- category: Product category (e.g., Tops, Bottoms, Dresses)
- fabric: Fabric content if shown
- description: Brief product description if available

RESPONSE FORMAT - Return ONLY this JSON structure:
{
  "products": [
    {
      "style_number": "...",
      "name": "...",
      "color": "...",
      "wholesale_price": "...",
      "retail_price": "...",
      "category": "...",
      "fabric": "...",
      "description": "..."
    }
  ],
  "document_notes": "Any relevant notes about the document"
}

CRITICAL: Your response must start with { and end with } - no explanatory text.`,
    expected_fields: ['style_number', 'name', 'color', 'wholesale_price', 'retail_price', 'category']
  },

  spec_sheet: {
    label: 'Spec Sheet',
    detect_keywords: ['specification', 'spec', 'measurements', 'grading', 'grade rule', 'tech spec'],
    extraction_prompt: `Extract specifications from this product spec sheet. Return ONLY a JSON object.

Extract:
- style_number: Style/item number
- measurements: Object of measurement name → value (use size 4/S as base if graded)
- fabric_content: Main fabric content
- lining_content: Lining fabric content if applicable
- construction_details: Notable construction details
- closures: Type of closures
- trims: Notable trims or hardware

RESPONSE FORMAT - Return ONLY this JSON structure:
{
  "style_number": "...",
  "measurements": { "HPS": "22", "chest": "36", ... },
  "fabric_content": "...",
  "lining_content": "...",
  "construction_details": "...",
  "closures": "...",
  "trims": "..."
}

CRITICAL: Your response must start with { and end with } - no explanatory text.`,
    expected_fields: ['style_number', 'measurements', 'fabric_content']
  },

  supplier_doc: {
    label: 'Supplier Document',
    detect_keywords: ['supplier', 'vendor', 'factory', 'mill', 'fabric swatch', 'lab dip'],
    extraction_prompt: `Extract supplier and material information from this document. Return ONLY a JSON object.

Extract:
- supplier_name: Supplier/vendor/factory name
- fabric_content: Fabric composition (e.g., "100% Silk")
- fabric_coo: Fabric country of origin
- care_instructions: Care/wash instructions
- lead_time: Lead time if mentioned
- minimum_order: Minimum order quantity if mentioned
- certifications: Any certifications mentioned
- colors_available: Available colors/colorways
- price_per_yard: Price per yard/meter if shown

RESPONSE FORMAT - Return ONLY this JSON structure:
{
  "supplier_name": "...",
  "fabric_content": "...",
  "fabric_coo": "...",
  "care_instructions": "...",
  "lead_time": "...",
  "minimum_order": "...",
  "certifications": "...",
  "colors_available": "...",
  "price_per_yard": "..."
}

CRITICAL: Your response must start with { and end with } - no explanatory text.`,
    expected_fields: ['supplier_name', 'fabric_content', 'fabric_coo', 'care_instructions']
  },

  general: {
    label: 'General Document',
    detect_keywords: [],
    extraction_prompt: `Analyze this document and extract any product-related data you find. Return ONLY a JSON object.

Look for any of these types of information:
- Product identifiers (style numbers, item IDs, SKUs)
- Product attributes (fabric, color, measurements, fit)
- Material information (content, origin, care instructions)
- Pricing information
- Supplier/vendor details
- Any tabular data

RESPONSE FORMAT - Return a JSON object with descriptive field names as keys:
{
  "field_name_1": "extracted value",
  "field_name_2": "extracted value",
  "summary": "Brief description of what this document contains"
}

CRITICAL: Your response must start with { and end with } - no explanatory text.`,
    expected_fields: []
  }
};

/**
 * Detect document type from filename and content.
 * Returns the best-matching type key, or 'general' as fallback.
 */
function detectDocumentType(filename, firstPageText) {
  const searchText = `${filename || ''} ${firstPageText || ''}`.toLowerCase();

  let bestMatch = 'general';
  let bestScore = 0;

  for (const [typeKey, typeDef] of Object.entries(DOCUMENT_TYPES)) {
    if (typeKey === 'general') continue;

    let score = 0;
    for (const keyword of typeDef.detect_keywords) {
      if (searchText.includes(keyword.toLowerCase())) {
        score++;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = typeKey;
    }
  }

  return bestMatch;
}

/**
 * Get the extraction prompt for a given document type.
 */
function getExtractionPrompt(docType) {
  const config = DOCUMENT_TYPES[docType] || DOCUMENT_TYPES.general;
  return config.extraction_prompt;
}

module.exports = { DOCUMENT_TYPES, detectDocumentType, getExtractionPrompt };

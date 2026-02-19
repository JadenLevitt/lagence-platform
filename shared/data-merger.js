/**
 * Data Merger - Multi-source data consolidation with configurable priority
 *
 * Merges data from multiple sources (input CSV, tech packs, uploaded PDFs,
 * supplementary CSVs, manual overrides) with configurable priority per source.
 * Higher priority values win when the same field has data from multiple sources.
 */

const DEFAULT_PRIORITY = {
  manual_override: 100,   // user corrections always win
  tech_pack: 20,          // extracted from Gerber tech packs
  uploaded_pdf: 15,       // from general PDF uploads
  input_csv: 10,          // user's original CSV data
  separate_csv: 5         // supplementary CSV
};

/**
 * Merge data from multiple sources with priority-based conflict resolution.
 *
 * @param {Array<{source_type: string, data: Object}>} sources - Data sources to merge
 * @param {Object} [priorityConfig] - Custom priority map (source_type → number)
 * @returns {{merged: Object, provenance: Object}} merged data + which source provided each field
 *
 * @example
 *   const { merged, provenance } = mergeDataSources([
 *     { source_type: 'input_csv', data: { 'COO': 'China', 'FC NAME': 'Jacket' } },
 *     { source_type: 'tech_pack', data: { 'COO': 'Italy', 'LINING': 'Yes' } }
 *   ]);
 *   // merged = { 'COO': 'Italy', 'FC NAME': 'Jacket', 'LINING': 'Yes' }
 *   // provenance = { 'COO': 'tech_pack', 'FC NAME': 'input_csv', 'LINING': 'tech_pack' }
 */
function mergeDataSources(sources, priorityConfig = DEFAULT_PRIORITY) {
  // Sort by priority ascending so higher-priority overwrites lower
  const sorted = [...sources].sort((a, b) =>
    (priorityConfig[a.source_type] || 0) - (priorityConfig[b.source_type] || 0)
  );

  const merged = {};
  const provenance = {};

  for (const source of sorted) {
    if (!source.data) continue;
    for (const [field, value] of Object.entries(source.data)) {
      if (value !== null && value !== undefined && String(value).trim() !== '') {
        merged[field] = value;
        provenance[field] = source.source_type;
      }
    }
  }

  return { merged, provenance };
}

module.exports = { mergeDataSources, DEFAULT_PRIORITY };

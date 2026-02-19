/**
 * PDF Processor - General-purpose PDF extraction using Claude Vision
 *
 * Reuses the Claude Vision pattern from tech-pack job-processor.js
 * but with flexible, document-type-specific prompts.
 */

const Anthropic = require('@anthropic-ai/sdk');
const { getSupabaseClient } = require('../../../../shared/supabase-client');
const { detectDocumentType, getExtractionPrompt } = require('./document-types');

const anthropic = new Anthropic();

/**
 * Extract data from a PDF stored in Supabase.
 *
 * @param {string} storagePath - Path in the 'documents' storage bucket
 * @param {string} [documentType] - Override document type detection
 * @returns {Promise<Object>} Extracted data as a JSON object
 */
async function extractFromPdf(storagePath, documentType) {
  const supabase = getSupabaseClient();

  // 1. Download from Supabase storage
  const { data, error } = await supabase.storage.from('documents').download(storagePath);
  if (error) {
    throw new Error(`Failed to download PDF: ${error.message}`);
  }

  const pdfBuffer = Buffer.from(await data.arrayBuffer());
  const base64Pdf = pdfBuffer.toString('base64');

  // 2. Auto-detect document type if not provided
  const detectedType = documentType || detectDocumentType(storagePath, '');

  // 3. Get type-specific prompt
  const prompt = getExtractionPrompt(detectedType);

  // 4. Call Claude Vision
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: base64Pdf
          }
        },
        {
          type: 'text',
          text: prompt
        }
      ]
    }]
  });

  // 5. Parse response
  const text = response.content[0].text;
  const jsonMatch = text.match(/\{[\s\S]*\}/);

  if (jsonMatch) {
    try {
      return {
        extracted_data: JSON.parse(jsonMatch[0]),
        document_type: detectedType,
        tokens_used: response.usage?.input_tokens + response.usage?.output_tokens
      };
    } catch (parseError) {
      return {
        extracted_data: { raw_text: text },
        document_type: detectedType,
        parse_error: parseError.message
      };
    }
  }

  return {
    extracted_data: { raw_text: text },
    document_type: detectedType
  };
}

/**
 * Process a document record: extract data and update the database.
 *
 * @param {string} documentId - UUID of the uploaded_documents record
 */
async function processDocument(documentId) {
  const supabase = getSupabaseClient();

  // Get document record
  const { data: doc, error: fetchErr } = await supabase
    .from('uploaded_documents')
    .select('*')
    .eq('id', documentId)
    .single();

  if (fetchErr || !doc) {
    throw new Error(`Document not found: ${documentId}`);
  }

  // Update status to processing
  await supabase
    .from('uploaded_documents')
    .update({ status: 'processing' })
    .eq('id', documentId);

  try {
    const result = await extractFromPdf(doc.storage_path, doc.document_type);

    // Save extracted data
    await supabase
      .from('uploaded_documents')
      .update({
        status: 'extracted',
        extracted_data: result.extracted_data,
        document_type: result.document_type
      })
      .eq('id', documentId);

    return result;
  } catch (extractErr) {
    await supabase
      .from('uploaded_documents')
      .update({
        status: 'failed',
        error_message: extractErr.message
      })
      .eq('id', documentId);

    throw extractErr;
  }
}

module.exports = { extractFromPdf, processDocument };

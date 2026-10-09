/**
 * FocusAI — Document Processing Service
 * Extracts text, pages/slides, and paragraph-level content blocks from PDFs, PPTXs, and Markdown.
 * Stores materials in Supabase Storage and records metadata, pages, and content blocks in the DB.
 */
import pdfParse from 'pdf-parse';
import AdmZip from 'adm-zip';
import { supabaseAdmin } from '../supabase.js';

/**
 * Categorise block text into heading, bullet, equation, or paragraph.
 */
function determineBlockType(text, index) {
  const trimmed = text.trim();
  if (index === 0 && trimmed.length < 120 && !trimmed.endsWith('.')) {
    return 'heading';
  }
  if (/^#{1,6}\s+/.test(trimmed) || /^(Slide|Chapter|Section|Module)\s+\d+/i.test(trimmed)) {
    return 'heading';
  }
  if (/^[•\-\*]\s+/.test(trimmed) || /^\d+[\.\)]\s+/.test(trimmed)) {
    return 'bullet';
  }
  if (/[∑∫√πθ=]/.test(trimmed) && trimmed.length < 60) {
    return 'equation';
  }
  return 'paragraph';
}

/**
 * Break page text into structured content blocks (paragraphs/bullets/headings).
 */
function segmentTextIntoBlocks(rawText) {
  if (!rawText || !rawText.trim()) return [];

  // Split on double line breaks or bullet points
  const rawSegments = rawText
    .split(/\n\s*\n/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  const blocks = [];
  let currentOffset = 0;

  for (let i = 0; i < rawSegments.length; i++) {
    const segment = rawSegments[i];
    const blockType = determineBlockType(segment, i);

    blocks.push({
      block_index: i,
      block_type: blockType,
      text: segment,
      char_offset_start: currentOffset,
      char_offset_end: currentOffset + segment.length,
      tracking_status: 'available',
      // Approximate bounding coordinates normalized 0-1 for web layout
      bounding_box: {
        x: 0.1,
        y: Math.min(0.9, 0.15 + i * 0.12),
        w: 0.8,
        h: Math.min(0.2, 0.08 + Math.floor(segment.length / 100) * 0.04),
      },
    });

    currentOffset += segment.length + 2;
  }

  return blocks;
}

/**
 * Parse PDF document with per-page tracking.
 */
async function parsePdf(buffer) {
  const pages = [];

  function pageRenderer(pageData) {
    return pageData.getTextContent().then((textContent) => {
      let lastY;
      let text = '';
      for (const item of textContent.items) {
        if (lastY === item.transform[5] || !lastY) {
          text += item.str;
        } else {
          text += '\n' + item.str;
        }
        lastY = item.transform[5];
      }
      pages.push({
        page_number: pages.length + 1,
        raw_text: text.trim(),
      });
      return text;
    });
  }

  try {
    const data = await pdfParse(buffer, { pagerender: pageRenderer });
    // If pagerender did not populate (e.g. single page fallback), use default text
    if (pages.length === 0 && data.text) {
      pages.push({
        page_number: 1,
        raw_text: data.text.trim(),
      });
    }
  } catch (err) {
    console.error('PDF parsing error:', err);
    throw new Error(`Failed to parse PDF document: ${err.message}`);
  }

  return pages.map(p => ({
    page_number: p.page_number,
    blocks: segmentTextIntoBlocks(p.raw_text),
  }));
}

/**
 * Parse PPTX file using AdmZip.
 * Extracts slides in order from ppt/slides/slide{N}.xml
 */
function parsePptx(buffer) {
  try {
    const zip = new AdmZip(buffer);
    const zipEntries = zip.getEntries();

    // Find all slide XML files
    const slideEntries = zipEntries.filter(entry =>
      /^ppt\/slides\/slide\d+\.xml$/i.test(entry.entryName)
    );

    // Natural sort: slide1.xml, slide2.xml, slide10.xml
    slideEntries.sort((a, b) => {
      const numA = parseInt(a.entryName.match(/slide(\d+)\.xml/i)[1], 10);
      const numB = parseInt(b.entryName.match(/slide(\d+)\.xml/i)[1], 10);
      return numA - numB;
    });

    if (slideEntries.length === 0) {
      throw new Error('No slide XML entries found in PPTX archive.');
    }

    const pages = [];

    slideEntries.forEach((entry, index) => {
      const xmlContent = entry.getData().toString('utf8');
      
      // Extract paragraphs: <a:p>...</a:p>
      const paragraphMatches = xmlContent.match(/<a:p[\s>][\s\S]*?<\/a:p>/gi) || [];
      const slideParagraphs = [];

      for (const pXml of paragraphMatches) {
        // Within paragraph, extract text from <a:t>...</a:t>
        const textMatches = pXml.match(/<a:t[^>]*>([\s\S]*?)<\/a:t>/gi) || [];
        const fullParaText = textMatches
          .map(t => t.replace(/<[^>]+>/g, '').trim())
          .filter(Boolean)
          .join(' ');

        if (fullParaText) {
          slideParagraphs.push(fullParaText);
        }
      }

      const slideText = slideParagraphs.join('\n\n');
      pages.push({
        page_number: index + 1,
        blocks: segmentTextIntoBlocks(slideText),
      });
    });

    return pages;
  } catch (err) {
    console.error('PPTX parsing error:', err);
    throw new Error(`Failed to parse PPTX file: ${err.message}`);
  }
}

/**
 * Parse Text or Markdown into slides/pages and content blocks.
 */
function parseTextOrMarkdown(text) {
  // Split into slides if separated by horizontal rules --- or primary headings #
  let slideTexts = text.split(/\n\s*---\s*\n/);
  if (slideTexts.length === 1) {
    // Try splitting by top-level Markdown headers if document is long
    const headerSplit = text.split(/\n(?=# )/);
    if (headerSplit.length > 1) {
      slideTexts = headerSplit;
    }
  }

  return slideTexts.map((st, idx) => ({
    page_number: idx + 1,
    blocks: segmentTextIntoBlocks(st),
  }));
}

export class DocumentService {
  /**
   * Process and store teaching material in Supabase.
   */
  static async uploadAndProcessMaterial({ classId, sessionId = null, teacherId, file }) {
    if (!classId || !teacherId || !file) {
      throw new Error('classId, teacherId, and file are required.');
    }

    const timestamp = Date.now();
    const safeFileName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `classes/${classId}/${timestamp}_${safeFileName}`;

    // 1. Upload original file to Supabase Storage 'materials' bucket
    const { error: storageError } = await supabaseAdmin.storage
      .from('materials')
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (storageError) {
      console.error('Supabase Storage upload error:', storageError);
      throw new Error(`Failed to upload file to storage: ${storageError.message}`);
    }

    // 2. Insert material record with 'processing' status
    const { data: materialRecord, error: matErr } = await supabaseAdmin
      .from('materials')
      .insert({
        class_id: classId,
        session_id: sessionId,
        uploader_id: teacherId,
        file_name: file.originalname,
        storage_path: storagePath,
        mime_type: file.mimetype,
        file_size_bytes: file.size,
        processing_status: 'processing',
      })
      .select()
      .single();

    if (matErr) {
      console.error('Insert material record error:', matErr);
      throw new Error(`Failed to create material record: ${matErr.message}`);
    }

    const materialId = materialRecord.id;

    // 3. Extract slides and content blocks
    try {
      let parsedPages = [];
      const ext = file.originalname.toLowerCase().split('.').pop();

      if (file.mimetype === 'application/pdf' || ext === 'pdf') {
        parsedPages = await parsePdf(file.buffer);
      } else if (
        file.mimetype === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
        ext === 'pptx'
      ) {
        parsedPages = parsePptx(file.buffer);
      } else {
        const textContent = file.buffer.toString('utf8');
        parsedPages = parseTextOrMarkdown(textContent);
      }

      if (parsedPages.length === 0) {
        parsedPages.push({
          page_number: 1,
          blocks: [
            {
              block_index: 0,
              block_type: 'paragraph',
              text: file.originalname,
              tracking_status: 'available',
            },
          ],
        });
      }

      // 4. Save document_pages and content_blocks in database
      for (const page of parsedPages) {
        const { data: pageRecord, error: pageErr } = await supabaseAdmin
          .from('document_pages')
          .insert({
            material_id: materialId,
            page_number: page.page_number,
            page_type: 'slide',
          })
          .select()
          .single();

        if (pageErr) {
          console.error(`Error saving page ${page.page_number}:`, pageErr);
          continue;
        }

        if (page.blocks && page.blocks.length > 0) {
          const blocksToInsert = page.blocks.map(b => ({
            material_id: materialId,
            page_id: pageRecord.id,
            block_index: b.block_index,
            block_type: b.block_type,
            text: b.text,
            char_offset_start: b.char_offset_start || 0,
            char_offset_end: b.char_offset_end || b.text.length,
            tracking_status: b.tracking_status || 'available',
            bounding_box: b.bounding_box || null,
          }));

          const { error: blocksErr } = await supabaseAdmin
            .from('content_blocks')
            .insert(blocksToInsert);

          if (blocksErr) {
            console.error(`Error saving content blocks for page ${page.page_number}:`, blocksErr);
          }
        }
      }

      // 5. Update material status to 'ready'
      const { data: updatedMaterial, error: updateErr } = await supabaseAdmin
        .from('materials')
        .update({
          processing_status: 'ready',
          total_pages: parsedPages.length,
        })
        .eq('id', materialId)
        .select()
        .single();

      if (updateErr) {
        console.error('Error updating material status:', updateErr);
      }

      return updatedMaterial || materialRecord;
    } catch (extractErr) {
      console.error('Document extraction failed:', extractErr);
      await supabaseAdmin
        .from('materials')
        .update({
          processing_status: 'failed',
          processing_error: extractErr.message,
        })
        .eq('id', materialId);

      throw extractErr;
    }
  }

  /**
   * Fetch complete material with all pages and content blocks.
   */
  static async getMaterialWithContent(materialId) {
    const { data: material, error: matErr } = await supabaseAdmin
      .from('materials')
      .select('*')
      .eq('id', materialId)
      .single();

    if (matErr || !material) {
      throw new Error(`Material not found: ${matErr?.message || materialId}`);
    }

    const { data: pages, error: pageErr } = await supabaseAdmin
      .from('document_pages')
      .select('*')
      .eq('material_id', materialId)
      .order('page_number', { ascending: true });

    if (pageErr) {
      throw new Error(`Failed to load pages: ${pageErr.message}`);
    }

    const { data: blocks, error: blockErr } = await supabaseAdmin
      .from('content_blocks')
      .select('*')
      .eq('material_id', materialId)
      .order('block_index', { ascending: true });

    if (blockErr) {
      throw new Error(`Failed to load content blocks: ${blockErr.message}`);
    }

    // Attach blocks to pages
    const pagesWithBlocks = pages.map(p => ({
      ...p,
      blocks: blocks.filter(b => b.page_id === p.id),
    }));

    return {
      ...material,
      pages: pagesWithBlocks,
    };
  }

  /**
   * List materials for a class.
   */
  static async listMaterialsByClass(classId) {
    const { data, error } = await supabaseAdmin
      .from('materials')
      .select('id, class_id, session_id, file_name, mime_type, file_size_bytes, processing_status, total_pages, created_at')
      .eq('class_id', classId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to list materials: ${error.message}`);
    }

    return data || [];
  }
}

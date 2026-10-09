/**
 * FocusAI — AI API Routes
 * Endpoints for Ollama + Gemma 4:12b Pipeline:
 * - /health: verify Ollama status & active models
 * - /concepts: automated concept extraction & important flags
 * - /summary: grounded slide summary from actual content blocks
 * - /reiterate: 3 alternative explanations (analogy, steps, real-world)
 * - /insights/:materialId: retrieve insights
 * - /cancel: abort in-flight generation
 */
import { Router } from 'express';
import { requireAuth, requireTeacher } from '../middleware/auth.js';
import { supabaseAdmin } from '../supabase.js';
import {
  checkOllamaHealth,
  extractConceptsForPage,
  generateSlideSummary,
  generateAlternativeExplanations,
  getSlideInsights,
  cancelOllamaRequest,
} from '../services/aiService.js';

export const aiRoutes = Router();

/**
 * GET /api/v1/ai/health
 * Public health check for AI engine
 */
aiRoutes.get('/health', async (req, res, next) => {
  try {
    const health = await checkOllamaHealth();
    res.json({ data: health });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/ai/concepts
 * Extract concepts and flag important blocks for a given page
 */
aiRoutes.post('/concepts', requireAuth, async (req, res, next) => {
  try {
    const { material_id, page_id } = req.body;
    if (!material_id || !page_id) {
      return res.status(400).json({ error: { message: 'material_id and page_id are required' } });
    }

    // Fetch blocks for the page
    const { data: blocks, error: bErr } = await supabaseAdmin
      .from('content_blocks')
      .select('*')
      .eq('page_id', page_id)
      .order('block_index', { ascending: true });

    if (bErr) throw bErr;
    if (!blocks || blocks.length === 0) {
      return res.status(404).json({ error: { message: 'No content blocks found for page' } });
    }

    const result = await extractConceptsForPage({
      materialId: material_id,
      pageId: page_id,
      blocks,
      requestId: req.id,
    });

    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/ai/summary
 * Generate grounded summary from actual content blocks
 */
aiRoutes.post('/summary', requireAuth, async (req, res, next) => {
  try {
    const { material_id, page_id } = req.body;
    if (!material_id || !page_id) {
      return res.status(400).json({ error: { message: 'material_id and page_id are required' } });
    }

    const { data: blocks, error: bErr } = await supabaseAdmin
      .from('content_blocks')
      .select('*')
      .eq('page_id', page_id)
      .order('block_index', { ascending: true });

    if (bErr) throw bErr;

    const summary = await generateSlideSummary({
      materialId: material_id,
      pageId: page_id,
      blocks: blocks || [],
      requestId: req.id,
    });

    res.json({ data: { summary } });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/ai/reiterate
 * Teacher triggers generation of 3 alternative explanations for confused concept
 */
aiRoutes.post('/reiterate', requireAuth, requireTeacher, async (req, res, next) => {
  try {
    const {
      session_id,
      material_id,
      content_block_id,
      concept_text,
      student_confusion_notes,
    } = req.body;

    if (!concept_text && !content_block_id) {
      return res.status(400).json({ error: { message: 'concept_text or content_block_id is required' } });
    }

    let textToExplain = concept_text || '';
    if (!textToExplain && content_block_id) {
      const { data: block } = await supabaseAdmin
        .from('content_blocks')
        .select('text')
        .eq('id', content_block_id)
        .single();
      if (block) textToExplain = block.text;
    }

    const result = await generateAlternativeExplanations({
      sessionId: session_id,
      materialId: material_id,
      contentBlockId: content_block_id,
      conceptText: textToExplain,
      studentConfusionNotes: student_confusion_notes || '',
      requestId: req.id,
    });

    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/ai/insights/:materialId
 * Retrieve stored insights for a material
 */
aiRoutes.get('/insights/:materialId', requireAuth, async (req, res, next) => {
  try {
    const { materialId } = req.params;
    const { sessionId, pageId } = req.query;

    const insights = await getSlideInsights({
      materialId,
      sessionId: sessionId || null,
      pageId: pageId || null,
    });

    res.json({ data: insights });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/ai/cancel
 * Cancel an active generation request
 */
aiRoutes.post('/cancel', requireAuth, async (req, res) => {
  const { request_id } = req.body;
  if (!request_id) {
    return res.status(400).json({ error: { message: 'request_id is required' } });
  }

  const cancelled = cancelOllamaRequest(request_id);
  res.json({ data: { cancelled } });
});

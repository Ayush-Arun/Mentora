/**
 * FocusAI — Local AI Integration Service (Ollama + Gemma 4:12b Pipeline)
 *
 * Implements:
 * 3.1: Ollama Server Proxy with timeout, cancellation & fallback
 * 3.2: Automated Concept Extraction & "Important" flags
 * 3.3: Grounded Slide Summaries from actual content blocks
 * 3.4: Teacher AI Insights Panel & Alternative Explanation Generator
 */
import { config } from '../config.js';
import { supabaseAdmin } from '../supabase.js';

const knownUnstableModels = new Set();

/**
 * 3.1: Query Ollama Server Proxy with per-attempt timeout, AbortSignal & fallback.
 */
export async function queryOllama({
  prompt,
  system = '',
  model = config.ollama.model || 'gemma4:12b',
  fallbackModel = 'llama3.2:latest',
  temperature = 0.2,
  format = undefined,
  timeoutMs = 40000,
  requestId = null,
}) {
  const attemptQuery = async (targetModel, attemptTimeout = 30000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new Error(`Ollama model ${targetModel} timed out after ${attemptTimeout}ms`));
    }, attemptTimeout);

    try {
      const url = `${config.ollama.baseUrl}/api/generate`;
      const body = {
        model: targetModel,
        prompt,
        system: system || undefined,
        stream: false,
        options: {
          temperature,
        },
      };
      if (format === 'json') {
        body.format = 'json';
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Ollama responded with ${res.status}: ${errText}`);
      }

      const data = await res.json();
      if (data.error) {
        throw new Error(`Ollama engine returned error: ${data.error}`);
      }

      return {
        text: data.response,
        modelUsed: targetModel,
        totalDurationMs: Math.round((data.total_duration || 0) / 1e6),
      };
    } finally {
      clearTimeout(timer);
    }
  };

  const primaryModel = knownUnstableModels.has(model) ? fallbackModel : model;

  try {
    return await attemptQuery(primaryModel, 20000);
  } catch (primaryErr) {
    if (primaryModel !== fallbackModel) {
      console.warn(`[AI Service] Primary model (${primaryModel}) failed: ${primaryErr.message}. Marking unstable and switching to fallback (${fallbackModel})...`);
      knownUnstableModels.add(primaryModel);
      return await attemptQuery(fallbackModel, 35000);
    }
    throw primaryErr;
  }
}

/**
 * Cancel an active Ollama generation by request ID.
 */
export function cancelOllamaRequest(requestId) {
  const controller = activeControllers.get(requestId);
  if (controller) {
    controller.abort(new Error('Cancelled by client request'));
    activeControllers.delete(requestId);
    return true;
  }
  return false;
}

/**
 * Health check & model status for Ollama.
 */
export async function checkOllamaHealth() {
  try {
    const res = await fetch(`${config.ollama.baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return { online: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    const models = data.models?.map(m => m.name) || [];
    return {
      online: true,
      configuredModel: config.ollama.model,
      availableModels: models,
      hasConfiguredModel: models.some(m => m.includes(config.ollama.model) || config.ollama.model.includes(m)),
    };
  } catch (err) {
    return {
      online: false,
      error: err.message,
    };
  }
}

/**
 * 3.2: Automated Concept Extraction & "Important" flags.
 * Analyzes page content blocks and flags key pedagogical concepts.
 */
export async function extractConceptsForPage({ materialId, pageId, blocks = [], requestId = null }) {
  if (!blocks || blocks.length === 0) return { concepts: [], flaggedBlockIds: [] };

  const formattedBlocks = blocks.map(b => `[Block ID: ${b.id}] (${b.block_type}): "${b.text}"`).join('\n\n');

  const system = `You are FocusAI's pedagogical curriculum analyzer.
Your task is to analyze content blocks from an instructional slide and extract the core concepts.
You MUST respond with valid JSON strictly adhering to this schema:
{
  "concepts": [
    {
      "name": "string (1-4 words)",
      "definition": "string (clear 1-sentence definition based on the text)",
      "importance": "high|medium|low",
      "relevant_block_id": "string (UUID from the given Block ID)"
    }
  ],
  "summary": "string (2-3 concise sentences summarizing key takeaways)",
  "recommended_check_question": {
    "question": "string",
    "options": ["string", "string", "string", "string"],
    "correct_option_index": 0,
    "rationale": "string"
  }
}
STRICT GROUNDING RULE: Never invent concepts or definitions that are not grounded in the provided slide text blocks.`;

  const prompt = `Analyze these slide content blocks and extract the key concepts:\n\n${formattedBlocks}`;

  const aiResult = await queryOllama({
    prompt,
    system,
    format: 'json',
    temperature: 0.1,
    requestId,
  });

  let parsed;
  try {
    parsed = JSON.parse(aiResult.text);
  } catch (e) {
    // If JSON parsing fails, extract JSON substring
    const match = aiResult.text.match(/\{[\s\S]*\}/);
    if (match) {
      parsed = JSON.parse(match[0]);
    } else {
      throw new Error(`Failed to parse AI concept extraction JSON: ${aiResult.text.substring(0, 100)}`);
    }
  }

  // Record insights in DB
  const flaggedBlockIds = [];
  if (parsed.concepts && Array.isArray(parsed.concepts)) {
    for (const concept of parsed.concepts) {
      // Record insight
      await supabaseAdmin.from('ai_insights').insert({
        material_id: materialId,
        content_block_id: concept.relevant_block_id || null,
        insight_type: 'important_concepts',
        content: JSON.stringify(concept),
        model_tag: aiResult.modelUsed,
        rationale: `Extracted concept: ${concept.name} (${concept.importance} importance)`,
        teacher_confirmed: false,
      });

      // If high importance, flag block in content_flags
      if (concept.importance === 'high' && concept.relevant_block_id) {
        await supabaseAdmin.from('content_flags').upsert({
          content_block_id: concept.relevant_block_id,
          session_id: null, // template flag for material
          flag_type: 'important',
          set_by: 'ai_suggestion',
          rationale: `AI identified "${concept.name}" as a core concept: ${concept.definition}`,
          confirmed_by_teacher: false,
        }, { onConflict: 'content_block_id,session_id,flag_type' });
        flaggedBlockIds.push(concept.relevant_block_id);
      }
    }
  }

  // Record slide summary insight
  if (parsed.summary) {
    await supabaseAdmin.from('ai_insights').insert({
      material_id: materialId,
      insight_type: 'slide_summary',
      content: parsed.summary,
      model_tag: aiResult.modelUsed,
      rationale: 'Automated grounded slide summary',
      teacher_confirmed: false,
    });
  }

  return {
    concepts: parsed.concepts || [],
    summary: parsed.summary || '',
    recommendedCheckQuestion: parsed.recommended_check_question || null,
    flaggedBlockIds,
    modelUsed: aiResult.modelUsed,
  };
}

/**
 * 3.3: Grounded Slide Summaries from actual content blocks.
 */
export async function generateSlideSummary({ materialId, pageId, blocks = [], requestId = null }) {
  if (!blocks || blocks.length === 0) return 'No text content available on this slide.';

  const fullText = blocks.map(b => b.text).join('\n\n');

  const system = `You are FocusAI's instructional summarizer.
Generate a concise 2-3 sentence learning summary grounded strictly in the provided slide text.
Do not introduce outside knowledge or unverified claims. Keep it accessible and direct.`;

  const prompt = `Slide text:\n${fullText}\n\nProvide the 2-3 sentence grounded summary:`;

  const aiResult = await queryOllama({
    prompt,
    system,
    temperature: 0.2,
    requestId,
  });

  const summary = aiResult.text.trim();

  // Store in ai_insights
  await supabaseAdmin.from('ai_insights').insert({
    material_id: materialId,
    insight_type: 'slide_summary',
    content: summary,
    model_tag: aiResult.modelUsed,
    rationale: 'Grounded slide summary',
    teacher_confirmed: false,
  });

  return summary;
}

/**
 * 3.4: Teacher AI Insights Panel & Alternative Explanation Generator.
 * Generates 3 pedagogical alternatives (analogy, step-by-step, concrete example).
 */
export async function generateAlternativeExplanations({
  sessionId = null,
  materialId = null,
  contentBlockId = null,
  conceptText = '',
  studentConfusionNotes = '',
  requestId = null,
}) {
  const system = `You are an expert instructional designer and teacher's AI copilot.
A student or group of students is confused by the following concept/passage from class.
Your job is to provide three distinct alternative explanations that the teacher can immediately use to clarify the concept:
1. Simpler Analogy: An intuitive, relatable everyday analogy.
2. Step-by-Step Breakdown: A numbered, bite-sized sequence explaining the logic without jargon.
3. Concrete Real-World Example: A tangible application showing why and how it happens in practice.

Respond STRICTLY in valid JSON:
{
  "analogy": "string (1-2 paragraphs)",
  "step_by_step": [
    "Step 1: ...",
    "Step 2: ...",
    "Step 3: ..."
  ],
  "concrete_example": "string (1-2 paragraphs)",
  "quick_check_question": "string (a 1-sentence question the teacher can ask to verify if students get it now)"
}`;

  const prompt = `Concept / Section Text:
"${conceptText}"

${studentConfusionNotes ? `Student Confusion Notes:\n"${studentConfusionNotes}"\n` : ''}
Generate the three alternative explanations now:`;

  const aiResult = await queryOllama({
    prompt,
    system,
    format: 'json',
    temperature: 0.3,
    requestId,
  });

  let parsed;
  try {
    parsed = JSON.parse(aiResult.text);
  } catch (e) {
    const match = aiResult.text.match(/\{[\s\S]*\}/);
    if (match) {
      parsed = JSON.parse(match[0]);
    } else {
      parsed = {
        analogy: aiResult.text,
        step_by_step: ['Review the core fundamentals.'],
        concrete_example: 'Consider standard textbook applications.',
        quick_check_question: 'Does this distinction make sense now?',
      };
    }
  }

  // Record proposal in reiteration_events if sessionId & contentBlockId are given
  let reiterationEvent = null;
  if (sessionId && contentBlockId) {
    const { data: event, error } = await supabaseAdmin.from('reiteration_events').insert({
      session_id: sessionId,
      content_block_id: contentBlockId,
      triggered_by: studentConfusionNotes ? 'threshold' : 'teacher_manual',
      status: 'proposed',
      ai_explanation: JSON.stringify(parsed),
      affected_count: 1,
      eligible_count: 1,
    }).select().single();

    if (!error) reiterationEvent = event;
  }

  // Record insight
  await supabaseAdmin.from('ai_insights').insert({
    session_id: sessionId,
    material_id: materialId,
    content_block_id: contentBlockId,
    insight_type: 'reiteration',
    content: JSON.stringify(parsed),
    model_tag: aiResult.modelUsed,
    rationale: 'Generated 3 alternative explanations for student confusion',
    teacher_confirmed: false,
  });

  return {
    alternatives: parsed,
    reiterationEvent,
    modelUsed: aiResult.modelUsed,
  };
}

/**
 * Fetch all AI insights for a specific slide / page.
 */
export async function getSlideInsights({ materialId, pageId = null, sessionId = null }) {
  let query = supabaseAdmin
    .from('ai_insights')
    .select('*')
    .order('created_at', { ascending: false });

  if (materialId) query = query.eq('material_id', materialId);
  if (sessionId) query = query.eq('session_id', sessionId);

  const { data, error } = await query.limit(20);
  if (error) throw error;
  return data || [];
}

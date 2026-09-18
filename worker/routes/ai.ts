/**
 * @file ai.ts
 * @description `/api/ai` — Workers AI coaching feedback for a stored pass.
 *
 * Inference runs on Cloudflare Workers AI through the `AI` binding, so there is no
 * third-party API key to manage and trainee data never leaves Cloudflare. Results are
 * cached in D1 per pass/focus/prompt version so repeat views cost nothing.
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { AiFeedback, AiFeedbackFocus, AiFeedbackResponse } from '../../shared/api';
import type { AppEnv } from '../env';
import { errorBody, parseJson } from '../lib/http';
import { passColumns, rowToPassRecord, type PassRow } from '../lib/passRecord';
import { jsonValidator } from '../lib/validate';
import type { JsonBody } from '../lib/validate';
import { canAccessUser, requireAuth } from '../middleware/auth';
import { aiFeedbackPayloadSchema, aiFeedbackSchema } from '../schemas';

/**
 * Any Workers AI text-generation model that supports JSON mode works here; override
 * with the `AI_MODEL` var.
 * See https://developers.cloudflare.com/workers-ai/features/json-mode/
 */
const DEFAULT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

/** Bumping this invalidates every cached feedback row. */
const PROMPT_VERSION = 'v2';

const MAX_OUTPUT_TOKENS = 1024;

/** JSON Schema the model is forced to satisfy; mirrors `aiFeedbackPayloadSchema`. */
const FEEDBACK_JSON_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    strengths: { type: 'array', items: { type: 'string' } },
    improvements: { type: 'array', items: { type: 'string' } },
    drills: { type: 'array', items: { type: 'string' } },
    safetyNotes: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'strengths', 'improvements', 'drills', 'safetyNotes'],
} as const;

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

const FOCUS_BRIEF: Record<AiFeedbackFocus, string> = {
  parameters: 'voltage, current, wire feed speed and CTWD relative to the material and joint',
  technique: 'travel speed consistency, push/drag travel angle, work angle and arc length control',
  both: 'parameters and technique equally, and how they interact',
};

/**
 * The prompt carries only objective measurements — never the student's name — so
 * stored feedback and upstream logs cannot leak trainee PII.
 */
function buildMessages(row: PassRow, focus: AiFeedbackFocus): ChatMessage[] {
  const pass = rowToPassRecord(row);
  const defects = pass.result.defects.map((defect) => ({
    name: defect.name,
    category: defect.category,
    severity: defect.severity,
  }));

  const brief = {
    focus,
    parameters: pass.parameters,
    measured: {
      durationSeconds: pass.durationSeconds,
      arcLength_mm: pass.totalLength_mm,
      sampleCount: pass.sampleCount,
      overallScore: pass.result.overallScore,
      parameterScore: pass.result.attribution.parameterScore,
      techniqueScore: pass.result.attribution.techniqueScore,
      primaryIssue: pass.result.attribution.primaryIssue,
      heatInput_kJ_per_mm: pass.result.heatInput_kJ_per_mm,
      meanBeadWidth_mm: pass.result.meanBeadWidth_mm,
      meanPenetration_mm: pass.result.meanPenetration_mm,
      transferMode: pass.result.transferMode,
      subScores: pass.result.subScores,
    },
    detectedDefects: defects,
    simulatorSummary: pass.result.attribution.summary,
  };

  return [
    {
      role: 'system',
      content: [
        'You are a GMAW/MIG welding instructor reviewing one practice pass from a training simulator.',
        `Focus your coaching on ${FOCUS_BRIEF[focus]}.`,
        'The data below is machine-measured; the operator is an apprentice, so be concrete and instructional.',
        'Answer as JSON matching the supplied schema.',
        'Keep every array to at most four short, actionable items.',
      ].join('\n'),
    },
    { role: 'user', content: `Pass data:\n${JSON.stringify(brief, null, 2)}` },
  ];
}

/** Models sometimes wrap JSON in a fenced block even in JSON mode. */
function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
  const candidate = fenced ? fenced[1] : trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return parseJson<unknown>(candidate.slice(start, end + 1), null);
}

/** JSON mode returns `{ response: <object | json string> }`; unwrap either shape. */
function unwrapOutput(output: unknown): unknown {
  if (typeof output === 'string') return extractJson(output);
  if (!output || typeof output !== 'object') return null;

  const generated = (output as Record<string, unknown>).response;
  if (typeof generated === 'string') return extractJson(generated);
  if (generated && typeof generated === 'object') return generated;
  return output;
}

async function requestFeedback(
  ai: Ai,
  model: string,
  messages: ChatMessage[],
): Promise<AiFeedback | null> {
  let output: unknown;
  try {
    output = await ai.run(model, {
      messages,
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0.2,
      response_format: { type: 'json_schema', json_schema: FEEDBACK_JSON_SCHEMA },
    });
  } catch (error) {
    // Workers AI throws when the model cannot satisfy the requested schema.
    console.error('Workers AI request failed:', error instanceof Error ? error.message : error);
    return null;
  }

  const parsed = aiFeedbackPayloadSchema.safeParse(unwrapOutput(output));
  return parsed.success ? parsed.data : null;
}

const requestAiFeedback = async (c: Context<AppEnv, '/', JsonBody<typeof aiFeedbackSchema>>) => {
  const user = c.get('user');
  const { passId, focus } = c.req.valid('json');

  const row = await c.env.DB.prepare(
    `SELECT ${passColumns('p')} FROM passes p WHERE p.id = ?`,
  )
    .bind(passId)
    .first<PassRow>();

  if (!row) {
    return c.json(errorBody('not_found', 'Pass not found'), 404);
  }
  if (!canAccessUser(user, row.user_id)) {
    return c.json(errorBody('forbidden', 'This pass belongs to another account'), 403);
  }

  const model = c.env.AI_MODEL || DEFAULT_MODEL;

  const cached = await c.env.DB.prepare(
    `SELECT payload_json, model, created_at
       FROM ai_feedback
      WHERE pass_id = ? AND focus = ? AND prompt_version = ?`,
  )
    .bind(passId, focus, PROMPT_VERSION)
    .first<{ payload_json: string; model: string; created_at: number }>();

  if (cached && cached.model === model) {
    const feedback = aiFeedbackPayloadSchema.safeParse(parseJson<unknown>(cached.payload_json, null));
    if (feedback.success) {
      return c.json<AiFeedbackResponse>(
        { feedback: feedback.data, model, cached: true, generatedAt: cached.created_at },
        200,
      );
    }
  }

  const binding = c.env.AI;
  if (!binding) {
    return c.json(
      errorBody('ai_unavailable', 'AI feedback is not configured on this deployment'),
      503,
    );
  }

  const feedback = await requestFeedback(binding, model, buildMessages(row, focus));
  if (!feedback) {
    return c.json(errorBody('upstream_error', 'The AI coach did not return usable feedback'), 502);
  }

  const generatedAt = Date.now();
  await c.env.DB.prepare(
    `INSERT OR REPLACE INTO ai_feedback
       (id, pass_id, focus, model, prompt_version, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      passId,
      focus,
      model,
      PROMPT_VERSION,
      JSON.stringify(feedback),
      generatedAt,
    )
    .run();

  return c.json<AiFeedbackResponse>({ feedback, model, cached: false, generatedAt }, 200);
};

const ai = new Hono<AppEnv>()
  .post('/', requireAuth, jsonValidator(aiFeedbackSchema), requestAiFeedback);

export default ai;

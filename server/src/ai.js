/**
 * ai.js - Shared OpenAI API helper for the SAA Alumni Management System.
 *
 * Used by the endpoints under /api/ai (chat support, content generation,
 * Gmail auto-reply, survey summaries, dashboard insights).
 *
 * Configuration (see server/.env.example):
 *   OPENAI_API_KEY      - when absent the system uses its built-in fallback engine
 *   OPENAI_MODEL        - defaults to gpt-4o-mini
 *   OPENAI_TIMEOUT_MS   - request timeout, defaults to 20000
 *
 * Credentials are read from the environment only and are never sent to the
 * frontend (per the manuscript's cybersecurity requirement).
 */

const API_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';

/** Institutional context supplied to the model so answers stay on-topic. */
export const SCHOOL_CONTEXT = [
  'You are the official AI Assistant of the Alumni Management System of',
  'St. Agnes Academy of Caloocan Inc., a Philippine educational institution',
  '(motto: "Caritas et Scientia").',
  '',
  'The system provides these alumni services to three roles',
  '(Administrator, Registrar, Alumni):',
  '- Alumni Database (centralized alumni records)',
  '- Transcript Request Portal and Certificate Reprint Requests',
  '- Graduate Tracking / Tracer Study (employment and education updates)',
  '- Job Placement Logs and Career Opportunities',
  '- Alumni Event Registration and Batch Reunions',
  '- Donor Campaigns',
  '- Alumni Newsletter',
  '- Alumni Feedback and Surveys',
  '- Automated SMS notifications and Gmail communication',
  '',
  'Answer professionally, courteously and concisely. Prefer short paragraphs',
  'or bullet points. If a request needs a human decision (for example releasing',
  'an official document), direct the user to the Registrar or Administrator.',
  'Never invent school policies, fees, dates or personal data.'
].join('\n');

export function isAiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function aiModel() {
  return process.env.OPENAI_MODEL || DEFAULT_MODEL;
}

/** Human-readable label describing which engine produced a result. */
export function aiProvider(source) {
  return isAiConfigured()
    ? `OpenAI API (${aiModel()})${source ? ` - ${source}` : ''}`
    : `Built-in AI fallback${source ? ` - ${source}` : ''} (set OPENAI_API_KEY to use OpenAI)`;
}

/**
 * Sends a chat-completion request to the OpenAI API.
 * Returns the assistant's text, or null when unconfigured or the call fails
 * (callers then use their own built-in fallback).
 */
export async function chat(messages, { maxTokens = 300, temperature = 0.7 } = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const timeoutMs = Number(process.env.OPENAI_TIMEOUT_MS) || 20000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: aiModel(),
        messages,
        max_tokens: maxTokens,
        temperature
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.warn(`[ai] OpenAI HTTP ${response.status}: ${detail.slice(0, 200)}`);
      return null;
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    return content && content.trim() ? content.trim() : null;
  } catch (err) {
    const reason = err.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : err.message;
    console.warn(`[ai] OpenAI call failed (${reason}) - using built-in fallback.`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Convenience: single-turn prompt with the institutional system context. */
export function ask(prompt, extraSystem = '', options = {}) {
  const system = extraSystem ? `${SCHOOL_CONTEXT}\n\n${extraSystem}` : SCHOOL_CONTEXT;
  return chat(
    [
      { role: 'system', content: system },
      { role: 'user', content: prompt }
    ],
    options
  );
}
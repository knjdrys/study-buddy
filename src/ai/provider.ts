/**
 * Optional LLM provider. StudyBuddy works fully without it; when the learner
 * brings their own API key, this module upgrades tutor feedback and content
 * drafting. Keys live only in local storage on the learner's device and are
 * sent exclusively to the provider they chose.
 */

import type { Settings } from '../domain/types';

export function isConfigured(settings: Settings): boolean {
  return settings.ai.provider !== 'none' && settings.ai.apiKey.trim().length > 0;
}

export function defaultModelFor(provider: Settings['ai']['provider']): string {
  if (provider === 'openai') return 'gpt-4o-mini';
  if (provider === 'gemini') return 'gemini-1.5-flash';
  return '';
}

export async function callLLM(
  settings: Settings,
  system: string,
  user: string,
  opts: { json?: boolean; maxTokens?: number } = {},
): Promise<string> {
  const { provider, apiKey, model } = settings.ai;
  const effectiveModel = model || defaultModelFor(provider);
  const maxTokens = opts.maxTokens ?? 700;

  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: effectiveModel,
        temperature: 0.5,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
    if (!res.ok) {
      throw new Error(`OpenAI request failed (${res.status})`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content ?? '';
  }

  // Gemini
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(effectiveModel)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: maxTokens,
          ...(opts.json ? { responseMimeType: 'application/json' } : {}),
        },
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`Gemini request failed (${res.status})`);
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
}

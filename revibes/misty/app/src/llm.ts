import type { LlmMode } from './types'

// --- fixtures (cached golden path) -----------------------------------------
export interface Fixture {
  key: string
  op: string
  meta: Record<string, unknown>
  response: string
  recordedAt?: string
  model?: string
}

const fixtureModules = import.meta.glob('./fixtures/*.json', { eager: true }) as Record<string, { default: Fixture }>
export const FIXTURES: Fixture[] = Object.values(fixtureModules).map((m) => m.default)

export async function sha(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
}

export function normalizeText(t: string): string {
  return t.replace(/\s+/g, ' ').trim().toLowerCase()
}

// --- the call ---------------------------------------------------------------
export interface LlmRequest {
  op: 'global' | 'dnd' | 'toggle' | 'fix'
  prompt: string
  images?: string[] // data URLs
  // semantic description of the request, used to key fixtures
  meta: Record<string, unknown>
}

export interface LlmReply {
  text: string
  source: 'live' | 'cached' | 'cached-approximate'
  fixtureKey: string
}

export interface LlmSettings {
  mode: LlmMode
  record: boolean
}

export const settings: LlmSettings = { mode: 'cached', record: false }

export async function fixtureKeyFor(req: LlmRequest): Promise<string> {
  const stable = JSON.stringify(req.meta, Object.keys(req.meta).sort())
  return `${req.op}-${await sha(stable)}`
}

function findApproximate(req: LlmRequest): Fixture | null {
  const same = FIXTURES.filter((f) => f.op === req.op)
  const m = req.meta
  const score = (f: Fixture) => {
    let s = 0
    if (f.meta.exampleId === m.exampleId) s += 4
    if (JSON.stringify(f.meta.aspects) === JSON.stringify(m.aspects)) s += 3
    if (f.meta.sourceHash === m.sourceHash) s += 2
    if (f.meta.targetHash === m.targetHash) s += 1
    if (JSON.stringify(f.meta.enabled) === JSON.stringify(m.enabled)) s += 1
    return s
  }
  const ranked = same.map((f) => ({ f, s: score(f) })).sort((a, b) => b.s - a.s)
  if (!ranked.length) return null
  // require at least the example (for blends) to match
  if ((req.op === 'global' || req.op === 'dnd') && ranked[0].f.meta.exampleId !== m.exampleId) return null
  return ranked[0].f
}

export async function bridgeHealth(): Promise<{ ok: boolean; backend?: string; model?: string; text?: string }> {
  try {
    const r = await fetch('/llm/health')
    if (!r.ok) return { ok: false, text: `HTTP ${r.status}` }
    const j = await r.json()
    return { ok: true, backend: j.backend, model: j.model, text: JSON.stringify(j) }
  } catch (e) {
    return { ok: false, text: String(e) }
  }
}

export class NoFixtureError extends Error {}

export async function callLlm(req: LlmRequest): Promise<LlmReply> {
  const key = await fixtureKeyFor(req)
  if (settings.mode === 'cached') {
    const exact = FIXTURES.find((f) => f.key === key)
    if (exact) return { text: exact.response, source: 'cached', fixtureKey: key }
    const approx = findApproximate(req)
    if (approx) return { text: approx.response, source: 'cached-approximate', fixtureKey: approx.key }
    throw new NoFixtureError('No cached response for this action. Follow the golden path steps, or switch to Live mode.')
  }

  const content: unknown[] = [{ type: 'text', text: req.prompt }]
  for (const img of req.images ?? []) content.push({ type: 'image_url', image_url: { url: img } })
  const body = {
    model: 'gpt-4o',
    messages: [{ role: 'user', content }],
    response_format: { type: 'json_object' },
  }
  const r = await fetch('/llm/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`LLM bridge error: HTTP ${r.status} ${await r.text()}`)
  const j = await r.json()
  const text: string = j.choices?.[0]?.message?.content ?? ''
  if (settings.record) {
    const fx: Fixture = { key, op: req.op, meta: req.meta, response: text, recordedAt: new Date().toISOString(), model: j.model }
    fetch('/__fixtures', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fx) }).catch(() => {})
  }
  return { text, source: 'live', fixtureKey: key }
}

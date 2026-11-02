// Heuristic repair of malformed React syntax, as the paper describes
// ("heuristic rules implemented using regular expressions").
export function repairCode(raw: string): string {
  let code = raw.trim()
  // strip code fences
  code = code.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim()
  // drop import / export statements: react-live scope provides everything
  code = code.replace(/^\s*import[^\n]*\n/gm, '')
  code = code.replace(/^\s*export\s+default\s+/gm, '')
  code = code.replace(/^\s*export\s+/gm, '')
  // "const App = () => {...}" -> expression
  const m = code.match(/^\s*(?:const|let|var)\s+\w+\s*=\s*([\s\S]*)$/)
  if (m) code = m[1].trim().replace(/;\s*$/, '')
  // "function App() {...}" -> arrow
  code = code.replace(/^\s*function\s+\w*\s*\(\s*\)\s*\{/, '() => {')
  // trailing render calls
  code = code.replace(/\n?\s*render\s*\([\s\S]*$/, '')
  code = code.replace(/\n?\s*ReactDOM\.render[\s\S]*$/, '')
  // class -> className
  code = code.replace(/(\s)class=/g, '$1className=')
  // self-close void elements
  code = code.replace(/<(img|input|br|hr)(\s[^>]*?)?(?<!\/)>/g, (_s, tag, attrs) => `<${tag}${attrs || ''} />`)
  // style="..." strings -> remove (invalid in JSX); Tailwind should be used instead
  code = code.replace(/\sstyle="[^"]*"/g, '')
  // HTML comments
  code = code.replace(/<!--[\s\S]*?-->/g, '')
  // common attribute names
  code = code.replace(/\sfor=/g, ' htmlFor=').replace(/\stabindex=/g, ' tabIndex=').replace(/\sstroke-width=/g, ' strokeWidth=')
  // remove balanced trailing semicolon
  code = code.replace(/;\s*$/, '')
  // if it does not start with an arrow function but is bare JSX, wrap it
  if (/^\s*</.test(code)) code = `() => (\n${code}\n)`
  return code
}

export function extractCodeFromParse(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') return null
  const o = obj as Record<string, unknown>
  const c = o.updatedCode ?? o.code ?? o.updated_code
  return typeof c === 'string' ? c : null
}

// Parse the model's JSON answer; tolerate fences and the backtick-wrapped code
// the paper's prompt format shows.
export function parseJsonLoose(text: string): Record<string, unknown> {
  let t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  try {
    return JSON.parse(t)
  } catch {
    /* fall through */
  }
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start >= 0 && end > start) {
    t = t.slice(start, end + 1)
    try {
      return JSON.parse(t)
    } catch {
      /* fall through */
    }
  }
  // last resort: pull updatedCode out of backticks and categorizedChanges by regex
  const code = t.match(/updatedCode"?\s*:\s*`([\s\S]*?)`\s*[,}]/)
  if (code) {
    const rest = t.replace(code[0], 'updatedCode: "",')
    let cats: unknown = []
    try {
      cats = JSON.parse(rest.slice(rest.indexOf('{'), rest.lastIndexOf('}') + 1)).categorizedChanges ?? []
    } catch {
      /* ignore */
    }
    return { updatedCode: code[1], categorizedChanges: cats }
  }
  throw new Error('Could not parse the model response as JSON')
}

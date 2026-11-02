export type Aspect = 'Color' | 'Layout' | 'Content' | string

export interface Change {
  type: string
  before: string
  after: string
}

export interface ChangeCategory {
  category: string
  changes: Change[]
  enabled: boolean
}

export interface BlendResult {
  designExplanation?: string
  differences?: string
  updatedCode: string
  categorizedChanges: { category: string; changes: Change[] }[]
}

export interface Crop {
  x: number // fractions of the image, 0..1
  y: number
  w: number
  h: number
}

export interface ExampleData {
  kind: 'example'
  exampleId: string // stable id: sample name or hash of the upload
  label: string
  src: string // data URL or /examples/... path
  crop: Crop | null // confirmed selection
  [key: string]: unknown
}

export type Origin =
  | { op: 'global'; exampleNodeId: string; sourceNodeId: string }
  | {
      op: 'dnd'
      exampleNodeId: string
      sourceNodeId: string
      aspects: Aspect[]
      crop: Crop | null
      targetHtml: string
      targetText: string
    }

export interface SourceData {
  kind: 'source'
  label: string
  code: string // code currently rendered (after toggles / edits)
  baseCode: string // code as produced by the blend, all toggles on
  originalCode: string // code of the parent source before the blend
  changes: ChangeCategory[]
  origin: Origin | null
  status: 'idle' | 'pending' | 'error'
  statusText?: string
  explanation?: string
  showChanges: boolean
  renderError?: string | null
  replay?: string
  [key: string]: unknown
}

export type LlmMode = 'cached' | 'live'

import { createContext, useContext } from 'react'
import type { Aspect, Crop } from './types'

export interface DropPayload {
  exampleNodeId: string
  sourceNodeId: string
  crop: Crop | null
  targetHtml: string
  targetText: string
}

export interface MistyActions {
  openBlendDialog: (p: DropPayload) => void
  runGlobalBlend: (exampleNodeId: string, sourceNodeId: string) => void
  runDndBlend: (p: DropPayload, aspects: Aspect[], customAspect?: string) => void
  regenerate: (nodeId: string) => void
  fixRender: (nodeId: string, error: string) => void
  toggleCategory: (nodeId: string, index: number) => void
  resetAll: (nodeId: string) => void
  setShowChanges: (nodeId: string, show: boolean) => void
  openEditor: (nodeId: string) => void
  updateCode: (nodeId: string, code: string) => void
  setCrop: (nodeId: string, crop: Crop | null) => void
  deleteNode: (nodeId: string) => void
  reportRenderError: (nodeId: string, error: string | null) => void
  dismissError: (nodeId: string) => void
}

export const MistyContext = createContext<MistyActions | null>(null)
export const useMisty = () => {
  const c = useContext(MistyContext)
  if (!c) throw new Error('MistyContext missing')
  return c
}

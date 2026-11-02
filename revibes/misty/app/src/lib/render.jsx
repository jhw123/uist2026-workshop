import React, { Component, useEffect, useMemo, useState } from 'react';
import * as Lucide from 'lucide-react';
import { generateElement } from 'react-live';
import { repairCode } from './repair.js';

// Scope available to rendered source code: React, its hooks, and lucide icons.
// Icon names that would shadow JS globals (Map, Image, Set, ...) are left out.
const iconScope = {};
for (const [k, v] of Object.entries(Lucide)) {
  if (/^[A-Z]/.test(k) && !(k in globalThis) && (typeof v === 'object' || typeof v === 'function')) iconScope[k] = v;
}
export const SCOPE = {
  React,
  ...iconScope,
  useState: React.useState,
  useEffect: React.useEffect,
  useRef: React.useRef,
  useMemo: React.useMemo,
  useCallback: React.useCallback,
  Fragment: React.Fragment,
};

export function compile(code) {
  let error = null;
  try {
    const El = generateElement({ code: repairCode(code), scope: SCOPE, enableTypeScript: true }, (e) => { error = e; });
    return { El, error: null };
  } catch (e) {
    return { El: null, error: e };
  }
}

class Boundary extends Component {
  state = { err: null };
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { this.props.onError?.(err); }
  render() {
    if (this.state.err) return <RenderError error={this.state.err} />;
    return this.props.children;
  }
}

export function RenderError({ error }) {
  return (
    <div className="m-3 rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-700 font-mono whitespace-pre-wrap">
      <div className="font-sans font-semibold mb-1">This code does not render.</div>
      {String(error?.message || error)}
      <div className="font-sans mt-2 text-red-600">Try “Fix Render”, “Regenerate”, or edit the code.</div>
    </div>
  );
}

// Renders a source node's code. `onError` receives compile/runtime errors.
export function CodePreview({ code, onError }) {
  const { El, error } = useMemo(() => compile(code), [code]);
  const [runtime, setRuntime] = useState({ code: null, err: null });
  const runtimeErr = runtime.code === code ? runtime.err : null;
  const reported = error || runtimeErr || null;
  useEffect(() => { onError?.(reported); }, [reported, onError]);
  if (error) return <RenderError error={error} />;
  return (
    <Boundary key={code} onError={(err) => setRuntime({ code, err })}>
      {El ? <El /> : null}
    </Boundary>
  );
}

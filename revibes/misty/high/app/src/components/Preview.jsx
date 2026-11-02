import React, { useContext, useEffect, useRef, useState } from "react";
import { LiveProvider, LivePreview, LiveContext } from "react-live";
import { ICON_SCOPE } from "../lib/icons.js";

export const SCOPE = {
  React,
  Fragment: React.Fragment,
  useState: React.useState,
  useEffect: React.useEffect,
  useRef: React.useRef,
  useMemo: React.useMemo,
  useCallback: React.useCallback,
  useReducer: React.useReducer,
  ...ICON_SCOPE,
};

export const FRAME_W = 375;
export const FRAME_H = 720;

function ErrorReporter({ onError }) {
  const { error } = useContext(LiveContext);
  useEffect(() => {
    onError?.(error || null);
  }, [error, onError]);
  if (!error) return null;
  return (
    <div className="absolute left-2 right-2 top-2 z-30 max-h-48 overflow-auto rounded-md bg-red-50 border border-red-300 p-2 text-[11px] font-mono text-red-700 whitespace-pre-wrap shadow">
      <div className="font-sans font-semibold text-xs mb-1">Render error: press Fix Render</div>
      {String(error)}
    </div>
  );
}

// Walk up from the element under the pointer to a block-level section worth blending into.
function pickTarget(el, content) {
  if (!el || !content || !content.contains(el) || el === content) return null;
  let cur = el;
  const frameArea = FRAME_W * FRAME_H;
  while (cur && cur !== content) {
    if (cur instanceof HTMLElement) {
      const w = cur.offsetWidth;
      const h = cur.offsetHeight;
      if (w * h >= 0.035 * frameArea || (w >= 0.8 * FRAME_W && h >= 36)) break;
    }
    cur = cur.parentElement;
  }
  if (!cur || cur === content || cur.classList?.contains("misty-live")) {
    // the component's root element: the whole screen
    return content.firstElementChild?.firstElementChild || content.firstElementChild || null;
  }
  return cur;
}

function describe(el) {
  if (!el) return "";
  const txt = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
  return `${el.tagName.toLowerCase()}${txt ? ` · “${txt.slice(0, 40)}${txt.length > 40 ? "…" : ""}”` : ""}`;
}

export function targetHtml(el) {
  if (!el) return "";
  const clone = el.cloneNode(true);
  clone.querySelectorAll("svg").forEach((s) => {
    const cls = s.getAttribute("class") || "";
    const name = (cls.match(/lucide-([a-z0-9-]+)/) || [])[1];
    const repl = document.createElement("icon");
    if (name) repl.setAttribute("name", name);
    s.replaceWith(repl);
  });
  let html = clone.outerHTML;
  if (html.length > 5000) html = html.slice(0, 5000) + "<!-- … truncated -->";
  return html;
}

/**
 * Renders source code in a phone-sized frame. While an example region is dragged over it,
 * highlights the section it would blend into (and similar sibling elements).
 */
export default function Preview({ code, onError, dragActive, onDropTarget, dimmed }) {
  const outerRef = useRef(null);
  const contentRef = useRef(null);
  const [hl, setHl] = useState(null); // {main: rect, similar: [rect], label}
  const targetRef = useRef(null);

  const rectOf = (el) => {
    const outer = outerRef.current;
    const or = outer.getBoundingClientRect();
    const scale = or.width / outer.offsetWidth || 1;
    const r = el.getBoundingClientRect();
    return {
      left: (r.left - or.left) / scale,
      top: (r.top - or.top) / scale,
      width: r.width / scale,
      height: r.height / scale,
    };
  };

  const update = (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const t = pickTarget(el, contentRef.current);
    targetRef.current = t;
    if (!t) return setHl(null);
    const similar = [];
    const p = t.parentElement;
    if (p && contentRef.current.contains(p)) {
      for (const sib of p.children) {
        if (sib !== t && sib.tagName === t.tagName && sib.className === t.className) similar.push(rectOf(sib));
      }
    }
    setHl({ main: rectOf(t), similar, label: describe(t) });
  };

  return (
    <div
      ref={outerRef}
      className="misty-frame relative bg-white overflow-hidden rounded-[22px] ring-1 ring-black/10 shadow-inner"
      style={{ width: FRAME_W, height: FRAME_H, transform: "translateZ(0)" }}
      onDragOver={(e) => {
        if (!dragActive) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        update(e);
      }}
      onDragLeave={(e) => {
        if (!outerRef.current.contains(e.relatedTarget)) {
          setHl(null);
          targetRef.current = null;
        }
      }}
      onDrop={(e) => {
        if (!dragActive) return;
        e.preventDefault();
        e.stopPropagation();
        const t = targetRef.current;
        const info = { html: targetHtml(t), label: describe(t) };
        setHl(null);
        targetRef.current = null;
        onDropTarget?.(info);
      }}
    >
      <div ref={contentRef} className="misty-scroll nodrag nowheel nopan h-full w-full overflow-y-auto overflow-x-hidden">
        <LiveProvider code={code} scope={SCOPE} enableTypeScript={false}>
          <LivePreview className="misty-live min-h-full" />
          <ErrorReporter onError={onError} />
        </LiveProvider>
      </div>
      {dimmed && <div className="absolute inset-0 z-20 bg-white/60 backdrop-blur-[1px]" />}
      {hl && (
        <div className="pointer-events-none absolute inset-0 z-40">
          {hl.similar.map((r, i) => (
            <div key={i} className="misty-hl-similar absolute rounded-md" style={r} />
          ))}
          <div className="misty-hl absolute rounded-md" style={hl.main} />
          <div
            className="absolute rounded bg-violet-700 px-1.5 py-0.5 text-[10px] font-medium text-white shadow"
            style={{ left: Math.max(4, hl.main.left), top: Math.max(4, hl.main.top - 20) }}
          >
            Blend into {hl.label}
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Loader2, X } from 'lucide-react';
import { TOURS, latestError } from '../lib/tours.js';

const PAD = 6;
const CARD_MARGIN = 20;

const padded = ({ left, top, width, height }) => ({
  left: left - PAD,
  top: top - PAD,
  width: width + PAD * 2,
  height: height + PAD * 2,
});

const intersects = (a, b) =>
  a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;

// Keep the card in a corner that doesn't cover what it is pointing at.
function placeCard(card, rects) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const { width, height } = card;
  const corners = [
    { left: W - width - CARD_MARGIN, top: H - height - CARD_MARGIN },
    { left: W - width - CARD_MARGIN, top: CARD_MARGIN },
    { left: CARD_MARGIN, top: H - height - 56 },
    { left: CARD_MARGIN, top: 76 },
  ];
  const score = (corner) => {
    const box = { ...corner, width, height };
    return rects.filter((r) => intersects(box, r)).length;
  };
  return corners.reduce((best, corner) => (score(corner) < score(best) ? corner : best), corners[0]);
}

function arrowPath(from, to) {
  // Run between the facing edges, so the line doesn't cross what it points at.
  const rightward = to.left + to.width / 2 >= from.left + from.width / 2;
  const a = { x: rightward ? from.left + from.width : from.left, y: from.top + from.height / 2 };
  const b = { x: rightward ? to.left : to.left + to.width, y: to.top + to.height / 2 };
  const lift = Math.min(90, Math.abs(b.x - a.x) * 0.2 + 30);
  return `M ${a.x} ${a.y} Q ${(a.x + b.x) / 2} ${Math.min(a.y, b.y) - lift} ${b.x} ${b.y}`;
}

function Picker({ completed, bridgeDown, onStart, onClose }) {
  return (
    <div className="m-demo-scrim" onClick={onClose}>
      <section className="m-demo-picker" role="dialog" aria-label="Guided demo" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <h2>Guided demo</h2>
            <p>Try Misty one idea at a time. Each demo points to what to do, then moves on when you’ve done it.</p>
          </div>
          <button className="m-demo-icon" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <ol>
          {TOURS.map((tour) => (
            <li key={tour.id}>
              <button onClick={() => onStart(tour)}>
                <span className="m-demo-mark">{completed[tour.id] ? <Check size={15} /> : null}</span>
                <span className="m-demo-text">
                  <strong>{tour.title}</strong>
                  <small>{tour.summary}</small>
                </span>
                <span className="m-demo-meta">
                  <em>{tour.source}</em>
                  {tour.meta}
                </span>
              </button>
            </li>
          ))}
        </ol>
        <footer className={bridgeDown ? 'is-alert' : ''}>
          {bridgeDown
            ? 'The LLM bridge isn’t reachable, so demos that blend will fail until it runs.'
            : 'Each demo resets the canvas. A blend takes 15 to 35 seconds and uses your plan.'}
        </footer>
      </section>
    </div>
  );
}

export default function DemoTour({ open, bridgeDown, ctx, onClose }) {
  const [tour, setTour] = useState(null);
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const [completed, setCompleted] = useState({});
  const [view, setView] = useState({ targets: [], missing: false, error: null, card: null });
  const cardRef = useRef(null);
  const armed = useRef(false);
  const advancing = useRef(false);
  const pointerDown = useRef(false);

  const step = tour && !finished ? tour.steps[index] : null;

  const start = useCallback(
    async (next) => {
      setTour(null);
      setFinished(false);
      setIndex(0);
      await ctx.loadScene(next.scene);
      // Let the canvas settle, so leftovers from the old scene can't satisfy the first step.
      await new Promise((resolve) => setTimeout(resolve, 400));
      setTour(next);
    },
    [ctx]
  );

  const stop = useCallback(() => {
    setTour(null);
    setFinished(false);
    onClose();
  }, [onClose]);

  const forward = useCallback(() => {
    setIndex((i) => {
      if (i + 1 >= tour.steps.length) {
        setFinished(true);
        setCompleted((c) => ({ ...c, [tour.id]: true }));
        return i;
      }
      return i + 1;
    });
  }, [tour]);

  // Hold back auto-advance until the pointer lifts, so a step doesn't change mid-drag.
  useEffect(() => {
    const down = () => (pointerDown.current = true);
    const up = () => (pointerDown.current = false);
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up, true);
    };
  }, []);

  useEffect(() => {
    if (!step) return undefined;
    advancing.current = false;
    // If a step is already satisfied on arrival (after Back), wait until it is undone.
    // A waiting step always moves on, even if the blend failed before it was reached.
    armed.current = step.waiting || !step.done?.();
    step.onEnter?.(ctx);
    let timer;

    const tick = () => {
      const targets = (step.targets?.() ?? []).filter(Boolean).map((t) => ({ style: t.style, rect: padded(t.rect) }));
      // A target can vanish because the step was just done, which isn't a problem.
      const missing = Boolean(step.targets) && targets.length === 0 && !step.done?.();
      const dialog = document.querySelector('.m-dialog')?.getBoundingClientRect();
      const box = cardRef.current?.getBoundingClientRect();
      const avoid = targets.map((t) => t.rect);
      if (dialog) avoid.push(dialog);
      const card = box ? placeCard(box, avoid) : null;
      const next = { targets, missing, error: latestError(), card };
      setView((previous) => (JSON.stringify(previous) === JSON.stringify(next) ? previous : next));

      if (!step.done) return;
      const done = Boolean(step.done());
      if (!done) armed.current = true;
      if (done && armed.current && !advancing.current && !pointerDown.current) {
        advancing.current = true;
        timer = setTimeout(forward, step.waiting ? 150 : 450);
      }
    };

    tick();
    const interval = setInterval(tick, 100);
    return () => {
      clearInterval(interval);
      clearTimeout(timer);
    };
  }, [step, ctx, forward]);

  if (!open) return null;

  if (!tour) {
    return <Picker completed={completed} bridgeDown={bridgeDown} onStart={start} onClose={stop} />;
  }

  const total = tour.steps.length;
  const position = finished ? total : index + 1;
  const nextTour = TOURS[(TOURS.findIndex((t) => t.id === tour.id) + 1) % TOURS.length];
  const { targets, missing, error, card } = finished ? { targets: [], missing: false, error: null, card: null } : view;
  const showArrow = step?.arrow && targets.length === 2;

  return (
    <>
      <svg className="m-demo-mask" aria-hidden="true">
        <defs>
          <mask id="m-demo-holes">
            <rect width="100%" height="100%" fill="white" />
            {targets.map((t, i) => (
              <rect key={i} x={t.rect.left} y={t.rect.top} width={t.rect.width} height={t.rect.height} rx="8" fill="black" />
            ))}
          </mask>
          <marker id="m-demo-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#4b2f7f" />
          </marker>
        </defs>
        {targets.length > 0 && <rect width="100%" height="100%" className="m-demo-dim" mask="url(#m-demo-holes)" />}
        {showArrow && (
          <>
            <path d={arrowPath(targets[0].rect, targets[1].rect)} className="m-demo-arrow-under" />
            <path d={arrowPath(targets[0].rect, targets[1].rect)} className="m-demo-arrow" markerEnd="url(#m-demo-head)" />
          </>
        )}
      </svg>

      {targets.map((t, i) => (
        <div key={i} className={`m-demo-ring ${t.style === 'region' ? 'is-region' : ''}`} style={t.rect} />
      ))}

      <aside
        ref={cardRef}
        className="m-demo-card"
        role="status"
        aria-live="polite"
        style={card ? { left: card.left, top: card.top } : { right: CARD_MARGIN, bottom: CARD_MARGIN }}
      >
        <div className="m-demo-progress" aria-hidden="true">
          <span style={{ width: `${(position / total) * 100}%` }} />
        </div>
        <div className="m-demo-card-head">
          <span>{tour.source}</span>
          <span className="m-demo-count">{finished ? 'Done' : `${position} of ${total}`}</span>
          <button className="m-demo-icon" aria-label="Exit the demo" onClick={stop}>
            <X size={16} />
          </button>
        </div>

        {finished ? (
          <>
            <h3>Demo complete</h3>
            <p>You’ve finished “{tour.title}”. The canvas is yours to keep exploring.</p>
            <div className="m-demo-actions">
              <button className="m-demo-secondary" onClick={() => start(nextTour)}>
                Next demo
              </button>
              <button className="m-demo-primary" onClick={() => setTour(null)}>
                All demos
              </button>
            </div>
          </>
        ) : (
          <>
            <h3>
              {step.waiting && <Loader2 size={17} className="m-spin" />}
              {step.title}
            </h3>
            <p>{step.body}</p>
            {step.why && <p className="m-demo-why">{step.why}</p>}
            {missing && !step.waiting && (
              <p className="m-demo-note">This isn’t on screen right now. Go back a step, or try the fit-view button.</p>
            )}
            {error && <p className="m-demo-note">{error}</p>}
            <div className="m-demo-actions">
              <button className="m-demo-secondary" disabled={index === 0 || step.waiting} onClick={() => setIndex(index - 1)}>
                <ArrowLeft size={15} /> Back
              </button>
              {step.done ? (
                <button className="m-demo-skip" disabled={step.waiting} onClick={forward}>
                  {step.waiting ? 'Waiting…' : 'Skip step'}
                </button>
              ) : (
                <button className="m-demo-primary" onClick={forward}>
                  {index + 1 === total ? 'Finish' : 'Next'} <ArrowRight size={15} />
                </button>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
}

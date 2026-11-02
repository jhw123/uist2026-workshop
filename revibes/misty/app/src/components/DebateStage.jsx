import React, { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Play, SkipForward, Volume2, VolumeX, X } from 'lucide-react';
import { chime, isMuted, setMuted, speak } from '../lib/simlish.js';
import { SPEAKERS } from '../lib/debate.js';

// The remix's stage: two characters argue over the blend while the user rules on each point.
// state: { status: 'loading' | 'playing' | 'done' | 'error', turns, compromise, note, error, exampleImage, exampleColor }

function Character({ who, color, image, talking, mouth, mood, active }) {
  return (
    <div className={`m-char m-char-${who} ${active ? 'is-active' : ''} ${talking ? `is-talking is-${mood}` : ''}`}>
      <div className="m-plumbob" aria-hidden="true" />
      <div className="m-char-body" style={{ background: color }}>
        {image && <img className="m-char-badge" src={image} alt="" />}
        <div className="m-char-eyes">
          <span />
          <span />
        </div>
        <div className="m-char-mouth" style={{ transform: `scaleY(${talking ? 0.35 + mouth * 0.9 : 0.2})` }} />
      </div>
      <div className="m-char-name">{SPEAKERS[who].name}</div>
    </div>
  );
}

export default function DebateStage({ state, onRule, onNote, onBlend, onSkip, onCancel, onPlayed }) {
  const [index, setIndex] = useState(-1); // turn currently shown
  const [speaking, setSpeaking] = useState(false);
  const [mouth, setMouth] = useState(0);
  const [muted, setMutedState] = useState(isMuted());
  const [countdown, setCountdown] = useState(null);
  const touched = useRef(false);
  const listRef = useRef(null);
  const turns = state?.turns ?? [];

  // Play the turns one after the other once the script has arrived. Rulings change the
  // turns, so the playback is keyed on the script's id, not on the turns themselves.
  const playing = state?.status === 'playing' ? state.scriptId : null;
  useEffect(() => {
    if (!playing) return undefined;
    let alive = true;
    touched.current = false;
    (async () => {
      chime(true);
      await new Promise((r) => setTimeout(r, 350));
      for (let i = 0; i < turns.length && alive; i++) {
        setIndex(i);
        setSpeaking(true);
        const t = turns[i];
        await speak(t.line, SPEAKERS[t.speaker], t.mood, (k) => alive && setMouth(k % 2 ? 0.25 : 1));
        if (!alive) return;
        setSpeaking(false);
        await new Promise((r) => setTimeout(r, 420));
      }
      if (alive) {
        setIndex(turns.length);
        chime(false);
        onPlayed?.();
      }
    })();
    return () => {
      alive = false;
    };
    // Only restart when a new script arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  // After the debate, blend automatically unless the user is still ruling.
  useEffect(() => {
    if (state?.status !== 'done') {
      setCountdown(null);
      return undefined;
    }
    if (touched.current) return undefined;
    setCountdown(12);
    const timer = setInterval(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearInterval(timer);
  }, [state?.status]);

  useEffect(() => {
    if (countdown === 0) onBlend();
  }, [countdown, onBlend]);

  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [index]);

  if (!state) return null;
  const hold = () => {
    touched.current = true;
    setCountdown(null);
  };
  const current = turns[index];
  const shown = turns.slice(0, Math.max(0, index + 1));
  const kept = turns.filter((t) => t.ruling === 'keep').length;
  const rejected = turns.filter((t) => t.ruling === 'reject').length;

  return (
    <section className="m-debate nodrag nowheel" role="dialog" aria-label="The inputs argue" onPointerDown={hold}>
      <header className="m-debate-head">
        <strong>The inputs argue</strong>
        <span className="m-debate-sub">
          {state.status === 'loading' && 'They are getting ready…'}
          {state.status === 'playing' && 'Side with a point using ✔ or ✖.'}
          {state.status === 'done' && `${kept} agreed, ${rejected} rejected. Misty blends the compromise.`}
          {state.status === 'error' && 'The debate could not start.'}
        </span>
        <button
          className="m-debate-icon"
          aria-label={muted ? 'Turn the voices on' : 'Mute the voices'}
          title={muted ? 'Voices off' : 'Voices on'}
          onClick={() => {
            setMuted(!muted);
            setMutedState(!muted);
          }}
        >
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <button className="m-debate-icon" aria-label="Cancel the blend" title="Cancel the blend" onClick={onCancel}>
          <X size={16} />
        </button>
      </header>

      <div className="m-debate-arena">
        <Character
          who="example"
          color={state.exampleColor}
          image={state.exampleImage}
          active={current?.speaker === 'example'}
          talking={speaking && current?.speaker === 'example'}
          mouth={mouth}
          mood={current?.mood}
        />
        <ol className="m-debate-lines" ref={listRef}>
          {state.status === 'loading' && (
            <li className="m-debate-wait">
              <Loader2 size={16} className="m-spin" /> Writing the argument (about 10 seconds)…
            </li>
          )}
          {state.status === 'error' && <li className="m-error">{state.error}</li>}
          {shown.map((t, i) => (
            <li key={t.id} className={`m-line m-line-${t.speaker} ${i === index && speaking ? 'is-speaking' : ''}`}>
              <p className="m-bubble">{t.line}</p>
              {t.proposal && (
                <div className="m-ruling">
                  <span className="m-proposal">{t.proposal}</span>
                  <button
                    className={`m-rule m-rule-keep ${t.ruling === 'keep' ? 'is-on' : ''}`}
                    aria-label={`Agree: ${t.proposal}`}
                    aria-pressed={t.ruling === 'keep'}
                    onClick={() => {
                      hold();
                      onRule(t.id, t.ruling === 'keep' ? null : 'keep');
                    }}
                  >
                    <Check size={14} />
                  </button>
                  <button
                    className={`m-rule m-rule-reject ${t.ruling === 'reject' ? 'is-on' : ''}`}
                    aria-label={`Reject: ${t.proposal}`}
                    aria-pressed={t.ruling === 'reject'}
                    onClick={() => {
                      hold();
                      onRule(t.id, t.ruling === 'reject' ? null : 'reject');
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </li>
          ))}
          {state.status === 'done' && state.compromise && (
            <li className="m-line m-line-compromise">
              <p className="m-bubble">Compromise: {state.compromise}</p>
            </li>
          )}
        </ol>
        <Character
          who="ui"
          color="#B79FD8"
          active={current?.speaker === 'ui'}
          talking={speaking && current?.speaker === 'ui'}
          mouth={mouth}
          mood={current?.mood}
        />
      </div>

      <footer className="m-debate-foot">
        <input
          className="m-debate-note"
          placeholder="Have your say (optional), e.g. “keep my colors, take the cards”"
          value={state.note ?? ''}
          onChange={(e) => {
            hold();
            onNote(e.target.value);
          }}
          onKeyDown={(e) => e.key === 'Enter' && state.status !== 'loading' && onBlend()}
        />
        <button className="m-debate-skip" onClick={onSkip} title="Blend without the debate">
          <SkipForward size={14} /> Skip
        </button>
        <button className="m-debate-go" disabled={state.status === 'loading'} onClick={onBlend}>
          <Play size={14} /> Blend{countdown !== null && countdown > 0 ? ` (${countdown})` : ''}
        </button>
      </footer>
    </section>
  );
}

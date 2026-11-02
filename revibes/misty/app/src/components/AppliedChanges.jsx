import React, { useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { useMisty } from '../context.js';

// Colour tokens get a swatch that opens a palette (ported from the xhigh revibe), so
// "varying individual colors" (Section 4.2.3) takes one click.
const HUES = ['slate', 'gray', 'zinc', 'stone', 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald',
  'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose'];
const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
const COLOR_RE = new RegExp(
  `^((?:[\\w-]+:)*)(bg|text|border|from|via|to|ring|fill|stroke|divide|outline|decoration|accent|shadow)-(?:(${HUES.join('|')})-(\\d{2,3})|(white|black))(\\/\\d+)?$`
);

function ColorSwatch({ value, disabled, onPick }) {
  const [open, setOpen] = useState(false);
  const tokens = value.split(/\s+/).filter(Boolean);
  const index = tokens.findIndex((t) => COLOR_RE.test(t));
  if (index < 0) return null;
  const [, variants, prop, hue, shade, plain, alpha = ''] = tokens[index].match(COLOR_RE);
  const current = plain || `${hue}-${shade}`;
  const pick = (color) => {
    setOpen(false);
    const next = [...tokens];
    next[index] = `${variants}${prop}-${color}${alpha}`;
    onPick(next.join(' '));
  };
  return (
    <span className="m-swatch-wrap">
      <button
        type="button"
        className={`m-swatch bg-${current}`}
        title={disabled ? '' : 'Pick another color'}
        aria-label={`Pick another color for ${tokens[index]}`}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <span className="m-palette" onMouseLeave={() => setOpen(false)}>
          <span className="m-palette-row">
            {['white', 'black'].map((c) => (
              <button key={c} type="button" title={c} className={`m-palette-cell bg-${c}`} onClick={() => pick(c)} />
            ))}
          </span>
          {HUES.map((h) => (
            <span key={h} className="m-palette-row">
              {SHADES.map((sh) => (
                <button
                  key={sh}
                  type="button"
                  title={`${h}-${sh}`}
                  className={`m-palette-cell bg-${h}-${sh}`}
                  onClick={() => pick(`${h}-${sh}`)}
                />
              ))}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

// The semantic diff: one toggle per category of change (Section 4.2.3), with the
// class-level changes underneath for fine-grained edits.
export default function AppliedChanges({ id, data }) {
  const { toggleCategory, resetAll, editChange, patchNode } = useMisty();
  const [expanded, setExpanded] = useState({});
  const disabled = data.status === 'loading' || data.toggling;

  if (!data.panelOpen) {
    return (
      <button
        className="m-panel-chevron nodrag"
        title="Show Applied Changes"
        onClick={() => patchNode(id, { panelOpen: true })}
      >
        <ChevronRight size={18} />
      </button>
    );
  }

  return (
    <>
      <button
        className="m-panel-chevron nodrag"
        title="Hide Applied Changes"
        onClick={() => patchNode(id, { panelOpen: false })}
      >
        <ChevronLeft size={18} />
      </button>
      <section className="m-changes nodrag nowheel">
        <h3 className="m-node-title">Applied Changes</h3>
        <div className="m-changes-actions">
          <button className="m-link" disabled={disabled} onClick={() => resetAll(id)}>
            <RotateCcw size={15} /> Reset All
          </button>
        </div>

        {data.categories.length === 0 && (
          <p className="m-muted">
            {data.status === 'loading' ? 'Waiting for the blend…' : 'The model listed no changes.'}
          </p>
        )}

        {data.categories.map((category) => (
          <div className="m-category" key={category.id}>
            <div className="m-category-label">{category.label}</div>
            <div className="m-category-row">
              <p className="m-category-text">{category.description}</p>
              <label className={`m-switch ${disabled ? 'is-disabled' : ''}`}>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label={`${category.label}: ${category.description}`}
                  checked={category.enabled}
                  disabled={disabled}
                  onChange={() => toggleCategory(id, category.id)}
                />
                <span className="m-switch-track" />
                <span className="m-switch-state">{category.enabled ? 'On' : 'Off'}</span>
              </label>
            </div>
            {category.changes.length > 0 && (
              <button
                className="m-details-toggle"
                onClick={() => setExpanded((e) => ({ ...e, [category.id]: !e[category.id] }))}
              >
                <ChevronDown size={13} className={expanded[category.id] ? 'is-open' : ''} />
                {category.changes.length} class {category.changes.length === 1 ? 'change' : 'changes'}
              </button>
            )}
            {expanded[category.id] && (
              <ul className="m-class-list">
                {category.changes.map((change, index) => (
                  <li key={index}>
                    <span className="m-class-type">{change.type}</span>
                    <code>{change.before || '(new)'}</code>
                    <span>→</span>
                    <ColorSwatch
                      value={change.after || ''}
                      disabled={disabled || !category.enabled}
                      onPick={(value) => editChange(id, category.id, index, value)}
                    />
                    <input
                      key={change.after}
                      className="m-class-input"
                      defaultValue={change.after}
                      disabled={disabled || !category.enabled}
                      spellCheck={false}
                      aria-label={`Value after the ${change.type} change`}
                      onBlur={(e) => editChange(id, category.id, index, e.target.value.trim())}
                      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

        {data.toggling && <p className="m-muted">Updating the code for this change…</p>}

        {data.designExplanation && (
          <details className="m-explain">
            <summary>What the model saw</summary>
            <p>{data.designExplanation}</p>
            {data.differences && (
              <p>{typeof data.differences === 'string' ? data.differences : JSON.stringify(data.differences)}</p>
            )}
          </details>
        )}
      </section>
    </>
  );
}

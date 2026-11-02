import React, { memo, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Hammer, Loader2, Sparkles, SquareTerminal } from 'lucide-react';
import { useMisty } from '../context.js';
import AppliedChanges from './AppliedChanges.jsx';
import CodeRender from './CodeRender.jsx';

function SourceNode({ id, data, selected }) {
  const { regenerate, fixRender, openCode, patchNode } = useMisty();
  const loading = data.status === 'loading';
  const hasBlend = Boolean(data.blend);

  const onError = useCallback(
    (error) => {
      if ((data.renderError || null) !== error) patchNode(id, { renderError: error });
    },
    [id, data.renderError, patchNode]
  );

  return (
    <div className={`m-node m-source ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Left} id="in" className="m-handle m-handle-source" />
      <div className="m-source-body">
        <div className="m-render-column">
          <h3 className="m-node-title">Code Render</h3>
          {data.blendLabel && <div className="m-blend-label">{data.blendLabel}</div>}

          {(hasBlend || data.renderError) && (
            <div className="m-node-tools nodrag">
              <button
                className={`m-link ${data.renderError ? 'is-alert' : ''}`}
                disabled={loading || data.toggling}
                onClick={() => fixRender(id)}
              >
                <Hammer size={15} /> Fix Render
              </button>
              {hasBlend && (
                <button
                  className="m-link"
                  disabled={loading || data.toggling}
                  onClick={() => regenerate(id)}
                >
                  <Sparkles size={15} /> Regenerate
                </button>
              )}
            </div>
          )}

          <div className={`m-screen-frame ${loading || data.toggling ? 'is-busy' : ''}`}>
            <CodeRender nodeId={id} code={data.code} onError={onError} />
            {(loading || data.toggling) && (
              <div className="m-busy">
                <Loader2 size={22} className="m-spin" />
                <span>{data.debating ? 'Arguing it out…' : loading ? 'Blending…' : 'Applying your change…'}</span>
              </div>
            )}
          </div>

          {data.error && <p className="m-error">{data.error}</p>}

          <button className="m-show-code nodrag" onClick={() => openCode(id)}>
            <SquareTerminal size={15} /> Show Code
          </button>
        </div>

        {hasBlend && <AppliedChanges id={id} data={data} />}
      </div>
      <Handle type="source" position={Position.Right} id="out" className="m-handle m-handle-out" isConnectable={false} />
    </div>
  );
}

export default memo(SourceNode);

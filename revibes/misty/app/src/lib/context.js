import { createContext, useContext } from 'react';

export const MistyContext = createContext(null);
export const useMisty = () => useContext(MistyContext);

// What is being dragged from an example node (HTML5 dataTransfer cannot be
// read during dragover, so it lives here).
let payload = null;
export const setDragPayload = (p) => { payload = p; };
export const getDragPayload = () => payload;

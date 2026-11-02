import { createContext, useContext } from "react";

// Actions and shared state the canvas nodes need (blend, toggle, show code, ...).
export const MistyContext = createContext(null);
export const useMisty = () => useContext(MistyContext);

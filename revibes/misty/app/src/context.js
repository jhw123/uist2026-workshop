import { createContext, useContext } from 'react';

export const MistyContext = createContext(null);
export const useMisty = () => useContext(MistyContext);

// Turns a source node's code (a React + Tailwind component written as one
// expression, `() => { ... }`) into a React component, the way React Live does:
// Sucrase compiles the JSX, then the code is evaluated with SCOPE in reach.
import { transform } from "sucrase";
import { SCOPE_KEYS, SCOPE_VALUES } from "./scope.js";

const cache = new Map();

export function compile(code) {
  if (cache.has(code)) return cache.get(code);
  let result;
  try {
    const body = `return (${String(code).trim().replace(/;+\s*$/, "")})`;
    const js = transform(body, { transforms: ["jsx", "typescript"], production: true }).code;
    // eslint-disable-next-line no-new-func
    const value = new Function(...SCOPE_KEYS, js)(...SCOPE_VALUES);
    const Component = typeof value === "function" ? value : () => value;
    result = { Component };
  } catch (e) {
    result = { error: e?.message || String(e) };
  }
  if (cache.size > 200) cache.clear();
  cache.set(code, result);
  return result;
}

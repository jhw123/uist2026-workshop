import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
await mkdir(`${root}public/vendor`, {recursive:true});
for (const [from,to] of [
  ['react/umd/react.production.min.js','react.js'],
  ['react-dom/umd/react-dom.production.min.js','react-dom.js'],
  ['@babel/standalone/babel.min.js','babel.js'],
  ['@tailwindcss/browser/dist/index.global.js','tailwind.js']
]) await copyFile(`${root}node_modules/${from}`, `${root}public/vendor/${to}`);
console.log('Local preview libraries ready. Run python3 server.py');

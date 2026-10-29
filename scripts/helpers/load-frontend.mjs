import fs from 'node:fs/promises';
import { transform } from 'esbuild';

// Execute the actual module with explicit in-memory adapters, never Firebase.
export async function loadFrontend(file, bindings, exports, replace = s => s) {
  let source = replace(await fs.readFile(new URL('../../' + file, import.meta.url), 'utf8'));
  source = source.replace(/import\s[\s\S]*?from\s+['"][^'"]+['"];?/g, '')
    .replace(/export default [^;]+;/g, '').replace(/export /g, '')
    .replace(/import\.meta/g, '({ env: { DEV: false } })');
  const { code } = await transform(source, { loader: 'jsx', jsx: 'transform' });
  delete bindings.default;
  return Function(...Object.keys(bindings), code + '\nreturn {' + exports.join(',') + '};')(...Object.values(bindings));
}

export function hooks() {
  const slots = [];
  let cursor = 0;
  let pending = [];
  const cleanups = [];
  const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) };
  return {
    bindings: {
      React, createContext: () => ({ Provider: 'provider' }), useContext: () => {},
      useState(initial) {
        const i = cursor++;
        if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
        return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }];
      },
      useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
      useEffect(effect, deps) {
        const i = cursor++;
        if (!slots[i] || deps.some((d, j) => d !== slots[i][j])) {
          slots[i] = deps;
          pending.push(() => { cleanups[i]?.(); cleanups[i] = effect(); });
        }
      },
      useMemo: fn => fn(), useCallback: fn => fn,
    },
    render(Component) {
      cursor = 0;
      const result = Component({ children: null }).props.value;
      const effects = pending; pending = []; effects.forEach(fn => fn());
      return result;
    },
    cleanup() { cleanups.forEach(fn => fn?.()); },
  };
}

export const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
export const flush = () => new Promise(resolve => setImmediate(resolve));

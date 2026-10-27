// Codepad: VS Code on a slide. The editor is Monaco (the editor inside VS Code); the terminal under it is
// typeable and really runs code: `node file.js` (JavaScript in a Web Worker, printing like Node) and
// `python3 file.py` (real CPython via Pyodide). Like VS Code, the terminal runs the SAVED file: Ctrl+S saves.
//   N = type the next prepared chunk (optional) · R = type and run `node …` / `python3 …` in each terminal
//   In the editor: Ctrl+S save · Ctrl+Enter save + run · Esc leave (so N / R / arrows work again)
//   In the terminal: Enter run · ↑ ↓ history · Tab completes file names · Ctrl+C stops · Ctrl+L clears
// No internet for Monaco? It falls back to a simple built-in editor. Markup:
//   <div class="vscode" data-folder="fundamentals">
//     <script type="text/plain" data-file="hello.js" data-start>…initial text…</script>
//     <script type="text/plain" data-file="hello.js" data-step>…typed on N…</script>
//     <script type="text/plain" data-file="hello.py" data-step data-mode="set">…replaces the file…</script>
//     <script type="text/plain" data-file="hello.py" data-expect>…recorded output (offline fallback)…</script>
//   </div>
(() => {
  const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/'
  const MONACO = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/'
  const isPresenter = new URLSearchParams(location.search).has('presenter')
  const chan = new BroadcastChannel('codepad:' + location.pathname)
  const KEEP_LINES = 400
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const langOf = (f) => (f.endsWith('.py') ? 'py' : 'js')
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  if (isPresenter) return presenterControls()

  // ---------- Node-style console.log formatting (runs inside the JS worker) ----------
  function nodeInspect(v) {
    const ident = /^[A-Za-z_$][\w$]*$/
    const quote = (s) => {
      const q = !s.includes("'") ? "'" : !s.includes('"') ? '"' : !s.includes('`') ? '`' : "'"
      const body = s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\t/g, '\\t').split(q).join('\\' + q)
      return q + body + q
    }
    const groupArray = (output, value, indent) => {
      let total = 0, maxLen = 0
      const lens = output.map((o) => { total += o.length + 2; if (o.length > maxLen) maxLen = o.length; return o.length })
      const actualMax = maxLen + 2
      if (actualMax * 3 + indent < 80 && (total / actualMax > 5 || maxLen <= 6)) {
        const averageBias = Math.sqrt(actualMax - total / output.length)
        const biasedMax = Math.max(actualMax - 3 - averageBias, 1)
        const columns = Math.min(Math.round(Math.sqrt(2.5 * biasedMax * output.length) / biasedMax), Math.floor((80 - indent) / actualMax), 12, 15)
        if (columns <= 1) return output
        const maxLine = []
        for (let i = 0; i < columns; i++) {
          let w = 0
          for (let j = i; j < output.length; j += columns) if (lens[j] > w) w = lens[j]
          maxLine.push(w + 2)
        }
        const numeric = value.every((x) => typeof x === 'number' || typeof x === 'bigint')
        const rows = []
        for (let i = 0; i < output.length; i += columns) {
          const max = Math.min(i + columns, output.length)
          let str = '', j = i
          for (; j < max - 1; j++) str += numeric ? `${output[j]}, `.padStart(maxLine[j - i], ' ') : `${output[j]}, `.padEnd(maxLine[j - i], ' ')
          str += numeric ? output[j].padStart(maxLine[j - i] - 2, ' ') : output[j]
          rows.push(str)
        }
        return rows
      }
      return output
    }
    const reduce = (output, open, close, indent, isArray, value) => {
      const entries = output.length
      if (isArray && entries > 6) output = groupArray(output, value, indent)
      if (entries === output.length) {
        const start = output.length + indent + open.length + 10
        let len = output.length + start, fits = len + output.length <= 80
        for (const o of output) { if (!fits) break; len += o.length; if (len > 80) fits = false }
        if (fits && !output.join(', ').includes('\n')) return `${open} ${output.join(', ')} ${close}`
      }
      const ind = '\n' + ' '.repeat(indent)
      return `${open}${ind}  ${output.join(`,${ind}  `)}${ind}${close}`
    }
    const fmt = (x, depth, indent, seen) => {
      if (x === null) return 'null'
      const t = typeof x
      if (t === 'string') return depth === 0 ? x : quote(x)
      if (t === 'number') return Object.is(x, -0) ? '-0' : String(x)
      if (t === 'bigint') return x + 'n'
      if (t === 'boolean' || t === 'undefined') return String(x)
      if (t === 'symbol') return x.toString()
      if (t === 'function') {
        const src = Function.prototype.toString.call(x)
        if (/^class\b/.test(src)) return `[class ${x.name || '(anonymous)'}]`
        return x.name ? `[Function: ${x.name}]` : '[Function (anonymous)]'
      }
      if (seen.includes(x)) return '[Circular *1]'
      if (x instanceof Error) return x.stack || String(x)
      if (x instanceof Date) return isNaN(x) ? 'Invalid Date' : x.toISOString()
      const next = [...seen, x]
      const child = (y) => fmt(y, depth + 1, indent + 2, next)
      if (Array.isArray(x)) {
        if (depth > 2) return '[Array]'
        if (!x.length) return '[]'
        const out = []
        let holes = 0
        const flush = () => { if (holes) { out.push(`<${holes} empty item${holes > 1 ? 's' : ''}>`); holes = 0 } }
        for (let i = 0; i < x.length && out.length < 100; i++) { if (!(i in x)) { holes++; continue } flush(); out.push(child(x[i])) }
        flush()
        if (x.length > 100) out.push(`... ${x.length - 100} more items`)
        return reduce(out, '[', ']', indent, true, x)
      }
      if (x instanceof Set) {
        if (depth > 2) return '[Set]'
        if (!x.size) return 'Set(0) {}'
        return reduce([...x].map(child), `Set(${x.size}) {`, '}', indent, true, [...x])
      }
      if (x instanceof Map) {
        if (depth > 2) return '[Map]'
        if (!x.size) return 'Map(0) {}'
        return reduce([...x].map(([k, v]) => `${child(k)} => ${child(v)}`), `Map(${x.size}) {`, '}', indent, false)
      }
      const proto = Object.getPrototypeOf(x)
      const name = proto === null ? '[Object: null prototype]' : proto.constructor && proto.constructor.name !== 'Object' ? proto.constructor.name : ''
      if (depth > 2) return name && proto !== null ? `[${name}]` : '[Object]'
      const keys = Object.keys(x)
      if (!keys.length) return name ? `${name} {}` : '{}'
      const out = keys.map((k) => `${ident.test(k) ? k : quote(k)}: ${child(x[k])}`)
      return reduce(out, name ? `${name} {` : '{', '}', indent, false)
    }
    return fmt(v, 0, 0, [])
  }


  // ---------- The JavaScript worker: node (with require between files) and a Jest-compatible runner ----------
  // Written as a plain function and shipped to a Worker as source, so no string escaping is needed.
  function jsWorkerMain(inspect) {
    let batch = [], last = 0
    const flush = () => { if (batch.length) postMessage({ t: 'lines', a: batch }); batch = []; last = Date.now() }
    const emit = (cls, s) => { if (batch.length < 80) batch.push([cls, s]); if (Date.now() - last > 40) flush() }
    const E = '\x1b['
    const C = {
      bold: (s) => `${E}1m${s}${E}22m`, dim: (s) => `${E}2m${s}${E}22m`,
      red: (s) => `${E}31m${s}${E}39m`, green: (s) => `${E}32m${s}${E}39m`, yellow: (s) => `${E}33m${s}${E}39m`,
      cyan: (s) => `${E}36m${s}${E}39m`, gray: (s) => `${E}90m${s}${E}39m`,
      badge: (s, col) => `${E}7m${E}1m${E}${col}m ${s} ${E}39m${E}22m${E}27m`,
    }
    const makeConsole = (cls = 'out') => {
      const out = (c, args) => emit(c, args.map((a) => (typeof a === 'string' ? a : inspect(a))).join(' '))
      return { log: (...a) => out(cls, a), info: (...a) => out(cls, a), debug: (...a) => out(cls, a), warn: (...a) => out('err', a), error: (...a) => out('err', a) }
    }

    // CommonJS modules over the slide's files
    function makeLoader(files, folder, con, extra) {
      const cache = {}
      const abs = (f) => `/home/student/${folder}/${f}`
      const norm = (p) => { const out = []; for (const s of p.split('/')) { if (!s || s === '.') continue; if (s === '..') out.pop(); else out.push(s) } return out.join('/') }
      const resolve = (from, spec) => {
        if (!/^\.{1,2}\//.test(spec)) return null
        const dir = from.includes('/') ? from.slice(0, from.lastIndexOf('/')) : ''
        const base = norm((dir ? dir + '/' : '') + spec)
        for (const c of [base, base + '.js', base + '.json', base + '/index.js']) if (Object.prototype.hasOwnProperty.call(files, c)) return c
        return null
      }
      function load(file) {
        if (cache[file]) return cache[file].exports
        const module = { exports: {} }
        cache[file] = module
        if (file.endsWith('.json')) { module.exports = JSON.parse(files[file]); return module.exports }
        const names = ['require', 'module', 'exports', '__filename', '__dirname', 'console', ...Object.keys(extra)]
        const fn = new Function(...names, files[file] + '\n//# sourceURL=' + file)
        const req = (spec) => {
          const r = resolve(file, spec)
          if (r === null) { const e = new Error(`Cannot find module '${spec}'`); e.code = 'MODULE_NOT_FOUND'; e.spec = spec; e.from = file; throw e }
          return load(r)
        }
        fn(req, module, module.exports, abs(file), `/home/student/${folder}`, con, ...Object.values(extra))
        return module.exports
      }
      return { load, abs }
    }

    // Where in the user's files an error happened: [file, line, col] (line/col 1-based)
    const userFrames = (err, files) => {
      const out = []
      for (const m of String(err && err.stack || '').matchAll(/([\w.\-/]+\.js):(\d+):(\d+)/g)) {
        if (Object.prototype.hasOwnProperty.call(files, m[1])) out.push([m[1], +m[2] - 2, +m[3]])
      }
      return out
    }

    function runNode(d) {
      const L = makeLoader(d.files, d.folder, makeConsole(), {})
      try { L.load(d.entry); return 0 } catch (err) {
        flush()
        if (err && err.code === 'MODULE_NOT_FOUND') {
          ;['node:internal/modules/cjs/loader:1228', '  throw err;', '  ^', '', `Error: Cannot find module '${err.spec}'`, 'Require stack:', `- ${L.abs(err.from)}`].forEach((l) => emit('err', l))
          return 1
        }
        const [f] = userFrames(err, d.files)
        if (f) {
          const src = d.files[f[0]].split('\n')[f[1] - 1]
          ;[`${L.abs(f[0])}:${f[1]}`, src, ' '.repeat(Math.max(0, f[2] - 1)) + '^', ''].forEach((l) => emit('err', l))
        }
        emit('err', `${err && err.name || 'Error'}: ${err && err.message}`)
        if (f) emit('err', `    at Object.<anonymous> (${L.abs(f[0])}:${f[1]}:${f[2]})`)
        return 1
      }
    }

    // ----- pretty-format, the way Jest prints values -----
    function pf(v, multi, ind = '') {
      const q = (s) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
      if (v === null) return 'null'
      const t = typeof v
      if (t === 'string') return q(v)
      if (t === 'number') return Object.is(v, -0) ? '-0' : String(v)
      if (t === 'bigint') return v + 'n'
      if (t === 'undefined' || t === 'boolean') return String(v)
      if (t === 'function') return `[Function ${v.name || 'anonymous'}]`
      if (t === 'symbol') return v.toString()
      const inner = ind + '  '
      if (Array.isArray(v)) {
        if (!v.length) return '[]'
        return multi ? `Array [\n${v.map((x) => inner + pf(x, true, inner) + ',').join('\n')}\n${ind}]` : `[${v.map((x) => pf(x)).join(', ')}]`
      }
      const proto = Object.getPrototypeOf(v)
      const name = proto && proto.constructor && proto.constructor.name !== 'Object' ? proto.constructor.name : 'Object'
      const keys = Object.keys(v).sort()
      if (!keys.length) return multi ? `${name} {}` : (name === 'Object' ? '{}' : `${name} {}`)
      return multi ? `${name} {\n${keys.map((k) => `${inner}${q(k)}: ${pf(v[k], true, inner)},`).join('\n')}\n${ind}}`
        : `${name === 'Object' ? '' : name + ' '}{${keys.map((k) => `${q(k)}: ${pf(v[k])}`).join(', ')}}`
    }
    function equals(a, b, strict) {
      if (Object.is(a, b)) return true
      if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false
      if (Array.isArray(a) !== Array.isArray(b)) return false
      if (strict && Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false
      const ka = Object.keys(a).filter((k) => strict || a[k] !== undefined), kb = Object.keys(b).filter((k) => strict || b[k] !== undefined)
      if (ka.length !== kb.length) return false
      return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && equals(a[k], b[k], strict))
    }
    function diffLines(a, b) {
      const n = a.length, m = b.length, L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
      for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
      const out = []; let i = 0, j = 0, dels = [], adds = [], nd = 0, na = 0
      const flushChange = () => { dels.forEach((l) => out.push(C.green('- ' + l))); adds.forEach((l) => out.push(C.red('+ ' + l))); nd += dels.length; na += adds.length; dels = []; adds = [] }
      while (i < n || j < m) {
        if (i < n && j < m && a[i] === b[j]) { flushChange(); out.push(C.dim('  ' + a[i])); i++; j++ }
        else if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) adds.push(b[j++])
        else dels.push(a[i++])
      }
      flushChange()
      return { out, nd, na }
    }
    function diffBlock(expected, received) {
      const a = pf(expected, true).split('\n'), b = pf(received, true).split('\n')
      const { out, nd, na } = diffLines(a, b)
      return [C.green(`- Expected  - ${nd}`), C.red(`+ Received  + ${na}`), '', ...out]
    }
    const hdr = (name, not, args = 'expected', note = '') => C.dim('expect(') + C.red('received') + C.dim(')' + (not ? '.not' : '') + '.') + name + C.dim('(') + (args ? C.green(args) : '') + C.dim(')') + (note ? C.dim(' // ' + note) : '')
    const EXP = (v) => `Expected: ${C.green(v)}`, REC = (v) => `Received: ${C.red(v)}`
    const MATCHERS = {
      toBe(r, e, not) {
        const pass = Object.is(r, e)
        const lines = [hdr('toBe', not, 'expected', 'Object.is equality'), '']
        if (not) lines.push(`Expected: not ${C.green(pf(e))}`)
        else if (r && e && typeof r === 'object' && typeof e === 'object' && equals(r, e, true) && pf(r) === pf(e)) lines.push('If it should pass with deep equality, replace "toBe" with "toStrictEqual"', '', EXP(pf(e)), `Received: ${C.red('serializes to the same string')}`)
        else if (r && e && typeof r === 'object' && typeof e === 'object') lines.push(...diffBlock(e, r))
        else lines.push(EXP(pf(e)), REC(pf(r)))
        return { pass, lines }
      },
      toEqual(r, e, not) {
        const pass = equals(r, e, false)
        const lines = [hdr('toEqual', not, 'expected', 'deep equality'), '']
        if (not) lines.push(`Expected: not ${C.green(pf(e))}`)
        else if (r && e && typeof r === 'object' && typeof e === 'object') lines.push(...diffBlock(e, r))
        else lines.push(EXP(pf(e)), REC(pf(r)))
        return { pass, lines }
      },
      toStrictEqual(r, e, not) {
        const res = MATCHERS.toEqual(r, e, not); res.pass = equals(r, e, true); res.lines[0] = hdr('toStrictEqual', not, 'expected', 'deep equality'); return res
      },
      toBeCloseTo(r, e, p, not) {
        if (typeof p !== 'number') { not = p; p = 2 }
        const diff = Math.abs(e - r), pass = diff < Math.pow(10, -p) / 2
        const lines = [hdr('toBeCloseTo', not), '', not ? `Expected: not ${C.green(pf(e))}` : EXP(pf(e)), REC(pf(r)), '', `Expected precision:    ${C.green(p)}`, `Expected difference: ${not ? '>=' : '< '} ${C.green(pf(Math.pow(10, -p) / 2))}`, `Received difference:   ${C.red(pf(diff))}`]
        return { pass, lines }
      },
      toContain(r, item, not) {
        const isStr = typeof r === 'string'
        const pass = isStr ? r.includes(item) : Array.from(r || []).some((x) => x === item)
        return { pass, lines: [hdr('toContain', not, 'expected', 'indexOf'), '', `Expected ${isStr ? 'substring' : 'value'}: ${not ? 'not ' : ''}${C.green(pf(item))}`, `Received ${isStr ? 'string' : 'array'}:  ${not ? '    ' : ''}${C.red(pf(r))}`] }
      },
      toHaveLength(r, n, not) {
        const pass = r != null && r.length === n
        return { pass, lines: [hdr('toHaveLength', not), '', `Expected length: ${not ? 'not ' : ''}${C.green(n)}`, `Received length: ${C.red(r && r.length)}`, `Received ${Array.isArray(r) ? 'array' : 'string'}:  ${C.red(pf(r))}`] }
      },
      toMatch(r, pat, not) {
        const pass = typeof pat === 'string' ? String(r).includes(pat) : pat.test(String(r))
        return { pass, lines: [hdr('toMatch', not), '', `Expected ${typeof pat === 'string' ? 'substring' : 'pattern'}: ${not ? 'not ' : ''}${C.green(typeof pat === 'string' ? pf(pat) : String(pat))}`, `Received string:  ${not ? '    ' : ''}${C.red(pf(r))}`] }
      },
      toThrow(fn, expected, not) {
        if (typeof expected === 'boolean' && not === undefined) { not = expected; expected = undefined }
        let threw = false, err
        try { fn() } catch (e) { threw = true; err = e }
        let pass = threw
        if (threw && expected !== undefined) {
          const msg = err && err.message !== undefined ? err.message : String(err)
          pass = typeof expected === 'string' ? msg.includes(expected) : expected instanceof RegExp ? expected.test(msg) : typeof expected === 'function' ? err instanceof expected : true
        }
        const lines = [hdr('toThrow', not, expected === undefined ? '' : 'expected'), '']
        if (!threw) lines.push('Received function did not throw')
        else lines.push(`Received message: ${C.red(pf(err && err.message))}`)
        return { pass, lines }
      },
    }
    const simple = (name, test, show) => (r, not) => ({ pass: test(r), lines: [hdr(name, not, ''), '', show ? show(r) : REC(pf(r))] })
    Object.assign(MATCHERS, {
      toBeTruthy: simple('toBeTruthy', (r) => !!r), toBeFalsy: simple('toBeFalsy', (r) => !r),
      toBeNull: simple('toBeNull', (r) => r === null), toBeUndefined: simple('toBeUndefined', (r) => r === undefined),
      toBeDefined: simple('toBeDefined', (r) => r !== undefined), toBeNaN: simple('toBeNaN', (r) => Number.isNaN(r)),
    })
    const cmp = (name, sym, f) => (r, n, not) => ({ pass: f(r, n), lines: [hdr(name, not), '', `Expected:${not ? ' not' : ''} ${sym} ${C.green(pf(n))}`, `Received:${' '.repeat(sym.length + 1 + (not ? 4 : 0))} ${C.red(pf(r))}`] })
    Object.assign(MATCHERS, {
      toBeGreaterThan: cmp('toBeGreaterThan', '>', (r, n) => r > n), toBeGreaterThanOrEqual: cmp('toBeGreaterThanOrEqual', '>=', (r, n) => r >= n),
      toBeLessThan: cmp('toBeLessThan', '<', (r, n) => r < n), toBeLessThanOrEqual: cmp('toBeLessThanOrEqual', '<=', (r, n) => r <= n),
    })
    function expect(received) {
      const api = { not: {} }
      for (const [name, m] of Object.entries(MATCHERS)) {
        api[name] = function (...args) { const r = m(received, ...args, false); if (!r.pass) { const e = new Error(name); e.jest = { matcher: name, lines: r.lines }; throw e } }
        api.not[name] = function (...args) { const r = m(received, ...args, true); if (r.pass) { const e = new Error(name); e.jest = { matcher: name, lines: r.lines }; throw e } }
      }
      return api
    }

    function codeFrame(src, line, col) {
      const lines = src.split('\n'), from = Math.max(1, line - 2), to = Math.min(lines.length, line + 3), w = String(to).length
      const out = []
      for (let n = from; n <= to; n++) {
        const mark = n === line
        out.push(C.dim('    ' + (mark ? C.red(C.bold('>')) : ' ') + ' ' + C.gray(String(n).padStart(w) + ' |') + (lines[n - 1] ? ' ' + lines[n - 1] : '')))
        if (mark) out.push(C.dim('    ' + '  ' + C.gray(' '.repeat(w) + ' |') + ' ' + ' '.repeat(Math.max(0, col - 1)) + C.red(C.bold('^'))))
      }
      return out
    }

    async function runSpec(file, files, folder) {
      const root = { title: null, children: [] }
      let cur = root, skipDepth = 0
      const addTest = (skip) => (title, fn) => { cur.children.push({ type: 'test', title: String(title), fn, skip: skip || skipDepth > 0 }) }
      const addDescribe = (skip) => (title, fn) => {
        const node = { type: 'describe', title: String(title), children: [], before: [], after: [] }
        cur.children.push(node)
        const prev = cur; cur = node; if (skip) skipDepth++
        try { fn() } finally { if (skip) skipDepth--; cur = prev }
      }
      root.before = []; root.after = []
      const test = addTest(false); test.skip = addTest(true); test.todo = addTest(true); test.only = test
      const describe = addDescribe(false); describe.skip = addDescribe(true); describe.only = describe
      const hooks = (k) => (fn) => { cur[k].push(fn) }
      const globals = { describe, test, it: test, xtest: test.skip, xit: test.skip, xdescribe: describe.skip, fit: test, fdescribe: describe,
        expect, beforeEach: hooks('before'), afterEach: hooks('after'), beforeAll: (fn) => fn(), afterAll: () => {} }
      const L = makeLoader(files, folder, makeConsole(), globals)
      try { L.load(file) } catch (err) { return { file, suiteError: err, root } }
      const run = async (node, ancestors, befores, afters) => {
        const b = [...befores, ...(node.before || [])], a = [...(node.after || []), ...afters]
        for (const c of node.children) {
          if (c.type === 'describe') { await run(c, [...ancestors, c.title], b, a); continue }
          c.ancestors = ancestors
          if (c.skip || !c.fn) { c.status = 'skipped'; continue }
          const t0 = performance.now()
          try {
            for (const h of b) await h()
            const r = c.fn(); if (r && typeof r.then === 'function') await r
            for (const h of a) await h()
            c.status = 'passed'
          } catch (e) { c.status = 'failed'; c.error = e }
          c.ms = Math.round(performance.now() - t0)
        }
      }
      await run(root, [], [], [])
      return { file, root }
    }
    const allTests = (node) => node.children.flatMap((c) => (c.type === 'describe' ? allTests(c) : [c]))

    async function runJest(d) {
      const t0 = performance.now()
      const isSpec = (f) => /(^|\/)__tests__\/.*\.[cm]?[jt]sx?$/.test(f) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(f)
      const filter = d.filter ? new RegExp(d.filter, 'i') : null
      const specs = Object.keys(d.files).filter(isSpec).filter((f) => !filter || filter.test(f)).sort()
      if (!specs.length) {
        const nf = Object.keys(d.files).length, nSpec = Object.keys(d.files).filter(isSpec).length
        ;['No tests found, exiting with code 1', 'Run with `--passWithNoTests` to exit with code 0', `In /home/student/${d.folder}`, `  ${nf} files checked.`,
          `  testMatch: **/__tests__/**/*.?([mc])[jt]s?(x), **/?(*.)+(spec|test).?([mc])[jt]s?(x) - ${nSpec} matches`,
          `  testPathIgnorePatterns: /node_modules/ - ${nf} matches`, '  testRegex:  - 0 matches', `Pattern: ${d.filter || ''} - 0 matches`].forEach((l) => emit('out', l))
        return 1
      }
      const results = []
      for (const f of specs) results.push(await runSpec(f, d.files, d.folder))
      const verbose = specs.length === 1
      for (const r of results) {
        const tests = r.suiteError ? [] : allTests(r.root)
        r.failed = !!r.suiteError || tests.some((t) => t.status === 'failed')
        r.tests = tests
        emit('out', (r.failed ? C.badge('FAIL', 31) : C.badge('PASS', 32)) + ' ' + C.dim('./') + C.bold(r.file))
        if (verbose && !r.suiteError) {
          const group = (node, level) => {
            const pad = '  '.repeat(level)
            const kids = node.children.filter((c) => c.type === 'test')
            for (const t of [...kids.filter((t) => t.status !== 'skipped'), ...kids.filter((t) => t.status === 'skipped')]) {
              const time = t.ms ? ` (${t.ms} ms)` : ''
              if (t.status === 'passed') emit('out', `${pad}${C.green('✓')} ${C.dim(t.title + time)}`)
              else if (t.status === 'failed') emit('out', `${pad}${C.red('✕')} ${C.dim(t.title + time)}`)
              else emit('out', `${pad}${C.yellow('○')} ${C.dim('skipped ' + t.title)}`)
            }
            for (const c of node.children.filter((c) => c.type === 'describe')) { emit('out', pad + c.title); group(c, level + 1) }
          }
          group(r.root, 1)
          emit('out', '')
        }
        const failBlock = (title, err) => {
          emit('out', C.bold(C.red('  ● ' + title)))
          emit('out', '')
          let frames = userFrames(err, d.files)
          if (err && err.jest) err.jest.lines.forEach((l) => emit('out', l ? '    ' + l : ''))
          else if (err && err.code === 'MODULE_NOT_FOUND') emit('out', `    Cannot find module '${err.spec}' from '${err.from}'`)
          else emit('out', `    ${err && err.name || 'Error'}: ${err && err.message}`)
          const f = frames[0]
          if (f) { emit('out', ''); codeFrame(d.files[f[0]], f[1], f[2]).forEach((l) => emit('out', l)) }
          emit('out', '')
          if (err && err.code === 'MODULE_NOT_FOUND') emit('out', C.dim('      at Resolver._throwModNotFoundError (') + C.dim('node_modules/jest-resolve/build/index.js:1031:11)'))
          if (f) emit('out', C.dim(`      at Object.${err && err.jest ? err.jest.matcher : err && err.code === 'MODULE_NOT_FOUND' ? 'require' : '<anonymous>'} (`) + C.cyan(f[0]) + C.dim(`:${f[1]}:${f[2]})`))
          emit('out', '')
        }
        if (r.suiteError) failBlock('Test suite failed to run', r.suiteError)
        else for (const t of r.tests.filter((t) => t.status === 'failed')) failBlock([...t.ancestors, t.title].join(' › '), t.error)
      }
      const all = results.flatMap((r) => r.tests)
      const count = (s) => all.filter((t) => t.status === s).length
      const parts = (f, sk, p, total) => [f && C.bold(C.red(`${f} failed`)), sk && C.bold(C.yellow(`${sk} skipped`)), p && C.bold(C.green(`${p} passed`)), `${total} total`].filter(Boolean).join(', ')
      const sf = results.filter((r) => r.failed).length
      const ss = results.filter((r) => !r.failed && r.tests.length && r.tests.every((t) => t.status === 'skipped')).length
      emit('out', C.bold('Test Suites: ') + parts(sf, ss, results.length - sf - ss, results.length))
      emit('out', C.bold('Tests:       ') + parts(count('failed'), count('skipped'), count('passed'), all.length))
      emit('out', C.bold('Snapshots:   ') + '0 total')
      emit('out', C.bold('Time:') + `        ${((performance.now() - t0) / 1000).toFixed(3)} s`)
      emit('out', C.dim(filter ? `Ran all test suites matching /${d.filter}/i.` : 'Ran all test suites.'))
      return results.some((r) => r.failed) ? 1 : 0
    }

    onmessage = async (e) => {
      const d = e.data
      let code = 0
      try { code = d.t === 'jest' ? await runJest(d) : runNode(d) }
      catch (err) { flush(); emit('err', String(err && err.stack || err)); code = 1 }
      flush()
      postMessage({ t: 'done', code })
    }
  }

  // ---------- The Python worker: python3 and real pytest (Pyodide) ----------
  const PY_SETUP = [
    'import sys, os, shutil, traceback, linecache',
    'sys.dont_write_bytecode = True',
    'sys.executable = "python3"',
    '__cp_dirs = set()',
    'def __cp_files(files, folder):',
    '    d = folder if folder.startswith("/") else "/home/student/" + folder',
    '    if folder.startswith("/"):',
    '        shutil.rmtree(d, ignore_errors=True)',
    '    os.makedirs(d, exist_ok=True)',
    '    for name, text in files.items():',
    '        p = os.path.join(d, name)',
    '        os.makedirs(os.path.dirname(p), exist_ok=True)',
    '        with open(p, "w") as fh:',
    '            fh.write(text)',
    '    os.chdir(d)',
    '    __cp_dirs.add(d)',
    '    for x in __cp_dirs:',
    '        while x in sys.path:',
    '            sys.path.remove(x)',
    '    sys.path.insert(0, d)',
    '    for k, m in list(sys.modules.items()):',
    '        f = getattr(m, "__file__", None) or ""',
    '        if any(f.startswith(x + "/") for x in __cp_dirs):',
    '            del sys.modules[k]',
    '    shutil.rmtree(os.path.join(d, "__pycache__"), ignore_errors=True)',
    '    linecache.clearcache()',
    'def __cp_run(fname):',
    '    try:',
    '        with open(fname) as fh:',
    '            src = fh.read()',
    '        exec(compile(src, fname, "exec"), {"__name__": "__main__", "__file__": fname})',
    '        return 0',
    '    except SystemExit as e:',
    '        return e.code if isinstance(e.code, int) else 0',
    '    except BaseException as e:',
    '        tb = e.__traceback__',
    '        while tb is not None and tb.tb_frame.f_code.co_filename != fname:',
    '            tb = tb.tb_next',
    '        sys.stdout.flush()',
    '        sys.stderr.write("".join(traceback.format_exception(type(e), e, tb)))',
    '        return 1',
    '    finally:',
    '        sys.stdout.flush()',
    '        sys.stderr.flush()',
    'def __cp_pytest(args, cols):',
    '    os.environ["COLUMNS"] = str(cols)',
    '    import pytest',
    '    try:',
    '        return int(pytest.main(["-p", "no:cacheprovider", "--color=yes", *args]))',
    '    finally:',
    '        sys.stdout.flush()',
    '        sys.stderr.flush()',
  ].join('\n')

  function pyWorkerMain(PYODIDE, SETUP) {
    importScripts(PYODIDE + 'pyodide.js')
    let batch = [], last = 0
    const flush = () => { if (batch.length) postMessage({ t: 'lines', a: batch }); batch = []; last = Date.now() }
    const emit = (cls, s) => { if (batch.length < 80) batch.push([cls, s]); if (Date.now() - last > 40) flush() }
    let py, pytestLoaded = false
    const buf = { out: '', err: '' }, dec = { out: new TextDecoder(), err: new TextDecoder() }
    const writer = (t) => (bytes) => {
      buf[t] += dec[t].decode(bytes, { stream: true })
      let i
      while ((i = buf[t].indexOf('\n')) >= 0) { emit(t, buf[t].slice(0, i)); buf[t] = buf[t].slice(i + 1) }
      return bytes.length
    }
    const ready = (async () => {
      py = await loadPyodide({ indexURL: PYODIDE })
      py.setStdout({ write: writer('out') })
      py.setStderr({ write: writer('err') })
      py.runPython(SETUP)
      postMessage({ t: 'ready', v: py.runPython('import sys; sys.version.split()[0]') })
    })().catch((e) => postMessage({ t: 'loadfail', s: String(e) }))
    onmessage = async (e) => {
      const d = e.data
      await ready
      let code = 0
      py.globals.get('__cp_files')(py.toPy(d.files), d.folder)
      if (d.t === 'pytest') {
        if (!pytestLoaded) { postMessage({ t: 'lines', a: [['sys', 'Loading pytest (first time only)…']] }); await py.loadPackage('pytest', { messageCallback: () => {} }); pytestLoaded = true; postMessage({ t: 'clearsys' }) }
        code = py.globals.get('__cp_pytest')(py.toPy(d.args), d.cols)
      } else code = py.globals.get('__cp_run')(d.file)
      for (const t of ['out', 'err']) if (buf[t]) { emit(t, buf[t]); buf[t] = '' }
      flush()
      postMessage({ t: 'done', code })
    }
  }

  const JS_WORKER = `(${jsWorkerMain.toString()})(${nodeInspect.toString()})`
  const PY_WORKER = `(${pyWorkerMain.toString()})(${JSON.stringify(PYODIDE)}, ${JSON.stringify(PY_SETUP)})`

  // ---------- Python worker (one, kept warm; restarted after Ctrl+C) ----------
  const pyState = { worker: null, ready: false, failed: false, version: '', listeners: new Set() }
  function startPython() {
    pyState.ready = false; pyState.failed = false
    pyState.worker = new Worker(URL.createObjectURL(new Blob([PY_WORKER], { type: 'text/javascript' })))
    pyState.worker.onmessage = (e) => {
      if (e.data.t === 'ready') { pyState.ready = true; pyState.version = e.data.v }
      else if (e.data.t === 'loadfail') pyState.failed = true
      pyState.listeners.forEach((fn) => fn(e.data))
      pads.forEach((p) => p.drawStatus())
    }
    pyState.worker.onerror = () => { if (pyState.ready) return; pyState.failed = true; pyState.listeners.forEach((fn) => fn({ t: 'loadfail' })); pads.forEach((p) => p.drawStatus()) }
    setTimeout(() => { if (!pyState.ready) { pyState.failed = true; pyState.listeners.forEach((fn) => fn({ t: 'loadfail' })); pads.forEach((p) => p.drawStatus()) } }, 45000)
  }

  // Run a job. sink = { lines([[cls, text]]), clearSys(), done(exitCode) }. Returns { stop() }.
  function runJs(job, sink) {
    const w = new Worker(URL.createObjectURL(new Blob([JS_WORKER], { type: 'text/javascript' })))
    let over = false
    const finish = (code, extra) => { if (over) return; over = true; clearTimeout(guard); if (extra) sink.lines(extra); sink.done(code); setTimeout(() => w.terminate(), 1500) }
    const guard = setTimeout(() => { w.terminate(); finish(130, [['err', '^C'], ['sys', 'Stopped after 20 seconds: a loop that never ends? Press Ctrl+C to stop a program.']]) }, 20000)
    w.onmessage = ({ data: d }) => { if (over) return; if (d.t === 'lines') sink.lines(d.a); else if (d.t === 'done') finish(d.code) }
    w.postMessage(job)
    return { stop: () => { if (over) return; w.terminate(); finish(130, [['err', '^C']]) } }
  }

  function runPy(job, sink, recorded) {
    let over = false
    const fn = (d) => {
      if (over) return
      if (d.t === 'lines') sink.lines(d.a)
      else if (d.t === 'clearsys') sink.clearSys()
      else if (d.t === 'done') finish(d.code)
      else if (d.t === 'loadfail') fallback()
    }
    const finish = (code, extra) => { if (over) return; over = true; clearTimeout(guard); pyState.listeners.delete(fn); if (extra) sink.lines(extra); sink.done(code) }
    const fallback = () => {
      if (recorded !== undefined) finish(0, [...recorded.split('\n').map((s) => ['out', s]), ['sys', '(recorded output: Python could not load here. Is the internet on?)']])
      else finish(1, [['sys', 'Python could not load (no internet?). Run it in your own terminal instead.']])
    }
    const restart = () => { pyState.worker.terminate(); startPython() }
    const guard = setTimeout(() => { if (!over) { restart(); finish(130, [['err', '^C'], ['sys', 'Stopped after 20 seconds: a loop that never ends? Press Ctrl+C to stop a program.']]) } }, 20000 + (pyState.ready ? 0 : 30000) + (job.t === 'pytest' ? 15000 : 0))
    if (pyState.failed) { fallback(); return { stop() {} } }
    if (!pyState.ready) sink.lines([['sys', 'Starting Python…']])
    pyState.listeners.add(fn)
    pyState.worker.postMessage(job)
    return { stop: () => { if (over) return; restart(); finish(130, [['err', '^CTraceback (most recent call last):'], ['err', '  …'], ['err', 'KeyboardInterrupt']]) } }
  }
  // ---------- Syntax highlighting ----------
  const words = (s) => new Set(s.split(' '))
  const LANG = {
    js: {
      re: /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|("(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?|`(?:[^`\\]|\\[\s\S])*`?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|([()[\]{}])|([\s\S])/g,
      kw: words('let const var function class new typeof instanceof true false null undefined this in of void delete async await'),
      ctl: words('if else for while do return break continue switch case default try catch finally throw'),
      cls: words('console Math Object JSON Array Number String Boolean Set Map Date Error Promise'),
      defkw: 'function', indent: '  ', opens: /[{[(]\s*$/,
    },
    py: {
      re: /(#[^\n]*)|((?:\b[fFrRbB]{1,2})?(?:"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?))|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)|([()[\]{}])|([\s\S])/g,
      kw: words('def lambda True False None and or not is class global nonlocal'),
      ctl: words('if elif else for in while return break continue pass del import from as try except finally raise with yield'),
      cls: words(''),
      defkw: 'def', indent: '    ', opens: /[:{[(]\s*$/,
    },
  }
  function highlight(src, lang) {
    const L = LANG[lang]
    let html = '', depth = 0, prevWord = '', m
    L.re.lastIndex = 0
    while ((m = L.re.exec(src))) {
      const [tok, com, str, num, word, br] = m
      if (com) html += `<span class="t-com">${esc(com)}</span>`
      else if (str) html += `<span class="t-str">${esc(str)}</span>`
      else if (num) html += `<span class="t-num">${num}</span>`
      else if (word) {
        const after = src.slice(L.re.lastIndex).match(/^\s*(.)/)?.[1]
        const before = src.slice(0, m.index).match(/(\S)\s*$/)?.[1]
        let c = 't-var'
        if (L.kw.has(word)) c = 't-kw'
        else if (L.ctl.has(word)) c = 't-ctl'
        else if (prevWord === L.defkw || after === '(') c = 't-fn'
        else if (before !== '.' && L.cls.has(word)) c = 't-cls'
        html += `<span class="${c}">${word}</span>`
        prevWord = word
        continue
      } else if (br) {
        if ('([{'.includes(br)) html += `<span class="t-b${depth++ % 3}">${br}</span>`
        else { depth = Math.max(depth - 1, 0); html += `<span class="t-b${depth % 3}">${br}</span>` }
      } else html += esc(tok)
      if (!/^\s+$/.test(tok)) prevWord = ''
    }
    return html
  }


  // ---------- Monaco (loaded once, from the CDN) ----------
  let monacoPromise = null
  function loadMonaco() {
    if (monacoPromise) return monacoPromise
    monacoPromise = new Promise((resolve) => {
      const give = (m) => { clearTimeout(timer); resolve(m) }
      const timer = setTimeout(() => give(null), 20000)
      window.MonacoEnvironment = { getWorkerUrl: () => URL.createObjectURL(new Blob([`self.MonacoEnvironment={baseUrl:'${MONACO}'};importScripts('${MONACO}vs/base/worker/workerMain.js');`], { type: 'text/javascript' })) }
      const s = document.createElement('script')
      s.src = MONACO + 'vs/loader.js'
      s.onerror = () => give(null)
      s.onload = () => {
        window.require.config({ paths: { vs: MONACO + 'vs' } })
        window.require(['vs/editor/editor.main'], async () => {
          const m = window.monaco
          m.editor.defineTheme('cp-dark', { base: 'vs-dark', inherit: true, rules: [], colors: {
            'editor.background': '#1f1f1f', 'editor.lineHighlightBackground': '#2a2d2e', 'editor.lineHighlightBorder': '#2a2d2e',
            'editorLineNumber.foreground': '#6e7681', 'editorLineNumber.activeForeground': '#cccccc' } })
          m.languages.typescript.javascriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false })
          try { await document.fonts.load('18px "JetBrains Mono"') } catch {}
          m.editor.remeasureFonts()
          give(m)
        }, () => give(null))
      }
      document.head.append(s)
    })
    return monacoPromise
  }

  // ---------- Two editor kinds with one small API ----------
  function monacoEditor(m, host, file, text, uri, hooks) {
    const model = m.editor.createModel(text, file.endsWith('.py') ? 'python' : file.endsWith('.json') ? 'json' : /^Dockerfile/.test(file) ? 'dockerfile' : 'javascript', m.Uri.parse(uri))
    model.updateOptions({ tabSize: langOf(file) === 'py' ? 4 : 2, indentSize: langOf(file) === 'py' ? 4 : 2, insertSpaces: true })
    const ed = m.editor.create(host, {
      model, theme: 'cp-dark', automaticLayout: true, minimap: { enabled: false }, scrollBeyondLastLine: false,
      fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontLigatures: false, fontSize: 18, lineHeight: 26,
      tabSize: langOf(file) === 'py' ? 4 : 2, insertSpaces: true, detectIndentation: false, renderWhitespace: 'none',
      padding: { top: 6, bottom: 6 }, overviewRulerLanes: 0, hideCursorInOverviewRuler: true,
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, alwaysConsumeMouseWheel: false },
      bracketPairColorization: { enabled: true }, guides: { bracketPairs: false, indentation: true },
      'semanticHighlighting.enabled': true, stickyScroll: { enabled: false }, contextmenu: true,
      // Type-what-you-see: typing a block from the presenter notes comes out exactly as written
      autoIndent: 'none', autoClosingBrackets: 'never', autoClosingQuotes: 'never', autoClosingDelete: 'never',
      autoClosingOvertype: 'never', autoSurround: 'never', formatOnType: false, formatOnPaste: false,
      acceptSuggestionOnEnter: 'off', tabCompletion: 'off',
    })
    ed.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyS, () => hooks.save())
    ed.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.Enter, () => hooks.run())
    ed.addCommand(m.KeyCode.Escape, () => document.activeElement?.blur(), '!suggestWidgetVisible && !findWidgetVisible && !parameterHintsVisible')
    model.onDidChangeContent(() => hooks.change())
    ed.onDidChangeCursorPosition(() => hooks.cursor())
    ed.onDidFocusEditorText(() => hooks.focus(true))
    ed.onDidBlurEditorText(() => hooks.focus(false))
    let deco = null
    return {
      kind: 'monaco',
      get value() { return model.getValue() },
      set value(v) { if (model.getValue() !== v) model.setValue(v) },
      append(s) {
        const end = model.getFullModelRange().getEndPosition()
        model.pushEditOperations([], [{ range: new m.Range(end.lineNumber, end.column, end.lineNumber, end.column), text: s }], () => null)
        const e2 = model.getFullModelRange().getEndPosition()
        ed.setPosition(e2); ed.revealLine(e2.lineNumber)
      },
      flash(lines) {
        deco?.clear()
        deco = ed.createDecorationsCollection(lines.map((l) => ({ range: new m.Range(l, 1, l, 1), options: { isWholeLine: true, className: 'ln-flash-m' } })))
        if (lines.length) ed.revealLineInCenterIfOutsideViewport(lines[0])
        if (ed.getContentHeight() <= ed.getLayoutInfo().height) ed.setScrollTop(0)
        setTimeout(() => deco?.clear(), 3000)
      },
      focus() { ed.focus() },
      get focused() { return ed.hasTextFocus() },
      line() { return ed.getPosition()?.lineNumber || 1 },
      col() { return ed.getPosition()?.column || 1 },
      setFont(size, lh) { ed.updateOptions({ fontSize: size, lineHeight: lh }) },
      top() { ed.setScrollTop(0) },
    }
  }

  function simpleEditor(host, file, text, hooks) {
    const lang = langOf(file), L = LANG[lang]
    host.innerHTML = '<div class="vs-gutter"></div><div class="vs-wrap"><pre class="vs-hl"></pre><textarea class="vs-ta" spellcheck="false" autocapitalize="off" autocomplete="off"></textarea></div>'
    host.classList.add('simple')
    const ta = host.querySelector('.vs-ta'), hl = host.querySelector('.vs-hl'), gutter = host.querySelector('.vs-gutter')
    let flashSet = null, caret = false
    ta.value = text
    const curLine = () => ta.value.slice(0, ta.selectionStart).split('\n').length
    function render() {
      let h = highlight(ta.value, lang)
      if (flashSet) h = h.split('\n').map((l, k) => (flashSet.has(k + 1) ? `<span class="ln-flash">${l || ' '}</span>` : l)).join('\n')
      if (caret) h += '<span class="vs-caret"></span>'
      hl.innerHTML = h + '\n'
      const n = ta.value.replace(/\n$/, '').split('\n').length
      const cur = document.activeElement === ta ? curLine() : -1
      gutter.innerHTML = Array.from({ length: Math.max(n, 1) }, (_, k) => `<div${k + 1 === cur ? ' class="on"' : ''}>${k + 1}</div>`).join('')
    }
    const follow = (line) => {
      const lh = parseFloat(getComputedStyle(host).getPropertyValue('--vs-lh')) || 26
      const top = (line - 1) * lh
      if (top + 2 * lh > host.scrollTop + host.clientHeight) host.scrollTop = top + 2 * lh - host.clientHeight
      else if (top < host.scrollTop) host.scrollTop = Math.max(0, top - lh)
    }
    ta.addEventListener('input', () => { render(); follow(curLine()); hooks.change() })
    ta.addEventListener('keyup', () => { render(); hooks.cursor() })
    ta.addEventListener('click', () => { render(); hooks.cursor() })
    ta.addEventListener('focus', () => { render(); hooks.focus(true) })
    ta.addEventListener('blur', () => { render(); hooks.focus(false) })
    ta.addEventListener('keydown', (k) => {
      if (k.key === 'Escape') { ta.blur(); return }
      if ((k.ctrlKey || k.metaKey) && k.key.toLowerCase() === 's') { k.preventDefault(); hooks.save(); return }
      if (k.key === 'Enter' && (k.ctrlKey || k.metaKey)) { k.preventDefault(); hooks.run(); return }
      if (k.key === 'Tab') { k.preventDefault(); document.execCommand('insertText', false, L.indent); return }
      if (k.key === 'Enter') {
        k.preventDefault()
        const cur = ta.value.slice(0, ta.selectionStart).split('\n').pop()
        let ind = cur.match(/^\s*/)[0]
        if (L.opens.test(cur)) ind += L.indent
        document.execCommand('insertText', false, '\n' + ind)
      }
    })
    render()
    return {
      kind: 'simple',
      get value() { return ta.value },
      set value(v) { ta.value = v; render() },
      append(s) { ta.value += s; caret = true; render(); follow(ta.value.split('\n').length); clearTimeout(this._c); this._c = setTimeout(() => { caret = false; render() }, 400) },
      flash(lines) { flashSet = new Set(lines); render(); if (lines.length) follow(lines[0]); setTimeout(() => { flashSet = null; render() }, 3000) },
      focus() { ta.focus() },
      get focused() { return document.activeElement === ta },
      line: curLine,
      col() { return ta.selectionStart - ta.value.lastIndexOf('\n', ta.selectionStart - 1) },
      setFont(size, lh) { host.style.setProperty('--vs-font', size + 'px'); host.style.setProperty('--vs-lh', lh + 'px') },
      top() { host.scrollTop = 0 },
    }
  }

  // ---------- A terminal you can type in ----------
  // Colors: programs print ANSI escape codes (pytest --color=yes, our Jest runner); turn them into spans.
  const ANSI = { 30: '#7f7f7f', 31: '#f14c4c', 32: '#23d18b', 33: '#f5f543', 34: '#3b8eea', 35: '#d670d6', 36: '#29b8db', 37: '#e5e5e5',
    90: '#8b949e', 91: '#f14c4c', 92: '#23d18b', 93: '#f5f543', 94: '#3b8eea', 95: '#d670d6', 96: '#29b8db', 97: '#ffffff' }
  function ansiInto(el, text) {
    text = text.replace(/\x1b\[[0-9;?]*[A-Za-ln-z]/g, '')
    const st = { fg: null, bold: false, dim: false, inv: false }
    const parts = text.split(/\x1b\[([0-9;]*)m/)
    for (let k = 0; k < parts.length; k++) {
      if (k % 2) {
        for (const c of (parts[k] || '0').split(';').map(Number)) {
          if (c === 0) Object.assign(st, { fg: null, bold: false, dim: false, inv: false })
          else if (c === 1) st.bold = true
          else if (c === 2) st.dim = true
          else if (c === 22) { st.bold = false; st.dim = false }
          else if (c === 7) st.inv = true
          else if (c === 27) st.inv = false
          else if (c === 39) st.fg = null
          else if (ANSI[c]) st.fg = ANSI[c]
        }
        continue
      }
      if (!parts[k]) continue
      const s = document.createElement('span')
      s.textContent = parts[k]
      if (st.inv) { s.style.background = st.fg || '#e5e5e5'; s.style.color = '#181818' } else if (st.fg) s.style.color = st.fg
      if (st.bold) s.style.fontWeight = '700'
      if (st.dim && !st.inv) s.style.opacity = '.62'
      el.append(s)
    }
  }

  function makeShell(term, pad) {
    term.innerHTML = '<div class="tout"></div><div class="tprompt"><span class="ps">$&nbsp;</span><input class="tin" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="terminal"></div>'
    term.tabIndex = -1
    const outEl = term.querySelector('.tout'), promptEl = term.querySelector('.tprompt'), input = term.querySelector('.tin')
    const history = []
    let hIdx = 0, running = null, typing = false, lastExit = 0
    const print = (cls, text) => {
      const d = document.createElement('div'); d.className = cls
      if (text.includes('\x1b')) ansiInto(d, text); else d.textContent = text
      outEl.append(d)
      while (outEl.childElementCount > KEEP_LINES) outEl.firstChild.remove()
    }
    const scroll = () => { term.scrollTop = term.scrollHeight }
    const cols = () => { // how many characters fit on one terminal line (hidden slide: assume 100)
      if (term.clientWidth < 200) return 100
      const probe = document.createElement('span'); probe.textContent = 'M'.repeat(50); probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre'
      outEl.append(probe); const cw = probe.getBoundingClientRect().width / 50 / (term.getBoundingClientRect().width / term.clientWidth || 1); probe.remove()
      const cs = getComputedStyle(term), inner = term.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      return Math.max(40, Math.floor(inner / cw) - 1)
    }
    const sys = (s) => print('sys', s)

    function runJob(kind, job, recorded) {
      promptEl.style.display = 'none'
      term.focus({ preventScroll: true })
      return new Promise((resolve) => {
        const sink = {
          lines(a) { a.forEach(([c, s]) => print(c, s)); scroll() },
          clearSys() { [...outEl.querySelectorAll('.sys')].pop()?.remove() },
          done(code) { running = null; lastExit = code; resolve() },
        }
        running = kind === 'py' ? runPy(job, sink, recorded) : runJs(job, sink)
      }).then(() => {
        promptEl.style.display = ''
        scroll()
        if (term.contains(document.activeElement)) input.focus({ preventScroll: true })
      })
    }

    // ---- docker: a practice Docker. build = read the Dockerfile and SNAPSHOT the copied files; run = run CMD on that snapshot
    // in a fresh WORKDIR. Edit a file without rebuilding and run shows the OLD result, like real Docker. Messages copied from real Docker.
    async function docker(args) {
      const images = (window.__cpImages ||= {})
      const D = '\x1b[2m', R = '\x1b[22m'
      const sub = args[0]
      if (sub === 'build') {
        let tag = null, file = 'Dockerfile'
        for (let k = 1; k < args.length; k++) { if (args[k] === '-t') tag = args[++k]; else if (args[k] === '-f') file = args[++k] }
        const text = pad.fsRead(file)
        if (!text) { print('err', `ERROR: failed to build: failed to solve: failed to read dockerfile: open ${file}: no such file or directory`); lastExit = 1; return }
        const img = { base: null, workdir: '/', files: {}, cmd: null, pytest: false }
        const steps = []
        for (const l of text.split('\n').map((x) => x.trim()).filter((x) => x && !x.startsWith('#'))) {
          const [ins, ...rest] = l.split(/\s+/), arg = rest.join(' '), I = ins.toUpperCase()
          if (I === 'FROM') { img.base = arg; steps.push(`FROM docker.io/library/${arg}`) }
          else if (I === 'WORKDIR') { img.workdir = arg; steps.push(`WORKDIR ${arg}`) }
          else if (I === 'COPY') {
            const [src] = rest, all = pad.fsAll()
            if (src === '.') Object.assign(img.files, all)
            else if (all[src] !== undefined) img.files[src] = all[src]
            else { print('err', `ERROR: failed to build: failed to solve: failed to compute cache key: "/${src}": not found`); lastExit = 1; return }
            steps.push(`COPY ${arg}`)
          } else if (I === 'RUN') { if (/pip3? install .*\bpytest\b/.test(arg)) img.pytest = true; steps.push(`RUN ${arg}`) }
          else if (I === 'CMD') { try { img.cmd = JSON.parse(arg) } catch { img.cmd = arg.split(/\s+/) } }
        }
        if (!/^(node|python)/.test(img.base || '')) { sys('(This practice terminal can build node:… and python:… images.)'); lastExit = 1; return }
        const prev = tag && images[tag]
        const same = prev && JSON.stringify(prev.files) === JSON.stringify(img.files) && prev.base === img.base
        const n = steps.length
        print('out', '')
        print('out', `[+] Building 0.4s (${n + 5}/${n + 5}) FINISHED`)
        steps.forEach((st, k) => {
          const cached = k > 0 && (st.startsWith('WORKDIR') || (same && !st.startsWith('FROM')))
          print('out', `${D} => ${cached ? 'CACHED ' : ''}[${k + 1}/${n}] ${st}${R}`)
        })
        if (tag) print('out', `${D} => => naming to docker.io/library/${tag}${R}`)
        if (!window.__cpDockerNoted) { window.__cpDockerNoted = true; sys('(Practice Docker in the slides: a real terminal prints more build lines, and pip prints its install the first time.)') }
        if (tag) images[tag] = img
        lastExit = 0
        return
      }
      if (sub === 'run') {
        let k = 1
        while (k < args.length && args[k].startsWith('-')) k++
        const name = args[k], rest = args.slice(k + 1)
        if (!name) { print('err', '"docker run" requires at least 1 argument.'); lastExit = 1; return }
        const img = images[name] || images[name.replace(/:latest$/, '')]
        if (!img) {
          ;[`Unable to find image '${name.includes(':') ? name : name + ':latest'}' locally`,
            `docker: Error response from daemon: pull access denied for ${name.split(':')[0]}, repository does not exist or may require 'docker login': denied: requested access to the resource is denied`,
            '', "Run 'docker run --help' for more information"].forEach((l) => print('err', l))
          lastExit = 125; return
        }
        const argv = rest.length ? rest : img.cmd || []
        const [prog, ...pargs] = argv
        const root = img.workdir.replace(/\/$/, '') || '/'
        const notFound = () => { print('err', `docker: Error response from daemon: failed to create task for container: failed to create shim task: OCI runtime create failed: runc create failed: unable to start container process: error during container init: exec: "${prog}": executable file not found in $PATH: unknown`); lastExit = 127 }
        if (prog === 'pytest' || prog === 'py.test') {
          if (!img.pytest) return notFound()
          return runJob('py', { t: 'pytest', files: img.files, folder: root, args: pargs, cols: cols() })
        }
        if (prog === 'python3' || prog === 'python') {
          const file = pargs.find((a) => !a.startsWith('-'))
          if (!file) { sys('(This practice terminal can run: pytest, or python3 <file>, inside the image.)'); lastExit = 1; return }
          if (img.files[file] === undefined) { print('err', `${prog}: can't open file '${root}/${file}': [Errno 2] No such file or directory`); lastExit = 2; return }
          return runJob('py', { t: 'run', files: img.files, folder: root, file })
        }
        if (!prog) { sys('(This image has no CMD. Add a command after the image name.)'); lastExit = 1; return }
        if (!['node', 'npm', 'pytest', 'python3', 'python'].includes(prog)) return notFound()
        sys('(This practice terminal can run: pytest, or python3 <file>, inside the image.)'); lastExit = 1
        return
      }
      if (sub === 'images') { print('out', 'IMAGE'); Object.keys(images).forEach((n) => print('out', `${n}:latest`)); lastExit = 0; return }
      sys('(This practice terminal knows: docker build -t <name> .  ·  docker run --rm <name>)'); lastExit = 1
    }

    function npmTest(extra) {
      const text = pad.fsRead('package.json')
      if (!text) { // an empty, never-saved package.json = the file doesn't exist yet
        ;['npm error code ENOENT', 'npm error syscall open', `npm error path /home/student/${pad.folder}/package.json`, 'npm error errno -2',
          `npm error enoent Could not read package.json: Error: ENOENT: no such file or directory, open '/home/student/${pad.folder}/package.json'`,
          'npm error enoent This is related to npm not being able to find a file.'].forEach((l) => print('err', l))
        lastExit = 254; return
      }
      let pkg
      try { pkg = JSON.parse(text) } catch (e) { print('err', 'npm error code EJSONPARSE'); print('err', `npm error JSON.parse Invalid package.json: ${e.message}`); lastExit = 1; return }
      const script = pkg.scripts && pkg.scripts.test
      if (!script) { ;['npm error Missing script: "test"', 'npm error', 'npm error To see a list of scripts, run:', 'npm error   npm run'].forEach((l) => print('err', l)); lastExit = 1; return }
      ;['', `> ${pkg.name}@${pkg.version} test`, `> ${script}${extra.length ? ' ' + extra.join(' ') : ''}`, ''].forEach((l) => print('out', l))
      if (/^jest(\s|$)/.test(script)) {
        const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
        if (!deps.jest) { print('err', 'sh: jest: command not found'); lastExit = 127; return }
        return runJest([...script.split(/\s+/).slice(1), ...extra])
      }
      if (/Error: no test specified/.test(script)) { print('out', 'Error: no test specified'); lastExit = 1; return }
      sys('(This practice terminal can only run "jest" as the test script.)'); lastExit = 1
    }
    const runJest = (args) => runJob('js', { t: 'jest', files: pad.fsAll(), folder: pad.folder, filter: args.find((a) => !a.startsWith('-')) || '' })

    function npmInit() {
      const old = pad.fsRead('package.json')
      const text = old || JSON.stringify({ name: pad.folder, version: '1.0.0', description: '', main: 'index.js',
        scripts: { test: 'echo "Error: no test specified" && exit 1' }, keywords: [], author: '', license: 'ISC', type: 'commonjs' }, null, 2) + '\n'
      pad.fsWrite('package.json', text)
      print('out', `Wrote to /home/student/${pad.folder}/package.json:`); print('out', '')
      text.replace(/\n$/, '').split('\n').forEach((l) => print('out', l)); print('out', ''); print('out', '')
      lastExit = 0
    }
    function npmInstall(args) {
      const pkgs = args.filter((a) => !a.startsWith('-'))
      const text = pad.fsRead('package.json')
      if (pkgs.includes('jest') && text) {
        try {
          const pkg = JSON.parse(text), key = args.some((a) => a === '--save-dev' || a === '-D') ? 'devDependencies' : 'dependencies'
          pkg[key] = { ...(pkg[key] || {}), jest: '^30.5.2' }
          pad.fsWrite('package.json', JSON.stringify(pkg, null, 2) + '\n')
        } catch {}
      }
      sys(pkgs.length ? `(Practice terminal: ${pkgs.join(', ')} is built in here, so nothing downloads. In your own terminal this installs it into node_modules/.)` : '(Practice terminal: nothing to download here. In your own terminal this installs everything in package.json.)')
      lastExit = 0
    }

    const shell = {
      print, lines: () => [...outEl.children].map((d) => d.textContent),
      clear() { outEl.innerHTML = '' },
      get busy() { return !!running || typing },
      get exitCode() { return lastExit },
      cols,
      async exec(line) {
        line = line.trim()
        input.value = ''
        print('cmd', line)
        if (line) { history.push(line); hIdx = history.length }
        const [cmd, ...args] = line.split(/\s+/).filter(Boolean)
        const file = args.find((a) => !a.startsWith('-'))
        const isPy = ['python3', 'python', 'py'].includes(cmd)
        const done = (code = 0) => { lastExit = code; scroll() }
        if (!cmd) return scroll()
        if (cmd === 'clear') { shell.clear(); return done() }
        if (cmd === 'ls') { print('out', pad.files().join('  ')); return done() }
        if (cmd === 'pwd') { print('out', `/home/student/${pad.folder}`); return done() }
        if (cmd === 'echo') { const s = args.join(' '); print('out', s === '$?' ? String(lastExit) : s.replace(/^["']|["']$/g, '')); return done() }
        if (cmd === 'cat') { const t = pad.fsRead(file); if (t === undefined) { print('err', `cat: ${file}: No such file or directory`); return done(1) } t.replace(/\n$/, '').split('\n').forEach((l) => print('out', l)); return done() }
        if (['cd', 'mkdir', 'code', 'touch'].includes(cmd)) { sys(`(This practice terminal stays in ${pad.folder}/. Create files in the editor.)`); return done() }
        if (cmd === 'docker') { await docker(args); return scroll() }
        if (cmd === 'pip' || cmd === 'pip3' || (isPy && args[0] === '-m' && args[1] === 'pip')) { sys('(Practice terminal: pytest is already installed here. In your own terminal this downloads and installs it.)'); return done() }
        if (cmd === 'pytest' || cmd === 'py.test' || (isPy && args[0] === '-m' && args[1] === 'pytest')) {
          const pargs = cmd === 'pytest' || cmd === 'py.test' ? args : args.slice(2)
          return runJob('py', { t: 'pytest', files: pad.fsAll(), folder: pad.folder, args: pargs, cols: cols() })
        }
        if (cmd === 'npm') {
          const sub = args[0]
          if (sub === 'init') { npmInit(); return done(lastExit) }
          if (['install', 'i', 'add'].includes(sub)) { npmInstall(args.slice(1)); return done() }
          if (sub === 'test' || sub === 't' || (sub === 'run' && args[1] === 'test')) {
            const dd = args.indexOf('--')
            await npmTest(dd >= 0 ? args.slice(dd + 1) : [])
            return scroll()
          }
          sys('(This practice terminal knows: npm init -y · npm install · npm test)'); return done(1)
        }
        if (cmd === 'npx' && args[0] === 'jest') { await runJest(args.slice(1)); return scroll() }
        const isNode = cmd === 'node'
        if (!isNode && !isPy) { print('err', `bash: ${cmd}: command not found`); return done(127) }
        if (args.includes('--version') || args.includes('-V') || args.includes('-v')) {
          if (isPy && pyState.ready) print('out', `Python ${pyState.version}`)
          else sys(isPy ? 'Python is still loading…' : 'This terminal runs JavaScript inside your browser. Check your real Node version in your own terminal.')
          return done()
        }
        if (!file) { sys(`Interactive ${isNode ? 'Node' : 'Python'} isn't available here. Run a file: ${cmd} <file>`); return done() }
        const code = pad.fsRead(file)
        if (code === undefined) {
          if (isNode) { ;['node:internal/modules/cjs/loader:1228', '  throw err;', '  ^', '', `Error: Cannot find module '/home/student/${pad.folder}/${file}'`].forEach((l) => print('err', l)); return done(1) }
          print('err', `${cmd}: can't open file '/home/student/${pad.folder}/${file}': [Errno 2] No such file or directory`); return done(2)
        }
        if (isNode) return runJob('js', { t: 'node', files: pad.fsAll(), folder: pad.folder, entry: file })
        return runJob('py', { t: 'run', files: pad.fsAll(), folder: pad.folder, file }, pad.recorded(file, code))
      },
      async typeAndRun(line) {
        if (running || typing) return
        typing = true
        input.value = ''
        for (const ch of line) { input.value += ch; await sleep(18) }
        await sleep(120)
        typing = false
        await shell.exec(line)
      },
      stop() { if (running) running.stop() },
      focus() { input.focus({ preventScroll: true }) },
    }
    term.addEventListener('click', () => { if (!running && !window.getSelection()?.toString()) input.focus({ preventScroll: true }) })
    term.addEventListener('keydown', (k) => {
      if (k.ctrlKey && (k.key === 'c' || k.key === 'C') && (running || !input.value || window.getSelection()?.toString() === '')) {
        if (running) { k.preventDefault(); running.stop(); return }
        if (document.activeElement === input) { k.preventDefault(); print('cmd', input.value + '^C'); input.value = ''; lastExit = 130; scroll(); return }
      }
      if (k.ctrlKey && (k.key === 'l' || k.key === 'L')) { k.preventDefault(); shell.clear() }
      k.stopPropagation() // keys typed in the terminal never change slides
    })
    input.addEventListener('keydown', (k) => {
      if (k.key === 'Enter') { k.preventDefault(); shell.exec(input.value) }
      else if (k.key === 'ArrowUp') { k.preventDefault(); if (hIdx > 0) input.value = history[--hIdx] }
      else if (k.key === 'ArrowDown') { k.preventDefault(); hIdx = Math.min(hIdx + 1, history.length); input.value = history[hIdx] || '' }
      else if (k.key === 'Tab') {
        k.preventDefault()
        const parts = input.value.split(' '), last = parts.pop()
        const hits = pad.files().filter((f) => f.startsWith(last))
        if (hits.length === 1) input.value = [...parts, hits[0]].join(' ') + ' '
        else if (hits.length > 1) {
          let common = hits[0]
          for (const h of hits) while (!h.startsWith(common)) common = common.slice(0, -1)
          if (common.length > last.length) input.value = [...parts, common].join(' ')
          else { print('cmd', input.value); print('out', hits.join('  ')); scroll() }
        }
      } else if (k.key === 'Escape') input.blur()
    })
    return shell
  }

  // What a prepared step does to a file's text
  function applyStep(text, st) {
    if (st.mode === 'set') return st.text
    if (st.mode === 'replace') return text.includes(st.find) ? text.replace(st.find, st.text.replace(/\n$/, '')) : text
    const b = text.replace(/\n*$/, '')
    return (b ? b + '\n\n' : '') + st.text
  }

  // ---------- Building one pad ----------
  const pads = []
  const filesByFolder = {} // every file in each folder so far, in deck order (for the explorer)
  document.querySelectorAll('.vscode').forEach((root, k) => {
    const list = (filesByFolder[root.dataset.folder || 'project'] ||= [])
    root.querySelectorAll('script[data-file]').forEach((s) => { if (!list.includes(s.dataset.file)) list.push(s.dataset.file) })
    pads.push(makePad(root, [...list], k))
  })

  function makePad(root, filesSoFar, padIndex) {
    const scripts = [...root.querySelectorAll('script[type="text/plain"][data-file]')]
    const clean = (s) => s.textContent.replace(/^\n/, '').replace(/\s+$/, '') + '\n'
    const allNames = [...new Set(scripts.map((s) => s.dataset.file))]
    const hidden = new Set(scripts.filter((s) => s.hasAttribute('data-hidden')).map((s) => s.dataset.file))
    const names = allNames.filter((n) => !hidden.has(n)) // files with an editor pane
    const oneTerminal = root.dataset.terminal === 'one'
    const steps = scripts.filter((s) => s.hasAttribute('data-step')).map((s) => ({ file: s.dataset.file, text: clean(s), mode: s.dataset.mode || 'append', find: s.dataset.find }))
    // mode 'set' = replace the whole file · 'replace' = change the text in data-find to this step's text
    const start = {}, expect = {}
    allNames.forEach((n) => { start[n] = '' })
    scripts.filter((s) => s.hasAttribute('data-start')).forEach((s) => (start[s.dataset.file] = clean(s)))
    scripts.filter((s) => s.hasAttribute('data-expect')).forEach((s) => (expect[s.dataset.file] = s.textContent.replace(/^\n/, '').replace(/\n$/, '')))
    scripts.forEach((s) => s.remove())
    const folder = root.dataset.folder || 'project'
    const extra = (root.dataset.extraFiles || '').split(' ').filter(Boolean)
    const explorerFiles = [...filesSoFar.filter((f) => !allNames.includes(f)), ...extra, ...allNames]
      .filter((f, k, a) => a.indexOf(f) === k).sort((a, b) => a.localeCompare(b))
    const fileIcon = (f) => f.endsWith('.py') ? '<span class="ficon py">py</span>' : f.endsWith('.js') ? '<span class="ficon js">JS</span>' : '<span class="ficon">≡</span>'

    root.innerHTML = `
      <div class="vs-title"><div class="dots"><i></i><i></i><i></i></div><div class="name">${esc(folder)} · Visual Studio Code</div></div>
      <div class="vs-main">
        <div class="vs-act">
          <svg class="on" viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/></svg>
          <svg viewBox="0 0 24 24"><circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="8" r="2.5"/><path d="M6 8.5v7M18 10.5c0 4-6 3-11 6"/></svg>
          <svg viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><path d="M15 4h5v5"/></svg>
        </div>
        <div class="vs-exp"><div class="h">EXPLORER</div><div class="folder">⌄ ${esc(folder.toUpperCase())}</div>
          ${explorerFiles.map((f) => `<div class="f${names.includes(f) ? ' cur' : ''}" data-f="${esc(f)}">${fileIcon(f)}${esc(f)}</div>`).join('')}</div>
        <div class="vs-groups"><div class="vs-peek" hidden><div class="vs-tabs"><div class="vs-tab"><span class="pk-icon"></span><span class="pk-name"></span><span class="pk-ro">read-only</span><button type="button" class="pk-x" title="Close (Esc)">×</button></div></div>
            <div class="vs-crumb"></div><pre class="pk-code"></pre></div>${names.map((n) => `
          <div class="vs-group" data-f="${esc(n)}">
            <div class="vs-tabs"><div class="vs-tab">${fileIcon(n)}${esc(n)}<span class="x" title="● = not saved yet (Ctrl+S)">×</span></div>
              <button type="button" class="vs-run" title="Save and run this file in its terminal (Ctrl+Enter)"><svg viewBox="0 0 10 10"><path d="M2 1l7 4-7 4z"/></svg>Run</button></div>
            <div class="vs-crumb">${esc(folder)} › ${esc(n)}</div>
            <div class="vs-code"></div>
          </div>`).join('')}</div>
      </div>
      <div class="vs-panel">
        <div class="vs-ptabs"><span>PROBLEMS</span><span>OUTPUT</span><span>DEBUG CONSOLE</span><span class="on">TERMINAL</span><span class="note"></span></div>
        <div class="vs-terms">${(oneTerminal ? ['*'] : names).map((n) => `<div class="vs-term" data-f="${esc(n)}"></div>`).join('')}</div>
      </div>
      <div class="vs-status"><span class="hint"></span><span class="stepinfo"></span>
        <div class="r"><span class="pos"></span><span class="lang"></span><span class="pystat"></span>
          <button type="button" class="b-next" title="Type the next prepared chunk (N)">Type next ▸</button>
          <button type="button" class="b-runall" title="Run every file in its terminal (R)">Run ▸</button>
          <button type="button" class="b-all" title="Show the finished code">All</button>
          <button type="button" class="b-reset" title="Back to the start of this slide">Reset</button></div></div>`

    const $ = (s) => root.querySelector(s)
    const ed = {}
    let stepIdx = 0, typing = null, focused = null, built = null, touched = false
    const saved = { ...start }
    const pad = {}

    const shared = oneTerminal ? makeShell(root.querySelector('.vs-term'), pad) : null
    names.forEach((n) => {
      const g = root.querySelector(`.vs-group[data-f="${CSS.escape(n)}"]`)
      ed[n] = { name: n, lang: langOf(n), g, host: g.querySelector('.vs-code'), tab: g.querySelector('.vs-tab .x'), editor: null,
                shell: shared || makeShell(root.querySelector(`.vs-term[data-f="${CSS.escape(n)}"]`), pad) }
    })

    // Click a file in the explorer: files with a pane get focus; the rest (Dockerfiles, earlier slides' files) open read-only
    const peek = root.querySelector('.vs-peek')
    const peekHtml = (f, t) => {
      if (/\.(js|py)$/.test(f)) return highlight(t, langOf(f))
      if (/^Dockerfile/.test(f)) return t.split('\n').map((l) => {
        if (/^\s*#/.test(l)) return `<span class="t-com">${esc(l)}</span>`
        const m = l.match(/^(\s*)([A-Z]+)\b(.*)$/)
        const rest = esc(m ? m[3] : l).replace(/"([^"]*)"/g, '<span class="t-str">"$1"</span>')
        return m ? `${m[1]}<span class="t-kw">${m[2]}</span>${rest}` : rest
      }).join('\n')
      return esc(t)
    }
    const closePeek = () => { peek.hidden = true; root.querySelectorAll('.vs-exp .f.peeked').forEach((x) => x.classList.remove('peeked')) }
    function openPeek(f) {
      const t = pad.fsRead(f)
      if (t === undefined) return
      peek.querySelector('.pk-icon').outerHTML = '<span class="pk-icon">' + fileIcon(f) + '</span>'
      peek.querySelector('.pk-name').textContent = f
      peek.querySelector('.vs-crumb').textContent = `${folder} › ${f}`
      peek.querySelector('.pk-code').innerHTML = t ? peekHtml(f, t.replace(/\n$/, '')) : '<span class="t-com">(empty file)</span>'
      closePeek(); peek.hidden = false
      root.querySelector(`.vs-exp .f[data-f="${CSS.escape(f)}"]`)?.classList.add('peeked')
    }
    root.querySelector('.vs-exp').addEventListener('click', (ev) => {
      const el = ev.target.closest('.f'); if (!el) return
      const f = el.dataset.f
      if (names.includes(f)) { closePeek(); build().then(() => ed[f].editor?.focus?.()); return }
      if (!peek.hidden && el.classList.contains('peeked')) closePeek(); else openPeek(f)
    })
    peek.querySelector('.pk-x').addEventListener('click', closePeek)

    const valueOf = (n) => (ed[n] && ed[n].editor ? ed[n].editor.value : saved[n] !== undefined ? saved[n] : start[n])
    const markDirty = () => names.forEach((n) => { const d = valueOf(n) !== saved[n]; ed[n].tab.textContent = d ? '●' : '×'; ed[n].tab.classList.toggle('dirty', d) })
    const save = (n) => { saved[n] = valueOf(n); touched = true; markDirty() }

    function build() {
      if (built) return built
      built = (async () => {
        fit()
        const m = await loadMonaco()
        names.forEach((n) => {
          const e = ed[n]
          const hooks = { save: () => save(n), run: () => { save(n); e.shell.typeAndRun(runCmd(n)) }, change: () => { touched = true; markDirty() }, cursor: drawStatus, focus: (on) => { if (on) focused = e; else if (focused === e) focused = null; drawStatus() } }
          e.editor = m ? monacoEditor(m, e.host, n, start[n], `file:///pad${padIndex}/${folder}/${n}`, hooks) : simpleEditor(e.host, n, start[n], hooks)
          if (fitted) e.editor.setFont(fitted.font, fitted.lh)
        })
        root.classList.add(m ? 'monaco' : 'simple')
        drawStatus()
      })()
      return built
    }

    const runCmd = (n) => (/^test_.*\.py$|_test\.py$/.test(n) ? `pytest ${n}` : /\.(spec|test)\.js$/.test(n) ? 'npm test' : n.endsWith('.json') ? `cat ${n}` : langOf(n) === 'py' ? `python3 ${n}` : `node ${n}`)
    const runList = (root.dataset.run || '').split('|').map((c) => c.trim()).filter(Boolean)

    function drawStatus() {
      const busy = !built
      $('.hint').textContent = focused ? `Editing ${focused.name} · Ctrl+S save · Ctrl+Enter run · Esc leave` : busy ? 'Loading the editor…' : 'N type next · R run · click the code or the terminal to type'
      $('.stepinfo').textContent = steps.length ? `Step ${Math.min(stepIdx, steps.length)} of ${steps.length}` : ''
      const e = focused || ed[steps[Math.max(0, Math.min(stepIdx - 1, steps.length - 1))]?.file] || ed[names[0]]
      $('.pos').textContent = focused?.editor ? `Ln ${focused.editor.line()}, Col ${focused.editor.col()}` : ''
      $('.lang').textContent = e?.lang === 'py' ? 'Python' : 'JavaScript'
      const py = $('.pystat'), hasPy = names.some((n) => langOf(n) === 'py')
      py.className = 'pystat ' + (pyState.ready ? 'ready' : pyState.failed ? 'off' : 'loading')
      py.textContent = !hasPy ? '' : pyState.ready ? `Python ${pyState.version}` : pyState.failed ? 'Python offline: recorded output' : 'Python loading…'
      $('.vs-ptabs .note').textContent = names.length > 1 && !oneTerminal ? 'split terminal: one per file' : ''
      $('.b-next').disabled = stepIdx >= steps.length && !typing
      broadcast()
    }

    function finishTyping() {
      if (!typing) return
      const t = typing; typing = null
      clearInterval(t.timer)
      t.e.editor.value = t.target
      save(t.e.name); drawStatus()
    }

    async function next() {
      await build()
      if (typing) return finishTyping()
      const st = steps[stepIdx]
      if (!st) return
      stepIdx++
      const e = ed[st.file]
      if (st.mode === 'set' || st.mode === 'replace') {
        const before = e.editor.value.split('\n')
        e.editor.value = applyStep(e.editor.value, st)
        const lines = e.editor.value.split('\n').map((l, k) => (l !== before[k] && l.trim() ? k + 1 : 0)).filter(Boolean)
        e.editor.flash(lines); save(st.file)
        return drawStatus()
      }
      const base = e.editor.value.replace(/\n*$/, '')
      if (e.editor.value !== base) e.editor.value = base
      const target = (base ? base + '\n\n' : '') + st.text
      let pos = base.length
      typing = { e, target, timer: null }
      typing.timer = setInterval(() => {
        let end = pos, n = 2
        while (n-- > 0 && end < target.length) {
          end++
          while (end < target.length && target[end - 1] === '\n' && target[end] === ' ') end++
          while (end < target.length && target[end] === ' ' && target[end - 1] === ' ') end++
        }
        e.editor.append(target.slice(pos, end)); pos = end
        if (pos >= target.length) finishTyping()
      }, 30)
      drawStatus()
    }

    async function showAll() {
      await build()
      finishTyping()
      while (stepIdx < steps.length) {
        const st = steps[stepIdx++], e = ed[st.file]
        e.editor.value = applyStep(e.editor.value, st)
      }
      names.forEach(save); drawStatus()
    }

    async function reset() {
      await build()
      finishTyping(); stepIdx = 0
      names.forEach((n) => { const e = ed[n]; e.shell.stop(); e.editor.value = start[n]; e.editor.top(); e.shell.clear(); saved[n] = start[n] })
      touched = false; markDirty(); drawStatus()
    }

    const finalText = (n) => {
      let t = start[n]
      steps.forEach((st) => { if (st.file === n) t = applyStep(t, st) })
      return t
    }

    async function run(n) { await build(); finishTyping(); await ed[n].shell.exec(runCmd(n)) }
    async function runAll() {
      await build(); finishTyping()
      if (focused) document.activeElement?.blur()
      if (runList.length) { const sh = shared || ed[names[0]].shell; for (const c of runList) await sh.typeAndRun(c); return }
      if (shared) { for (const n of names) await shared.typeAndRun(runCmd(n)); return }
      await Promise.all(names.map(async (n, k) => { await sleep(k * 150); await ed[n].shell.typeAndRun(runCmd(n)) }))
    }

    // Size the font and terminal so this slide's longest file and its output both fit (slides only)
    let fitted = null
    function fit() {
      if (fitted || !steps.length || !root.offsetHeight) return
      const lines = Math.max(...names.map((n) => finalText(n).split('\n').length)) // Monaco shows the empty last line too
      const outLines = Math.max(+(root.dataset.termLines || 7), ...names.map((n) => (expect[n] ?? '').split('\n').length + 2))
      const crumbs = [...root.querySelectorAll('.vs-crumb')]
      const crumbH = crumbs[0].offsetHeight
      const total = ed[names[0]].host.clientHeight + root.querySelector('.vs-panel').offsetHeight + crumbH
      let lh = 26, tlh = 22
      for (; lh > 18; lh--) {
        tlh = Math.min(22, Math.max(18, Math.round(lh * 0.85)))
        if (lines * lh + 28 + outLines * tlh + 46 + (lh >= 24 ? crumbH : 0) <= total) break // 28 = padding + a sideways scrollbar
      }
      fitted = { lh, font: Math.round(lh * 0.69) }
      if (root.dataset.font) { fitted.font = Math.min(fitted.font, +root.dataset.font); fitted.lh = lh = Math.min(lh, Math.round(fitted.font * 1.45)) } // data-font: smaller code so 3 panes fit side by side
      root.style.setProperty('--vs-lh', lh + 'px')
      root.style.setProperty('--vs-font', fitted.font + 'px')
      root.style.setProperty('--vs-tlh', tlh + 'px')
      root.style.setProperty('--vs-tfont', Math.round(tlh * 0.73) + 'px')
      root.style.setProperty('--vs-term', outLines * tlh + 46 + 'px')
      root.style.setProperty('--vs-padb', '12px')
      if (lh < 24) crumbs.forEach((c) => (c.style.display = 'none'))
      names.forEach((n) => ed[n].editor?.setFont(fitted.font, fitted.lh))
    }

    names.forEach((n) => { ed[n].g.querySelector('.vs-run').onclick = async (ev) => {
      ev.currentTarget.blur(); await build(); save(n)
      if (/^Dockerfile/.test(n)) { for (const c of runList.length ? runList : ['docker build .']) await ed[n].shell.typeAndRun(c); return } // a Dockerfile runs as build + run
      ed[n].shell.typeAndRun(runCmd(n))
    } })
    $('.b-next').onclick = (ev) => { ev.currentTarget.blur(); next() }
    $('.b-runall').onclick = (ev) => { ev.currentTarget.blur(); runAll() }
    $('.b-all').onclick = (ev) => { ev.currentTarget.blur(); showAll() }
    $('.b-reset').onclick = (ev) => { ev.currentTarget.blur(); reset() }

    function broadcast() {
      if (root.closest('.slide') && !root.closest('.slide').classList.contains('active')) return
      const st = steps[stepIdx]
      chan.postMessage({ t: 'state', has: true, step: Math.min(stepIdx, steps.length), total: steps.length, file: st?.file || null, next: st ? st.text : null })
    }

    Object.assign(pad, {
      saveFocused: () => { if (focused) save(focused.name) },
      closePeek, peekOpen: () => !peek.hidden,
      save: (n) => save(n),
      async stepInstant() { await build(); finishTyping(); const st = steps[stepIdx]; if (!st) return false; stepIdx++; ed[st.file].editor.value = applyStep(ed[st.file].editor.value, st); save(st.file); drawStatus(); return true },
      shells: () => [...new Set(names.map((n) => ed[n].shell))],
      runList,
      root, names, ed, expect, folder, fit, build, next, showAll, reset, run, runAll, drawStatus, broadcast, finalText,
      get stepIdx() { return stepIdx }, steps,
      text: (n) => valueOf(n),
      terminal: (n) => ed[n].shell.lines().join('\n'),
      files: () => explorerFiles,
      // what a terminal "sees" on disk: this slide's saved files; earlier slides' files as they ended
      fsRead(f) {
        if (allNames.includes(f)) return saved[f]
        for (let k = padIndex - 1; k >= 0; k--) { const p = pads[k]; if (p.folder === folder && p.allNames.includes(f)) return p.savedOrFinal(f) }
        return explorerFiles.includes(f) ? '' : undefined
      },
      fsWrite(f, text) {
        touched = true
        saved[f] = text
        if (names.includes(f) && ed[f].editor) ed[f].editor.value = text
        if (!allNames.includes(f)) {
          allNames.push(f)
          if (!explorerFiles.includes(f)) {
            explorerFiles.push(f); explorerFiles.sort((a, b) => a.localeCompare(b))
            const div = document.createElement('div'); div.className = 'f'; div.dataset.f = f; div.innerHTML = fileIcon(f) + esc(f)
            const after = [...root.querySelectorAll('.vs-exp .f')].find((x) => x.dataset.f.localeCompare(f) > 0)
            after ? after.before(div) : root.querySelector('.vs-exp').append(div)
          }
        }
        markDirty()
      },
      fsAll() { const out = {}; for (const f of explorerFiles) { const t = pad.fsRead(f); if (t !== undefined) out[f] = t } return out },
      allNames,
      savedOrFinal: (f) => (touched ? (saved[f] !== undefined ? saved[f] : finalText(f)) : finalText(f)),
      recorded: (f, code) => (code === finalText(f) ? expect[f] : undefined),
    })
    markDirty(); drawStatus()
    return pad
  }

  // ---------- Keys, slide changes, presenter link ----------
  const activePad = () => pads.find((p) => p.root.contains(document.activeElement)) || pads.find((p) => !p.root.closest('.slide') || p.root.closest('.slide').classList.contains('active'))
  addEventListener('keydown', (k) => {
    const p = activePad(); if (!p) return
    if ((k.ctrlKey || k.metaKey) && k.key.toLowerCase() === 's') { k.preventDefault(); p.saveFocused(); return }  // VS Code's save, not the browser's
    if (k.target.closest && k.target.closest('input, textarea, select, .vs-term')) return
    if (k.ctrlKey || k.metaKey || k.altKey) return
    if (k.key === 'Escape' && p.peekOpen()) { k.preventDefault(); k.stopPropagation(); p.closePeek() }
    else if (k.key === 'n' || k.key === 'N') { k.preventDefault(); p.closePeek(); p.next() }
    else if (k.key === 'r' || k.key === 'R') { k.preventDefault(); p.closePeek(); p.runAll() }
  }, true)
  const sendState = () => { const p = activePad(); if (p) { p.fit(); p.build(); p.broadcast() } else chan.postMessage({ t: 'state', has: false }) }
  new MutationObserver(sendState).observe(document.querySelector('.stage') || document.body, { attributes: true, subtree: true, attributeFilter: ['class'] })
  chan.onmessage = ({ data: d }) => {
    if (d.t === 'hello') sendState()
    if (d.t === 'cmd') { const p = activePad(); if (!p) return; p.closePeek(); ({ next: p.next, run: p.runAll, all: p.showAll, reset: p.reset })[d.c]?.() }
  }
  if (pads.some((p) => p.names.some((n) => langOf(n) === 'py'))) startPython()
  if (pads.length) loadMonaco()
  const first = activePad(); if (first) { first.fit(); first.build() }
  window.Codepad = { pads, py: pyState, nodeInspect, loadMonaco }

  // ---------- Presenter window: buttons + a peek at the next chunk ----------
  function presenterControls() {
    const side = document.querySelector('.pv .side')
    if (!side) return
    const box = document.createElement('div')
    box.className = 'padbox'
    box.innerHTML = `<div class="meta">CODEPAD (N type next · R run)</div><div class="info"></div><pre></pre>
      <div class="row"><button data-c="next" style="background:#13795b;color:#fff">Type next</button><button data-c="run" style="background:#2552c9;color:#fff">Run</button></div>
      <div class="row" style="margin-top:8px"><button data-c="all">Show all</button><button data-c="reset">Reset</button></div>`
    side.insertBefore(box, side.querySelector('.next'))
    box.querySelectorAll('button').forEach((b) => (b.onclick = () => chan.postMessage({ t: 'cmd', c: b.dataset.c })))
    chan.onmessage = ({ data: d }) => {
      if (d.t !== 'state') return
      box.classList.toggle('on', d.has)
      if (!d.has) return
      box.querySelector('.info').textContent = d.next ? `Step ${d.step + 1} of ${d.total} → ${d.file}` : `All ${d.total} steps typed. Press R to run.`
      box.querySelector('pre').textContent = d.next || ''
      box.querySelector('pre').style.display = d.next ? '' : 'none'
    }
    addEventListener('keydown', (k) => {
      if (k.key === 'n' || k.key === 'N') chan.postMessage({ t: 'cmd', c: 'next' })
      if (k.key === 'r' || k.key === 'R') chan.postMessage({ t: 'cmd', c: 'run' })
    })
    chan.postMessage({ t: 'hello' })
  }
})()

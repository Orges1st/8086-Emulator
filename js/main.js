/* main.js - all UI code: editor, buttons, run loop, rendering. The CPU knows nothing about the DOM. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const cpu = new CPU();
  const code = $('code'), hl = $('hl'), gut = $('gutter'), out = $('out');
  // Speed slider 1..5: delay between ticks (ms) and instructions executed per tick
  const SPEEDS = [{ d: 700, b: 1 }, { d: 300, b: 1 }, { d: 80, b: 1 }, { d: 8, b: 25 }, { d: 0, b: 3000 }];
  const FLAGS = ['CF', 'ZF', 'SF', 'OF', 'PF', 'AF'];
  const LH = 20;
  let state = 'idle', timer = null, prev = null, log = [], viewOff = 0, curLine = 0, errLine = 0;

  /* ---------- syntax highlighting ---------- */
  const TOK = new RegExp(`(;.*$)|('[^']*'|"[^"]*")|^(\\s*[A-Za-z_@$.?][\\w@$.?]*\\s*:)|\\b(${Object.keys(ISA).join('|')})\\b|\\b(${[...REG16, ...Object.keys(REG8)].join('|')})\\b|\\b(BYTE|WORD|PTR|OFFSET|DB|DW)\\b|(\\b0x[0-9a-f]+\\b|\\b[0-9][0-9a-f]*h\\b|\\b[01]+b\\b|\\b\\d+\\b)`, 'gi');
  function hlLine(s) {
    let o = '', last = 0, m; TOK.lastIndex = 0;
    while ((m = TOK.exec(s))) {
      o += esc(s.slice(last, m.index));
      const k = m[1] ? 'c' : m[2] ? 's' : m[3] ? 'l' : m[4] ? 'k' : m[5] ? 'r' : m[6] ? 'd' : 'n';
      o += `<span class="t-${k}">${esc(m[0])}</span>`; last = TOK.lastIndex;
    }
    return o + esc(s.slice(last));
  }
  function renderEditor() {
    const L = code.value.split('\n'), cls = i => (i + 1 === curLine ? ' cur' : '') + (i + 1 === errLine ? ' bad' : '');
    hl.innerHTML = L.map((s, i) => `<div class="ln${cls(i)}">${hlLine(s) || ' '}</div>`).join('');
    gut.innerHTML = L.map((_, i) => `<div class="${cls(i).trim()}">${i + 1}</div>`).join('');
    sync();
  }
  function sync() { hl.scrollTop = gut.scrollTop = code.scrollTop; hl.scrollLeft = code.scrollLeft; }
  function revealLine(n) {                       // keep the executing line visible
    if (!n) return;
    const y = (n - 1) * LH + 8;
    if (y < code.scrollTop) code.scrollTop = y - LH;
    else if (y + LH > code.scrollTop + code.clientHeight) code.scrollTop = y + LH - code.clientHeight + 8;
    sync();
  }

  /* ---------- console / status ---------- */
  function sys(msg, cls = 'sys') { const d = document.createElement('span'); d.className = cls; d.textContent = msg; out.appendChild(d); out.parentNode.scrollTop = 1e9; }
  cpu.onOutput = t => {
    let s = out.lastChild;
    if (!s || !s.classList.contains('prog')) { s = document.createElement('span'); s.className = 'prog'; out.appendChild(s); }
    s.textContent += t.replace(/\r/g, ''); out.parentNode.scrollTop = 1e9;
  };
  function setState(s, text) {
    state = s;
    const p = $('status'); p.textContent = text || s; p.className = 'pill ' + s;
    $('run').disabled = $('step').disabled = s === 'running' || s === 'halted' || s === 'error';
    $('stop').disabled = s !== 'running';
  }

  /* ---------- registers & flags ---------- */
  function buildRegs() {
    $('gp').innerHTML = ['AX', 'BX', 'CX', 'DX'].map(r => `<tr><th>${r}</th><td id="r-${r}"></td><th>${r[0]}H</th><td id="r-${r[0]}H"></td><th>${r[0]}L</th><td id="r-${r[0]}L"></td></tr>`).join('');
    $('ptr').innerHTML = ['CS', 'DS', 'SS', 'ES', 'SI', 'DI', 'BP', 'SP', 'IP'].map(r => `<tr><th>${r}</th><td id="r-${r}"${r === 'IP' ? ' title="Index of the next instruction"' : ''}></td></tr>`).join('');
    $('flags').innerHTML = FLAGS.map(f => `<div class="flag" id="f-${f}"><b>${f}</b><span>0</span></div>`).join('');
  }
  const snap = () => ({ r: cpu.regs.snap(), f: { ...cpu.flags.f } });
  const mark = () => { prev = snap(); cpu.mem.changed.clear(); };      // baseline for "changed" highlighting
  function renderRegs() {
    for (const n of [...REG16, ...Object.keys(REG8)]) {
      const el = $('r-' + n), v = cpu.regs.get(n);
      el.textContent = hex(v, REG8[n] ? 2 : 4);
      el.classList.toggle('chg', n !== 'IP' && v !== cpu.regs.get(n, prev.r));
      if (!REG8[n]) el.title = n === 'IP' ? 'Index of the next instruction' : `${v} unsigned, ${v & 0x8000 ? v - 65536 : v} signed`;
    }
    for (const f of FLAGS) {
      const el = $('f-' + f), v = cpu.flags.get(f);
      el.firstElementChild.nextSibling.textContent = v;
      el.classList.toggle('on', !!v); el.classList.toggle('chg', v !== prev.f[f]);
    }
  }

  /* ---------- memory viewer ---------- */
  function renderMem() {
    const base = ((cpu.regs.v.DS << 4) + viewOff) & 0xFFFFF; let h = '';
    for (let r = 0; r < 8; r++) {
      let hx = '', as = '';
      for (let k = 0; k < 16; k++) {
        const p = (base + r * 16 + k) & 0xFFFFF, v = cpu.mem.r8(p), c = cpu.mem.changed.has(p) ? ' chg' : '';
        hx += `<span class="b${c}${v ? '' : ' z'}" data-a="${p}">${hex(v, 2)}</span>`;
        as += `<span class="${c.trim()}">${v >= 32 && v < 127 ? esc(String.fromCharCode(v)) : '.'}</span>`;
      }
      h += `<div class="row"><span class="ad">${hex(cpu.regs.v.DS, 4)}:${hex((viewOff + r * 16) & 0xFFFF, 4)}</span><span>${hx}</span><span class="as">${as}</span></div>`;
    }
    $('mem').innerHTML = h; $('memAddr').value = hex(viewOff, 4);
  }
  const goto = off => { viewOff = off & 0xFFF0; renderMem(); };
  $('mem').onclick = e => {
    const b = e.target.closest('.b'); if (!b) return;
    const a = +b.dataset.a, s = prompt(`New value for the byte at physical address ${hex(a, 5)} (hex, 00-FF):`, hex(cpu.mem.r8(a), 2));
    if (s === null) return;
    if (!/^[0-9a-f]{1,2}$/i.test(s.trim())) { sys('Memory edit rejected: enter 1-2 hex digits.', 'err'); return; }
    cpu.mem.w8(a, parseInt(s, 16)); renderMem();
  };
  $('mgo').onclick = () => { const v = parseInt($('memAddr').value, 16); if (!isNaN(v)) goto(v); };
  $('memAddr').onkeydown = e => { if (e.key === 'Enter') $('mgo').click(); };
  $('mprev').onclick = () => goto(viewOff - 128);
  $('mnext').onclick = () => goto(viewOff + 128);
  $('mdata').onclick = () => goto(0x100);
  $('msp').onclick = () => goto(cpu.regs.v.SP - 16);

  /* ---------- execution log ---------- */
  function pushLog(ins, b) {
    const d = [];
    for (const n of REG16) if (n !== 'IP' && cpu.regs.v[n] !== b.r[n]) d.push(`${n}=${hex(cpu.regs.v[n], 4)}`);
    for (const f of FLAGS) if (cpu.flags.f[f] !== b.f[f]) d.push(`${f}=${cpu.flags.f[f]}`);
    log.push({ l: ins.line, t: ins.text, d: d.join(' ') });
    if (log.length > 1000) log.splice(0, 200);
  }
  function renderLog() {
    const el = $('log');
    el.innerHTML = log.slice(-200).map(e => e.e ? `<div class="e">${esc(e.e)}</div>` : `<div><i>L${e.l}</i><b>${esc(e.t)}</b><span>${e.d}</span></div>`).join('');
    el.scrollTop = 1e9;
  }

  /* ---------- control ---------- */
  function refresh() {
    curLine = state === 'error' && cpu.errorLine ? 0 : (cpu.halted ? 0 : (cpu.program[cpu.regs.v.IP] || {}).line || 0);
    if (state === 'error' && cpu.errorLine) errLine = cpu.errorLine;
    renderEditor(); revealLine(curLine || errLine); renderRegs(); renderMem(); renderLog();
  }
  function load() {                              // assemble the editor text and reset the machine
    clearTimeout(timer); out.innerHTML = ''; log = []; errLine = 0;
    const res = Assembler.assemble(code.value);
    cpu.load(res); mark();
    if (res.errors.length) {
      errLine = res.errors[0].line;
      for (const e of res.errors) sys(`Line ${e.line}: ${e.msg}`, 'err');
      setState('error', 'Assembly error'); refresh(); return false;
    }
    sys(`Assembled ${res.program.length} instruction(s). Ready.`);
    setState('ready', 'Ready'); refresh(); return true;
  }
  function stepOnce() {
    const ins = cpu.program[cpu.regs.v.IP], b = snap();
    cpu.step();
    if (ins) pushLog(ins, b);
  }
  function finished() {                          // true when the program stopped
    if (!cpu.halted) return false;
    if (cpu.error) { sys(cpu.error, 'err'); log.push({ e: cpu.error }); setState('error', 'Runtime error'); }
    else { sys(cpu.message, 'ok'); setState('halted', 'Halted'); }
    return true;
  }
  function tick() {
    if (state !== 'running') return;
    const sp = SPEEDS[$('speed').value - 1];
    mark();
    for (let i = 0; i < sp.b && !cpu.halted; i++) stepOnce();
    const done = finished(); refresh();
    if (!done) timer = setTimeout(tick, sp.d);
  }
  $('run').onclick = () => {
    if (state === 'idle' && !load()) return;
    setState('running', 'Running'); tick();
  };
  $('step').onclick = () => {
    if (state === 'idle' && !load()) return;
    mark(); stepOnce();
    if (!finished()) setState('paused', 'Paused (step)');
    refresh();
  };
  $('stop').onclick = () => { clearTimeout(timer); setState('paused', 'Stopped - Run to resume'); refresh(); };
  $('reset').onclick = load;
  $('clear').onclick = () => {
    clearTimeout(timer); code.value = ''; $('examples').selectedIndex = -1;
    cpu.reset(); mark(); out.innerHTML = ''; log = []; curLine = errLine = 0;
    setState('idle', 'Empty'); refresh(); code.focus();
  };
  code.addEventListener('input', () => {         // editing invalidates the loaded program
    clearTimeout(timer);
    if (state !== 'idle') { setState('idle', 'Edited - press Run'); curLine = errLine = 0; }
    renderEditor();
  });
  code.addEventListener('scroll', sync);
  code.addEventListener('keydown', e => {
    if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '    '); }
  });
  $('examples').onchange = e => { code.value = EXAMPLES[e.target.value].code; load(); };

  /* ---------- tabs & static content ---------- */
  document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
    document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b));
    document.querySelectorAll('.pane').forEach(p => { p.hidden = p.id !== 'tab-' + b.dataset.tab; });
  });
  $('tab-ref').innerHTML = `<p>${ADDRESSING}</p><table class="ref">` + REFERENCE.map(r =>
    `<tr><th>${esc(r[0])}</th><td><code>${esc(r[1])}</code><br>${esc(r[2])}<br><small>Flags: ${esc(r[3])}</small></td></tr>`).join('') + '</table>';
  $('tab-info').innerHTML = '<table class="ref">' + REG_INFO.map(r => `<tr><th>${r[0]}</th><td>${esc(r[1])}</td></tr>`).join('') +
    '</table><br><table class="ref">' + FLAG_INFO.map(r => `<tr><th>${r[0]}</th><td>${esc(r[1])}</td></tr>`).join('') + '</table>';

  /* ---------- init ---------- */
  $('examples').innerHTML = EXAMPLES.map((e, i) => `<option value="${i}">${esc(e.name)}</option>`).join('');
  buildRegs();
  code.value = EXAMPLES[0].code;
  load();
})();

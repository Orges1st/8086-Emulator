/* assembler.js - turns source text into a list of decoded instructions.
 * Supports: labels, ; comments, DB/DW data, decimal/hex(0Ah, 0x0A)/binary(1010b)/'c' literals,
 * registers, [mem] operands (BX/BP/SI/DI + displacement), BYTE/WORD PTR, OFFSET label.
 * Every error carries a line number; nothing is silently ignored.
 */
const DATA_BASE = 0x0100;                 // data defined with DB/DW is placed at DS:0100h and up

class Assembler {
  static parseNum(t) {
    t = t.trim(); let m;
    if (/^(['"]).\1$/.test(t)) return t.charCodeAt(1);
    if (/^[-+]?\d+$/.test(t)) return parseInt(t, 10);
    if ((m = t.match(/^([-+]?)(?:0x([0-9a-f]+)|([0-9][0-9a-f]*)h)$/i))) return (m[1] === '-' ? -1 : 1) * parseInt(m[2] || m[3], 16);
    if ((m = t.match(/^([-+]?)([01]+)b$/i))) return (m[1] === '-' ? -1 : 1) * parseInt(m[2], 2);
    return null;
  }
  static strip(s) {                        // remove ; comment (but not inside quotes)
    let q = null;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) { if (c === q) q = null; } else if (c === "'" || c === '"') q = c; else if (c === ';') return s.slice(0, i);
    }
    return s;
  }
  static split(s) {                        // split on commas outside quotes
    const out = []; let q = null, cur = '';
    for (const c of s) {
      if (q) { cur += c; if (c === q) q = null; }
      else if (c === "'" || c === '"') { q = c; cur += c; }
      else if (c === ',') { out.push(cur.trim()); cur = ''; }
      else cur += c;
    }
    out.push(cur.trim());
    return out;
  }
  static dataBytes(rest, w) {
    const out = [];
    for (const it of Assembler.split(rest)) {
      if (!it) throw new Error('Empty value in data directive');
      const s = it.match(/^(['"])(.*)\1$/);
      if (s && s[2].length !== 1 || (s && w === 2)) {            // strings: one byte (DB) or word (DW) per char
        for (const ch of s[2]) { const c = ch.charCodeAt(0); if (c > 255) throw new Error('Only ASCII characters are supported'); out.push(c); if (w === 2) out.push(0); }
        continue;
      }
      if (it === '?') { for (let k = 0; k < w; k++) out.push(0); continue; }
      const n = Assembler.parseNum(it);
      if (n === null) throw new Error(`Invalid data value '${it}'`);
      if (n < (w === 1 ? -128 : -32768) || n > (w === 1 ? 255 : 65535)) throw new Error(`Value ${it} does not fit in ${w === 1 ? 'a byte' : 'a word'}`);
      const v = n & (w === 1 ? 0xFF : 0xFFFF);
      out.push(v & 0xFF); if (w === 2) out.push(v >> 8);
    }
    return out;
  }

  /** Parse one operand token into {type:'reg'|'mem'|'imm'|'label', ...}. */
  static operand(tok, data) {
    let t = tok.trim(), size = 0, m;
    if (!t) throw new Error('Empty operand');
    if ((m = t.match(/^(byte|word)\s+ptr\s+(.+)$/i))) { size = m[1].toLowerCase() === 'byte' ? 1 : 2; t = m[2].trim(); if (t[0] !== '[' && !data[t]) throw new Error('PTR must be followed by a memory operand'); }
    else if ((m = t.match(/^offset\s+(\w+)$/i))) {
      if (!data[m[1]]) throw new Error(`OFFSET needs a data label, '${m[1]}' is not one`);
      return { type: 'imm', value: data[m[1]].addr };
    }
    if (t[0] === '[') {
      if (t.slice(-1) !== ']') throw new Error(`Missing ']' in operand '${tok}'`);
      const terms = t.slice(1, -1).replace(/\s+/g, '').match(/[+-]?[^+-]+/g);
      if (!terms) throw new Error(`Empty memory operand '${tok}'`);
      const regs = []; let disp = 0;
      for (const term of terms) {
        const sg = term[0] === '-' ? -1 : 1, b = term.replace(/^[+-]/, ''), U = b.toUpperCase(), n = Assembler.parseNum(b);
        if (['BX', 'BP', 'SI', 'DI'].includes(U)) { if (sg < 0) throw new Error('A register cannot be subtracted in an address'); regs.push(U); }
        else if (Registers.size(U)) throw new Error(`${U} cannot be used as an address register (use BX, BP, SI or DI)`);
        else if (n !== null) disp += sg * n;
        else if (data[b]) disp += sg * data[b].addr;
        else throw new Error(`Invalid memory operand '${tok}'`);
      }
      if (regs.filter(r => r === 'BX' || r === 'BP').length > 1 || regs.filter(r => r === 'SI' || r === 'DI').length > 1)
        throw new Error('An address may use at most one base (BX/BP) and one index (SI/DI) register');
      return { type: 'mem', regs, disp, size };
    }
    const U = t.toUpperCase(), rs = Registers.size(U);
    if (rs) { if (U === 'IP') throw new Error('IP is not a valid operand'); return { type: 'reg', name: U, size: rs }; }
    const n = Assembler.parseNum(t);
    if (n !== null) { if (size) throw new Error('PTR must be followed by a memory operand'); return { type: 'imm', value: n }; }
    if (data[t]) return { type: 'mem', regs: [], disp: data[t].addr, size: size || data[t].size };   // plain data label = its contents
    if (/^[A-Za-z_@$.?][\w@$.?]*$/.test(t)) return { type: 'label', name: t };
    throw new Error(`Invalid operand '${tok}'`);
  }

  /** Validate operand kinds/sizes; returns the operation size (1 or 2). */
  static check(m, spec, o) {
    if (o.length !== spec.a.length) throw new Error(`${m} expects ${spec.a.length} operand(s), got ${o.length}`);
    const K = { reg: 'r', mem: 'm', imm: 'i', label: 'l' };
    const N = { reg: 'a register', mem: 'a memory operand', imm: 'an immediate value', label: 'a label' };
    o.forEach((x, k) => {
      if (x.type === 'label' && spec.a[k] !== 'l') throw new Error(`Undefined symbol '${x.name}'`);
      if (!spec.a[k].includes(K[x.type])) throw new Error(`Operand ${k + 1} of ${m} cannot be ${N[x.type]}`);
    });
    if (o.length === 2 && o[0].type === 'mem' && o[1].type === 'mem') throw new Error(`${m} cannot have two memory operands`);
    let s = spec.w || 0;
    for (const x of o) {
      const z = x.type === 'reg' || x.type === 'mem' ? x.size : 0;
      if (!z) continue;
      if (spec.w && z !== spec.w) throw new Error(`${m} requires a 16-bit operand`);
      if (s && z !== s) throw new Error(`Operand size mismatch in ${m}`);
      s = z;
    }
    if (!s && /[rm]/.test(spec.a.join(''))) throw new Error('Operand size is unknown: use BYTE PTR or WORD PTR');
    for (const x of o) if (x.type === 'imm') {
      if (x.value < (s === 1 ? -128 : -32768) || x.value > (s === 1 ? 255 : 65535)) throw new Error(`Immediate ${x.value} does not fit in ${s === 1 ? 8 : 16} bits`);
    }
    if (spec.chk) spec.chk(o);
    return s;
  }

  /** Assemble source -> {program, data, errors}. */
  static assemble(src) {
    const errors = [], items = [], code = Object.create(null), data = Object.create(null), dataOut = [];
    const err = (line, msg) => errors.push({ line, msg });
    let dp = DATA_BASE;
    // ---- pass 1: labels and data ----
    src.split(/\r?\n/).forEach((raw, n) => {
      const line = n + 1;
      let t = Assembler.strip(raw).trim(), label = null, m;
      if (!t) return;
      if ((m = t.match(/^([A-Za-z_@$.?][\w@$.?]*)\s*:\s*(.*)$/))) { label = m[1]; t = m[2].trim(); }
      const dm = t.match(/^(?:([A-Za-z_]\w*)\s+)?(DB|DW)\b\s*(.*)$/i);
      const dup = nm => { if (nm in code || nm in data) { err(line, `Label '${nm}' is already defined`); return true; } };
      if (dm) {
        const w = dm[2].toUpperCase() === 'DB' ? 1 : 2, name = dm[1] || label;
        try {
          const bytes = Assembler.dataBytes(dm[3], w);
          if (name && !dup(name)) data[name] = { addr: dp, size: w };
          dataOut.push({ addr: dp, bytes }); dp += bytes.length;
        } catch (e) { err(line, e.message); }
        return;
      }
      if (label && !dup(label)) code[label] = items.length;
      if (t) items.push({ line, t });
    });
    // ---- pass 2: instructions ----
    const program = [];
    for (const { line, t } of items) {
      const sp = t.search(/\s/), mn = (sp < 0 ? t : t.slice(0, sp)).toUpperCase(), rest = sp < 0 ? '' : t.slice(sp).trim();
      const spec = ISA[mn];
      if (!spec) { err(line, `Unsupported instruction '${mn}' (see the Instruction Reference tab)`); continue; }
      try {
        const toks = rest ? Assembler.split(rest) : [];
        const o = toks.map((tok, k) => (spec.a[k] === 'l' ? { type: 'label', name: tok.trim() } : Assembler.operand(tok, data)));
        for (const x of o) if (x.type === 'label' && spec.a[0] === 'l') {
          if (!/^[A-Za-z_@$.?][\w@$.?]*$/.test(x.name)) throw new Error(`Invalid operand '${x.name}'`);
          if (!(x.name in code)) throw new Error(`Undefined label '${x.name}'`);
          x.target = code[x.name];
        }
        program.push({ m: mn, o, size: Assembler.check(mn, spec, o), line, text: t });
      } catch (e) { err(line, e.message); }
    }
    return { program, data: dataOut, errors };
  }
}

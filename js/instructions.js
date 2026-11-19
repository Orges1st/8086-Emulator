/* instructions.js - the instruction set: operand rules + behaviour of each mnemonic.
 *
 * Operand kinds in `a`: r = register, m = memory, i = immediate, l = code label.
 * `w` forces the operand size (PUSH/POP are always 16-bit).
 * `run(x, ins)` receives the Executor `x` (x.rd / x.wr / x.f ...) and the decoded instruction.
 */
class CPUError extends Error {}
const MASK = s => (s === 1 ? 0xFF : 0xFFFF);
const SIGN = s => (s === 1 ? 0x80 : 0x8000);

/** Arithmetic/logic helpers that compute the result AND set the flags. */
const ALU = {
  add(f, a, b, s) {
    const r = a + b, x = r & MASK(s);
    f.set('CF', r > MASK(s));
    f.set('OF', (~(a ^ b) & (a ^ x) & SIGN(s)) !== 0);   // same-sign inputs, different-sign result
    f.set('AF', ((a ^ b ^ x) & 0x10) !== 0);
    f.szp(x, s);
    return x;
  },
  sub(f, a, b, s) {
    const x = (a - b) & MASK(s);
    f.set('CF', a < b);                                     // borrow
    f.set('OF', ((a ^ b) & (a ^ x) & SIGN(s)) !== 0);
    f.set('AF', ((a ^ b ^ x) & 0x10) !== 0);
    f.szp(x, s);
    return x;
  },
  logic(f, x, s) {                                          // AND/OR/XOR: CF=OF=0
    x &= MASK(s);
    f.set('CF', 0); f.set('OF', 0); f.set('AF', 0);
    f.szp(x, s);
    return x;
  },
};

const two = (fn, write = true) => ({
  a: ['rm', 'rmi'],
  run: (x, i) => {
    const v = fn(x.f, x.rd(i.o[0], i.size), x.rd(i.o[1], i.size), i.size);
    if (write) x.wr(i.o[0], i.size, v);
  },
});

const ISA = {
  // ---- data transfer ----
  MOV: { a: ['rm', 'rmi'],
    chk: o => {
      if (o[0].type === 'reg' && SEGREGS.includes(o[0].name)) {
        if (o[0].name === 'CS') throw new Error('CS cannot be a MOV destination');
        if (o[1].type === 'imm') throw new Error('A segment register cannot be loaded with an immediate; go through AX');
      }
      if (o[0].type === 'reg' && o[0].name === 'IP') throw new Error('IP is not a valid operand');
    },
    run: (x, i) => x.wr(i.o[0], i.size, x.rd(i.o[1], i.size)) },
  XCHG: { a: ['rm', 'rm'], run: (x, i) => {
    const [a, b] = i.o, p = x.rd(a, i.size), q = x.rd(b, i.size);
    x.wr(a, i.size, q); x.wr(b, i.size, p); } },
  PUSH: { a: ['rm'], w: 2, run: (x, i) => x.push(x.rd(i.o[0], 2)) },
  POP:  { a: ['rm'], w: 2, run: (x, i) => x.wr(i.o[0], 2, x.pop()) },
  // ---- arithmetic ----
  ADD: two((f, a, b, s) => ALU.add(f, a, b, s)),
  SUB: two((f, a, b, s) => ALU.sub(f, a, b, s)),
  CMP: two((f, a, b, s) => ALU.sub(f, a, b, s), false),
  INC: { a: ['rm'], run: (x, i) => {          // INC/DEC leave CF untouched
    const cf = x.f.get('CF');
    x.wr(i.o[0], i.size, ALU.add(x.f, x.rd(i.o[0], i.size), 1, i.size)); x.f.set('CF', cf); } },
  DEC: { a: ['rm'], run: (x, i) => {
    const cf = x.f.get('CF');
    x.wr(i.o[0], i.size, ALU.sub(x.f, x.rd(i.o[0], i.size), 1, i.size)); x.f.set('CF', cf); } },
  MUL: { a: ['rm'], run: (x, i) => {           // unsigned: AX=AL*src  or  DX:AX=AX*src
    const r = x.c.regs, s = i.size, m = x.rd(i.o[0], s);
    let hi;
    if (s === 1) { const p = r.get('AL') * m; r.set('AX', p); hi = p >> 8; }
    else { const p = r.get('AX') * m; hi = Math.floor(p / 65536); r.set('AX', p & 0xFFFF); r.set('DX', hi); }
    x.f.set('CF', hi !== 0); x.f.set('OF', hi !== 0);   // set when the upper half is used
  } },
  DIV: { a: ['rm'], run: (x, i) => {           // unsigned: AX/src -> AL,AH  or  DX:AX/src -> AX,DX
    const r = x.c.regs, s = i.size, d = x.rd(i.o[0], s);
    if (d === 0) throw new CPUError('Divide error: division by zero');
    if (s === 1) {
      const n = r.get('AX'), q = Math.floor(n / d);
      if (q > 0xFF) throw new CPUError('Divide error: quotient does not fit in AL');
      r.set('AL', q); r.set('AH', n % d);
    } else {
      const n = r.get('DX') * 65536 + r.get('AX'), q = Math.floor(n / d);
      if (q > 0xFFFF) throw new CPUError('Divide error: quotient does not fit in AX');
      r.set('AX', q); r.set('DX', n % d);
    }
  } },
  // ---- logic ----
  AND: two((f, a, b, s) => ALU.logic(f, a & b, s)),
  OR:  two((f, a, b, s) => ALU.logic(f, a | b, s)),
  XOR: two((f, a, b, s) => ALU.logic(f, a ^ b, s)),
  NOT: { a: ['rm'], run: (x, i) => x.wr(i.o[0], i.size, ~x.rd(i.o[0], i.size)) },   // no flags
  // ---- control flow ----
  JMP:  { a: ['l'], run: (x, i) => x.jmp(i.o[0]) },
  LOOP: { a: ['l'], run: (x, i) => {
    const r = x.c.regs, cx = (r.get('CX') - 1) & 0xFFFF;
    r.set('CX', cx); if (cx) x.jmp(i.o[0]); } },
  CALL: { a: ['l'], run: (x, i) => { x.push(x.c.regs.v.IP); x.jmp(i.o[0]); } },
  RET:  { a: [], run: x => { x.c.regs.v.IP = x.pop(); } },
  // ---- other ----
  NOP: { a: [], run: () => {} },
  HLT: { a: [], run: x => x.c.halt('HLT executed - program stopped') },
  INT: { a: ['i'],
    chk: o => { if (o[0].value !== 0x20 && o[0].value !== 0x21) throw new Error(`INT ${hex(o[0].value, 2)}h is not supported (only INT 20h and INT 21h)`); },
    run: (x, i) => x.int(i.o[0].value) },
};

// Conditional jumps: name -> condition on the flags
const CONDS = {
  JE: f => f.get('ZF'), JZ: f => f.get('ZF'),
  JNE: f => !f.get('ZF'), JNZ: f => !f.get('ZF'),
  JC: f => f.get('CF'), JB: f => f.get('CF'),
  JNC: f => !f.get('CF'), JAE: f => !f.get('CF'),
};
for (const [n, c] of Object.entries(CONDS)) ISA[n] = { a: ['l'], run: (x, i) => { if (c(x.f)) x.jmp(i.o[0]); } };

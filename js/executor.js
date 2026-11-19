/* executor.js - runs ONE decoded instruction against the CPU state. No DOM access. */
class Executor {
  constructor(cpu) { this.c = cpu; this.f = cpu.flags; }

  // Effective / physical address of a memory operand (BP uses SS, everything else DS)
  ea(o) { let a = o.disp; for (const r of o.regs) a += this.c.regs.get(r); return a & 0xFFFF; }
  pa(o) { return ((this.c.regs.get(o.regs.includes('BP') ? 'SS' : 'DS') << 4) + this.ea(o)) & 0xFFFFF; }

  rd(o, s) {
    if (o.type === 'imm') return o.value & MASK(s);
    if (o.type === 'reg') return this.c.regs.get(o.name);
    const a = this.pa(o);
    return s === 1 ? this.c.mem.r8(a) : this.c.mem.r16(a);
  }
  wr(o, s, v) {
    v &= MASK(s);
    if (o.type === 'reg') this.c.regs.set(o.name, v);
    else if (s === 1) this.c.mem.w8(this.pa(o), v);
    else this.c.mem.w16(this.pa(o), v);
  }
  jmp(o) { this.c.regs.v.IP = o.target; }

  push(v) {
    const r = this.c.regs;
    if (r.v.SP < 2) throw new CPUError('Stack overflow');
    r.v.SP -= 2;
    this.c.mem.w16((r.v.SS << 4) + r.v.SP, v);
  }
  pop() {
    const r = this.c.regs;
    if (r.v.SP >= 0xFFFE) throw new CPUError('Stack underflow: POP/RET with an empty stack');
    const v = this.c.mem.r16((r.v.SS << 4) + r.v.SP);
    r.v.SP += 2;
    return v;
  }

  /** INT 20h / INT 21h (AH=02h print char, 09h print $-string, 4Ch exit). */
  int(n) {
    const c = this.c, r = c.regs;
    if (n === 0x20) { c.halt('INT 20h - program terminated'); return; }
    const ah = r.get('AH');
    if (ah === 0x02) c.emit(String.fromCharCode(r.get('DL')));
    else if (ah === 0x09) {
      const a = (r.get('DS') << 4) + r.get('DX');
      let s = '', k = 0;
      for (; k < 0x10000; k++) { const b = c.mem.r8(a + k); if (b === 0x24) break; s += String.fromCharCode(b); }
      if (k === 0x10000) throw new CPUError("INT 21h/09h: no '$' terminator found");
      c.emit(s);
    } else if (ah === 0x4C) c.halt(`Program terminated with exit code ${r.get('AL')} (INT 21h/4Ch)`);
    else throw new CPUError(`INT 21h function AH=${hex(ah, 2)}h is not supported (supported: 02h, 09h, 4Ch)`);
  }

  /** Execute the instruction at IP. Returns false when the CPU has stopped. */
  step() {
    const c = this.c;
    if (c.halted) return false;
    const ip = c.regs.v.IP, ins = c.program[ip];
    if (!ins) { c.halt('Program finished (ran past the last instruction)'); return false; }
    c.regs.v.IP = ip + 1;                     // IP advances first; jumps overwrite it
    try { ISA[ins.m].run(this, ins); c.steps++; }
    catch (e) {
      if (!(e instanceof CPUError)) throw e;
      c.halted = true; c.error = `Line ${ins.line}: ${e.message}`; c.errorLine = ins.line; c.regs.v.IP = ip;
      return false;
    }
    return !c.halted;
  }
}

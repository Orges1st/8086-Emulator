/* cpu.js - ties registers, flags, memory and the executor together (UI-independent). */
class CPU {
  constructor() {
    this.regs = new Registers(); this.mem = new Memory(); this.flags = new Flags();
    this.ex = new Executor(this); this.onOutput = null; this.reset();
  }
  reset() {
    this.regs.reset(); this.mem.reset(); this.flags.reset();
    this.program = []; this.halted = false; this.error = null; this.errorLine = 0;
    this.message = ''; this.steps = 0; this.output = '';
  }
  /** Reset the machine and load an assembled program (+ its data) into it. */
  load(asm) {
    this.reset();
    this.program = asm.program;
    for (const d of asm.data) d.bytes.forEach((b, k) => this.mem.w8((this.regs.v.DS << 4) + d.addr + k, b));
    this.mem.changed.clear();
  }
  emit(t) { this.output += t; if (this.onOutput) this.onOutput(t); }
  halt(msg) { this.halted = true; this.message = msg; }
  step() { return this.ex.step(); }
}

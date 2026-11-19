/* registers.js - 16-bit register file with 8-bit views (AH/AL ...). */
const REG16 = ['AX', 'BX', 'CX', 'DX', 'SI', 'DI', 'BP', 'SP', 'IP', 'CS', 'DS', 'SS', 'ES'];
const SEGREGS = ['CS', 'DS', 'SS', 'ES'];
// 8-bit register -> [parent 16-bit register, bit shift]
const REG8 = { AL: ['AX', 0], AH: ['AX', 8], BL: ['BX', 0], BH: ['BX', 8],
               CL: ['CX', 0], CH: ['CX', 8], DL: ['DX', 0], DH: ['DX', 8] };

class Registers {
  constructor() { this.reset(); }
  reset() {
    this.v = {};
    for (const r of REG16) this.v[r] = 0;
    this.v.SP = 0xFFFE;                    // empty stack at SS:FFFE
  }
  /** 1 for 8-bit registers, 2 for 16-bit ones, 0 if not a register. */
  static size(n) { return REG8[n] ? 1 : REG16.includes(n) ? 2 : 0; }
  /** Read a register; `v` lets the UI read from a saved snapshot. */
  get(n, v = this.v) {
    const p = REG8[n];
    return p ? (v[p[0]] >> p[1]) & 0xFF : v[n];
  }
  set(n, x) {
    const p = REG8[n];
    if (p) this.v[p[0]] = (this.v[p[0]] & ~(0xFF << p[1]) & 0xFFFF) | ((x & 0xFF) << p[1]);
    else this.v[n] = x & 0xFFFF;
  }
  snap() { return { ...this.v }; }
}

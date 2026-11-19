/* flags.js - CPU status flags (CF PF AF ZF SF OF). No UI code here. */
const hex = (n, w) => (n >>> 0).toString(16).toUpperCase().padStart(w, '0');

class Flags {
  constructor() { this.reset(); }
  reset() { this.f = { CF: 0, PF: 0, AF: 0, ZF: 0, SF: 0, OF: 0 }; }
  get(n) { return this.f[n]; }
  set(n, v) { this.f[n] = v ? 1 : 0; }
  /** Set ZF, SF and PF from a result of the given size (1 = byte, 2 = word). */
  szp(res, size) {
    res &= size === 1 ? 0xFF : 0xFFFF;
    this.set('ZF', res === 0);
    this.set('SF', res & (size === 1 ? 0x80 : 0x8000));
    let p = res & 0xFF, odd = 0;           // PF looks at the low byte only
    while (p) { odd ^= p & 1; p >>= 1; }
    this.set('PF', odd === 0);             // PF = 1 when the number of 1-bits is even
  }
}

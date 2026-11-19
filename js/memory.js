/* memory.js - 1 MB byte-addressable memory, little-endian words. */
class Memory {
  constructor() { this.m = new Uint8Array(0x100000); this.changed = new Set(); }
  reset() { this.m.fill(0); this.changed.clear(); }
  r8(a) { return this.m[a & 0xFFFFF]; }
  w8(a, v) {
    a &= 0xFFFFF; v &= 0xFF;
    if (this.m[a] !== v) this.changed.add(a);   // remembered for the UI highlight
    this.m[a] = v;
  }
  r16(a) { return this.r8(a) | (this.r8(a + 1) << 8); }
  w16(a, v) { this.w8(a, v); this.w8(a + 1, v >> 8); }
}

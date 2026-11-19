/* reference.js - text for the Instruction Reference and Registers/Flags tabs. */
const REFERENCE = [
  ['MOV', 'MOV dst, src', 'Copy src into dst (reg/mem/imm). Both operands must have the same size.', 'none'],
  ['PUSH', 'PUSH r16/m16', 'SP = SP - 2, then store the word at SS:SP.', 'none'],
  ['POP', 'POP r16/m16', 'Load the word at SS:SP, then SP = SP + 2.', 'none'],
  ['XCHG', 'XCHG a, b', 'Swap two operands (reg/mem).', 'none'],
  ['ADD', 'ADD dst, src', 'dst = dst + src.', 'CF OF SF ZF PF AF'],
  ['SUB', 'SUB dst, src', 'dst = dst - src. CF = borrow.', 'CF OF SF ZF PF AF'],
  ['CMP', 'CMP a, b', 'Compute a - b and set flags; the result is discarded.', 'CF OF SF ZF PF AF'],
  ['INC', 'INC dst', 'dst = dst + 1.', 'OF SF ZF PF AF (CF unchanged)'],
  ['DEC', 'DEC dst', 'dst = dst - 1.', 'OF SF ZF PF AF (CF unchanged)'],
  ['MUL', 'MUL src', 'Unsigned. Byte: AX = AL * src. Word: DX:AX = AX * src.', 'CF OF = 1 if the upper half is non-zero'],
  ['DIV', 'DIV src', 'Unsigned. Byte: AL = AX / src, AH = remainder. Word: AX = DX:AX / src, DX = remainder. Division by zero or a too-large quotient stops the program.', 'undefined (left unchanged)'],
  ['AND', 'AND dst, src', 'Bitwise AND.', 'SF ZF PF; CF = OF = 0'],
  ['OR', 'OR dst, src', 'Bitwise OR.', 'SF ZF PF; CF = OF = 0'],
  ['XOR', 'XOR dst, src', 'Bitwise exclusive OR.', 'SF ZF PF; CF = OF = 0'],
  ['NOT', 'NOT dst', 'Invert every bit.', 'none'],
  ['JMP', 'JMP label', 'Jump to label.', 'none'],
  ['JE / JZ', 'JE label', 'Jump if ZF = 1 (equal / zero).', 'none'],
  ['JNE / JNZ', 'JNE label', 'Jump if ZF = 0.', 'none'],
  ['JC / JB', 'JC label', 'Jump if CF = 1 (carry / below, unsigned).', 'none'],
  ['JNC / JAE', 'JNC label', 'Jump if CF = 0.', 'none'],
  ['LOOP', 'LOOP label', 'CX = CX - 1; jump if CX is not zero.', 'none'],
  ['CALL', 'CALL label', 'Push the return address, then jump to label.', 'none'],
  ['RET', 'RET', 'Pop the return address into IP.', 'none'],
  ['NOP', 'NOP', 'Do nothing.', 'none'],
  ['HLT', 'HLT', 'Stop the program.', 'none'],
  ['INT 21h', 'INT 21h', 'DOS services. AH=02h: print char in DL. AH=09h: print $-terminated string at DS:DX. AH=4Ch: exit with code AL. INT 20h also exits.', 'none'],
];

const REG_INFO = [
  ['AX BX CX DX', 'General-purpose 16-bit registers. Each splits into a high and low byte (AH/AL, BH/BL, CH/CL, DH/DL). AX is the accumulator (MUL/DIV/INT use it), CX is the LOOP counter.'],
  ['SI DI', 'Source and destination index. Handy for walking through arrays: MOV AL, [SI].'],
  ['BP SP', 'Base pointer and stack pointer. SP always points at the top of the stack (SS:SP) and moves down by 2 on every PUSH. BP-based addresses use SS.'],
  ['CS DS SS ES', 'Segment registers. A physical address is segment x 16 + offset. This emulator starts with all of them at 0000h.'],
  ['IP', 'Instruction pointer. Simplification: IP holds the index of the next instruction in the program, not a byte address.'],
];
const FLAG_INFO = [
  ['CF', 'Carry: unsigned overflow of ADD, or a borrow in SUB/CMP.'],
  ['ZF', 'Zero: the result was 0 (also "equal" after CMP).'],
  ['SF', 'Sign: the top bit of the result is 1 (negative when read as signed).'],
  ['OF', 'Overflow: the signed result did not fit (e.g. 7Fh + 1).'],
  ['PF', 'Parity: the low byte of the result has an even number of 1 bits.'],
  ['AF', 'Auxiliary carry: carry/borrow out of bit 3 (used for BCD arithmetic).'],
];
const ADDRESSING = `<b>Supported operands:</b> registers, immediates (<code>42</code>, <code>2Ah</code>, <code>0x2A</code>, <code>101010b</code>, <code>'A'</code>),
direct memory <code>[0200h]</code>, register indirect <code>[BX]</code>, based/indexed <code>[BX+SI]</code>, with displacement <code>[BX+SI+4]</code>
(base BX/BP, index SI/DI), data labels, <code>BYTE PTR</code> / <code>WORD PTR</code>, <code>OFFSET label</code>.
Use a size prefix when no register shows the size: <code>MOV BYTE PTR [BX], 5</code>.`;

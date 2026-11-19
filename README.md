# 8086 Emulator

An educational Intel 8086 assembly emulator that runs entirely in the browser, inspired by EMU8086.
Write assembly, then Run or Step through it and watch registers, flags, memory and output change.

> This is a **teaching subset** of the 8086. It is not a complete or cycle-accurate Intel 8086 emulator.

## Features
- Code editor with syntax highlighting, line numbers and current-line highlighting
- Run, Step, Stop (pause; Run resumes), Reset, Clear code, and a 5-level speed control
- Live registers: AX BX CX DX (+ AH/AL ... DH/DL), CS DS SS ES, SI DI BP SP IP
- Flags: CF ZF SF OF PF AF, with recently changed registers/flags highlighted
- Memory viewer (hex + ASCII, navigation, click a byte to edit) and a per-instruction execution log
- Console for `INT 21h` output and for assembly/runtime errors (with line numbers)
- 8 example programs, instruction reference, register and flag explanations

## Technologies
HTML5, CSS3 and vanilla JavaScript. No frameworks, build step or backend.

## Installation
No installation needed: open `index.html` in a modern browser (works from `file://`).
Optional: `python3 -m http.server` in this folder and visit http://localhost:8000.

## How to use
1. Pick an example (**Add two numbers** is a good start) or type your own code.
2. **Step** executes one instruction; **Run** executes continuously (use the speed slider); **Stop** pauses, and **Run** resumes.
3. **Reset** reassembles the code and restores the initial machine state. Editing the code also requires a fresh Run/Reset.
4. Open the **Instructions** and **Registers & flags** tabs for help. Use the memory viewer to inspect results (e.g. `0200`).

## Supported instructions
| Group | Instructions |
|---|---|
| Data transfer | `MOV` `PUSH` `POP` `XCHG` |
| Arithmetic | `ADD` `SUB` `INC` `DEC` `MUL` `DIV` `CMP` (8- and 16-bit, unsigned MUL/DIV) |
| Logic | `AND` `OR` `XOR` `NOT` |
| Control flow | `JMP` `JE`/`JZ` `JNE`/`JNZ` `JC`/`JB` `JNC`/`JAE` `LOOP` `CALL` `RET` |
| Other | `NOP` `HLT` `INT 21h` (AH=02h print char, AH=09h print `$` string, AH=4Ch exit), `INT 20h` |

**Operands:** registers, immediates (decimal, `2Ah`, `0x2A`, `1010b`, `'A'`), `[addr]`, `[BX]`, `[SI]`, `[BX+SI+4]`
(base BX/BP + index SI/DI + displacement), `BYTE PTR` / `WORD PTR`, `OFFSET label`.
**Directives:** `DB` and `DW` (data is placed from `DS:0100h`; a plain data label reads its contents).
Anything else (e.g. `LEA`, `SHL`, `.model`) is reported as an unsupported instruction with its line number.

## Project structure
```
index.html  style.css  README.md
js/flags.js        status flags
js/registers.js    16-bit registers with 8-bit views
js/memory.js       1 MB memory
js/instructions.js instruction table: operand rules + behaviour, ALU/flag logic
js/assembler.js    parser, labels, data, operand validation
js/executor.js     executes one instruction, stack, INT 21h
js/cpu.js          ties the parts together (no DOM)
js/main.js         UI only
js/examples.js  js/reference.js   educational content
tests/             node tests/test.js  (CPU, 135 checks)   node tests/ui.test.js (needs `npm i jsdom`)
```
CPU code never touches the DOM, so it can be tested in Node.

## Testing
`node tests/test.js` runs every instruction (values, flags, memory, stack, control flow, `INT 21h`), all error paths,
and checks that each bundled example assembles and finishes. `tests/ui.test.js` drives the real buttons with jsdom.

## Screenshots
_Add screenshots here, e.g. `docs/editor.png`, `docs/registers.png`._

## Limitations
- **IP is an instruction index**, not a byte address; code is not stored in memory (no self-modifying code, `CALL`/`JMP` take labels only, no `JMP reg`).
- Segments all start at 0000h. Memory is a flat 1 MB array with no wrap-around at 1 MB.
- No signed jumps (`JG`/`JL`...), shifts, `LEA`, string instructions, `IMUL`/`IDIV`, `ADC`/`SBB`, `NEG`, `TEST`, `IN`/`OUT`, or interrupts other than `INT 20h/21h`.
- `INT 21h` has no keyboard input. `MUL`/`DIV` are unsigned only; `DIV` leaves flags unchanged (undefined on real hardware).
- `DB`/`DW` only (no `DUP`, `EQU`, `ORG`, segments or `PROC`). Immediate `PUSH` is rejected, as on the original 8086.
- Timing, prefetch and real-mode quirks are not modelled.

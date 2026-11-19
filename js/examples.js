/* examples.js - sample programs shown in the "Example" menu. */
const EXAMPLES = [
{ name: 'Add two numbers (start here)', code: `; Add two numbers and store the result in memory
MOV AX, 25h          ; first number
MOV BX, 17h          ; second number
ADD AX, BX           ; AX = AX + BX = 3Ch
MOV [0200h], AX      ; store the 16-bit result at DS:0200h
HLT                  ; stop
` },
{ name: 'Loop: sum 1 to 10', code: `; Sum 1..10 with LOOP (CX counts down)
MOV CX, 10
MOV AX, 0            ; running total
MOV BX, 1            ; next number to add
again:
  ADD AX, BX
  INC BX
  LOOP again         ; CX = CX - 1, jump while CX != 0
MOV [0200h], AX      ; AX = 55 (0037h)
HLT
` },
{ name: 'Arithmetic and flags', code: `; ADD / SUB / MUL / DIV and the flags they change
MOV AL, 0FFh
ADD AL, 1            ; AL=00  CF=1 ZF=1 AF=1 PF=1
MOV AL, 7Fh
ADD AL, 1            ; AL=80  OF=1 SF=1 (signed overflow)
MOV AX, 3
SUB AX, 5            ; AX=FFFE  CF=1 SF=1 (borrow)
MOV AL, 12
MOV BL, 10
MUL BL               ; AX = 12 * 10 = 120 (0078h)
MOV AX, 100
MOV BL, 7
DIV BL               ; AL = 14 (quotient), AH = 2 (remainder)
CMP AL, 14           ; ZF=1 means equal
HLT
` },
{ name: 'Logic: AND / OR / XOR / NOT', code: `MOV AL, 0F0h
AND AL, 3Ch          ; AL = 30h  (mask bits)
OR  AL, 01h          ; AL = 31h  (set bit 0)
XOR AL, 0FFh         ; AL = CEh  (flip all bits)
NOT AL               ; AL = 31h  (NOT does not change flags)
XOR AX, AX           ; classic way to clear AX, sets ZF=1
HLT
` },
{ name: 'Memory: table of squares', code: `; Write 1,4,9,... (squares) to DS:0300h..0307h
MOV SI, 0300h        ; SI points at the table
MOV CX, 8
MOV DL, 1            ; current number
fill:
  MOV AL, DL
  MOV BL, DL
  MUL BL             ; AX = AL * BL
  MOV [SI], AL       ; store the square
  INC SI
  INC DL
  LOOP fill
HLT                  ; open the memory viewer at 0300
` },
{ name: 'Hello, World (INT 21h)', code: `; DB defines data at DS:0100h; INT 21h/AH=09h prints a '$'-terminated string
msg DB 'Hello, 8086!', 0Dh, 0Ah, '$'
MOV AH, 09h
MOV DX, OFFSET msg
INT 21h
MOV AH, 4Ch          ; exit
INT 21h
` },
{ name: 'Print 3 + 4', code: `; AH=02h prints the character in DL
MOV DL, 3
ADD DL, 4
ADD DL, '0'          ; number -> ASCII digit
MOV AH, 02h
INT 21h
HLT
` },
{ name: 'Subroutine: CALL / RET / stack', code: `; CALL pushes the return address; RET pops it
MOV AX, 3
CALL double
CALL double          ; AX = 12
PUSH AX              ; watch SP change and the stack memory (SS:SP)
POP BX               ; BX = 12
HLT
double:
  ADD AX, AX
  RET
` },
];

/* Runs inside the emulator's vm context (see test.js). */
function run(src, max = 100000) {
  const c = new CPU(), a = Assembler.assemble(src);
  if (a.errors.length) return { c, errors: a.errors };
  c.load(a); let n = 0;
  while (!c.halted && n++ < max) c.step();
  return { c, errors: [] };
}
let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) pass++; else { fail++; console.log('FAIL', name, info || ''); } }
function t(name, src, exp) {                       // exp: {AX:1, 'F.CF':1, 'M8.200':5, 'M16.200':5, out:'x'}
  const { c, errors } = run(src + '\nHLT');
  if (errors.length) return ok(name, false, JSON.stringify(errors));
  if (c.error) return ok(name, false, c.error);
  for (const [k, v] of Object.entries(exp)) {
    let got;
    if (k.startsWith('F.')) got = c.flags.get(k.slice(2));
    else if (k.startsWith('M8.')) got = c.mem.r8(parseInt(k.slice(3), 16));
    else if (k.startsWith('M16.')) got = c.mem.r16(parseInt(k.slice(4), 16));
    else if (k === 'out') got = c.output;
    else if (k === 'msg') got = c.message;
    else got = c.regs.get(k);
    ok(`${name} [${k}]`, got === v, `expected ${v}, got ${got}`);
  }
}
function terr(name, src, re) {                     // expect an assembly OR runtime error matching re
  const { c, errors } = run(src);
  const msg = errors.length ? errors[0].msg : c.error;
  ok(name, !!msg && re.test(msg), `got: ${msg}`);
}

// ---- MOV ----
t('MOV imm16', 'MOV AX,1234h', { AX: 0x1234, AH: 0x12, AL: 0x34 });
t('MOV 8-bit halves', 'MOV AH,12h\nMOV AL,0FFh', { AX: 0x12FF });
t('MOV reg,reg', 'MOV BX,7\nMOV CX,BX', { CX: 7 });
t('MOV mem16', 'MOV AX,0BEEFh\nMOV [200h],AX', { 'M16.200': 0xBEEF, 'M8.200': 0xEF, 'M8.201': 0xBE });
t('MOV BYTE PTR [BX]', 'MOV BX,300h\nMOV BYTE PTR [BX],5\nMOV AL,[BX]', { 'M8.300': 5, AL: 5 });
t('MOV [BX+SI+2]', 'MOV BX,100h\nMOV SI,10h\nMOV WORD PTR [BX+SI+2],99', { 'M16.112': 99 });
t('MOV binary/char/neg', "MOV AL,1010b\nMOV BL,'A'\nMOV CL,-1", { AL: 10, BL: 65, CL: 255 });
t('MOV DS via AX', 'MOV AX,10h\nMOV DS,AX\nMOV BYTE PTR [0],7', { DS: 0x10, 'M8.100': 7 });
// ---- stack / XCHG ----
t('PUSH/POP', 'MOV AX,5\nPUSH AX\nMOV AX,0\nPOP BX', { BX: 5, SP: 0xFFFE });
t('PUSH decrements SP', 'MOV AX,1\nPUSH AX', { SP: 0xFFFC, 'M16.FFFC': 1 });
t('XCHG', 'MOV AX,1\nMOV BX,2\nXCHG AX,BX', { AX: 2, BX: 1 });
// ---- ADD / SUB / flags ----
t('ADD carry+zero', 'MOV AX,0FFFFh\nADD AX,1', { AX: 0, 'F.CF': 1, 'F.ZF': 1, 'F.SF': 0, 'F.OF': 0 });
t('ADD signed overflow', 'MOV AL,7Fh\nADD AL,1', { AL: 0x80, 'F.OF': 1, 'F.SF': 1, 'F.CF': 0, 'F.AF': 1 });
t('ADD parity', 'MOV AL,1\nADD AL,2', { AL: 3, 'F.PF': 1 });
t('ADD parity odd', 'MOV AL,1\nADD AL,1', { AL: 2, 'F.PF': 0 });
t('SUB equal', 'MOV AX,5\nSUB AX,5', { AX: 0, 'F.ZF': 1, 'F.CF': 0 });
t('SUB borrow', 'MOV AX,3\nSUB AX,5', { AX: 0xFFFE, 'F.CF': 1, 'F.SF': 1 });
t('SUB overflow', 'MOV AL,80h\nSUB AL,1', { AL: 0x7F, 'F.OF': 1 });
t('CMP leaves operands', 'MOV AX,3\nCMP AX,5', { AX: 3, 'F.CF': 1, 'F.ZF': 0 });
t('INC keeps CF', 'MOV AL,0FFh\nADD AL,1\nMOV BL,0FFh\nINC BL', { BL: 0, 'F.ZF': 1, 'F.CF': 1 });
t('INC overflow', 'MOV AL,7Fh\nINC AL', { AL: 0x80, 'F.OF': 1 });
t('DEC wrap', 'MOV AX,0\nDEC AX', { AX: 0xFFFF, 'F.SF': 1, 'F.CF': 0 });
t('INC mem', 'MOV WORD PTR [200h],9\nINC WORD PTR [200h]', { 'M16.200': 10 });
// ---- MUL / DIV ----
t('MUL byte', 'MOV AL,10\nMOV BL,20\nMUL BL', { AX: 200, 'F.CF': 0, 'F.OF': 0 });
t('MUL byte carry', 'MOV AL,80h\nMOV BL,2\nMUL BL', { AX: 0x100, 'F.CF': 1, 'F.OF': 1 });
t('MUL word', 'MOV AX,1000h\nMOV BX,10h\nMUL BX', { AX: 0, DX: 1, 'F.CF': 1 });
t('MUL word small', 'MOV AX,300\nMOV BX,3\nMUL BX', { AX: 900, DX: 0, 'F.CF': 0 });
t('DIV byte', 'MOV AX,100\nMOV BL,7\nDIV BL', { AL: 14, AH: 2 });
t('DIV word', 'MOV DX,1\nMOV AX,0\nMOV BX,2\nDIV BX', { AX: 0x8000, DX: 0 });
terr('DIV by zero', 'MOV AX,1\nMOV BL,0\nDIV BL', /division by zero/);
terr('DIV overflow', 'MOV AX,0FFFFh\nMOV BL,1\nDIV BL', /does not fit/);
// ---- logic ----
t('AND', 'MOV AL,0F0h\nAND AL,3Ch', { AL: 0x30, 'F.CF': 0, 'F.OF': 0 });
t('OR', 'MOV AL,30h\nOR AL,1', { AL: 0x31 });
t('XOR self', 'MOV AX,1234h\nXOR AX,AX', { AX: 0, 'F.ZF': 1, 'F.PF': 1 });
t('NOT', 'MOV AL,0Fh\nNOT AL', { AL: 0xF0 });
t('NOT word', 'MOV AX,0\nNOT AX', { AX: 0xFFFF });
t('AND sets SF', 'MOV AL,0FFh\nAND AL,80h', { 'F.SF': 1 });
// ---- control flow ----
t('JMP', 'MOV AX,1\nJMP skip\nMOV AX,2\nskip: NOP', { AX: 1 });
t('JE taken', 'MOV AX,5\nCMP AX,5\nJE yes\nMOV BX,1\nyes: NOP', { BX: 0 });
t('JZ not taken', 'MOV AX,5\nCMP AX,4\nJZ yes\nMOV BX,1\nyes: NOP', { BX: 1 });
t('JNE', 'MOV AX,5\nCMP AX,4\nJNE yes\nMOV BX,1\nyes: NOP', { BX: 0 });
t('JNZ not taken', 'MOV AX,5\nCMP AX,5\nJNZ yes\nMOV BX,1\nyes: NOP', { BX: 1 });
t('JC taken', 'MOV AX,1\nCMP AX,2\nJC yes\nMOV BX,1\nyes: NOP', { BX: 0 });
t('JNC taken', 'MOV AX,2\nCMP AX,1\nJNC yes\nMOV BX,1\nyes: NOP', { BX: 0 });
t('LOOP sum 1..10', 'MOV CX,10\nMOV AX,0\nMOV BX,1\nagain: ADD AX,BX\nINC BX\nLOOP again', { AX: 55, CX: 0 });
t('CALL/RET', 'MOV AX,3\nCALL dbl\nCALL dbl\nHLT\ndbl: ADD AX,AX\nRET', { AX: 12, SP: 0xFFFE });
t('label on own line', 'MOV CX,2\nl1:\nDEC CX\nJNZ l1', { CX: 0 });
// ---- data + INT 21h ----
t('DB + INT 21h/09h', "msg DB 'Hi', 0Dh, 0Ah, '$'\nMOV AH,9\nMOV DX,OFFSET msg\nINT 21h", { out: 'Hi\r\n' });
t('data label contents', 'v DB 42\nMOV AL,v\nMOV v,7', { AL: 42, 'M8.100': 7 });
t('DW + [label+1]', 'w DW 1234h\nMOV AL,[w+1]', { AL: 0x12 });
t('INT 21h/02h', 'MOV DL,3\nADD DL,4\nADD DL,30h\nMOV AH,2\nINT 21h', { out: '7' });
t('INT 21h/4Ch', 'MOV AH,4Ch\nMOV AL,3\nINT 21h\nMOV BX,9', { BX: 0, msg: 'Program terminated with exit code 3 (INT 21h/4Ch)' });
t('comments + case', 'mov ax, 5 ; five\n; nothing\nMoV bx , 6', { AX: 5, BX: 6 });
t('hex 0x', 'MOV AX,0x10', { AX: 16 });
// ---- error handling ----
terr('unsupported instr', 'LEA AX,[BX]', /Unsupported instruction 'LEA'/);
terr('operand count', 'MOV AX', /expects 2 operand/);
terr('size mismatch', 'MOV AL,BX', /size mismatch/);
terr('size unknown', 'MOV [200h],5', /BYTE PTR or WORD PTR/);
terr('mem,mem', 'MOV [1],[2]', /two memory operands/);
terr('undefined label', 'JMP nowhere', /Undefined label 'nowhere'/);
terr('undefined symbol', 'MOV AX,foo', /Undefined symbol 'foo'/);
terr('imm too big', 'MOV AL,300', /does not fit/);
terr('imm to segreg', 'MOV DS,5', /segment register/);
terr('bad address reg', 'MOV AX,[AX]', /cannot be used as an address/);
terr('missing bracket', 'MOV AX,[BX', /Missing '\]'/);
terr('POP empty', 'POP AX', /Stack underflow/);
terr('RET empty', 'RET', /Stack underflow/);
terr('INT unsupported', 'INT 13h', /not supported/);
terr('INT fn unsupported', 'MOV AH,1\nINT 21h', /AH=01h is not supported/);
terr('dup label', 'a: NOP\na: NOP', /already defined/);
terr('imm dest', 'MOV 5,AX', /cannot be an immediate/);
terr('PUSH 8-bit', 'PUSH AL', /16-bit/);
{ const { c } = run('MOV AX,1'); ok('falls off end', c.halted && /ran past/.test(c.message)); }
{ const { c } = run('MOV AX,1\nHLT\nMOV AX,2'); ok('HLT stops', c.regs.get('AX') === 1 && c.halted); }
{ const { c } = run('x: JMP x', 500); ok('infinite loop is interruptible', !c.halted && c.steps === 500); }
// ---- bundled examples must all assemble and finish cleanly ----
if (typeof EXAMPLES !== 'undefined') for (const e of EXAMPLES) {
  const { c, errors } = run(e.code, 50000);
  ok('example: ' + e.name, !errors.length && !c.error && c.halted, JSON.stringify(errors) + c.error);
}
console.log(`${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;

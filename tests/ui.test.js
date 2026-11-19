// UI smoke test (needs `npm i jsdom`): loads index.html, clicks the real buttons, checks the DOM.
const { JSDOM } = require('jsdom'), path = require('path');
(async () => {
  const dom = await JSDOM.fromFile(path.join(__dirname, '..', 'index.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true });
  const w = dom.window, d = w.document, $ = id => d.getElementById(id);
  await new Promise(r => w.addEventListener('load', r));
  let bad = 0; const eq = (n, a, b) => { if (a !== b) { bad++; console.log('FAIL', n, 'got', a, 'expected', b); } };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const pick = i => { $('examples').value = i; $('examples').dispatchEvent(new w.Event('change')); };
  eq('initial status', $('status').textContent, 'Ready');
  eq('no js errors: gp rows', d.querySelectorAll('#gp tr').length, 4);
  // Step through example 0
  $('step').click(); eq('step1 AX', $('r-AX').textContent, '0025'); eq('AL shown', $('r-AL').textContent, '25');
  eq('step1 AX highlighted', $('r-AX').classList.contains('chg'), true);
  eq('current line highlighted', d.querySelector('#hl .cur') && d.querySelector('#hl .cur').textContent.startsWith('MOV BX'), true);
  $('step').click(); $('step').click(); eq('after ADD AX', $('r-AX').textContent, '003C'); eq('ADD clears flags', $('f-ZF').classList.contains('on'), false);
  $('step').click(); eq('memory written', d.querySelector('#mem .b').textContent, '00');   // viewer at 0000 (result is at 0200)
  $('mgo').previousElementSibling.value = '0200'; $('mgo').click(); eq('mem 0200', d.querySelector('#mem .b').textContent, '3C');
  eq('mem byte highlighted', d.querySelector('#mem .b').classList.contains('chg'), true);
  $('step').click(); eq('HLT status', $('status').textContent, 'Halted'); eq('step disabled', $('step').disabled, true);
  // Reset, then Run to the end
  $('reset').click(); eq('reset AX', $('r-AX').textContent, '0000'); eq('reset status', $('status').textContent, 'Ready');
  $('speed').value = 5; $('run').click(); await sleep(60); eq('run finished', $('status').textContent, 'Halted'); eq('run AX', $('r-AX').textContent, '003C');
  // Hello world output
  pick(5); $('speed').value = 5; $('run').click(); await sleep(60);
  eq('hello output', d.querySelector('#out .prog').textContent, 'Hello, 8086!\n');
  // Stop + resume on an infinite loop
  $('clear').click(); $('code').value = 'MOV CX,5\nl: INC AX\nJMP l'; $('code').dispatchEvent(new w.Event('input'));
  $('speed').value = 4; $('run').click(); await sleep(60); eq('running', $('status').textContent, 'Running');
  $('stop').click(); const ax = $('r-AX').textContent; eq('stopped', $('status').textContent.startsWith('Stopped'), true);
  await sleep(40); eq('stop really stops', $('r-AX').textContent, ax);
  $('run').click(); await sleep(40); $('stop').click(); eq('resume advances AX', $('r-AX').textContent !== ax, true);
  // Errors
  $('code').value = 'MOV AX,1\nLEA AX,[BX]'; $('code').dispatchEvent(new w.Event('input')); $('run').click();
  eq('asm error status', $('status').textContent, 'Assembly error'); eq('error line marked', !!d.querySelector('#hl .bad'), true);
  eq('error text', /Unsupported instruction 'LEA'/.test($('out').textContent), true);
  $('code').value = 'MOV AX,1\nMOV BL,0\nDIV BL'; $('code').dispatchEvent(new w.Event('input')); $('run').click(); await sleep(30);
  eq('runtime error status', $('status').textContent, 'Runtime error'); eq('runtime error line', d.querySelector('#hl .bad').textContent, 'DIV BL');
  // all examples run to completion in the UI
  for (let i = 0; i < 8; i++) { pick(i); $('speed').value = 5; $('run').click(); await sleep(40); eq('example ' + i, $('status').textContent, 'Halted'); }
  console.log(bad ? bad + ' UI failures' : 'UI smoke test passed'); process.exit(bad ? 1 : 0);
})();

// Usage: node tests/test.js   - loads the browser scripts into one VM context (no DOM) and runs cases.js
const vm = require('vm'), fs = require('fs'), path = require('path');
const ctx = vm.createContext({ console, process });
const js = f => fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8');
for (const f of ['flags', 'registers', 'memory', 'instructions', 'assembler', 'executor', 'cpu', 'examples']) vm.runInContext(js(f), ctx, { filename: f + '.js' });
vm.runInContext(fs.readFileSync(path.join(__dirname, 'cases.js'), 'utf8'), ctx, { filename: 'cases.js' });

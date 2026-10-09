const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');

const directory = path.resolve(__dirname, '../frontend');
const env = { ...process.env };
if (!env.CHROME_BIN && process.platform === 'win32') {
  const candidates = [
    [env.ProgramFiles, 'Google/Chrome/Application/chrome.exe'],
    [env['ProgramFiles(x86)'], 'Google/Chrome/Application/chrome.exe'],
    [env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'],
    [env.ProgramFiles, 'Microsoft/Edge/Application/msedge.exe'],
    [env['ProgramFiles(x86)'], 'Microsoft/Edge/Application/msedge.exe']
  ].filter(([base]) => base).map(([base, suffix]) => path.join(base, suffix));
  env.CHROME_BIN = candidates.find(existsSync);
}
const cli = [
  path.join(directory, 'node_modules/@angular/cli/bin/ng.js'),
  path.resolve(directory, '../node_modules/@angular/cli/bin/ng.js')
].find(existsSync);
if (!cli) throw new Error('Instala las dependencias con npm ci antes de ejecutar las pruebas.');
const child = spawn(process.execPath, [cli, 'test', '--watch=false', '--browsers=ChromeHeadless', ...process.argv.slice(2)], {
  cwd: directory, env, stdio: 'inherit', windowsHide: true
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });

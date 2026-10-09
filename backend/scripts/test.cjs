const { spawn } = require('node:child_process');
const { readdirSync } = require('node:fs');
const path = require('node:path');

const directory = path.resolve(__dirname, '..');
const integration = process.argv.includes('--integration');
const env = integration ? { ...process.env, ECOPLACA_INTEGRATION: '1' } : {
  ...process.env,
  NODE_ENV: 'test', ECOPLACA_INTEGRATION: '0',
  DB_HOST: '127.0.0.1', DB_PORT: '3306', DB_USER: 'ecoplaca_test',
  DB_PASSWORD: 'test-only-placeholder', DB_NAME: 'ecoplaca_test',
  JWT_SECRET: 'local-test-only-secret', JWT_EXPIRES_IN: '7d'
};
const files = integration ? ['tests/integration.test.ts'] : readdirSync(path.join(directory, 'tests'))
  .filter(file => file.endsWith('.test.ts')).sort().map(file => `tests/${file}`);
const child = spawn(process.execPath, ['--require', 'ts-node/register', '--test', ...files], {
  cwd: directory, env, stdio: 'inherit', windowsHide: true
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });

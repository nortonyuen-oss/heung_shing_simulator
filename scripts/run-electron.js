const { spawn } = require('child_process');
const electronPath = require('electron');
const performanceMode = process.argv.includes('--performance')
  || process.env.ELECTRON_PERFORMANCE_MODE === '1';

const child = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: undefined,
    ELECTRON_PERFORMANCE_MODE: performanceMode ? '1' : undefined,
    ELECTRON_DISABLE_UPDATES: performanceMode ? '1' : process.env.ELECTRON_DISABLE_UPDATES,
  },
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

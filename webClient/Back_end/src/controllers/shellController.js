import pty from 'node-pty';
import os from 'os';

const shell = process.platform === 'win32' ? 'cmd.exe' : 'bash';

export const handleShellConnection = (ws, projectPath) => {
  console.log('Shell client connected, cwd:', projectPath);

  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-color',
    cols: 80,
    rows: 24,
    cwd: projectPath || process.env.HOME || process.cwd(),
    env: process.env,
  });

  ptyProcess.onData((data) => {
    ws.send(data);
  });

  ws.on('message', (msg) => {
    const data = msg.toString();
    try {
      const json = JSON.parse(data);
      if (json.type === 'resize') {
        ptyProcess.resize(json.cols, json.rows);
      } else if (json.type === 'input') {
        ptyProcess.write(json.data);
      }
    } catch (e) {
      // If it's not JSON, treat it as raw input (fallback)
      ptyProcess.write(data);
    }
  });

  ws.on('close', () => {
    ptyProcess.kill();
    console.log('Shell client disconnected');
  });
};

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

let processes = [];
let activeConnections = 0;
let isRunning = false;

export const startXtermStream = () => {
    if (isRunning) return;
    isRunning = true;
    console.log('🚀 Starting environment because a user connected...');

    const env = { ...process.env };
    delete env.WAYLAND_DISPLAY;
    delete env.XDG_RUNTIME_DIR;
    delete env.XDG_SESSION_TYPE;
    delete env.XDG_CURRENT_DESKTOP;
    env.DISPLAY = ':1';

    // 1. Xvfb
    const xvfb = spawn('Xvfb', [':1', '-screen', '0', '1920x1080x24'], { env });
    xvfb.on('error', (err) => console.error('Failed to start Xvfb:', err));
    processes.push(xvfb);

    setTimeout(() => {
        // 2. Openbox (fallback to xfwm4 if openbox is missing)
        const wm = spawn('openbox', [], { env });
        wm.on('error', (err) => {
            console.error('Failed to start openbox, trying xfwm4:', err);
            const fallbackWm = spawn('xfwm4', [], { env });
            fallbackWm.on('error', (err2) => console.error('Failed to start fallback xfwm4:', err2));
            processes.push(fallbackWm);
        });
        processes.push(wm);
    }, 1000);

    setTimeout(() => {
        // 4. VNC & Websockify
        const vnc = spawn('x11vnc', ['-display', ':1', '-nopw', '-forever', '-shared'], { env });
        vnc.on('error', (err) => console.error('Failed to start x11vnc:', err));
        
        const bridge = spawn('websockify', ['8081', 'localhost:5900'], { env });
        bridge.on('error', (err) => console.error('Failed to start websockify:', err));
        
        processes.push(vnc, bridge);
    }, 2000);
}

export const stopXtermStream = () => {
    console.log('🛑 No active connections. Shutting down background processes...');
    processes.forEach(p => {
        try { p.kill('SIGTERM'); } catch (e) {}
    });
    processes = [];
    isRunning = false;
    
    // Force kill any lingering Xvfb lock
    const rmLock = spawn('rm', ['-f', '/tmp/.X1-lock']);
    rmLock.on('error', (err) => console.error('Failed to remove Xvfb lock file:', err));
}

export const incrementConnections = () => {
    activeConnections++;
    startXtermStream();
};

export const decrementConnections = () => {
    activeConnections--;
    console.log(`Connection closed. Active: ${activeConnections}`);
    if (activeConnections <= 0) {
        // Wait 5 seconds before killing processes to allow for page refreshes
        setTimeout(() => {
            if (activeConnections <= 0) stopXtermStream();
        }, 5000);
    }
};

export const getVncPage = (req, res) => {
    const hostIP = req.hostname === 'localhost' ? 'localhost' : req.hostname;
    res.send(`
        <body style="margin:0; background:#2e2e2e; color:white; font-family:sans-serif;">
            <div id="status" style="padding:10px; background:#444;">Status: Waiting for connection...</div>
            <iframe 
                src="/novnc/vnc.html?autoconnect=true&host=${hostIP}&port=8081" 
                style="width:100%; height:90vh; border:none;">
            </iframe>
            <script>
                // Heartbeat to keep the server informed this tab is open
                const ws = new WebSocket('ws://' + window.location.host + '/vnc-heartbeat');
                ws.onopen = () => document.getElementById('status').innerText = "Status: Connected (Processes Running)";
                ws.onclose = () => document.getElementById('status').innerText = "Status: Disconnected";
            </script>
        </body>
    `);
};

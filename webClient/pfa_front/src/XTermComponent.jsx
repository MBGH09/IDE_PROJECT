import React, { useEffect, useRef } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";


const XTermComponent = ({ projectId, dockerMode, imageID }) => {
  const terminalRef = useRef(null);
  const containerRef = useRef(null);
  const commandRef = useRef(""); // Buffer for the current command
  const dockerModeRef = useRef(dockerMode);
  const imageIDRef = useRef(imageID);

  // Update refs when props change
  useEffect(() => {
    dockerModeRef.current = dockerMode;
    imageIDRef.current = imageID;
  }, [dockerMode, imageID]);

  useEffect(() => {
    const wsUrl = `ws://${window.location.hostname}:5001/shell${projectId ? `?projectId=${projectId}` : ''}`;
    const socket = new WebSocket(wsUrl);

    const term = new Terminal({
      cursorBlink: true,
      convertEol: true,
      theme: { 
        background: "#252526",
        foreground: "#cccccc",
        cursor: "#ffffff"
      },
      fontSize: 13,
      fontFamily: "'Cascadia Code', 'Consolas', 'Liberation Mono', Menlo, Courier, monospace",
      allowProposedApi: true
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(terminalRef.current);

    const sendResize = (cols, rows) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "resize", cols, rows }));
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      sendResize(term.cols, term.rows);
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    term.onData((data) => {
      if (socket.readyState !== WebSocket.OPEN) return;

      if (dockerModeRef.current) {
        // Handle input for Docker Mode
        if (data === "\r") { // Enter key
          const fullCmd = commandRef.current.trim();
          if (fullCmd) {
            // Prepend Docker boilerplate
            // We use -it for interaction, --rm to clean up, -v for current dir
            // Added -v /tmp/.X11-unix:/tmp/.X11-unix and -e DISPLAY=:1 for GUI support
            const dockerCmd = `docker run --rm -it -v "$(pwd)":/app -v /app/node_modules -p 8000:8000 -w /app ${imageIDRef.current || 'node:latest'} sh -c "${fullCmd.replace(/"/g, '\\"')}"\r`;
            socket.send(JSON.stringify({ type: "input", data: dockerCmd }));
          } else {
            socket.send(JSON.stringify({ type: "input", data: "\r" }));
          }
          commandRef.current = "";
        } else if (data === "\x7f") { // Backspace
          if (commandRef.current.length > 0) {
            commandRef.current = commandRef.current.slice(0, -1);
            term.write("\b \b");
          }
        } else if (data.length === 1 && data.charCodeAt(0) >= 32) { // Printable chars
          commandRef.current += data;
          term.write(data);
        } else if (data.length > 1) { // Likely a paste
          const lines = data.split(/[\r\n]+/);
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line) {
              const dockerCmd = `docker run --rm -it -v "$(pwd)":/app -w /app ${imageIDRef.current || 'node:latest'} sh -c "${line.replace(/"/g, '\\"')}"\r`;
              socket.send(JSON.stringify({ type: "input", data: dockerCmd }));
            }
          }
          commandRef.current = "";
        } else {
          // Pass through control sequences (arrows, etc)
          socket.send(JSON.stringify({ type: "input", data }));
        }
      } else {
        // Normal mode: send data immediately
        socket.send(JSON.stringify({ type: "input", data }));
      }
    });

    term.onResize(({ cols, rows }) => {
      sendResize(cols, rows);
    });

    socket.onmessage = (event) => {
      term.write(event.data);
    };

    socket.onclose = () => {
      term.write("\r\nDisconnected from server.\r\n");
    };

    socket.onopen = () => {
      // Send initial size once socket is open
      fitAddon.fit();
      sendResize(term.cols, term.rows);
    };

    term.write("Welcome to PFA Terminal\r\n$ ");

    // Initial fit
    setTimeout(() => {
      fitAddon.fit();
      sendResize(term.cols, term.rows);
    }, 100);

    return () => {
      resizeObserver.disconnect();
      term.dispose();
      socket.close();
    };
  }, [projectId]);


  return (
    <div ref={containerRef} style={{ height: "100%", width: "100%", overflow: "hidden" }}>
      <div ref={terminalRef} style={{ height: "100%", width: "100%" }} />
    </div>
  );
};

export default XTermComponent;

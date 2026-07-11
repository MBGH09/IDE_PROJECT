import { useState, useRef, useEffect, useMemo } from 'react'
import { Editor } from '@monaco-editor/react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { WebrtcProvider } from 'y-webrtc'
import { MonacoBinding } from 'y-monaco'
import { Tree } from "react-arborist";
import { 
  File, 
  Folder, 
  ChevronRight, 
  ChevronDown, 
  FileCode, 
  FileJson, 
  FileText,
  Save,
  X,
  Terminal as TerminalIcon,
  ArrowLeft,
  Monitor
} from "lucide-react";
import XTermComponent from './XTermComponent';
import "./IDE.css";

const API_BASE = `http://${window.location.hostname}:5001/api/files`;
const DOCKER_API = `http://${window.location.hostname}:5001/api/docker`;

const getFileIcon = (name, isFolder) => {
  if (isFolder) {
    return <Folder size={16} color="#dcb67a" />;
  }
  
  const ext = name.split(".").pop();
  switch (ext) {
    case "js":
    case "jsx":
    case "ts":
    case "tsx":
      return <FileCode size={16} color="#e1b12c" />;
    case "json":
      return <FileJson size={16} color="#e1b12c" />;
    case "html":
      return <FileCode size={16} color="#e67e22" />;
    case "css":
      return <FileCode size={16} color="#3498db" />;
    case "md":
      return <FileText size={16} color="#95a5a6" />;
    default:
      return <File size={16} color="#ecf0f1" />;
  }
};

const Node = ({ node, style, dragHandle }) => {
  const isSelected = node.isSelected;

  return (
    <div
      style={style}
      ref={dragHandle}
      className={`tree-node ${isSelected ? "selected" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        if (node.isInternal) {
          node.toggle();
        } else {
          node.select();
        }
      }}
    >
      <span className="arrow-container">
        {node.isInternal && (node.isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
      </span>
      <span className="icon-container">
        {getFileIcon(node.data.name, node.isInternal)}
      </span>
      <span className="node-text">{node.data.name}</span>
    </div>
  );
};

function IDE({ projectId, onBack, token, currentUser }) {
  const [editor, setEditor] = useState(null)
  const [filePath, setFilePath] = useState(null);
  const [data, setData] = useState([]);
  const [code, setCode] = useState(null);
  const [openFiles, setOpenFiles] = useState([]);
  const [imageID, setImageID] = useState("");
  const [startCommand, setStartCommand] = useState("");
  const [dockerMode, setDockerMode] = useState(false);
  const [containerID, setContainerID] = useState(null);
  const [containerUrl, setContainerUrl] = useState(null);
  const [directUrl, setDirectUrl] = useState(null);
  const [traefikAvailable, setTraefikAvailable] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [showTerminal, setShowTerminal] = useState(true);
  const [terminalTab, setTerminalTab] = useState("terminal"); // "terminal" or "vnc"
  const [remoteCursors, setRemoteCursors] = useState({});
  const [editorPositions, setEditorPositions] = useState({});
  const treeRef = useRef();
  const providerRef = useRef(null);

  const userColor = useMemo(() => {
    const colors = [
      '#f94144', '#f3722c', '#f8961e', '#f9844a', '#f9c74f', 
      '#90be6d', '#43aa8b', '#4d908e', '#577590', '#277da1'
    ];
    const name = currentUser?.name || 'Anonymous';
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }, [currentUser]);

  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'x-project-id': projectId
  };

  const handleMouseMove = (e) => {
    if (providerRef.current) {
      providerRef.current.awareness.setLocalStateField('cursor', {
        x: e.clientX,
        y: e.clientY,
        updated: Date.now()
      });
    }
  };

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Update remote positions for typing cursors
  useEffect(() => {
    if (!editor || Object.keys(remoteCursors).length === 0) return;

    const updatePositions = () => {
      const positions = {};
      Object.entries(remoteCursors).forEach(([clientID, state]) => {
        if (state.typing && state.typing.filePath === filePath) {
          const pos = editor.getScrolledVisiblePosition({
            lineNumber: state.typing.lineNumber,
            column: state.typing.column
          });
          if (pos) {
            positions[clientID] = pos;
          }
        }
      });
      setEditorPositions(positions);
    };

    updatePositions();
    const listener = editor.onDidScrollChange(updatePositions);
    const interval = setInterval(updatePositions, 100); // Periodic check for other changes

    return () => {
      listener.dispose();
      clearInterval(interval);
    };
  }, [editor, remoteCursors, filePath]);

  useEffect(() => {
    if (!editor || !filePath || !providerRef.current) return;

    const disposable = editor.onDidChangeCursorPosition((e) => {
      providerRef.current.awareness.setLocalStateField('typing', {
        lineNumber: e.position.lineNumber,
        column: e.position.column,
        filePath: filePath,
        updated: Date.now()
      });
    });

    return () => disposable.dispose();
  }, [editor, filePath]);

  const runProject = async () => {
    if (!imageID) return alert("Enter an Image ID");
    setIsLaunching(true);
    try {
      const res = await fetch(`${DOCKER_API}/run`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ imageID, startCommand, port: "3000" })
      });
      const data = await res.json();
      setContainerID(data.containerID);
      setContainerUrl(data.previewURL);
      setDirectUrl(data.directURL);
      setTraefikAvailable(!!data.traefikAvailable);
    } catch (err) {
      console.error(err);
      alert("Failed to launch");
    } finally {
      setIsLaunching(false);
    }
  };
  const stopProject = async () => {
    if (!containerID) return;
    try {
      await fetch(`${DOCKER_API}/stop`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ containerID })
      });
      setContainerID(null);
      setContainerUrl(null);
      setDirectUrl(null);
      setTraefikAvailable(false);
    } catch (err) {
      console.error(err);
    }
  };


  const loadTree = async () => {
    try {
      const res = await fetch(`${API_BASE}?projectId=${projectId}`, {
        headers: authHeaders
      });
      const data = await res.json();
      setData(data);
    } catch (err) {
      console.error("Failed to load tree", err);
    }
  };

  useEffect(() => {
    loadTree();
  }, [projectId]);

  const openFile = async (path) => {
    if (!path) return;
    try {
      const res = await fetch(`${API_BASE}/file?path=${path}&projectId=${projectId}`, {
        headers: authHeaders
      });
      const text = await res.text();

      setFilePath(path);
      setCode(text);

      setOpenFiles((prev) => {
        if (!prev.includes(path)) {
          return [...prev, path];
        }
        return prev;
      });
    } catch (err) {
      console.error("Failed to open file", err);
    }
  };

  const saveFile = async (path, content) => {
    if (!path || content === undefined || content === null) return;
    try {
      await fetch(`${API_BASE}/file`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ path, content, projectId }),
      });
    } catch (err) {
      console.error("Failed to save file", err);
    }
  };

  const closeFile = (e, path) => {
    e.stopPropagation();
    const newOpenFiles = openFiles.filter(f => f !== path);
    setOpenFiles(newOpenFiles);
    if (filePath === path) {
      const nextFile = newOpenFiles.length > 0 ? newOpenFiles[0] : null;
      setFilePath(nextFile);
      if (nextFile) {
        openFile(nextFile);
      } else {
        setCode(null);
      }
    }
  };

  useEffect(() => {
    if (!filePath || !editor) return;
    
    const interval = setInterval(() => {
      if (editor) {
        const content = editor.getValue();
        if (content) saveFile(filePath, content);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [filePath, editor]);

  const getLanguage = (file) => {
    if (!file) return "plaintext";
    const ext = file.split(".").pop();
    
    const map = {
      js: "javascript",
      jsx: "javascript",
      ts: "typescript",
      tsx: "typescript",
      json: "json",
      html: "html",
      css: "css",
      py: "python",
      md: "markdown"
    };
    return map[ext] || "plaintext";
  };

  useEffect(() => {
    if (!editor || !filePath || code === null) return;

    const doc = new Y.Doc();
    const normalizedPath = filePath.replace(/[\\/]/g, "-").toLowerCase();
    const roomName = `pfa-room-${projectId}-${normalizedPath}`;

    const provider = new WebsocketProvider(
      `ws://${window.location.hostname}:5001/yjs`,
      roomName,
      doc
    );
    providerRef.current = provider;

    const webrtcProvider = new WebrtcProvider(roomName, doc, {
      awareness: provider.awareness,
      signaling: [
        'wss://y-webrtc-signaling-eu.herokuapp.com',
        'wss://y-webrtc-signaling-us.herokuapp.com',
        'wss://y-webrtc.codemirror.net'
      ]
    });

    provider.awareness.setLocalStateField('user', {
      name: currentUser?.name || 'Anonymous',
      color: userColor
    });

    const type = doc.getText("monaco");
    let binding = null;

    const onSync = async (isSynced) => {
      if (isSynced) {
        if (type.toString() === "") {
          await new Promise(r => setTimeout(r, 100 + Math.random() * 200));
          const otherPeers = [...provider.awareness.getStates().keys()].filter(
            id => id !== provider.awareness.clientID
          );
          if (type.toString() === "" && otherPeers.length === 0 && code) {
            doc.transact(() => {
              type.insert(0, code);
            }, "initial-seed");
          }
        }
        if (!binding) {
          binding = new MonacoBinding(
            type,
            editor.getModel(),
            new Set([editor]),
            provider.awareness
          );
        }
      }
    };

    const handleAwarenessChange = () => {
      const states = provider.awareness.getStates();
      const cursors = {};
      states.forEach((state, clientID) => {
        if (clientID !== provider.awareness.clientID && state.user) {
          cursors[clientID] = state;
        }
      });
      setRemoteCursors(cursors);
    };

    provider.on('sync', onSync);
    provider.awareness.on('change', handleAwarenessChange);

    return () => {
      provider.off('sync', onSync);
      provider.awareness.off('change', handleAwarenessChange);
      if (binding) binding.destroy();
      webrtcProvider.destroy();
      provider.destroy();
      doc.destroy();
      providerRef.current = null;
    };
  }, [filePath, editor, code, projectId, currentUser, userColor]);

  function handleEditorDidMount(editorInstance) {
    setEditor(editorInstance);
  }

  return (
    <div className="app-container">
      {/* 🖱️ Global Cursors */}
      {Object.entries(remoteCursors).map(([clientID, state]) => {
        const { user, cursor } = state;
        if (!cursor) return null;
        return (
          <div 
            key={clientID} 
            className="remote-cursor" 
            style={{ 
              left: cursor.x, 
              top: cursor.y,
              '--cursor-color': user.color
            }}
          >
            <div className="cursor-pointer">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.5 2.5L17.5 10L10 12.5L7.5 17.5L2.5 2.5Z" fill={user.color} stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="cursor-label" style={{ backgroundColor: user.color }}>
              {user.name}
            </div>
          </div>
        );
      })}
      {/* 📂 Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>IDE</span>
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#bbbbbb', cursor: 'pointer' }}>
            <ArrowLeft size={14} />
          </button>
        </div>
        
        <div className="sidebar-header">DOCKER</div>
        <div className="docker-controls">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <input 
              type="checkbox" 
              id="dockerMode" 
              checked={dockerMode} 
              onChange={(e) => setDockerMode(e.target.checked)} 
              style={{ cursor: 'pointer' }}
            />
            <label htmlFor="dockerMode" style={{ fontSize: '11px', opacity: 0.8, cursor: 'pointer', userSelect: 'none' }}>
              Run commands in Docker
            </label>
          </div>
          <input 
            type="text" 
            placeholder="Image ID (e.g. node:18-alpine)" 
            value={imageID}
            onChange={(e) => setImageID(e.target.value)}
            className="docker-input"
          />
          <input 
            type="text" 
            placeholder="Start Command (e.g. npm start)" 
            value={startCommand}
            onChange={(e) => setStartCommand(e.target.value)}
            className="docker-input"
            style={{ marginTop: '4px' }}
          />
          {!containerID ? (
            <button onClick={runProject} disabled={isLaunching} className="run-btn">
              {isLaunching ? "Launching..." : "Run"}
            </button>
          ) : (
            <button onClick={stopProject} className="stop-btn">Stop</button>
          )}
        </div>
        {(containerUrl || directUrl) && (
          <div className="container-info">
            {directUrl && (
              <div style={{ marginBottom: '4px' }}>
                <a href={directUrl} target="_blank" rel="noreferrer">✅ Direct: {directUrl} ↗</a>
              </div>
            )}
            {containerUrl && (
              <div>
                <a href={containerUrl} target="_blank" rel="noreferrer">
                  {traefikAvailable ? '🌐' : '⚠️'} Proxy: {containerUrl} {!traefikAvailable && '(Traefik offline)'} ↗
                </a>
              </div>
            )}
          </div>
        )}

        <div className="sidebar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>EXPLORER</span>
          <button 
            onClick={loadTree} 
            style={{ background: 'none', border: 'none', color: '#bbbbbb', cursor: 'pointer', padding: '4px' }}
            title="Refresh Explorer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path></svg>
          </button>
        </div>
        <div className="tree-container">
          {data.length > 0 ? (
            <Tree
              ref={treeRef}
              data={data}
              openByDefault={false}
              width={260}
              height={window.innerHeight - 200}
              indent={16}
              rowHeight={24}
              onSelect={(nodes) => {
                const node = nodes[0];
                if (node && !node.isInternal) {
                  openFile(node.data.id);
                }
              }}
            >
              {Node}
            </Tree>
          ) : (
            <div style={{ padding: '16px', fontSize: '12px', opacity: 0.5 }}>No files found.</div>
          )}
        </div>
      </div>

      {/* 🧠 Editor Area */}
      <div className="editor-area">
        {(containerUrl || directUrl) && (
          <div className="url-banner" style={{ 
            background: traefikAvailable ? '#2d5a27' : '#5a3e27', 
            color: 'white', 
            padding: '8px 16px', 
            display: 'flex', 
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '13px',
            borderBottom: '1px solid #3c3c3c'
          }}>
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              {directUrl && (
                <span>
                  ✅ <strong>Direct:</strong>{' '}
                  <a href={directUrl} target="_blank" rel="noreferrer" style={{ color: '#9cdcfe', textDecoration: 'underline' }}>{directUrl}</a>
                </span>
              )}
              {containerUrl && (
                <span style={{ opacity: traefikAvailable ? 1 : 0.55 }}>
                  {traefikAvailable ? '🌐' : '⚠️'} <strong>Proxy:</strong>{' '}
                  <a href={containerUrl} target="_blank" rel="noreferrer" style={{ color: '#9cdcfe', textDecoration: 'underline' }}>{containerUrl}</a>
                  {!traefikAvailable && <em style={{ fontSize: '11px', marginLeft: '6px' }}>(Traefik offline — use Direct)</em>}
                </span>
              )}
            </div>
            <button onClick={() => { setContainerUrl(null); setDirectUrl(null); setTraefikAvailable(false); }} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}>
              <X size={14} />
            </button>
          </div>
        )}
        {/* Tabs */}
        <div className="tabs-container">
          <div className="tabs-list">
            {openFiles.map((file) => (
              <div
                key={file}
                onClick={() => openFile(file)}
                className={`tab ${file === filePath ? "active" : ""}`}
              >
                <span className="tab-icon">{getFileIcon(file, false)}</span>
                <span className="tab-title">{file.split(/[/\\]/).pop()}</span>
                <X size={14} className="tab-close" onClick={(e) => closeFile(e, file)} />
              </div>
            ))}
          </div>
          <div className="tabs-actions">
             <button 
              className={`action-btn ${showTerminal ? "active" : ""}`} 
              onClick={() => setShowTerminal(!showTerminal)}
              title="Toggle Terminal"
            >
              <TerminalIcon size={16} />
            </button>
          </div>
        </div>

        {/* Editor */}
        <div className="editor-wrapper">
          {/* ✍️ Remote Writing Cursors */}
          {Object.entries(editorPositions).map(([clientID, pos]) => {
            const user = remoteCursors[clientID]?.user;
            if (!user) return null;
            return (
              <div 
                key={`typing-${clientID}`}
                className="remote-typing-cursor"
                style={{
                  left: pos.left,
                  top: pos.top,
                  height: pos.height,
                  '--cursor-color': user.color
                }}
              >
                <div className="typing-label" style={{ backgroundColor: user.color }}>
                  {user.name}
                </div>
              </div>
            );
          })}
          {filePath ? (
            <>
              <div className="editor-header">
                <span className="file-path">{filePath}</span>
                <button className="save-btn" onClick={() => saveFile(filePath, editor?.getValue())}>
                  <Save size={14} /> Save
                </button>
              </div>
              <Editor
                height="100%"
                theme="vs-dark"
                path={filePath}
                language={getLanguage(filePath)}
                onMount={handleEditorDidMount}
                options={{
                  fontSize: 14,
                  minimap: { enabled: true },
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                }}
              />
            </>
          ) : (
            <div className="empty-state">
              <div className="empty-logo">PFA Editor</div>
              <div className="empty-hint">Select a file to start editing</div>
            </div>
          )}
        </div>

        {/* Terminal Panel */}
        {showTerminal && (
          <div className="terminal-panel">
            <div className="terminal-header">
              <div className="terminal-tabs">
                <div 
                  className={`terminal-tab ${terminalTab === "terminal" ? "active" : ""}`}
                  onClick={() => setTerminalTab("terminal")}
                >
                  TERMINAL
                </div>
                
               {
                /*
                 <div 
                  className={`terminal-tab ${terminalTab === "vnc" ? "active" : ""}`}
                  onClick={() => setTerminalTab("vnc")}
                >
                  GUI (VNC)
                </div>
               */}
              </div>
              <div className="terminal-actions">
                <X size={14} className="action-icon" onClick={() => setShowTerminal(false)} />
              </div>
            </div>
            <div className="terminal-body">
              {terminalTab === "terminal" ? (
                <XTermComponent projectId={projectId} dockerMode={dockerMode} imageID={imageID} />
              ) : (
                <div style={{ width: '100%', height: '100%', background: '#fff' }}>
                  <iframe 
                    src={`http://${window.location.hostname}:5001/api/vnc`} 
                    style={{ width: '100%', height: '100%', border: 'none' }}
                    title="VNC Viewer"
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default IDE;

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import { WebSocketServer } from 'ws';
import sequelize from './config/db.js';
import authRoutes from './routes/auth.js';
import projectRoutes from './routes/projects.js';
import copilotRoutes from './routes/copilot.js';
import dockerRoutes from './routes/docker.js';
import fileRoutes from './routes/files.js';
import vncRoutes from './routes/vnc.js';
import { errorHandler } from './middleware/errorHandler.js';
import { handleShellConnection } from './controllers/shellController.js';
import { incrementConnections, decrementConnections } from './controllers/vncController.js';
import pkgY from 'y-websocket/bin/utils';
import { Project } from './models/index.js';

const { setupWSConnection } = pkgY;

dotenv.config({ override: true });

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

app.use(cors());
app.use(express.json());

// Static for noVNC (if on Debian/Ubuntu, otherwise adjust path)
app.use('/novnc', express.static('/usr/share/novnc/'));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/copilot', copilotRoutes);
app.use('/api/docker', dockerRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/vnc', vncRoutes);

// WebSocket Handling
server.on('upgrade', async (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const pathname = url.pathname;
  const projectId = url.searchParams.get('projectId');

  if (pathname === '/shell') {
    let projectPath = process.env.HOME || process.env.USERPROFILE || process.cwd();
    if (projectId) {
      try {
        const project = await Project.findByPk(projectId);
        if (project && project.path) projectPath = project.path;
      } catch (e) {
        console.error("Error fetching project for shell:", e);
      }
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      handleShellConnection(ws, projectPath);
    });
  } else if (pathname === '/vnc-heartbeat') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      incrementConnections();
      ws.on('close', () => {
        decrementConnections();
      });
    });
  } else if (pathname.startsWith('/yjs')) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      setupWSConnection(ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Error handling middleware
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

sequelize.sync().then(async () => {
  try {
    await sequelize.query("ALTER TABLE ProjectMembers ADD COLUMN status ENUM('pending', 'accepted') NOT NULL DEFAULT 'pending';");
  } catch (e) {
    // Ignore error if column already exists
  }
  console.log('Database synced');
  server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
}).catch(err => {
  console.error('Failed to sync database:', err);
  // Start the server even if sync fails, so API doesn't crash completely 
  server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT} (DB Sync Failed)`));
});

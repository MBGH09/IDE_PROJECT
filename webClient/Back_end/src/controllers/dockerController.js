import Docker from 'dockerode';
import path from 'path';
import fs from 'fs';
import os from 'os';
import http from 'http';
import { Project, User } from '../models/index.js';

const getSocketPath = () => {
  const homeSocket = path.join(os.homedir(), '.docker/desktop/docker.sock');
  if (fs.existsSync(homeSocket)) return homeSocket;
  return '/var/run/docker.sock';
};

const docker = new Docker({ socketPath: getSocketPath() });

const getLocalIP = () => {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
};

const pullImage = async (imageID) => {
  const images = await docker.listImages();
  if (images.some(img => img.RepoTags && img.RepoTags.includes(imageID))) return;

  console.log(`Image ${imageID} not found locally, pulling...`);
  await new Promise((resolve, reject) => {
    docker.pull(imageID, (err, stream) => {
      if (err) return reject(err);
      docker.modem.followProgress(stream, (err, output) => {
        if (err) return reject(err);
        resolve(output);
      });
    });
  });
};

export const runContainer = async (req, res, next) => {
  const projectId = req.headers['x-project-id'];
  const { imageID, startCommand } = req.body;
  if (!projectId) return res.status(400).json({ message: "Project ID is required" });
  if (!imageID) return res.status(400).json({ message: "Image ID is required" });

  let containerName = '';

  try {
    const project = await Project.findByPk(projectId, {
      include: [{ model: User, as: 'Owner' }]
    });

    if (!project || !project.path) return res.status(404).json({ message: "Project path not found" });

    const username = project.Owner.username.toLowerCase();
    const projectName = project.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    containerName = `collabro-${username}-${projectName}`;
    const localIP = getLocalIP();
    const subdomain = `${projectName}.${username}.${localIP}.nip.io`;

    // 1. Cleanup existing
    try {
      const existing = docker.getContainer(containerName);
      await existing.remove({ force: true });
    } catch (e) {}

    // 2. Setup Network
    const NETWORK_NAME = 'pfa_net';
    const networks = await docker.listNetworks();
    if (!networks.some(n => n.Name === NETWORK_NAME)) {
      await docker.createNetwork({ Name: NETWORK_NAME, Driver: 'bridge' });
    }

    // 3. Pull Image
    await pullImage(imageID);

    const finalPort = parseInt(req.body.port) || 3000;

    // 4. Create Container
    const containerConfig = {
      name: containerName,
      Image: imageID,
      Cmd: startCommand ? ['sh', '-c', startCommand] : undefined,
      ExposedPorts: {
        [`${finalPort}/tcp`]: {}
      },
      HostConfig: {
        Binds: [`${project.path}:/app`],
        PortBindings: {
          [`${finalPort}/tcp`]: [{ HostPort: '0' }]
        },
        NetworkMode: NETWORK_NAME
      },
      Labels: {
        'traefik.enable': 'true',
        'traefik.docker.network': NETWORK_NAME,
        [`traefik.http.routers.${containerName}.rule`]: `Host(\`${subdomain}\`)`,
        [`traefik.http.routers.${containerName}.entrypoints`]: 'web',
        [`traefik.http.routers.${containerName}.service`]: `${containerName}-service`,
        [`traefik.http.services.${containerName}-service.loadbalancer.server.port`]: finalPort.toString()
      },
      WorkingDir: '/app',
      Tty: true
    };

    const container = await docker.createContainer(containerConfig);
    await container.start();

    // Inspect to get the assigned host port
    const containerInfo = await container.inspect();
    const hostPort = containerInfo.NetworkSettings.Ports[`${finalPort}/tcp`][0].HostPort;
    // Use the server's real IP so the URL works from any machine on the same network
    const directURL = `http://${localIP}:${hostPort}`;

    // Check if Traefik is running by pinging its API (no Docker socket needed)
    let traefikAvailable = false;
    try {
      await new Promise((resolve, reject) => {
        const req = http.get('http://localhost:8080/api/version', { timeout: 1500 }, (res) => {
          traefikAvailable = res.statusCode === 200;
          resolve();
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      });
    } catch (e) {}

    console.log(`Container started: ${containerName}`);
    console.log(`URL (Traefik): http://${subdomain} [available: ${traefikAvailable}]`);
    console.log(`URL (Direct):  ${directURL}`);

    res.json({
      containerID: container.id,
      status: "Running",
      previewURL: `http://${subdomain}`,
      directURL,
      traefikAvailable
    });

  } catch (err) {
    console.error("CRITICAL FAILURE:", err);
    if (containerName) {
      try {
        const container = docker.getContainer(containerName);
        await container.remove({ force: true });
      } catch (e) {}
    }
    res.status(500).json({ error: "docker_error", details: err.message });
  }
};

export const stopContainer = async (req, res, next) => {
  const { containerID } = req.body;
  const projectId = req.headers['x-project-id'];
  
  try {
    let container;
    if (containerID) {
      container = docker.getContainer(containerID);
    } else if (projectId) {
      const project = await Project.findByPk(projectId, { include: [{ model: User, as: 'Owner' }] });
      if (project) {
        const username = project.Owner.username.toLowerCase();
        const projectName = project.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        container = docker.getContainer(`collabro-${username}-${projectName}`);
      }
    }

    if (!container) return res.status(400).json({ message: "ID or project header required" });

    await container.stop();
    await container.remove();
    res.json({ message: "Stopped and removed" });
  } catch (err) {
    if (err.statusCode === 404) return res.json({ message: "Already gone" });
    next(err);
  }
};

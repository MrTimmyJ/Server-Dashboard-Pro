require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fs = require('fs-extra');
const path = require('path');
const si = require('systeminformation');
const Docker = require('dockerode');
const { createClient } = require('redis');
const { RedisStore } = require('connect-redis');
const { exec } = require('child_process');
const util = require('util');
const http = require('http');
const WebSocket = require('ws');

const execPromise = util.promisify(exec);
const app = express();
const docker = new Docker();

const server = http.createServer(app);

// Redis client setup
let redisClient;
try {
    redisClient = createClient({
        socket: {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT) || 6379
        }
    });
    
    redisClient.connect().catch(console.error);
    
    redisClient.on('error', (err) => {
        console.log('Redis error: ', err);
    });
    
    redisClient.on('connect', () => {
        console.log('✅ Connected to Redis');
    });
} catch (error) {
    console.log('Redis not available, using memory store');
    redisClient = null;
}

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const SESSION_SECRET = process.env.SESSION_SECRET || require('crypto').randomBytes(64).toString('hex');

// WebSocket server setup
const wss = new WebSocket.Server({ 
    server, 
    path: '/dashboard/ws'
});

// Track connected clients
const connectedClients = new Set();

wss.on('connection', (ws, req) => {
    // Simple auth check
    if (!req.headers.cookie || !req.headers.cookie.includes('server_dashboard.sid')) {
        ws.close(1008, 'Authentication required');
        return;
    }
    
    connectedClients.add(ws);
    console.log('🔌 WebSocket client connected');
    
    ws.on('close', () => {
        connectedClients.delete(ws);
        console.log('🔌 WebSocket client disconnected');
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        connectedClients.delete(ws);
    });
});

// Function to broadcast to all clients
function broadcastToClients(data) {
    connectedClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

// Real-time stats broadcasting
setInterval(async () => {
    if (connectedClients.size === 0) return;
    
    try {
        const [currentLoad, mem, networkStats] = await Promise.all([
            si.currentLoad(),
            si.mem(),
            si.networkStats()
        ]);

        const realTimeData = {
            type: 'real-time-stats',
            data: {
                cpu: parseFloat(currentLoad.currentLoad.toFixed(1)),
                memory: parseFloat(((mem.used / mem.total) * 100).toFixed(1)),
                network: {
                    rx: (networkStats[0]?.rx_sec || 0) / 1024,
                    tx: (networkStats[0]?.tx_sec || 0) / 1024
                },
                timestamp: Date.now()
            }
        };

        broadcastToClients(realTimeData);
    } catch (error) {
        console.error('WebSocket data error:', error);
    }
}, 2000);

// Enhanced middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "ws:", "wss:"]
        }
    },
    crossOriginEmbedderPolicy: false
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.set('trust proxy', 1);

// Session configuration
const sessionConfig = {
    name: 'server_dashboard.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000,
        path: '/dashboard/'
    }
};

// Use Redis store if available, otherwise memory store
if (redisClient) {
    sessionConfig.store = new RedisStore({ client: redisClient });
}

app.use(session(sessionConfig));

// Rate limiting
const createRateLimit = (windowMs, max, message) => rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false
});

const loginLimiter = createRateLimit(15 * 60 * 1000, 5, 'Too many login attempts');
const apiLimiter = createRateLimit(15 * 60 * 1000, 1000, 'Too many API requests');

// Enhanced system monitoring functions
async function getEnhancedSystemInfo() {
    try {
        const [
            cpu, mem, fsSize, currentLoad, networkStats, 
            osInfo, processes, networkConnections, 
            users, temperatures, services, time
        ] = await Promise.all([
            si.cpu(),
            si.mem(),
            si.fsSize(),
            si.currentLoad(),
            si.networkStats(),
            si.osInfo(),
            si.processes(),
            si.networkConnections(),
            si.users(),
            si.cpuTemperature().catch(() => ({ main: null })),
            si.services('nginx,ssh,docker,mysql,postgresql,redis,apache2,pm2').catch(() => []),
            si.time()
        ]);

        // Get Docker info
        let dockerInfo = { Containers: 0 };
        try {
            if (process.env.ENABLE_DOCKER !== 'false') {
                dockerInfo = await docker.info();
            }
        } catch (error) {
            console.log('Docker not available');
        }

        // Get security information
        const [openPorts, sshConnections] = await Promise.all([
            getOpenPorts(),
            getSSHConnections()
        ]);

        return {
            cpu: {
                usage: parseFloat(currentLoad.currentLoad.toFixed(1)),
                cores: cpu.cores,
                speed: cpu.speed,
                model: cpu.manufacturer + ' ' + cpu.brand,
                temperature: temperatures.main
            },
            memory: {
                usage: parseFloat(((mem.used / mem.total) * 100).toFixed(1)),
                used: (mem.used / 1024 / 1024 / 1024).toFixed(1),
                total: (mem.total / 1024 / 1024 / 1024).toFixed(1),
                free: (mem.free / 1024 / 1024 / 1024).toFixed(1),
                unit: 'GB'
            },
            storage: fsSize.map(fs => ({
                mount: fs.mount,
                size: (fs.size / 1024 / 1024 / 1024).toFixed(1),
                used: (fs.used / 1024 / 1024 / 1024).toFixed(1),
                usage: ((fs.used / fs.size) * 100).toFixed(1),
                unit: 'GB'
            })),
            network: {
                rx: (networkStats[0]?.rx_sec || 0) / 1024,
                tx: (networkStats[0]?.tx_sec || 0) / 1024,
                unit: 'KB/s',
                connections: networkConnections.length
            },
            os: {
                platform: osInfo.platform,
                distro: osInfo.distro,
                release: osInfo.release,
                arch: osInfo.arch,
                uptime: osInfo.uptime,
                hostname: osInfo.hostname,
                kernel: osInfo.kernel
            },
            processes: {
                total: processes.all,
                running: processes.running,
                sleeping: processes.sleeping
            },
            security: {
                sshConnections,
                openPorts: openPorts.slice(0, 20)
            },
            users: users.length,
            docker: dockerInfo.Containers || 0,
            services: services,
            timestamp: time.current
        };
    } catch (error) {
        console.error('Enhanced system info error:', error);
        throw error;
    }
}

async function getOpenPorts() {
    try {
        const { stdout } = await execPromise('ss -tuln | grep LISTEN');
        return stdout.split('\n')
            .filter(line => line.trim())
            .map(line => {
                const parts = line.split(/\s+/);
                return {
                    protocol: parts[0],
                    address: parts[4],
                    state: parts[5]
                };
            });
    } catch (error) {
        return [];
    }
}

async function getSSHConnections() {
    try {
        const { stdout } = await execPromise('who');
        return stdout.split('\n')
            .filter(line => line.trim())
            .map(line => {
                const parts = line.split(/\s+/);
                const from = parts.length > 2 ? parts[2] : 'local';
                return {
                    user: parts[0],
                    from: from,
                    time: parts.length > 3 ? `${parts[2]} ${parts[3]}` : 'unknown'
                };
            })
            .filter(conn => conn.user && conn.from);
    } catch (error) {
        return [];
    }
}

// Authentication middleware
function ensureAuth(req, res, next) {
    if (req.session && req.session.user) return next();
    
    if (req.path.startsWith('/api/') || req.xhr) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    res.redirect('/dashboard/login.html');
}

// User management
const users = {
    admin: {
        passwordHash: bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin', 10),
        role: 'admin'
    }
};

// Routes
app.post('/dashboard/api/login', loginLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        const user = users[username];
        
        if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        req.session.user = { 
            username, 
            role: user.role,
            loginTime: new Date().toISOString(),
            ip: req.ip
        };

        res.json({ success: true });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

app.post('/dashboard/api/logout', ensureAuth, (req, res) => {
    req.session.destroy((err) => {
        res.clearCookie('server_dashboard.sid');
        res.json({ success: true });
    });
});

app.get('/dashboard/api/auth/check', ensureAuth, (req, res) => {
    res.json({ 
        authenticated: true, 
        user: req.session.user 
    });
});

// Enhanced API endpoints
app.get('/dashboard/api/system/enhanced', ensureAuth, apiLimiter, async (req, res) => {
    try {
        const systemInfo = await getEnhancedSystemInfo();
        res.json(systemInfo);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Keep original system/info endpoint for compatibility
app.get('/dashboard/api/system/info', ensureAuth, apiLimiter, async (req, res) => {
    try {
        const systemInfo = await getEnhancedSystemInfo();
        res.json(systemInfo);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/dashboard/api/system/stats', ensureAuth, apiLimiter, async (req, res) => {
    try {
        const [currentLoad, mem, fsSize] = await Promise.all([
            si.currentLoad(),
            si.mem(),
            si.fsSize()
        ]);

        const rootFs = fsSize.find(fs => fs.mount === '/') || fsSize[0];
        const storagePercent = rootFs ? ((rootFs.used / fs.size) * 100).toFixed(1) : '0.0';

        res.json({
            cpu: parseFloat(currentLoad.currentLoad.toFixed(1)),
            memory: parseFloat(((mem.used / mem.total) * 100).toFixed(1)),
            storage: parseFloat(storagePercent),
            uptime: osInfo.uptime,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/dashboard/api/security/connections', ensureAuth, async (req, res) => {
    try {
        const [sshConnections, openPorts] = await Promise.all([
            getSSHConnections(),
            getOpenPorts()
        ]);
        
        res.json({ 
            sshConnections, 
            openPorts,
            failedLogins: 0
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Docker endpoints
app.get('/dashboard/api/docker/containers', ensureAuth, async (req, res) => {
    try {
        if (process.env.ENABLE_DOCKER === 'false') {
            return res.json([]);
        }

        const containers = await docker.listContainers({ all: true });
        const enhancedContainers = await Promise.all(
            containers.map(async (container) => {
                try {
                    const dockerContainer = docker.getContainer(container.Id);
                    const stats = await dockerContainer.stats({ stream: false }).catch(() => ({}));
                    
                    return {
                        id: container.Id,
                        name: container.Names[0]?.replace('/', '') || 'unknown',
                        image: container.Image,
                        status: container.State,
                        statusText: container.Status,
                        created: new Date(container.Created * 1000).toISOString(),
                        ports: container.Ports,
                        state: container.State,
                        cpu: stats.cpu_stats,
                        memory: stats.memory_stats
                    };
                } catch (error) {
                    return {
                        id: container.Id,
                        name: container.Names[0]?.replace('/', '') || 'unknown',
                        image: container.Image,
                        status: container.State,
                        statusText: container.Status,
                        created: new Date(container.Created * 1000).toISOString(),
                        ports: container.Ports,
                        state: container.State,
                        error: 'Failed to get stats'
                    };
                }
            })
        );

        res.json(enhancedContainers);
    } catch (error) {
        res.status(500).json({ error: 'Docker not available: ' + error.message });
    }
});

app.post('/dashboard/api/docker/containers/:id/:action', ensureAuth, async (req, res) => {
    try {
        const { id, action } = req.params;
        const container = docker.getContainer(id);
        
        const validActions = ['start', 'stop', 'restart'];
        if (!validActions.includes(action)) {
            return res.status(400).json({ error: 'Invalid action' });
        }

        await container[action]();
        
        // Broadcast container event
        const containerInfo = await container.inspect();
        broadcastToClients({
            type: 'container-event',
            data: {
                action,
                name: containerInfo.Name.replace('/', ''),
                id: containerInfo.Id
            }
        });
        
        res.json({ success: true, message: `Container ${action}ed successfully` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Logs endpoint
app.get('/dashboard/api/system/logs', ensureAuth, async (req, res) => {
    try {
        if (process.env.ENABLE_SYSTEM_LOGS === 'false') {
            return res.json({ logs: ['Log access disabled'], type: 'disabled' });
        }

        const { lines = 50, type = 'syslog' } = req.query;
        let logContent = '';

        try {
            if (type === 'syslog') {
                const content = await fs.readFile('/var/log/syslog', 'utf8');
                const allLines = content.trim().split('\n');
                logContent = allLines.slice(-parseInt(lines)).join('\n');
            } else if (type === 'auth') {
                const content = await fs.readFile('/var/log/auth.log', 'utf8');
                const allLines = content.trim().split('\n');
                logContent = allLines.slice(-parseInt(lines)).join('\n');
            } else if (type === 'docker') {
                const { stdout } = await execPromise(`docker logs --tail ${lines} $(docker ps -q) 2>&1 || echo "No Docker containers running"`);
                logContent = stdout;
            } else {
                logContent = 'Unsupported log type';
            }
        } catch (fileError) {
            logContent = `Log file not accessible: ${fileError.message}`;
        }

        res.json({ 
            logs: logContent.split('\n'), 
            type,
            count: logContent.split('\n').length 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Serve static files
app.use('/dashboard', express.static(path.join(__dirname, 'public'), {
    maxAge: process.env.NODE_ENV === 'production' ? '1h' : '0',
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
}));

// Login page (public)
app.get('/dashboard/login.html', (req, res) => {
    if (req.session.user) {
        return res.redirect('/dashboard/');
    }
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Protect dashboard routes
app.get('/dashboard/', ensureAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard/index.html', ensureAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check endpoint
app.get('/dashboard/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '2.0'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((error, req, res, next) => {
    console.error('Server Error:', error);
    res.status(500).json({ 
        error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message 
    });
});

// Start server
server.listen(PORT, HOST, () => {
    console.log(`🚀 Server Dashboard Pro v2.0`);
    console.log(`📍 http://${HOST}:${PORT}/dashboard`);
    console.log(`🔐 Authentication: Enabled`);
    console.log(`📊 Real-time WebSocket: Enabled (${connectedClients.size} clients)`);
    console.log(`🐳 Docker: ${process.env.ENABLE_DOCKER !== 'false' ? 'Enabled' : 'Disabled'}`);
    console.log(`🛡️  Security Monitoring: Enabled`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`💾 Session Store: ${redisClient ? 'Redis' : 'Memory'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
    });
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

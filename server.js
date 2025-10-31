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

const app = express();
const docker = new Docker();

const redisClient = createClient({
  socket: {
    host: 'localhost',
    port: 6379
  }
});

// Connect to Redis
redisClient.connect().catch(console.error);

redisClient.on('error', (err) => {
  console.log('Redis error: ', err);
});

redisClient.on('connect', () => {
  console.log('✅ Connected to Redis');
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const SESSION_SECRET = process.env.SESSION_SECRET || 'change_this_in_production';
const USERS_FILE = path.join(__dirname, 'users.json');

// Enhanced middleware stack
//app.use(helmet({
//  contentSecurityPolicy: {
//    directives: {
//      defaultSrc: ["'self'"],
//      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
//      fontSrc: ["'self'", "https://fonts.gstatic.com"],
//      scriptSrc: ["'self'", "'unsafe-inline'"],
//      imgSrc: ["'self'", "data:", "https:"],
//      connectSrc: ["'self'", "ws:", "wss:"]
//    }
//  },
//  crossOriginEmbedderPolicy: false
//}));

// For local Development
 app.use(helmet({
   contentSecurityPolicy: false
 }));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.set('trust proxy', 1);
app.set('view engine', 'html');

// Session configuration
//app.use(session({
//  name: 'server_dashboard.sid',
//  secret: SESSION_SECRET,
//  resave: false,
//  saveUninitialized: false,
//  cookie: {
//    httpOnly: true,
//    secure: process.env.NODE_ENV === 'production',
//    sameSite: 'lax',
//    maxAge: 24 * 60 * 60 * 1000,
//    path: '/dashboard/'
   // maxAge: parseInt(process.env.SESSION_MAX_AGE) || 24 * 60 * 60 * 1000
//  }
//}));

// For local Development
app.use(session({
  store: new RedisStore({ client: redisClient }),
  name: 'server_dashboard.sid',
  secret: SESSION_SECRET,
  //resave: true,  // ← Change to true
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false,  // ← Change to false for local testing
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/dashboard/'
  }
}));

// Rate limiting
const loginLimiter = rateLimit({
  windowMs: (parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES) || 15) * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_LOGIN) || 5,
  message: { error: 'Too many login attempts. Please try again later.' },
  standardHeaders: true
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  // max: parseInt(process.env.RATE_LIMIT_MAX_API) || 100,
  message: { error: 'Too many API requests.' },
  standardHeaders: true
});

// Utility functions
async function loadUsers() {
  try {
    return await fs.readJson(USERS_FILE);
  } catch (err) {
    return {};
  }
}

async function getSystemInfo() {
  try {
    const [cpu, mem, fsSize, currentLoad, network, osInfo, services] = await Promise.all([
      si.cpu(),
      si.mem(),
      si.fsSize(),
      si.currentLoad(),
      si.networkStats(),
      si.osInfo(),
      si.services('nginx,ssh,docker,mysql,postgresql,redis,apache2')
    ]);

    return {
      cpu: {
        usage: parseFloat(currentLoad.currentLoad.toFixed(1)),
        cores: cpu.cores,
        speed: cpu.speed,
        model: cpu.manufacturer + ' ' + cpu.brand
      },
      memory: {
        usage: parseFloat(((mem.used / mem.total) * 100).toFixed(1)),
        used: (mem.used / 1024 / 1024 / 1024).toFixed(1),
        total: (mem.total / 1024 / 1024 / 1024).toFixed(1),
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
        rx: (network[0]?.rx_sec || 0) / 1024,
        tx: (network[0]?.tx_sec || 0) / 1024,
        unit: 'KB/s'
      },
      os: {
        platform: osInfo.platform,
        distro: osInfo.distro,
        release: osInfo.release,
        arch: osInfo.arch,
        uptime: osInfo.uptime
      },
      services: services
    };
  } catch (error) {
    console.error('System info error:', error);
    throw error;
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

// Routes
app.post('/dashboard/api/login', loginLimiter, async (req, res) => {
  try {
    console.log('Login attempt:', req.body.username);
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const users = await loadUsers();
    const user = users[username];
    
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      console.log('Invalid credentials for:', username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    req.session.user = { 
      username, 
      role: user.role || 'user',
      loginTime: new Date().toISOString()
    };

    console.log('Login successful, session:', req.session.user);
    res.redirect('/dashboard/');
    
  } catch (error) {
    console.log('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/dashboard/api/logout', ensureAuth, (req, res) => {
  req.session.destroy((err) => {
    res.clearCookie('server_dashboard.sid');
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

app.get('/dashboard/api/auth/check', ensureAuth, (req, res) => {
  console.log('Auth check - user:', req.session.user);
  res.json({ 
    authenticated: true, 
    user: req.session.user 
  });
});

// Enhanced API endpoints
app.get('/dashboard/api/system/info', ensureAuth, apiLimiter, async (req, res) => {
  try {
    const systemInfo = await getSystemInfo();
    res.json(systemInfo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/dashboard/api/system/stats', ensureAuth, apiLimiter, async (req, res) => {
  try {
    const [currentLoad, mem, fsSize, time] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.time()
    ]);

    const rootFs = fsSize.find(fs => fs.mount === '/') || fsSize[0];
    const storagePercent = rootFs ? ((rootFs.used / rootFs.size) * 100).toFixed(1) : '0.0';

    res.json({
      cpu: parseFloat(currentLoad.currentLoad.toFixed(1)),
      memory: parseFloat(((mem.used / mem.total) * 100).toFixed(1)),
      storage: parseFloat(storagePercent),
      uptime: time.uptime,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Stats endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/dashboard/api/docker/containers', ensureAuth, async (req, res) => {
  try {
    if (process.env.ENABLE_DOCKER === 'false') {
      return res.json([]);
    }

    const containers = await docker.listContainers({ all: true });
    const enhancedContainers = containers.map(container => ({
      id: container.Id,
      name: container.Names[0].replace('/', ''),
      image: container.Image,
      status: container.State,
      statusText: container.Status,
      created: new Date(container.Created * 1000).toISOString(),
      ports: container.Ports,
      state: container.State === 'running' ? 'running' : 'stopped'
    }));

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
    res.json({ success: true, message: `Container ${action}ed successfully` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/dashboard/api/system/logs', ensureAuth, async (req, res) => {
  try {
    if (process.env.ENABLE_SYSTEM_LOGS === 'false') {
      return res.json({ logs: ['Log access disabled'], type: 'disabled' });
    }

    const { lines = 50, type = 'syslog' } = req.query;
    let logContent = '';

    if (type === 'syslog' && await fs.pathExists('/var/log/syslog')) {
      const content = await fs.readFile('/var/log/syslog', 'utf8');
      const allLines = content.trim().split('\n');
      logContent = allLines.slice(-parseInt(lines)).join('\n');
    } else if (type === 'auth' && await fs.pathExists('/var/log/auth.log')) {
      const content = await fs.readFile('/var/log/auth.log', 'utf8');
      const allLines = content.trim().split('\n');
      logContent = allLines.slice(-parseInt(lines)).join('\n');
    } else {
      // Fallback
      logContent = 'Log file not accessible. Running with limited permissions?';
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

// Protect all other routes
//app.use(['/', '/index.html'], ensureAuth, (req, res) => {
//  res.sendFile(path.join(__dirname, 'public', 'index.html'));
//});


// Protect all other routes
app.get('/dashboard/', ensureAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard/index.html', ensureAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});
// app.use((req, res) => {
//   if (req.accepts('html')) {
//     res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
//   } else if (req.accepts('json')) {
//     res.status(404).json({ error: 'Not found' });
//   } else {
//     res.status(404).type('txt').send('Not found');
//   }
// });

// Error handler
app.use((error, req, res, next) => {
  console.error('Server Error:', error);
  res.status(500).json({ 
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message 
  });
});

// Start server
app.listen(PORT, HOST, () => {
  console.log(`Server Dashboard`);
  console.log(`📍 http://${HOST}:${PORT}`);
  console.log(`🔐 Authentication: Enabled`);
  console.log(`🐳 Docker: ${process.env.ENABLE_DOCKER !== 'false' ? 'Enabled' : 'Disabled'}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

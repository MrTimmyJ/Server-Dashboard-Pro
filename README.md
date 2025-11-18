# Server Dashboard Pro
A professional, production-grade server monitoring and management dashboard built with Node.js, Express, and modern web technologies.

**Author**: Timothy Johnson  
**Date**: October to November 2025  

**Live Demos**: 
- 🐳 **Docker Container**: http://143.198.51.64:3002/dashboard/
- ☸️ **Kubernetes Deployment**: http://143.198.51.64:32657/dashboard/ 
- 🚀 **Direct Deployment**: http://143.198.51.64/dashboard/

## Overview
Server Dashboard Pro provides real-time system monitoring, Docker container management, and comprehensive server analytics through an intuitive web interface.

## 🚀 Deployment Architecture
- **Docker Containerization**: Isolated environment with optimized Node.js runtime
- **Kubernetes Orchestration**: Scalable container management with replica sets  
- **Traditional Deployment**: Direct PM2 process management
- **CI/CD Ready**: GitHub Actions pipeline for automated deployment

## ✨ Features
### 🔍 System Monitoring
- **Real-time Metrics**: CPU, memory, storage, and network usage
- **Live Charts**: Interactive performance graphs with Chart.js
- **System Information**: OS details, kernel version, architecture, and hostname

### 🐳 Docker & Kubernetes Integration
- **Container Overview**: List all running/stopped containers via Docker API
- **Container Controls**: Start, stop, restart containers via web interface
- **Multi-Environment Deployment**: Docker, Kubernetes, and traditional deployment

### 🔐 Security & Authentication
- **Secure Authentication**: BCrypt password hashing with session management
- **Rate Limiting**: Protection against brute force attacks
- **Session Security**: Redis-based session storage with secure cookies

## 🧰 Technologies Used

### 🌐 Backend & Runtime
- **Node.js** - JavaScript runtime environment
- **Express.js** - Web application framework
- **WebSocket** - Real-time bidirectional communication
- **PM2** - Production process manager
- **Nginx** - Reverse proxy and web server

### 🐳 Containerization & Orchestration
- **Docker** - Application containerization
- **Kubernetes** - Container orchestration and scaling
- **k3s** - Lightweight Kubernetes distribution
- **Helm** - Kubernetes package manager

### 🔐 Authentication & Security
- **bcrypt** - Password hashing (12-round salt)
- **express-session** - Session management
- **Redis** - Production session storage
- **Helmet.js** - Security headers protection
- **express-rate-limit** - API rate limiting
- **CORS** - Cross-origin resource sharing

### 📊 System Monitoring
- **systeminformation** - Comprehensive system metrics
- **Dockerode** - Docker API integration
- **Chart.js** - Real-time performance charts

### 🎨 Frontend & UI
- **HTML5** - Semantic markup structure
- **CSS3** - Modern styling with Flexbox/Grid
- **JavaScript (ES6+)** - Frontend application logic
- **Google Fonts (Inter)** - Typography
- **CSS Custom Properties** - Theming system (dark/light mode)

### 🔧 Development & Deployment
- **Git** - Version control
- **GitHub Actions** - CI/CD pipeline
- **kubectl** - Kubernetes command-line tool
- **SSH** - Secure server deployment
- **npm** - Package management

### 🛠 Infrastructure
- **Ubuntu Server** - Operating system
- **Redis Server** - Session storage database
- **Docker** - Containerization platform
- **Kubernetes (k3s)** - Container orchestration
- **Let's Encrypt** - SSL certificates

## 🛡 Security Measures

### Authentication & Session Security
- **BCrypt Password Hashing**: 12-round salt hashing for user credentials
- **Session Management**: 
  - Development: MemoryStore with secure configuration
  - Production: Redis session store for persistence and scalability
- **Secure Cookies**: HTTP-only, same-site lax, configurable secure flags
- **Session Timeout**: 24-hour session expiration

### API Security
- **Rate Limiting**:
  - Login endpoints: 5 attempts per 15 minutes
  - API endpoints: 100 requests per 15 minutes
- **Authentication Middleware**: Protects all sensitive endpoints
- **Input Validation**: JSON payload validation and size limits

### Infrastructure Security
- **Helmet.js**: Configurable security headers
- **CSP Ready**: Content Security Policy configuration available
- **Environment Variables**: Sensitive configuration externalized
- **Nginx Proxy**: Additional security layer with reverse proxy

## 📊 API Endpoints

| Endpoint	| Method	| Description	| Auth |
|---------|---------------------------|----------|--------|
|/api/auth/check	| GET	| Session validation	| Yes |
|/api/login	| POST | User authentication	| No |
|/api/logout	| POST	| Session termination	| Yes |
|/api/system/stats	| GET	| Real-time system metrics	| Yes |
|/api/system/info	| GET	| System information	| Yes |
|/api/docker/containers	| GET	| Container list	| Yes |
|WebSocket /dashboard/ws	| WS | Live data streaming | Yes |

## 🆚 Development vs Production

| Feature | This Version (Development) | Production Version |
|---------|---------------------------|-------------------|
| **Session Storage** | MemoryStore | Redis |
| **Security Headers** | Basic CSP | Advanced CSP |
| **Deployment** | Local development | Automated CI/CD |
| **Dependencies** | Minimal | Production-ready |
| **Session Persistence** | Lost on restart | Persistent |


📁 Code Structure

.<br>
server-dashboard/<br>
├── server.js # Main application entry point<br>
├── create_admin.js # Admin configuration<br>
├── package.json # Dependencies and scripts<br>
├── .env # Environment configuration<br>
├── users.json # User database<br>
├── public/ # Frontend assets<br>
│ ├── index.html # Main dashboard interface<br>
│ ├── login.html # Authentication page<br>
│ ├── script.js # Frontend application logic<br>
│ └── style.css # UI styles and themes<br>
└── .github/workflows/ # CI/CD configuration<br>
└── deploy.yml # Automated deployment pipeline<br>

🖼️ Screenshots / Visuals



🚀 Getting Started

    ### Prerequisites
    - Node.js 16+ 
    - PM2 - Production process manager
    - Redis (for production)
    - Docker (optional, for container management)
    
    ### Installation
    
    1. **Clone and setup**:
    ```bash
    git clone https://github.com/MrTimmyJ/server-dashboard-pro.git
    cd server-dashboard-pro
    npm install
    npm install -g pm2

    touch .env

    ### Docker Deployment
    docker build -t server-dashboard .
    docker run -p 3000:3000 -d server-dashboard

⚙️ Configuration

Environment Variables (.env)

```
NODE_ENV=development
PORT=3000
SESSION_SECRET=your-development-secret
ENABLE_DOCKER=true
ENABLE_SYSTEM_LOGS=true
```

Security Configuration

```
// Development-optimized security
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  }
}));
```

🪪 License

© 2025 Timothy Johnson. All Rights Reserved.<br>
This project and its code may not be copied, modified, or reused without permission.

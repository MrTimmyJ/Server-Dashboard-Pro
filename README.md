# Server Dashboard Pro
A professional, production-grade server monitoring and management dashboard built with Node.js, Express, and modern web technologies.

Author: Timothy Johnson <br>
Date: October 2025 <br>

**Live Demo**: http://143.198.51.64/dashboard/

## Overview

Server Dashboard Pro provides real-time system monitoring, Docker container management, and comprehensive server analytics through an intuitive web interface.<br>

Built with security and scalability in mind, it's designed for developers and system administrators who need robust server management capabilities.

## ✨ Features

### 🔍 System Monitoring
- **Real-time Metrics**: CPU, memory, storage, and network usage
- **Live Charts**: Interactive performance graphs with Chart.js
- **System Information**: OS details, kernel version, architecture, and hostname
- **Uptime Tracking**: Server and application uptime monitoring

### 🐳 Docker Management
- **Container Overview**: List all running/stopped containers
- **Container Controls**: Start, stop, restart containers via web interface
- **Batch Operations**: Start/stop multiple containers simultaneously
- **Container Status**: Real-time state monitoring

### 🔐 Security & Authentication
- **Secure Authentication**: BCrypt password hashing with session management
- **Rate Limiting**: Protection against brute force attacks
- **Session Security**: Redis-based session storage with secure cookies
- **Helmet.js**: Security headers protection (configurable)
- **Environment-based Configuration**: Separate settings for development/production

### 🛠 Technical Features
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Real-time Updates**: Auto-refreshing dashboard with configurable intervals
- **RESTful API**: Clean API design for system data
- **Error Handling**: Comprehensive error handling and logging
- **PM2 Integration**: Process management and monitoring

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
|/api/system/stats	| GET	| System metrics	| Yes |
|/api/system/info	| GET	| System information	| Yes |
|/api/docker/containers	| GET	| Container list	| Yes |

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

🧰 Technologies Used
🌐 Backend & Runtime

    Node.js - JavaScript runtime environment

    Express.js - Web application framework

    PM2 - Production process manager

    Nginx - Reverse proxy and web server

🔐 Authentication & Security

    bcrypt - Password hashing (12-round salt)

    express-session - Session management

    Redis - Production session storage (connect-redis)

    Helmet.js - Security headers protection

    express-rate-limit - API rate limiting

    CORS - Cross-origin resource sharing

📊 System Monitoring

    systeminformation - Comprehensive system metrics (CPU, memory, storage, network, OS info)

    Dockerode - Docker API integration for container management

    Chart.js - Real-time performance charts and graphs

💾 Data & File Management

    fs-extra - Enhanced file system operations

    path - File path utilities

    dotenv - Environment variable management

🎨 Frontend & UI

    HTML5 - Semantic markup structure

    CSS3 - Modern styling with Flexbox/Grid

    JavaScript (ES6+) - Frontend application logic

    Chart.js - Interactive data visualization

    Google Fonts (Inter) - Typography

    CSS Custom Properties - Theming system (dark/light mode)

🔧 Development & Deployment

    Git - Version control

    GitHub Actions - CI/CD pipeline

    SSH - Secure server deployment

    npm - Package management

🛠 Infrastructure

    Ubuntu Server - Operating system

    Redis Server - Session storage database

    Docker - Containerization platform

    Let's Encrypt (potential) - SSL certificates

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

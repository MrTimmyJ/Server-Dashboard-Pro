class ServerDashboard {
    constructor() {
        this.config = {
            refreshInterval: 10000,
            chartHistory: 120,
            theme: 'dark',
            realTimeEnabled: true,
            autoRefresh: true
        };
        
        this.state = {
            authenticated: false,
            user: null,
            systemInfo: {},
            realTimeStats: {},
            containers: [],
            security: {},
            charts: {},
            ws: null,
            lastUpdate: null,
            previousStats: {}
        };
        
        this.chartData = {
            cpu: [],
            memory: [],
            networkRx: [],
            networkTx: []
        };
        
        this.alertHistory = [];
        this.pendingConfirmation = null;
        
        this.init();
    }

    async init() {
        await this.checkAuth();
        this.loadSettings();
        this.setupWebSocket();
        this.setupEventListeners();
        this.initializeCharts();
        this.startPolling();
        this.hideLoadingScreen();
        
        // Initial data fetch
        this.fetchAllData();
        
        // Set up visibility change handler
        this.setupVisibilityHandler();
    }

    async checkAuth() {
        try {
            const response = await fetch('/dashboard/api/auth/check');
            if (response.ok) {
                const data = await response.json();
                this.state.authenticated = true;
                this.state.user = data.user;
                this.updateUserDisplay();
            } else {
                window.location.href = '/dashboard/login.html';
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            window.location.href = '/dashboard/login.html';
        }
    }

    setupWebSocket() {
        if (!this.config.realTimeEnabled) return;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/dashboard/ws`;
        
        try {
            this.state.ws = new WebSocket(wsUrl);
            
            this.state.ws.onopen = () => {
                console.log('✅ WebSocket connected - real-time updates enabled');
                this.showToast('Real-time monitoring enabled', 'success');
                this.updateRealtimeStatus('Connected');
            };
            
            this.state.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleWebSocketMessage(data);
                } catch (error) {
                    console.error('WebSocket message parsing error:', error);
                }
            };
            
            this.state.ws.onclose = () => {
                console.log('❌ WebSocket disconnected');
                this.showToast('Real-time updates disconnected', 'warning');
                this.updateRealtimeStatus('Disconnected');
                
                // Attempt reconnection after delay
                setTimeout(() => {
                    if (this.config.realTimeEnabled) {
                        this.setupWebSocket();
                    }
                }, 5000);
            };
            
            this.state.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.updateRealtimeStatus('Error');
            };
        } catch (error) {
            console.error('WebSocket setup failed:', error);
            this.updateRealtimeStatus('Failed');
        }
    }

    handleWebSocketMessage(data) {
        switch (data.type) {
            case 'real-time-stats':
                this.updateRealTimeStats(data.data);
                break;
            case 'container-event':
                this.handleContainerEvent(data.data);
                break;
            case 'security-alert':
                this.handleSecurityAlert(data.data);
                break;
        }
    }

    updateRealTimeStats(stats) {
        // Calculate trends
        this.calculateTrends(stats);
        
        this.state.realTimeStats = stats;
        this.updateCharts(stats);
        this.updateQuickStats();
        this.updateOverviewStats();
    }

    calculateTrends(currentStats) {
        const previous = this.state.previousStats;
        
        if (previous.cpu !== undefined) {
            const cpuTrend = currentStats.cpu > previous.cpu ? 'up' : 'down';
            this.updateTrendIndicator('cpu-trend', cpuTrend);
        }
        
        if (previous.memory !== undefined) {
            const memoryTrend = currentStats.memory > previous.memory ? 'up' : 'down';
            this.updateTrendIndicator('memory-trend', memoryTrend);
        }
        
        this.state.previousStats = { ...currentStats };
    }

    updateTrendIndicator(elementId, trend) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = trend === 'up' ? '↗' : '↘';
            element.className = `status-trend trend-${trend}`;
        }
    }

    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                this.switchTab(e.currentTarget.dataset.tab);
            });
        });

        // Logout
        document.getElementById('logout-btn').addEventListener('click', () => {
            this.showConfirmation(
                'Confirm Logout',
                'Are you sure you want to logout?',
                () => this.logout()
            );
        });

        // Refresh buttons
        document.getElementById('manual-refresh')?.addEventListener('click', () => {
            this.triggerManualRefresh();
        });

        document.getElementById('refresh-containers')?.addEventListener('click', () => {
            this.fetchContainers();
        });

        document.getElementById('refresh-containers-full')?.addEventListener('click', () => {
            this.fetchContainers();
        });

        // Container actions
        document.getElementById('start-all-containers')?.addEventListener('click', () => {
            this.showConfirmation(
                'Start All Containers',
                'Are you sure you want to start all containers?',
                () => this.batchContainerAction('start')
            );
        });

        document.getElementById('stop-all-containers')?.addEventListener('click', () => {
            this.showConfirmation(
                'Stop All Containers',
                'This will stop all running containers. Continue?',
                () => this.batchContainerAction('stop')
            );
        });

        // Security refresh
        document.getElementById('refresh-security')?.addEventListener('click', () => {
            this.fetchSecurityInfo();
        });

        // Settings
        document.getElementById('refresh-interval')?.addEventListener('change', (e) => {
            this.updateRefreshInterval(parseInt(e.target.value));
        });

        document.getElementById('theme-select')?.addEventListener('change', (e) => {
            this.changeTheme(e.target.value);
        });

        document.getElementById('auto-refresh')?.addEventListener('change', (e) => {
            this.toggleAutoRefresh(e.target.checked);
        });

        document.getElementById('real-time-toggle')?.addEventListener('change', (e) => {
            this.toggleRealTime(e.target.checked);
        });

        // Log controls
        document.getElementById('log-type')?.addEventListener('change', () => {
            this.fetchLogs();
        });

        document.getElementById('log-lines')?.addEventListener('change', () => {
            this.fetchLogs();
        });

        document.getElementById('refresh-logs')?.addEventListener('click', () => {
            this.fetchLogs();
        });

        document.getElementById('clear-logs')?.addEventListener('click', () => {
            document.getElementById('system-logs').textContent = '';
        });

        // Modal handlers
        document.getElementById('modal-cancel')?.addEventListener('click', () => {
            this.hideConfirmation();
        });

        document.getElementById('modal-confirm')?.addEventListener('click', () => {
            if (this.pendingConfirmation) {
                this.pendingConfirmation();
                this.hideConfirmation();
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && !e.altKey) {
                switch(e.key) {
                    case 'r':
                    case 'R':
                        e.preventDefault();
                        this.triggerManualRefresh();
                        break;
                    case '1':
                        e.preventDefault();
                        this.switchTab('overview');
                        break;
                    case '2':
                        e.preventDefault();
                        this.switchTab('performance');
                        break;
                    case '3':
                        e.preventDefault();
                        this.switchTab('containers');
                        break;
                    case '4':
                        e.preventDefault();
                        this.switchTab('security');
                        break;
                    case '5':
                        e.preventDefault();
                        this.switchTab('logs');
                        break;
                    case '6':
                        e.preventDefault();
                        this.switchTab('settings');
                        break;
                }
            }
        });
    }

    setupVisibilityHandler() {
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.stopPolling();
            } else {
                this.startPolling();
                this.fetchAllData();
            }
        });
    }

    switchTab(tabName) {
        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');

        // Update content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(tabName)?.classList.add('active');

        // Tab-specific initialization
        switch(tabName) {
            case 'performance':
                this.initializeCharts();
                break;
            case 'security':
                this.fetchSecurityInfo();
                break;
            case 'logs':
                this.fetchLogs();
                break;
            case 'settings':
                this.loadSettingsDisplay();
                break;
        }

        this.showToast(`Switched to ${tabName} tab`, 'info');
    }

    async fetchAllData() {
        try {
            await Promise.all([
                this.fetchSystemStats(),
                this.fetchSystemInfo(),
                this.fetchContainers(),
                this.fetchSecurityInfo()
            ]);
            
            this.state.lastUpdate = new Date();
            this.updateLastUpdated();
        } catch (error) {
            console.error('Error fetching data:', error);
            this.showToast('Failed to update dashboard data', 'error');
        }
    }

    async fetchSystemStats() {
        try {
            const response = await fetch('/dashboard/api/system/stats');
            if (!response.ok) throw new Error('Failed to fetch stats');
            
            const stats = await response.json();
            this.state.stats = stats;
            this.updateStatsDisplay();
            
            // Update charts if WebSocket is NOT connected
            if (!this.state.ws || this.state.ws.readyState !== WebSocket.OPEN) {
                this.updateCharts(stats);
            }
        } catch (error) {
            throw error;
        }
    }

    async fetchSystemInfo() {
        try {
            const response = await fetch('/dashboard/api/system/info');
            if (!response.ok) throw new Error('Failed to fetch system info');
            
            const info = await response.json();
            this.updateSystemInfoDisplay(info);
        } catch (error) {
            throw error;
        }
    }

    async fetchSecurityInfo() {
        try {
            const response = await fetch('/dashboard/api/security/connections');
            if (!response.ok) throw new Error('Failed to fetch security info');
            
            const security = await response.json();
            this.state.security = security;
            this.updateSecurityDisplay(security);
        } catch (error) {
            console.error('Security info fetch error:', error);
            throw error;
        }
    }

    updateStatsDisplay() {
        const { stats } = this.state;

        // Update overview cards
        this.updateElementText('cpu-usage', `${stats.cpu}%`);
        this.updateElementText('memory-usage', `${stats.memory}%`);
        this.updateElementText('storage-usage', `${stats.storage}%`);
        
        // Update quick stats
        this.updateElementText('stat-containers', this.state.containers.length);
        this.updateElementText('stat-processes', '—');
        this.updateElementText('stat-load', '—');
        
        // Uptime handling
        if (stats.uptime !== undefined && !isNaN(stats.uptime)) {
            this.updateElementText('stat-uptime', this.formatUptime(stats.uptime));
        } else {
            this.updateElementText('stat-uptime', '—');
        }
    }

    updateSystemInfoDisplay(info) {
        this.updateElementText('info-os', `${info.os.distro} ${info.os.release}`);
        this.updateElementText('info-kernel', info.os.kernel || '—');
        this.updateElementText('info-arch', info.os.arch);
        this.updateElementText('info-hostname', info.os.hostname || '—');
    }

    updateSecurityDisplay(security) {
        if (!security) return;

        // Update security overview
        this.updateElementText('security-ssh', security.sshConnections?.length || 0);
        this.updateElementText('security-ports', security.openPorts?.length || 0);
        this.updateElementText('ssh-count', security.sshConnections?.length || 0);
        this.updateElementText('ports-count', security.openPorts?.length || 0);
        
        // Update security details
        this.updateSSHConnectionsDisplay(security.sshConnections);
        this.updateOpenPortsDisplay(security.openPorts);
        
        // Update alert badge
        this.updateSecurityAlerts(security);
    }

    updateSecurityAlerts(security) {
        const alerts = [];
        const sshCount = security.sshConnections?.length || 0;
        const portsCount = security.openPorts?.length || 0;
        
        if (sshCount > 10) {
            alerts.push('High SSH connections');
        }
        
        if (portsCount > 50) {
            alerts.push('Many open ports');
        }
        
        const totalAlerts = alerts.length;
        this.updateAlertBadge(totalAlerts);
        this.updateElementText('security-alerts', totalAlerts);
    }

    updateAlertBadge(count) {
        const badge = document.getElementById('security-badge');
        const alertBadge = document.getElementById('alert-badge');
        const alertIndicator = document.getElementById('alert-indicator');
        
        if (badge) {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'flex' : 'none';
        }
        
        if (alertBadge) {
            alertBadge.textContent = count;
            alertBadge.style.display = count > 0 ? 'flex' : 'none';
        }
        
        if (alertIndicator) {
            alertIndicator.textContent = count;
            alertIndicator.style.display = count > 0 ? 'flex' : 'none';
        }
    }

    updateSSHConnectionsDisplay(connections) {
        const container = document.getElementById('ssh-connections');
        if (!container) return;
        
        if (!connections || connections.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No active SSH connections</p></div>';
            return;
        }
        
        container.innerHTML = connections.map(conn => `
            <div class="security-connection">
                <div class="connection-info">
                    <strong>${this.escapeHtml(conn.user)}</strong>
                    <span>from ${this.escapeHtml(conn.from)}</span>
                </div>
                <div class="connection-time">${this.escapeHtml(conn.time)}</div>
            </div>
        `).join('');
    }

    updateOpenPortsDisplay(ports) {
        const container = document.getElementById('open-ports');
        if (!container) return;
        
        if (!ports || ports.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No open ports found</p></div>';
            return;
        }
        
        container.innerHTML = ports.slice(0, 10).map(port => `
            <div class="port-item">
                <div class="port-protocol">${this.escapeHtml(port.protocol)}</div>
                <div class="port-address">${this.escapeHtml(port.address)}</div>
                <div class="port-state">${this.escapeHtml(port.state)}</div>
            </div>
        `).join('');
    }

    updateQuickStats() {
        const stats = this.state.realTimeStats;
        if (!stats) return;
        
        // Update real-time values
        this.updateElementText('cpu-usage', `${stats.cpu}%`);
        this.updateElementText('memory-usage', `${stats.memory}%`);
    }

    updateOverviewStats() {
        const stats = this.state.realTimeStats;
        if (!stats) return;

        // Update network usage
        const networkTotal = (stats.network?.rx || 0) + (stats.network?.tx || 0);
        this.updateElementText('network-usage', `${networkTotal.toFixed(1)} KB/s`);
    }

    async fetchContainers() {
        try {
            const response = await fetch('/dashboard/api/docker/containers');
            if (!response.ok) throw new Error('Failed to fetch containers');
            
            const containers = await response.json();
            this.state.containers = containers;
            this.updateContainersDisplay();
        } catch (error) {
            console.error('Container fetch error:', error);
            this.updateContainersDisplay();
        }
    }

    updateContainersDisplay() {
        const containersList = document.getElementById('containers-list');
        const tableBody = document.getElementById('containers-table-body');
        
        const containers = this.state.containers || [];
        
        // Update overview containers list
        if (containersList) {
            if (containers.length === 0) {
                containersList.innerHTML = `
                    <div class="empty-state">
                        <p>No containers found or Docker not available</p>
                    </div>
                `;
            } else {
                containersList.innerHTML = containers.slice(0, 5).map(container => `
                    <div class="container-item">
                        <div class="container-info">
                            <div class="container-status ${container.state}"></div>
                            <div>
                                <div class="container-name">${this.escapeHtml(container.name)}</div>
                                <div class="container-image">${this.escapeHtml(container.image)}</div>
                            </div>
                        </div>
                        <div class="container-actions">
                            ${container.state === 'running' ? 
                                `<button class="btn btn-sm btn-danger" onclick="dashboard.containerAction('${container.id}', 'stop')">Stop</button>` :
                                `<button class="btn btn-sm btn-success" onclick="dashboard.containerAction('${container.id}', 'start')">Start</button>`
                            }
                        </div>
                    </div>
                `).join('');
            }
        }
        
        // Update containers table
        if (tableBody) {
            tableBody.innerHTML = containers.map(container => `
                <tr>
                    <td>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div class="container-status ${container.state}"></div>
                            <span>${this.escapeHtml(container.name)}</span>
                        </div>
                    </td>
                    <td>${this.escapeHtml(container.image)}</td>
                    <td>
                        <span class="status-badge ${container.state}">
                            ${container.state}
                        </span>
                    </td>
                    <td>${new Date(container.created).toLocaleDateString()}</td>
                    <td>${container.cpu ? this.formatContainerCPU(container.cpu) : '—'}</td>
                    <td>${container.memory ? this.formatContainerMemory(container.memory) : '—'}</td>
                    <td>
                        <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                            ${container.state === 'running' ? 
                                `<button class="btn btn-sm btn-outline" onclick="dashboard.containerAction('${container.id}', 'stop')">Stop</button>
                                 <button class="btn btn-sm btn-outline" onclick="dashboard.containerAction('${container.id}', 'restart')">Restart</button>` :
                                `<button class="btn btn-sm btn-success" onclick="dashboard.containerAction('${container.id}', 'start')">Start</button>`
                            }
                        </div>
                    </td>
                </tr>
            `).join('');
        }
        
        // Update containers count
        this.updateElementText('stat-containers', containers.length);
    }

    formatContainerCPU(cpuStats) {
        if (!cpuStats || !cpuStats.cpu_usage) return '—';
        try {
            const usage = cpuStats.cpu_usage.total_usage;
            const system = cpuStats.system_cpu_usage;
            const cores = cpuStats.online_cpus;
            
            if (usage && system && cores) {
                const cpuDelta = usage - (cpuStats.precpu_stats?.cpu_usage?.total_usage || 0);
                const systemDelta = system - (cpuStats.precpu_stats?.system_cpu_usage || 0);
                
                if (systemDelta > 0 && cpuDelta > 0) {
                    const cpuPercent = (cpuDelta / systemDelta) * cores * 100;
                    return `${Math.min(100, cpuPercent).toFixed(1)}%`;
                }
            }
            return '—';
        } catch {
            return '—';
        }
    }

    formatContainerMemory(memoryStats) {
        if (!memoryStats || !memoryStats.usage) return '—';
        try {
            const usage = memoryStats.usage;
            const limit = memoryStats.limit || memoryStats.max_usage;
            
            if (usage && limit) {
                const memoryPercent = (usage / limit) * 100;
                return `${memoryPercent.toFixed(1)}%`;
            }
            return '—';
        } catch {
            return '—';
        }
    }

    async containerAction(containerId, action) {
        try {
            const response = await fetch(`/dashboard/api/docker/containers/${containerId}/${action}`, {
                method: 'POST'
            });
            
            if (!response.ok) throw new Error('Action failed');
            
            const result = await response.json();
            this.showToast(`Container ${action}ed successfully`, 'success');
            
            // Refresh containers list
            setTimeout(() => this.fetchContainers(), 1000);
        } catch (error) {
            this.showToast(`Failed to ${action} container: ${error.message}`, 'error');
        }
    }

    async batchContainerAction(action) {
        const runningContainers = this.state.containers.filter(c => 
            action === 'stop' ? c.state === 'running' : c.state !== 'running'
        );
        
        if (runningContainers.length === 0) {
            this.showToast(`No containers to ${action}`, 'warning');
            return;
        }
        
        try {
            const promises = runningContainers.map(container => 
                fetch(`/dashboard/api/docker/containers/${container.id}/${action}`, { method: 'POST' })
            );
            
            await Promise.all(promises);
            this.showToast(`${action === 'stop' ? 'Stopped' : 'Started'} ${runningContainers.length} containers`, 'success');
            
            // Refresh containers list
            setTimeout(() => this.fetchContainers(), 2000);
        } catch (error) {
            this.showToast(`Failed to ${action} containers`, 'error');
        }
    }

    async fetchLogs() {
        try {
            const type = document.getElementById('log-type').value;
            const lines = document.getElementById('log-lines').value;
            
            const response = await fetch(`/dashboard/api/system/logs?type=${type}&lines=${lines}`);
            if (!response.ok) throw new Error('Failed to fetch logs');
            
            const data = await response.json();
            this.updateLogsDisplay(data.logs);
        } catch (error) {
            this.updateLogsDisplay([`Error loading logs: ${error.message}`]);
        }
    }

    updateLogsDisplay(logs) {
        const logsElement = document.getElementById('system-logs');
        if (logsElement) {
            logsElement.textContent = Array.isArray(logs) ? logs.join('\n') : logs;
            logsElement.scrollTop = logsElement.scrollHeight;
        }
    }

    // Enhanced UI methods
    showConfirmation(title, message, onConfirm) {
        this.pendingConfirmation = onConfirm;
        
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-message').textContent = message;
        document.getElementById('confirmation-modal').classList.remove('hidden');
    }

    hideConfirmation() {
        this.pendingConfirmation = null;
        document.getElementById('confirmation-modal').classList.add('hidden');
    }

    triggerManualRefresh() {
        const btn = document.getElementById('manual-refresh');
        const originalText = btn?.innerHTML;
        
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="loading-spinner-small"></span> Refreshing...';
        }
        
        this.fetchAllData().finally(() => {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        });
    }

    toggleRealTime(enabled) {
        this.config.realTimeEnabled = enabled;
        localStorage.setItem('realTimeEnabled', enabled);
        
        if (enabled) {
            this.setupWebSocket();
        } else if (this.state.ws) {
            this.state.ws.close();
            this.state.ws = null;
        }
        this.updateRealtimeStatus(enabled ? 'Enabled' : 'Disabled');
    }

    updateRealtimeStatus(status) {
        this.updateElementText('realtime-status', status);
    }

    // Chart methods
    initializeCharts() {
        // Destroy existing charts
        Object.values(this.state.charts).forEach(chart => {
            if (chart && typeof chart.destroy === 'function') {
                chart.destroy();
            }
        });

        const cpuCtx = document.getElementById('cpu-chart')?.getContext('2d');
        const memoryCtx = document.getElementById('memory-chart')?.getContext('2d');
        const networkCtx = document.getElementById('network-chart')?.getContext('2d');
        
        if (cpuCtx) {
            this.state.charts.cpu = new Chart(cpuCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'CPU Usage',
                        data: [],
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 0
                    }]
                },
                options: this.getChartOptions('CPU Usage (%)')
            });
        }
        
        if (memoryCtx) {
            this.state.charts.memory = new Chart(memoryCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Memory Usage',
                        data: [],
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 0
                    }]
                },
                options: this.getChartOptions('Memory Usage (%)')
            });
        }
        
        if (networkCtx) {
            this.state.charts.network = new Chart(networkCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [
                        {
                            label: 'Download',
                            data: [],
                            borderColor: '#8b5cf6',
                            backgroundColor: 'rgba(139, 92, 246, 0.1)',
                            borderWidth: 2,
                            fill: true,
                            tension: 0.4,
                            pointRadius: 0
                        },
                        {
                            label: 'Upload',
                            data: [],
                            borderColor: '#f59e0b',
                            backgroundColor: 'rgba(245, 158, 11, 0.1)',
                            borderWidth: 2,
                            fill: true,
                            tension: 0.4,
                            pointRadius: 0
                        }
                    ]
                },
                options: this.getChartOptions('Network (KB/s)')
            });
        }
    }

    getChartOptions(title) {
        const isDark = this.config.theme === 'dark';
        const textColor = isDark ? '#f8fafc' : '#0f172a';
        const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
        
        return {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { 
                        color: textColor,
                        boxWidth: 12,
                        padding: 15
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: isDark ? '#1e293b' : '#ffffff',
                    titleColor: textColor,
                    bodyColor: textColor,
                    borderColor: isDark ? '#475569' : '#e2e8f0',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    grid: { 
                        color: gridColor,
                        drawBorder: false
                    },
                    ticks: { 
                        color: textColor,
                        maxTicksLimit: 8
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: { 
                        color: gridColor,
                        drawBorder: false
                    },
                    ticks: { 
                        color: textColor,
                        callback: function(value) {
                            return value + (title.includes('%') ? '%' : ' KB/s');
                        }
                    }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            },
            animation: {
                duration: 0
            },
            elements: {
                point: {
                    radius: 0,
                    hoverRadius: 4
                }
            }
        };
    }

    updateCharts(stats) {
        const now = new Date().toLocaleTimeString();
        
        // CPU Chart
        if (this.state.charts.cpu) {
            this.updateChartData(this.state.charts.cpu, now, stats.cpu);
        }
        
        // Memory Chart
        if (this.state.charts.memory) {
            this.updateChartData(this.state.charts.memory, now, stats.memory);
        }
        
        // Network Chart
        if (this.state.charts.network && stats.network) {
            const download = stats.network.rx || 0;
            const upload = stats.network.tx || 0;
            this.updateChartData(this.state.charts.network, now, [download, upload]);
        }
    }

    updateChartData(chart, label, data, maxDataPoints = 60) {
        chart.data.labels.push(label);
        
        if (Array.isArray(data)) {
            chart.data.datasets.forEach((dataset, index) => {
                dataset.data.push(data[index] || 0);
            });
        } else {
            chart.data.datasets[0].data.push(data || 0);
        }
        
        // Remove old data
        if (chart.data.labels.length > maxDataPoints) {
            chart.data.labels.shift();
            chart.data.datasets.forEach(dataset => {
                dataset.data.shift();
            });
        }
        
        chart.update('none');
    }

    // Settings management
    loadSettings() {
        const savedInterval = localStorage.getItem('refreshInterval');
        const savedTheme = localStorage.getItem('theme');
        const savedAutoRefresh = localStorage.getItem('autoRefresh');
        const savedRealTime = localStorage.getItem('realTimeEnabled');
        
        if (savedInterval) {
            this.config.refreshInterval = parseInt(savedInterval);
            document.getElementById('refresh-interval').value = this.config.refreshInterval / 1000;
        }
        
        if (savedTheme) {
            this.changeTheme(savedTheme);
            document.getElementById('theme-select').value = savedTheme;
        }
        
        if (savedAutoRefresh !== null) {
            this.config.autoRefresh = savedAutoRefresh === 'true';
            document.getElementById('auto-refresh').checked = this.config.autoRefresh;
        }
        
        if (savedRealTime !== null) {
            this.config.realTimeEnabled = savedRealTime === 'true';
            document.getElementById('real-time-toggle').checked = this.config.realTimeEnabled;
        }
    }

    loadSettingsDisplay() {
        // Load current settings into display elements
        this.updateElementText('node-version', process.versions?.node || '—');
        this.updateElementText('dashboard-uptime', this.formatUptime(process.uptime()));
        this.updateElementText('last-update-time', new Date().toLocaleString());
    }

    updateRefreshInterval(seconds) {
        this.config.refreshInterval = seconds * 1000;
        localStorage.setItem('refreshInterval', this.config.refreshInterval);
        this.restartPolling();
        this.showToast(`Refresh interval updated to ${seconds} seconds`, 'success');
    }

    changeTheme(theme) {
        this.config.theme = theme;
        
        if (theme === 'auto') {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
        } else {
            document.documentElement.setAttribute('data-theme', theme);
        }
        
        localStorage.setItem('theme', theme);
        
        // Update charts if they exist
        if (this.state.charts.cpu) {
            this.updateChartColors();
        }
    }

    updateChartColors() {
        const isDark = this.config.theme === 'dark';
        const textColor = isDark ? '#f8fafc' : '#0f172a';
        const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
        
        Object.values(this.state.charts).forEach(chart => {
            if (chart && chart.options) {
                chart.options.scales.x.ticks.color = textColor;
                chart.options.scales.x.grid.color = gridColor;
                chart.options.scales.y.ticks.color = textColor;
                chart.options.scales.y.grid.color = gridColor;
                
                if (chart.options.plugins?.legend?.labels) {
                    chart.options.plugins.legend.labels.color = textColor;
                }
                
                if (chart.options.plugins?.title) {
                    chart.options.plugins.title.color = textColor;
                }
                
                chart.update();
            }
        });
    }

    toggleAutoRefresh(enabled) {
        this.config.autoRefresh = enabled;
        localStorage.setItem('autoRefresh', enabled);
        
        if (enabled) {
            this.startPolling();
            this.showToast('Auto-refresh enabled', 'success');
        } else {
            this.stopPolling();
            this.showToast('Auto-refresh disabled', 'info');
        }
    }

    startPolling() {
        if (!this.config.autoRefresh) return;
        
        this.stopPolling();

        this.pollInterval = setInterval(() => {
            this.fetchAllData();
        }, this.config.refreshInterval);
    }

    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    restartPolling() {
        this.stopPolling();
        this.startPolling();
    }

    updateLastUpdated() {
        const element = document.getElementById('last-updated');
        if (element && this.state.lastUpdate) {
            const now = new Date();
            const diff = now - this.state.lastUpdate;
            const seconds = Math.floor(diff / 1000);
            
            if (seconds < 60) {
                element.textContent = 'Just now';
            } else if (seconds < 3600) {
                element.textContent = `${Math.floor(seconds / 60)} min ago`;
            } else {
                element.textContent = this.state.lastUpdate.toLocaleTimeString();
            }
        }
    }

    updateUserDisplay() {
        const usernameDisplay = document.getElementById('username-display');
        if (usernameDisplay && this.state.user) {
            usernameDisplay.textContent = this.state.user.username;
        }
    }

    async logout() {
        try {
            await fetch('/dashboard/api/logout', { method: 'POST' });
            window.location.href = '/dashboard/login.html';
        } catch (error) {
            console.error('Logout failed:', error);
            window.location.href = '/dashboard/login.html';
        }
    }

    hideLoadingScreen() {
        const loading = document.getElementById('loading');
        const app = document.getElementById('app');
        
        if (loading && app) {
            setTimeout(() => {
                loading.style.display = 'none';
                app.classList.remove('hidden');
            }, 500);
        }
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span>${message}</span>
            <button onclick="this.parentElement.remove()" style="background: none; border: none; color: inherit; cursor: pointer; margin-left: 8px;">×</button>
        `;
        
        container.appendChild(toast);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 5000);
    }

    // Utility methods
    formatUptime(seconds) {
        if (!seconds || isNaN(seconds)) return '—';
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (days > 0) {
            return `${days}d ${hours}h ${minutes}m`;
        } else if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else {
            return `${minutes}m`;
        }
    }

    escapeHtml(unsafe) {
        if (unsafe === null || unsafe === undefined) return '';
        return unsafe.toString()
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    updateElementText(id, text) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = text;
        }
    }

    // Event handlers
    handleContainerEvent(event) {
        console.log('Container event:', event);
        this.showToast(`Container ${event.action}: ${event.name}`, 'info');
        this.fetchContainers();
    }

    handleSecurityAlert(alert) {
        console.log('Security alert:', alert);
        this.showToast(`Security alert: ${alert.message}`, 'warning');
        this.fetchSecurityInfo();
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new ServerDashboard();
});

// Make dashboard globally available for HTML onclick handlers
window.containerAction = (containerId, action) => {
    if (window.dashboard) {
        window.dashboard.containerAction(containerId, action);
    }
};

// Error handling
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
});

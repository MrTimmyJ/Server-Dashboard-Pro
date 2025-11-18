class ServerDashboard {
    constructor() {
        this.config = {
            refreshInterval: 30000,
            chartHistory: 60,
            theme: 'dark'
        };
        
        this.state = {
            authenticated: false,
            user: null,
            stats: {},
            containers: [],
            charts: {},
            lastUpdate: null,
			ws: null
        };
        
        this.chartData = {
            cpu: [],
            memory: [],
            network: []
        };
        
        this.init();
    }

    async init() {
        await this.checkAuth();
		this.setupWebSocket();
        this.setupEventListeners();
        this.loadSettings();
        this.initializeCharts();
        //this.startPolling();
        this.hideLoadingScreen();
		this.fetchAllData();
    }

	// WebSocket setup
    setupWebSocket() {
        try {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            this.state.ws = new WebSocket(`${protocol}//${window.location.host}/dashboard/ws`);
            
            this.state.ws.onopen = () => {
                console.log('✅ WebSocket connected - real-time updates enabled');
                this.showToast('Live updates enabled', 'success');
                this.stopPolling(); // Stop HTTP polling since we have WebSocket
            };
            
            this.state.ws.onmessage = (event) => {
                const message = JSON.parse(event.data);
                if (message.type === 'real-time-stats') {
                    this.updateCharts(message.data); // Real-time chart updates
                    this.updateQuickStats(message.data);
                }
            };
            
            this.state.ws.onclose = () => {
                console.log('❌ WebSocket disconnected - falling back to polling');
                this.showToast('Live updates disabled, using polling', 'warning');
                this.startPolling(); // Fallback to normal polling
            };
            
            this.state.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
            
        } catch (error) {
            console.log('WebSocket not available, using polling:', error);
            this.startPolling();
        }
    }

    // Update quick stats in real-time
    updateQuickStats(stats) {
        // Update CPU and Memory percentages in real-time
        this.updateElementText('cpu-usage', `${stats.cpu}%`);
        this.updateElementText('memory-usage', `${stats.memory}%`);
        
        // Update network stats with real data
        const networkRx = document.getElementById('network-rx');
        const networkTx = document.getElementById('network-tx');
        if (networkRx) networkRx.textContent = `${stats.network.rx.toFixed(1)} KB/s`;
        if (networkTx) networkTx.textContent = `${stats.network.tx.toFixed(1)} KB/s`;
    }

    // Update charts with real-time data
    updateCharts(stats) {
        const now = new Date().toLocaleTimeString();
        
        // CPU Chart
        if (this.state.charts.cpu) {
            this.updateChartData(this.state.charts.cpu, now, stats.cpu, 60);
        }
        
        // Memory Chart
        if (this.state.charts.memory) {
            this.updateChartData(this.state.charts.memory, now, stats.memory, 60);
        }
        
        // Network Chart
        if (this.state.charts.network) {
            const download = stats.network.rx;
            const upload = stats.network.tx;
            this.updateChartData(this.state.charts.network, now, [download, upload], 60);
        }
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

    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                this.switchTab(e.currentTarget.dataset.tab);
            });
        });

        // Logout
        document.getElementById('logout-btn').addEventListener('click', () => {
            this.logout();
        });

	// Manual Refresh Button
        document.getElementById('manual-refresh')?.addEventListener('click', () => {
            this.fetchAllData();
        });

        // Refresh buttons
        document.getElementById('refresh-containers')?.addEventListener('click', () => {
            this.fetchContainers();
        });

        document.getElementById('refresh-logs')?.addEventListener('click', () => {
            this.fetchLogs();
        });

        // Container actions
        document.getElementById('start-all-containers')?.addEventListener('click', () => {
            this.batchContainerAction('start');
        });

        document.getElementById('stop-all-containers')?.addEventListener('click', () => {
            this.batchContainerAction('stop');
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

        // Log controls
        document.getElementById('log-type')?.addEventListener('change', () => {
            this.fetchLogs();
        });

        document.getElementById('log-lines')?.addEventListener('change', () => {
            this.fetchLogs();
        });

        document.getElementById('clear-logs')?.addEventListener('click', () => {
            document.getElementById('system-logs').textContent = '';
        });
    }

    switchTab(tabName) {
        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Update content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(tabName).classList.add('active');

        // Tab-specific initialization
        if (tabName === 'performance') {
            this.initializeCharts();
        } else if (tabName === 'logs') {
            this.fetchLogs();
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
        }
    }

    loadSettings() {
        const savedInterval = localStorage.getItem('refreshInterval');
        const savedTheme = localStorage.getItem('theme');
        
        if (savedInterval) {
            this.config.refreshInterval = parseInt(savedInterval);
            document.getElementById('refresh-interval').value = this.config.refreshInterval / 1000;
        }
        
        if (savedTheme) {
            this.changeTheme(savedTheme);
            document.getElementById('theme-select').value = savedTheme;
        }
    }

    updateRefreshInterval(seconds) {
        this.config.refreshInterval = seconds * 1000;
        localStorage.setItem('refreshInterval', this.config.refreshInterval);
        this.restartPolling();
        this.showToast(`Refresh interval updated to ${seconds} seconds`, 'success');
    }

    changeTheme(theme) {
        this.config.theme = theme;
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        
        if (this.state.charts.cpu) {
            this.updateChartColors();
        }
    }

    toggleAutoRefresh(enabled) {
        if (enabled) {
            this.startPolling();
	    this.showToast('Auto-refresh enabled', 'success');
        } else {
            this.stopPolling();
	    this.showToast('Auto-refresh disabled', 'info');
        }
    }

    startPolling() {
        this.stopPolling();

        this.pollInterval = setInterval(() => {
            this.fetchAllData();
        }, this.config.refreshInterval);
        
	console.log('Auto-refresh started:', this.config.refreshInterval + 'ms');
        // Initial fetch
        //this.fetchAllData();
    }

    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
        }
    }

    restartPolling() {
        this.stopPolling();
        this.startPolling();
    }

    async fetchAllData() {
        try {
            await Promise.all([
                this.fetchSystemStats(),
                this.fetchSystemInfo(),
                this.fetchContainers()
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

    updateStatsDisplay() {
        const { stats } = this.state;

        //console.log('📊 Stats data:', stats);
        //console.log('⏰ Uptime value:', stats.uptime);
        //console.log('📅 Uptime type:', typeof stats.uptime);
        
        // Update overview cards
        this.updateElementText('cpu-usage', `${stats.cpu}%`);
        this.updateElementText('memory-usage', `${stats.memory}%`);
        this.updateElementText('storage-usage', `${stats.storage}%`);
        
        // Update quick stats
        this.updateElementText('stat-containers', this.state.containers.length);
        this.updateElementText('stat-processes', '—'); // Would need additional API
        this.updateElementText('stat-load', '—'); // Would need additional API
        this.updateElementText('stat-uptime', this.formatUptime(stats.uptime));

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

    updateContainersDisplay() {
        const containersList = document.getElementById('containers-list');
        const tableBody = document.getElementById('containers-table-body');
        
        if (!containersList && !tableBody) return;
        
        const containers = this.state.containers;
        
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
                    <td>
                        <div style="display: flex; gap: 4px;">
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

    updateLogsDisplay(logs) {
        const logsElement = document.getElementById('system-logs');
        if (logsElement) {
            logsElement.textContent = Array.isArray(logs) ? logs.join('\n') : logs;
            logsElement.scrollTop = logsElement.scrollHeight;
        }
    }

    updateLastUpdated() {
        const element = document.getElementById('last-updated');
        if (element && this.state.lastUpdate) {
            element.textContent = this.state.lastUpdate.toLocaleTimeString();
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

    initializeCharts() {
        // Destroy existing charts first
        if (this.state.charts.cpu) {
            this.state.charts.cpu.destroy();
        }
        if (this.state.charts.memory) {
            this.state.charts.memory.destroy();
        }
        if (this.state.charts.network) {
            this.state.charts.network.destroy();
        }

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
                        tension: 0.4
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
                        tension: 0.4
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
                            tension: 0.4
                        },
                        {
                            label: 'Upload',
                            data: [],
                            borderColor: '#f59e0b',
                            backgroundColor: 'rgba(245, 158, 11, 0.1)',
                            borderWidth: 2,
                            fill: true,
                            tension: 0.4
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
                    labels: { color: textColor }
                },
                title: {
                    display: true,
                    text: title,
                    color: textColor,
                    font: { size: 14 }
                }
            },
            scales: {
                x: {
                    grid: { color: gridColor },
                    ticks: { color: textColor }
                },
                y: {
                    min: 0,
                    max: 100,
                    grid: { color: gridColor },
                    ticks: { color: textColor }
                }
            },
            animation: {
                duration: 0
            },
            elements: {
                point: {
                    radius: 0
                }
            }
        };
    }

    updateCharts(stats) {
        const now = new Date().toLocaleTimeString();
        
        // CPU Chart
        if (this.state.charts.cpu) {
            this.updateChartData(this.state.charts.cpu, now, stats.cpu, 60);
        }
        
        // Memory Chart
        if (this.state.charts.memory) {
            this.updateChartData(this.state.charts.memory, now, stats.memory, 60);
        }
        
        // Network Chart (placeholder data)
        if (this.state.charts.network) {
            const download = Math.random() * 100;
            const upload = Math.random() * 50;
            this.updateChartData(this.state.charts.network, now, [download, upload], 60);
        }
    }

    updateChartData(chart, label, data, maxDataPoints) {
        chart.data.labels.push(label);
        chart.data.datasets.forEach((dataset, index) => {
            const value = Array.isArray(data) ? data[index] : data;
            dataset.data.push(value);
        });
        
        // Remove old data
        if (chart.data.labels.length > maxDataPoints) {
            chart.data.labels.shift();
            chart.data.datasets.forEach(dataset => {
                dataset.data.shift();
            });
        }
        
        chart.update('none');
    }

    updateChartColors() {
        const isDark = this.config.theme === 'dark';
        const textColor = isDark ? '#f8fafc' : '#0f172a';
        const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
        
        Object.values(this.state.charts).forEach(chart => {
            chart.options.scales.x.ticks.color = textColor;
            chart.options.scales.x.grid.color = gridColor;
            chart.options.scales.y.ticks.color = textColor;
            chart.options.scales.y.grid.color = gridColor;
            chart.options.plugins.legend.labels.color = textColor;
            chart.options.plugins.title.color = textColor;
            chart.update();
        });
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span>${message}</span>
            <button onclick="this.parentElement.remove()" style="background: none; border: none; color: inherit; cursor: pointer;">×</button>
        `;
        
        container.appendChild(toast);
        
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 5000);
    }

    hideLoadingScreen() {
        const loading = document.getElementById('loading');
        const app = document.getElementById('app');
        
        if (loading && app) {
            loading.style.display = 'none';
            app.classList.remove('hidden');
        }
    }

    // Utility methods
    updateElementText(id, text) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = text;
        }
    }

    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    formatUptime(seconds) {
        if (!seconds || isNaN(seconds)) return '—';
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        return `${days}d ${hours}h`;
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new ServerDashboard();
});

// Error handling
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
});

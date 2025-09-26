const mineflayer = require('mineflayer');
const { pathfinder, Movements } = require('mineflayer-pathfinder');
const http = require('http');

// Bot configuration
const BOT_CONFIG = {
    host: process.env.SERVER_HOST || 'localhost',
    port: parseInt(process.env.SERVER_PORT) || 25565,
    username: process.env.BOT_USERNAME || 'AFKBot',
    password: process.env.BOT_PASSWORD || '',
    version: process.env.MC_VERSION || '1.21.8',
    auth: process.env.AUTH_TYPE || 'offline',
    keepAlive: true,
    checkTimeoutInterval: 30000,
    hideErrors: false
};

const HTTP_PORT = process.env.PORT || 10000;

// Enhanced monitoring and recovery settings
const MONITORING_CONFIG = {
    healthCheckInterval: 30000,      // Check every 30 seconds
    processMonitorInterval: 15000,   // Monitor process every 15 seconds
    silentFailureTimeout: 120000,    // 2 minutes of silence = potential failure
    forceRestartInterval: 1800000,   // Force restart every 30 minutes as safety
    keepAliveInterval: 300000,       // HTTP keep-alive every 5 minutes
    logRetentionCount: 200,          // Keep more logs
    watchdogTimeout: 60000,          // Watchdog timer
    maxMemoryMB: 500,               // Memory limit monitoring
    inactivityThreshold: 300000      // 5 minutes of inactivity
};

console.log('🚀 Starting ROBUST Minecraft AFK Bot with Enhanced Monitoring');
console.log('🔍 Configuration Check:');
console.log('SERVER_HOST:', process.env.SERVER_HOST || '❌ NOT SET');
console.log('SERVER_PORT:', process.env.SERVER_PORT || '❌ NOT SET');
console.log('BOT_USERNAME:', process.env.BOT_USERNAME || '❌ NOT SET');
console.log('HTTP_PORT:', HTTP_PORT);
console.log('Node Version:', process.version);
console.log('Platform:', process.platform);

// Movement patterns
const MOVEMENT_PATTERNS = {
    gentle: { forward: 500, right: 500, back: 500, left: 500 },
    circle: { forward: 800, right: 800, back: 800, left: 800 },
    square: { forward: 1200, right: 400, back: 1200, left: 400 },
    random: { min: 600, max: 1800 }
};

class RobustAFKBot {
    constructor() {
        this.bot = null;
        this.isMoving = false;
        this.currentPattern = 'gentle';
        this.movementInterval = null;
        this.healthCheckTimer = null;
        this.processMonitorTimer = null;
        this.keepAliveTimer = null;
        this.watchdogTimer = null;
        this.forceRestartTimer = null;

        // State tracking
        this.isConnected = false;
        this.connectionStable = false;
        this.lastActivity = Date.now();
        this.lastHealthCheck = Date.now();
        this.connectionTime = null;
        this.processStartTime = Date.now();
        this.totalReconnects = 0;
        this.silentFailures = 0;
        this.recoveryAttempts = 0;

        // Enhanced logging
        this.logs = [];
        this.systemLogs = [];
        this.lastLogTime = Date.now();

        // Process monitoring
        this.memoryUsage = { rss: 0, heapUsed: 0, external: 0 };
        this.cpuUsage = { user: 0, system: 0 };

        this.startProcessMonitoring();
        this.startWatchdog();
        this.setupForceRestart();
    }

    addLog(message, type = 'info', skipConsole = false) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            message: `[${timestamp}] ${message}`,
            type,
            timestamp: Date.now()
        };

        this.logs.push(logEntry);
        this.lastLogTime = Date.now();

        // Keep logs manageable
        if (this.logs.length > MONITORING_CONFIG.logRetentionCount) {
            this.logs = this.logs.slice(-MONITORING_CONFIG.logRetentionCount);
        }

        if (!skipConsole) {
            console.log(logEntry.message);
        }

        // Reset watchdog
        this.resetWatchdog();
    }

    addSystemLog(message, data = null) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            message: `[${timestamp}] SYSTEM: ${message}`,
            data,
            timestamp: Date.now()
        };

        this.systemLogs.push(logEntry);

        if (this.systemLogs.length > 100) {
            this.systemLogs = this.systemLogs.slice(-100);
        }

        console.log(logEntry.message);
        if (data) console.log('Data:', data);
    }

    getStatus() {
        const uptime = Date.now() - this.processStartTime;
        return {
            service: 'Robust Minecraft AFK Bot',
            version: '2.0',
            processUptime: Math.floor(uptime / 1000),

            // Connection status
            connected: this.isConnected,
            stable: this.connectionStable,
            sessionUptime: this.connectionTime ? Math.floor((Date.now() - this.connectionTime) / 1000) : 0,

            // Bot details
            username: BOT_CONFIG.username,
            server: `${BOT_CONFIG.host}:${BOT_CONFIG.port}`,
            moving: this.isMoving,
            pattern: this.currentPattern,

            // Health metrics
            lastActivity: new Date(this.lastActivity).toISOString(),
            lastHealthCheck: new Date(this.lastHealthCheck).toISOString(),
            lastLogTime: new Date(this.lastLogTime).toISOString(),

            // Statistics
            totalReconnects: this.totalReconnects,
            silentFailures: this.silentFailures,
            recoveryAttempts: this.recoveryAttempts,

            // Game stats
            health: this.bot?.health || 0,
            food: this.bot?.food || 0,
            position: this.bot?.entity?.position ? {
                x: Math.round(this.bot.entity.position.x),
                y: Math.round(this.bot.entity.position.y),
                z: Math.round(this.bot.entity.position.z)
            } : null,

            // System metrics
            memoryUsage: this.memoryUsage,
            cpuUsage: this.cpuUsage,

            // Logs
            recentLogs: this.logs.slice(-25).map(log => ({
                message: log.message.replace(/\[.*?\] /, ''),
                type: log.type,
                age: Math.floor((Date.now() - log.timestamp) / 1000)
            })),
            systemLogs: this.systemLogs.slice(-10).map(log => ({
                message: log.message.replace(/\[.*?\] SYSTEM: /, ''),
                age: Math.floor((Date.now() - log.timestamp) / 1000)
            }))
        };
    }

    startProcessMonitoring() {
        this.addSystemLog('Starting comprehensive process monitoring');

        this.processMonitorTimer = setInterval(() => {
            this.performSystemHealthCheck();
        }, MONITORING_CONFIG.processMonitorInterval);

        // Memory and CPU monitoring
        setInterval(() => {
            const memUsage = process.memoryUsage();
            this.memoryUsage = {
                rss: Math.round(memUsage.rss / 1024 / 1024), // MB
                heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
                external: Math.round(memUsage.external / 1024 / 1024)
            };

            const cpuUsage = process.cpuUsage();
            this.cpuUsage = {
                user: cpuUsage.user,
                system: cpuUsage.system
            };

            // Memory leak detection
            if (this.memoryUsage.rss > MONITORING_CONFIG.maxMemoryMB) {
                this.addSystemLog(`High memory usage detected: ${this.memoryUsage.rss}MB`, this.memoryUsage);
                this.addLog(`⚠️ High memory usage: ${this.memoryUsage.rss}MB - considering restart`, 'warning');

                if (this.memoryUsage.rss > MONITORING_CONFIG.maxMemoryMB * 1.5) {
                    this.addLog('🚨 Memory limit exceeded, forcing restart', 'error');
                    this.forceRestart();
                }
            }
        }, 60000); // Every minute
    }

    performSystemHealthCheck() {
        const now = Date.now();
        const timeSinceLastLog = now - this.lastLogTime;
        const timeSinceLastActivity = now - this.lastActivity;
        const timeSinceLastHealthCheck = now - this.lastHealthCheck;

        // Detect silent failures
        if (timeSinceLastLog > MONITORING_CONFIG.silentFailureTimeout && this.isConnected) {
            this.silentFailures++;
            this.addLog(`🔍 SILENT FAILURE DETECTED: ${Math.floor(timeSinceLastLog/1000)}s since last log`, 'error');
            this.addSystemLog('Silent failure detected', {
                timeSinceLastLog: timeSinceLastLog,
                timeSinceLastActivity: timeSinceLastActivity,
                isConnected: this.isConnected,
                botExists: !!this.bot
            });
            this.handleSilentFailure();
        }

        // Detect bot inactivity
        if (this.isConnected && timeSinceLastActivity > MONITORING_CONFIG.inactivityThreshold) {
            this.addLog(`⚠️ Bot inactive for ${Math.floor(timeSinceLastActivity/1000)}s`, 'warning');
            this.performBotHealthCheck();
        }

        // Check if health check is overdue
        if (timeSinceLastHealthCheck > MONITORING_CONFIG.healthCheckInterval * 2) {
            this.addLog('🔍 Health check overdue, performing emergency check', 'warning');
            this.performBotHealthCheck();
        }

        this.lastHealthCheck = now;
        this.addSystemLog('System health check completed', {
            memoryMB: this.memoryUsage.rss,
            timeSinceLastLog: Math.floor(timeSinceLastLog/1000),
            timeSinceLastActivity: Math.floor(timeSinceLastActivity/1000),
            isConnected: this.isConnected,
            botAlive: this.bot && !this.bot.ended
        });
    }

    performBotHealthCheck() {
        if (!this.bot || this.bot.ended) {
            this.addLog('🔍 Health check: Bot is null or ended', 'error');
            this.handleBotFailure();
            return;
        }

        if (!this.isConnected) {
            this.addLog('🔍 Health check: Bot marked as disconnected', 'warning');
            return;
        }

        try {
            // Gentle health check - just look around
            if (this.bot.entity) {
                const yaw = Math.random() * Math.PI * 2;
                this.bot.look(yaw, 0);
                this.addLog('🔍 Health check: Look command successful', 'info', true);
                this.lastActivity = Date.now();
            } else {
                this.addLog('🔍 Health check: No entity found', 'warning');
            }
        } catch (error) {
            this.addLog(`🔍 Health check failed: ${error.message}`, 'error');
            this.handleBotFailure();
        }
    }

    handleSilentFailure() {
        this.recoveryAttempts++;
        this.addLog(`🚨 Handling silent failure (attempt ${this.recoveryAttempts})`, 'error');

        if (this.recoveryAttempts > 3) {
            this.addLog('🚨 Multiple silent failures detected, forcing full restart', 'error');
            this.forceRestart();
        } else {
            this.handleBotFailure();
        }
    }

    handleBotFailure() {
        this.addLog('🔧 Handling bot failure - attempting recovery', 'warning');
        this.cleanupBot();

        setTimeout(() => {
            this.createBot();
        }, 10000); // 10 second delay
    }

    startWatchdog() {
        this.addSystemLog('Starting watchdog timer');
        this.resetWatchdog();
    }

    resetWatchdog() {
        if (this.watchdogTimer) {
            clearTimeout(this.watchdogTimer);
        }

        this.watchdogTimer = setTimeout(() => {
            this.addLog('🐕 WATCHDOG TIMEOUT: No activity detected, restarting bot', 'error');
            this.addSystemLog('Watchdog timeout triggered');
            this.handleBotFailure();
        }, MONITORING_CONFIG.watchdogTimeout);
    }

    setupForceRestart() {
        this.addSystemLog('Setting up periodic force restart timer');

        this.forceRestartTimer = setInterval(() => {
            this.addLog('🔄 Periodic safety restart (every 30 minutes)', 'info');
            this.forceRestart();
        }, MONITORING_CONFIG.forceRestartInterval);
    }

    forceRestart() {
        this.addLog('🚨 FORCE RESTART initiated', 'warning');
        this.addSystemLog('Force restart triggered', {
            totalReconnects: this.totalReconnects,
            silentFailures: this.silentFailures,
            memoryUsage: this.memoryUsage
        });

        this.cleanupBot();
        this.cleanupTimers();

        // Reset counters
        this.silentFailures = 0;
        this.recoveryAttempts = 0;

        setTimeout(() => {
            this.createBot();
            this.startProcessMonitoring();
        }, 15000); // 15 second delay
    }

    cleanupTimers() {
        if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);
        if (this.processMonitorTimer) clearInterval(this.processMonitorTimer);
        if (this.watchdogTimer) clearTimeout(this.watchdogTimer);
        if (this.movementInterval) clearInterval(this.movementInterval);

        this.healthCheckTimer = null;
        this.processMonitorTimer = null;
        this.watchdogTimer = null;
        this.movementInterval = null;
    }

    cleanupBot() {
        this.addLog('🧹 Cleaning up bot resources', 'info');

        this.isConnected = false;
        this.connectionStable = false;
        this.isMoving = false;
        this.connectionTime = null;

        if (this.movementInterval) {
            clearInterval(this.movementInterval);
            this.movementInterval = null;
        }

        if (this.bot) {
            try {
                this.bot.end();
            } catch (error) {
                this.addLog(`Warning during bot cleanup: ${error.message}`, 'warning');
            }
            this.bot = null;
        }
    }

    createBot() {
        this.addLog(`🚀 Creating robust bot connection to ${BOT_CONFIG.host}:${BOT_CONFIG.port}`, 'info');
        this.addSystemLog('Bot creation started', BOT_CONFIG);

        try {
            this.bot = mineflayer.createBot(BOT_CONFIG);
            this.setupEventHandlers();
            this.setupPathfinder();

            // Start health checking
            this.healthCheckTimer = setInterval(() => {
                this.performBotHealthCheck();
            }, MONITORING_CONFIG.healthCheckInterval);

        } catch (error) {
            this.addLog(`❌ Failed to create bot: ${error.message}`, 'error');
            setTimeout(() => this.createBot(), 15000);
        }
    }

    setupEventHandlers() {
        this.bot.on('login', () => {
            this.addLog(`✅ Bot logged in as ${this.bot.username}`, 'success');
            this.isConnected = true;
            this.connectionTime = Date.now();
            this.lastActivity = Date.now();
            this.totalReconnects++;

            setTimeout(() => {
                this.connectionStable = true;
                this.addLog('🛡️ Connection marked as stable', 'success');
            }, 15000);

            this.startAFKBehavior();
        });

        this.bot.on('spawn', () => {
            this.addLog('🎯 Bot spawned in game world', 'success');
            this.lastActivity = Date.now();
            setTimeout(() => this.startMovement(), 10000);
        });

        this.bot.on('death', () => {
            this.addLog('💀 Bot died, attempting respawn', 'warning');
            this.lastActivity = Date.now();
            setTimeout(() => {
                if (this.bot && !this.bot.ended) {
                    try {
                        this.bot.respawn();
                    } catch (error) {
                        this.addLog(`Respawn failed: ${error.message}`, 'error');
                    }
                }
            }, 3000);
        });

        this.bot.on('kicked', (reason) => {
            this.addLog(`⚠️ Bot kicked: ${reason}`, 'error');
            this.isConnected = false;
            this.connectionStable = false;
            setTimeout(() => this.createBot(), 60000); // 1 minute delay after kick
        });

        this.bot.on('error', (err) => {
            this.addLog(`❌ Bot error: ${err.message}`, 'error');
            this.addSystemLog('Bot error occurred', { code: err.code, message: err.message });
            this.isConnected = false;
            this.connectionStable = false;

            setTimeout(() => this.createBot(), 20000);
        });

        this.bot.on('end', (reason) => {
            this.addLog(`🔌 Bot disconnected: ${reason || 'Unknown reason'}`, 'warning');
            this.addSystemLog('Bot connection ended', { reason });
            this.isConnected = false;
            this.connectionStable = false;
            this.cleanupBot();

            setTimeout(() => this.createBot(), 15000);
        });

        this.bot.on('chat', (username, message) => {
            if (username === this.bot.username) return;
            this.addLog(`💬 ${username}: ${message}`, 'chat', true);
            this.lastActivity = Date.now();
        });

        // Track all activity
        this.bot.on('physicsTick', () => {
            this.lastActivity = Date.now();
        });

        this.bot.on('move', () => {
            this.lastActivity = Date.now();
        });
    }

    setupPathfinder() {
        try {
            this.bot.loadPlugin(pathfinder);
        } catch (error) {
            this.addLog(`⚠️ Pathfinder load failed: ${error.message}`, 'warning');
        }
    }

    startAFKBehavior() {
        this.addLog('🤖 Starting robust AFK behavior', 'info');

        setTimeout(() => {
            if (this.bot && this.bot.chat && this.isConnected) {
                this.bot.chat('Robust AFK Bot online');
            }
        }, 20000);
    }

    startMovement() {
        if (this.isMoving || !this.bot || !this.isConnected) return;

        this.addLog(`🚶 Starting movement pattern: ${this.currentPattern}`, 'info');
        this.isMoving = true;

        const moveLoop = () => {
            if (!this.bot || !this.isConnected || !this.isMoving) return;

            try {
                this.lastActivity = Date.now();
                const pattern = MOVEMENT_PATTERNS[this.currentPattern];

                if (this.currentPattern === 'random') {
                    this.performRandomMovement();
                } else {
                    this.performPatternMovement(pattern);
                }
            } catch (error) {
                this.addLog(`Movement error: ${error.message}`, 'error');
            }
        };

        this.movementInterval = setInterval(moveLoop, 25000); // Every 25 seconds
        setTimeout(moveLoop, 2000); // Initial movement
    }

    performRandomMovement() {
        if (!this.bot || !this.bot.setControlState) return;

        const directions = ['forward', 'back', 'left', 'right'];
        const direction = directions[Math.floor(Math.random() * directions.length)];
        const duration = 1000 + Math.random() * 1000;

        this.bot.setControlState(direction, true);

        setTimeout(() => {
            if (this.bot && this.isConnected) {
                this.bot.clearControlStates();
                if (Math.random() < 0.3) {
                    setTimeout(() => {
                        if (this.bot && this.isConnected) {
                            this.bot.setControlState('jump', true);
                            setTimeout(() => {
                                if (this.bot && this.isConnected) {
                                    this.bot.setControlState('jump', false);
                                }
                            }, 500);
                        }
                    }, 500);
                }
            }
        }, duration);
    }

    performPatternMovement(pattern) {
        const movements = Object.entries(pattern);
        let currentMove = 0;

        const executeMove = () => {
            if (currentMove >= movements.length || !this.isMoving || !this.bot || !this.isConnected) {
                return;
            }

            const [direction, duration] = movements[currentMove];

            if (this.bot.setControlState) {
                this.bot.setControlState(direction, true);

                setTimeout(() => {
                    if (this.bot && this.isConnected) {
                        this.bot.clearControlStates();
                        currentMove++;
                        if (currentMove < movements.length) {
                            setTimeout(executeMove, 1000);
                        }
                    }
                }, duration);
            }
        };

        executeMove();
    }

    changePattern(newPattern) {
        if (MOVEMENT_PATTERNS[newPattern]) {
            this.addLog(`🔄 Changed pattern to: ${newPattern}`, 'info');
            this.currentPattern = newPattern;
            return true;
        }
        return false;
    }
}

// Create the robust bot
const robustBot = new RobustAFKBot();

// HTTP Keep-Alive system to prevent Render from sleeping
let keepAliveRequests = 0;
const keepAliveUrl = `http://localhost:${HTTP_PORT}/keep-alive`;

function performKeepAlive() {
    try {
        const req = http.get(keepAliveUrl, (res) => {
            keepAliveRequests++;
            console.log(`🔄 Keep-alive ping #${keepAliveRequests} - Status: ${res.statusCode}`);
        });
        req.on('error', (err) => {
            console.log('Keep-alive error (normal):', err.message);
        });
    } catch (error) {
        console.log('Keep-alive request failed (normal):', error.message);
    }
}

// Start keep-alive system
setInterval(performKeepAlive, MONITORING_CONFIG.keepAliveInterval);

// Enhanced HTTP server with more endpoints
const server = http.createServer((req, res) => {
    const url = req.url;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    if (url === '/keep-alive') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
        return;
    }

    if (url === '/') {
        const status = robustBot.getStatus();
        const html = `
<!DOCTYPE html>
<html>
<head>
    <title>🤖 Robust AFK Bot Dashboard</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { 
            font-family: system-ui, -apple-system, sans-serif; 
            margin: 0; padding: 15px; 
            background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); 
            min-height: 100vh; color: #333;
        }
        .container { 
            max-width: 1400px; margin: 0 auto; 
            background: rgba(255,255,255,0.95); 
            padding: 25px; border-radius: 15px; 
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        }
        .header { text-align: center; margin-bottom: 25px; }
        .header h1 { color: #1e3c72; margin: 0; font-size: 2.2em; }
        .status-grid { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
            gap: 15px; margin: 20px 0; 
        }
        .status-card { 
            padding: 15px; border-radius: 10px; text-align: center;
            color: white; font-weight: bold;
        }
        .connected { background: linear-gradient(45deg, #27ae60, #2ecc71); }
        .disconnected { background: linear-gradient(45deg, #e74c3c, #c0392b); }
        .stable { background: linear-gradient(45deg, #3498db, #2980b9); }
        .warning { background: linear-gradient(45deg, #f39c12, #e67e22); }

        .metrics { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); 
            gap: 15px; margin: 20px 0; 
        }
        .metric { 
            background: #f8f9fa; padding: 15px; border-radius: 8px;
            text-align: center; border-left: 4px solid #3498db;
        }
        .metric-value { font-size: 1.5em; font-weight: bold; color: #2c3e50; }
        .metric-label { font-size: 0.8em; color: #7f8c8d; text-transform: uppercase; }

        .logs-container { display: grid; grid-template-columns: 2fr 1fr; gap: 20px; margin: 20px 0; }
        .logs { 
            background: #1a1a1a; color: #00ff41; padding: 15px; 
            border-radius: 8px; font-family: 'Courier New', monospace; 
            height: 350px; overflow-y: auto; border: 2px solid #333;
            font-size: 0.85em;
        }
        .system-logs { 
            background: #2c3e50; color: #ecf0f1; padding: 15px; 
            border-radius: 8px; font-family: 'Courier New', monospace; 
            height: 350px; overflow-y: auto; border: 2px solid #34495e;
            font-size: 0.8em;
        }

        .log-success { color: #2ecc71; }
        .log-error { color: #e74c3c; }
        .log-warning { color: #f39c12; }
        .log-info { color: #3498db; }
        .log-chat { color: #9b59b6; }

        .controls { 
            display: flex; flex-wrap: wrap; gap: 10px; 
            justify-content: center; margin: 20px 0; 
        }
        .btn { 
            background: linear-gradient(45deg, #3498db, #2980b9); 
            color: white; border: none; padding: 10px 20px; 
            border-radius: 6px; cursor: pointer; font-weight: bold;
            transition: all 0.3s; font-size: 0.9em;
        }
        .btn:hover { transform: translateY(-2px); opacity: 0.9; }
        .btn-danger { background: linear-gradient(45deg, #e74c3c, #c0392b); }

        .alert { 
            padding: 12px; border-radius: 6px; margin: 10px 0; 
            text-align: center; font-weight: bold;
        }
        .alert-warning { background: #fff3cd; border: 2px solid #ffc107; color: #856404; }
        .alert-info { background: #d1ecf1; border: 2px solid #17a2b8; color: #0c5460; }

        .footer { text-align: center; margin-top: 20px; color: #7f8c8d; font-size: 0.85em; }
    </style>
    <meta http-equiv="refresh" content="15">
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🤖 Robust AFK Bot v2.0</h1>
            <div style="font-size: 0.9em; color: #7f8c8d;">
                Enhanced Monitoring • Auto-Recovery • Silent Failure Detection
            </div>
        </div>

        <div class="status-grid">
            <div class="status-card ${status.connected ? 'connected' : 'disconnected'}">
                ${status.connected ? '🟢 CONNECTED' : '🔴 DISCONNECTED'}
            </div>
            <div class="status-card ${status.stable ? 'stable' : 'warning'}">
                ${status.stable ? '🛡️ STABLE' : '⚠️ STABILIZING'}
            </div>
        </div>

        ${status.silentFailures > 0 || status.recoveryAttempts > 0 ? `
        <div class="alert alert-warning">
            🚨 Recovery Status: ${status.silentFailures} silent failures detected, ${status.recoveryAttempts} recovery attempts
        </div>
        ` : ''}

        <div class="alert alert-info">
            🔄 Keep-Alive: ${keepAliveRequests} pings sent | Process Uptime: ${Math.floor(status.processUptime / 3600)}h ${Math.floor((status.processUptime % 3600) / 60)}m
        </div>

        <div class="metrics">
            <div class="metric">
                <div class="metric-value">${status.username}</div>
                <div class="metric-label">Bot Username</div>
            </div>
            <div class="metric">
                <div class="metric-value">${status.server}</div>
                <div class="metric-label">Server</div>
            </div>
            <div class="metric">
                <div class="metric-value">${status.moving ? status.pattern : 'Stopped'}</div>
                <div class="metric-label">Movement</div>
            </div>
            <div class="metric">
                <div class="metric-value">${Math.floor(status.sessionUptime / 60)}m</div>
                <div class="metric-label">Session</div>
            </div>
            <div class="metric">
                <div class="metric-value">${status.health}/20</div>
                <div class="metric-label">Health</div>
            </div>
            <div class="metric">
                <div class="metric-value">${status.food}/20</div>
                <div class="metric-label">Food</div>
            </div>
            <div class="metric">
                <div class="metric-value">${status.memoryUsage.rss}MB</div>
                <div class="metric-label">Memory</div>
            </div>
            <div class="metric">
                <div class="metric-value">${status.totalReconnects}</div>
                <div class="metric-label">Reconnects</div>
            </div>
        </div>

        <div class="logs-container">
            <div>
                <h3 style="color: #2c3e50; margin: 0 0 10px 0;">📋 Bot Activity Logs</h3>
                <div class="logs">
${status.recentLogs.map(log => `<div class="log-${log.type}">[${log.age}s ago] ${log.message}</div>`).join('\n')}
                </div>
            </div>
            <div>
                <h3 style="color: #2c3e50; margin: 0 0 10px 0;">🔧 System Monitoring</h3>
                <div class="system-logs">
${status.systemLogs.map(log => `<div>[${log.age}s ago] ${log.message}</div>`).join('\n')}
                </div>
            </div>
        </div>

        <div class="controls">
            <button class="btn" onclick="location.reload()">🔄 Refresh</button>
            <button class="btn" onclick="fetch('/api/pattern/gentle', {method: 'POST'}).then(() => setTimeout(() => location.reload(), 1000))">🕊️ Gentle</button>
            <button class="btn" onclick="fetch('/api/pattern/circle', {method: 'POST'}).then(() => setTimeout(() => location.reload(), 1000))">🔵 Circle</button>
            <button class="btn" onclick="fetch('/api/pattern/random', {method: 'POST'}).then(() => setTimeout(() => location.reload(), 1000))">🎲 Random</button>
            <button class="btn btn-danger" onclick="fetch('/api/restart', {method: 'POST'}).then(() => setTimeout(() => location.reload(), 2000))">🚨 Force Restart</button>
        </div>

        <div class="footer">
            <div><strong>Robust Minecraft AFK Bot v2.0</strong> with Enhanced Monitoring</div>
            <div>Last Health Check: ${Math.floor((Date.now() - new Date(status.lastHealthCheck).getTime()) / 1000)}s ago</div>
            <div>Last Activity: ${Math.floor((Date.now() - new Date(status.lastActivity).getTime()) / 1000)}s ago</div>
        </div>
    </div>
</body>
</html>`;

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);

    } else if (url === '/api/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(robustBot.getStatus()));

    } else if (url.startsWith('/api/pattern/') && req.method === 'POST') {
        const pattern = url.split('/')[3];
        const success = robustBot.changePattern(pattern);
        res.writeHead(success ? 200 : 400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success, pattern }));

    } else if (url === '/api/restart' && req.method === 'POST') {
        robustBot.forceRestart();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Force restart initiated' }));

    } else {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 - Not Found</h1><p><a href="/">← Back to Dashboard</a></p>');
    }
});

// Start HTTP server
server.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`🌐 Robust Dashboard running on port ${HTTP_PORT}`);
    console.log('🔄 Keep-alive system active');
    console.log('🤖 Starting robust Minecraft bot...');

    // Start the bot
    robustBot.createBot();
});

// Enhanced shutdown handling
const shutdown = () => {
    console.log('\n🛑 Robust shutdown initiated...');

    robustBot.cleanupBot();
    robustBot.cleanupTimers();

    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });

    setTimeout(() => {
        console.log('🚨 Force exit');
        process.exit(1);
    }, 20000);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Global error handlers
process.on('uncaughtException', (error) => {
    console.error('🚨 UNCAUGHT EXCEPTION:', error);
    robustBot.addSystemLog('Uncaught exception', { error: error.message, stack: error.stack });
    robustBot.forceRestart();
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 UNHANDLED REJECTION:', reason);
    robustBot.addSystemLog('Unhandled rejection', { reason, promise });
});

console.log('✅ Robust AFK Bot v2.0 initialized with comprehensive monitoring');

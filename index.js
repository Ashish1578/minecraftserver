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

// Sleep prevention and monitoring
const SLEEP_CONFIG = {
    externalPingTimeout: 900000,     // 15 minutes - expect external pings
    internalPingInterval: 600000,    // 10 minutes - backup internal pings  
    sleepDetectionThreshold: 30000,  // 30 seconds to detect cold start
    wakeupGracePeriod: 45000,       // 45 seconds after wake for reconnection
    maxSleepCycles: 10,             // Track sleep cycles
    coldStartTimeout: 60000          // 1 minute for cold start reconnections
};

console.log('🚀 SLEEP-AWARE Minecraft AFK Bot v3.0');
console.log('🛡️ Enhanced with Render Sleep Prevention');
console.log('🔍 Configuration:');
console.log('SERVER_HOST:', process.env.SERVER_HOST || '❌ NOT SET');
console.log('SERVER_PORT:', process.env.SERVER_PORT || '❌ NOT SET');
console.log('BOT_USERNAME:', process.env.BOT_USERNAME || '❌ NOT SET');

// Movement patterns
const MOVEMENT_PATTERNS = {
    gentle: { forward: 400, right: 400, back: 400, left: 400 },
    circle: { forward: 800, right: 800, back: 800, left: 800 },
    square: { forward: 1200, right: 400, back: 1200, left: 400 },
    random: { min: 500, max: 1500 }
};

class SleepAwareAFKBot {
    constructor() {
        this.bot = null;
        this.isMoving = false;
        this.currentPattern = 'gentle';
        this.movementInterval = null;

        // Connection state
        this.isConnected = false;
        this.connectionStable = false;
        this.connectionTime = null;
        this.lastActivity = Date.now();
        this.totalReconnects = 0;

        // Sleep monitoring
        this.lastExternalPing = Date.now();
        this.lastInternalPing = 0;
        this.sleepCycles = 0;
        this.lastWakeTime = Date.now();
        this.externalPingCount = 0;
        this.internalPingCount = 0;
        this.sleepDetected = false;
        this.serviceStartTime = Date.now();

        // Enhanced logging
        this.logs = [];

        // Timers
        this.internalKeepAliveTimer = null;
        this.sleepMonitorTimer = null;
        this.reconnectionTimeout = null;

        this.startSleepPrevention();
        this.startSleepMonitoring();
    }

    addLog(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const logEntry = {
            message: `[${timestamp}] ${message}`,
            type,
            timestamp: Date.now()
        };

        this.logs.push(logEntry);

        // Keep reasonable log count
        if (this.logs.length > 150) {
            this.logs = this.logs.slice(-150);
        }

        console.log(logEntry.message);
    }

    startSleepPrevention() {
        this.addLog('🛡️ Starting sleep prevention system', 'info');

        // Internal keep-alive as backup
        this.internalKeepAliveTimer = setInterval(() => {
            this.performInternalKeepAlive();
        }, SLEEP_CONFIG.internalPingInterval);
    }

    performInternalKeepAlive() {
        const timeSinceExternalPing = Date.now() - this.lastExternalPing;

        // Only do internal pings if external pings are failing
        if (timeSinceExternalPing > SLEEP_CONFIG.externalPingTimeout) {
            this.internalPingCount++;
            this.lastInternalPing = Date.now();

            this.addLog(`🔄 Internal keep-alive ping #${this.internalPingCount} (no external pings for ${Math.floor(timeSinceExternalPing/60000)}m)`, 'warning');

            try {
                const req = http.get(`http://localhost:${HTTP_PORT}/keep-alive`, (res) => {
                    // Internal ping successful
                });
                req.on('error', () => {
                    // Ignore internal ping errors
                });
            } catch (error) {
                // Ignore internal ping errors
            }
        }
    }

    startSleepMonitoring() {
        this.addLog('👁️ Starting sleep cycle monitoring', 'info');

        this.sleepMonitorTimer = setInterval(() => {
            this.checkForSleepCycles();
        }, 30000); // Check every 30 seconds
    }

    checkForSleepCycles() {
        const now = Date.now();
        const timeSinceLastExternal = now - this.lastExternalPing;
        const timeSinceLastWake = now - this.lastWakeTime;

        // Detect potential sleep if no external pings for extended period
        if (timeSinceLastExternal > SLEEP_CONFIG.externalPingTimeout && !this.sleepDetected) {
            this.sleepDetected = true;
            this.sleepCycles++;
            this.addLog('💤 SLEEP CYCLE DETECTED - No external pings for 15+ minutes', 'error');
            this.addLog(`📊 Total sleep cycles: ${this.sleepCycles}`, 'warning');

            // If bot is connected but service might be sleeping, prepare for reconnection
            if (this.isConnected) {
                this.addLog('🤖 Bot still connected - monitoring for wake event', 'info');
            } else {
                this.addLog('🤖 Bot disconnected - will reconnect on service wake', 'warning');
            }
        }

        // Detect wake-up (external pings resume)
        if (this.sleepDetected && timeSinceLastExternal < 300000) { // 5 minutes
            this.sleepDetected = false;
            this.lastWakeTime = now;
            this.addLog('☀️ SERVICE WAKE DETECTED - External pings resumed', 'success');
            this.addLog(`⏰ Sleep duration: ~${Math.floor(timeSinceLastExternal/60000)} minutes`, 'info');

            // If bot disconnected during sleep, reconnect with extended timeout
            if (!this.isConnected) {
                this.addLog('🔄 Initiating post-sleep reconnection with extended timeout', 'info');
                this.reconnectWithColdStartHandling();
            }
        }
    }

    reconnectWithColdStartHandling() {
        if (this.reconnectionTimeout) {
            clearTimeout(this.reconnectionTimeout);
        }

        this.reconnectionTimeout = setTimeout(() => {
            this.addLog('🚀 Post-sleep reconnection attempt', 'info');
            this.createBot();
        }, SLEEP_CONFIG.wakeupGracePeriod);
    }

    getStatus() {
        const serviceUptime = Date.now() - this.serviceStartTime;
        const timeSinceExternalPing = Date.now() - this.lastExternalPing;
        const timeSinceInternalPing = this.lastInternalPing ? Date.now() - this.lastInternalPing : null;

        return {
            service: 'Sleep-Aware Minecraft AFK Bot',
            version: '3.0',

            // Connection status
            connected: this.isConnected,
            stable: this.connectionStable,
            sessionUptime: this.connectionTime ? Math.floor((Date.now() - this.connectionTime) / 1000) : 0,

            // Bot details
            username: BOT_CONFIG.username,
            server: `${BOT_CONFIG.host}:${BOT_CONFIG.port}`,
            moving: this.isMoving,
            pattern: this.currentPattern,

            // Sleep prevention metrics
            serviceUptime: Math.floor(serviceUptime / 1000),
            externalPingCount: this.externalPingCount,
            internalPingCount: this.internalPingCount,
            lastExternalPing: timeSinceExternalPing < 300000 ? `${Math.floor(timeSinceExternalPing/1000)}s ago` : 'Over 5 minutes ago',
            lastInternalPing: timeSinceInternalPing ? `${Math.floor(timeSinceInternalPing/1000)}s ago` : 'Never',
            sleepCycles: this.sleepCycles,
            sleepDetected: this.sleepDetected,

            // Sleep status
            sleepRisk: timeSinceExternalPing > 600000 ? 'HIGH' : timeSinceExternalPing > 300000 ? 'MEDIUM' : 'LOW',
            preventionStatus: timeSinceExternalPing < 600000 ? 'External pings active' : 'Relying on internal pings',

            // Game stats
            health: this.bot?.health || 0,
            food: this.bot?.food || 0,
            position: this.bot?.entity?.position ? {
                x: Math.round(this.bot.entity.position.x),
                y: Math.round(this.bot.entity.position.y),
                z: Math.round(this.bot.entity.position.z)
            } : null,

            // Statistics
            totalReconnects: this.totalReconnects,
            lastActivity: new Date(this.lastActivity).toISOString(),

            // Logs
            recentLogs: this.logs.slice(-20).map(log => ({
                message: log.message.replace(/\[.*?\] /, ''),
                type: log.type,
                age: Math.floor((Date.now() - log.timestamp) / 1000)
            }))
        };
    }

    createBot() {
        this.addLog(`🚀 Creating bot connection to ${BOT_CONFIG.host}:${BOT_CONFIG.port}`, 'info');

        // Clear any existing timeouts
        if (this.reconnectionTimeout) {
            clearTimeout(this.reconnectionTimeout);
            this.reconnectionTimeout = null;
        }

        try {
            this.bot = mineflayer.createBot(BOT_CONFIG);
            this.setupEventHandlers();
            this.setupPathfinder();
        } catch (error) {
            this.addLog(`❌ Bot creation failed: ${error.message}`, 'error');

            // Retry with cold start handling if recently woke from sleep
            const timeSinceWake = Date.now() - this.lastWakeTime;
            const delay = timeSinceWake < SLEEP_CONFIG.wakeupGracePeriod ? SLEEP_CONFIG.coldStartTimeout : 15000;

            setTimeout(() => this.createBot(), delay);
        }
    }

    setupEventHandlers() {
        this.bot.on('login', () => {
            this.addLog(`✅ Bot logged in successfully as ${this.bot.username}`, 'success');
            this.isConnected = true;
            this.connectionTime = Date.now();
            this.lastActivity = Date.now();
            this.totalReconnects++;

            // Mark connection as stable after delay
            setTimeout(() => {
                this.connectionStable = true;
                this.addLog('🛡️ Connection marked as stable', 'success');
            }, 10000);

            this.startAFKBehavior();
        });

        this.bot.on('spawn', () => {
            this.addLog('🎯 Bot spawned in game world', 'success');
            this.lastActivity = Date.now();
            setTimeout(() => this.startMovement(), 8000);
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
            setTimeout(() => this.createBot(), 60000); // 1 minute delay
        });

        this.bot.on('error', (err) => {
            this.addLog(`❌ Bot error: ${err.message}`, 'error');
            this.isConnected = false;
            this.connectionStable = false;

            // Handle version mismatch
            if (err.message && err.message.includes('This server is version')) {
                const versionMatch = err.message.match(/This server is version ([\d\.]+)/);
                if (versionMatch) {
                    BOT_CONFIG.version = versionMatch[1];
                    this.addLog(`🔄 Updated to server version: ${versionMatch[1]}`, 'info');
                }
            }

            setTimeout(() => this.createBot(), 20000);
        });

        this.bot.on('end', (reason) => {
            this.addLog(`🔌 Bot disconnected: ${reason || 'Unknown'}`, 'warning');
            this.isConnected = false;
            this.connectionStable = false;

            // Check if this might be due to service sleep
            const timeSinceExternalPing = Date.now() - this.lastExternalPing;
            if (timeSinceExternalPing > SLEEP_CONFIG.externalPingTimeout) {
                this.addLog('💤 Disconnection may be due to service sleep - monitoring for wake', 'warning');
                // Don't immediately reconnect, wait for wake detection
            } else {
                // Normal disconnection, reconnect normally
                setTimeout(() => this.createBot(), 15000);
            }
        });

        this.bot.on('chat', (username, message) => {
            if (username === this.bot.username) return;
            this.addLog(`💬 ${username}: ${message}`, 'chat');
            this.lastActivity = Date.now();
        });

        // Track all activity to reset last activity timer
        this.bot.on('physicsTick', () => {
            this.lastActivity = Date.now();
        });
    }

    setupPathfinder() {
        try {
            this.bot.loadPlugin(pathfinder);
        } catch (error) {
            this.addLog(`⚠️ Pathfinder failed: ${error.message}`, 'warning');
        }
    }

    startAFKBehavior() {
        this.addLog('🤖 Starting sleep-aware AFK behavior', 'info');

        setTimeout(() => {
            if (this.bot && this.bot.chat && this.isConnected) {
                this.bot.chat('Sleep-Aware AFK Bot online!');
            }
        }, 15000);
    }

    startMovement() {
        if (this.isMoving || !this.bot || !this.isConnected) return;

        this.addLog(`🚶 Starting movement: ${this.currentPattern}`, 'info');
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

        this.movementInterval = setInterval(moveLoop, 22000); // Every 22 seconds
        setTimeout(moveLoop, 2000);
    }

    performRandomMovement() {
        if (!this.bot?.setControlState) return;

        const directions = ['forward', 'back', 'left', 'right'];
        const direction = directions[Math.floor(Math.random() * directions.length)];
        const duration = 800 + Math.random() * 700;

        this.bot.setControlState(direction, true);

        setTimeout(() => {
            if (this.bot && this.isConnected) {
                this.bot.clearControlStates();
                if (Math.random() < 0.3) {
                    setTimeout(() => {
                        if (this.bot?.setControlState && this.isConnected) {
                            this.bot.setControlState('jump', true);
                            setTimeout(() => {
                                if (this.bot?.setControlState && this.isConnected) {
                                    this.bot.setControlState('jump', false);
                                }
                            }, 400);
                        }
                    }, 300);
                }
            }
        }, duration);
    }

    performPatternMovement(pattern) {
        const movements = Object.entries(pattern);
        let currentMove = 0;

        const executeMove = () => {
            if (currentMove >= movements.length || !this.isMoving || !this.bot || !this.isConnected) return;

            const [direction, duration] = movements[currentMove];

            if (this.bot.setControlState) {
                this.bot.setControlState(direction, true);

                setTimeout(() => {
                    if (this.bot && this.isConnected) {
                        this.bot.clearControlStates();
                        currentMove++;
                        if (currentMove < movements.length) {
                            setTimeout(executeMove, 600);
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

            if (this.isMoving) {
                clearInterval(this.movementInterval);
                this.isMoving = false;
                setTimeout(() => this.startMovement(), 2000);
            }
            return true;
        }
        return false;
    }

    cleanup() {
        if (this.internalKeepAliveTimer) clearInterval(this.internalKeepAliveTimer);
        if (this.sleepMonitorTimer) clearInterval(this.sleepMonitorTimer);
        if (this.movementInterval) clearInterval(this.movementInterval);
        if (this.reconnectionTimeout) clearTimeout(this.reconnectionTimeout);

        if (this.bot) {
            try {
                this.bot.end();
            } catch (error) {
                this.addLog(`Cleanup error: ${error.message}`, 'warning');
            }
        }
    }
}

// Create sleep-aware bot
const sleepAwareBot = new SleepAwareAFKBot();

// Enhanced HTTP server with external ping tracking
const server = http.createServer((req, res) => {
    const url = req.url;
    const userAgent = req.headers['user-agent'] || '';

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    if (url === '/keep-alive') {
        const isExternal = userAgent.includes('UptimeRobot') || 
                          userAgent.includes('Pingdom') || 
                          userAgent.includes('Freshping') ||
                          userAgent.includes('StatusCake') ||
                          userAgent.includes('cron-job.org') ||
                          !userAgent.includes('Node');

        if (isExternal) {
            sleepAwareBot.externalPingCount++;
            sleepAwareBot.lastExternalPing = Date.now();

            // Reset sleep detection on external ping
            if (sleepAwareBot.sleepDetected) {
                sleepAwareBot.sleepDetected = false;
                sleepAwareBot.lastWakeTime = Date.now();
                sleepAwareBot.addLog('☀️ External ping received - service awake', 'success');
            }

            console.log(`🔄 External keep-alive #${sleepAwareBot.externalPingCount} from ${userAgent.split(' ')[0]}`);
        }

        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
        return;
    }

    if (url === '/') {
        const status = sleepAwareBot.getStatus();
        const html = `
<!DOCTYPE html>
<html>
<head>
    <title>🛡️ Sleep-Aware AFK Bot</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { 
            font-family: system-ui, -apple-system, sans-serif; 
            margin: 0; padding: 15px; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
            min-height: 100vh; color: #333;
        }
        .container { 
            max-width: 1200px; margin: 0 auto; 
            background: rgba(255,255,255,0.95); 
            padding: 25px; border-radius: 15px; 
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        }
        .header { text-align: center; margin-bottom: 25px; }
        .header h1 { color: #2c3e50; margin: 0; font-size: 2.2em; }
        .subtitle { color: #7f8c8d; font-size: 1.1em; margin: 10px 0; }

        .status-bar { 
            display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px; margin: 20px 0; 
        }
        .status-card { 
            padding: 15px; border-radius: 10px; text-align: center;
            color: white; font-weight: bold; font-size: 0.9em;
        }
        .connected { background: linear-gradient(45deg, #27ae60, #2ecc71); }
        .disconnected { background: linear-gradient(45deg, #e74c3c, #c0392b); }
        .sleep-safe { background: linear-gradient(45deg, #3498db, #2980b9); }
        .sleep-risk { background: linear-gradient(45deg, #f39c12, #e67e22); }
        .sleep-danger { background: linear-gradient(45deg, #e74c3c, #c0392b); }

        .alert { 
            padding: 15px; border-radius: 8px; margin: 15px 0; 
            text-align: center; font-weight: bold;
        }
        .alert-info { background: #d1ecf1; border: 2px solid #17a2b8; color: #0c5460; }
        .alert-warning { background: #fff3cd; border: 2px solid #ffc107; color: #856404; }
        .alert-danger { background: #f8d7da; border: 2px solid #dc3545; color: #721c24; }

        .metrics { 
            display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); 
            gap: 15px; margin: 20px 0; 
        }
        .metric { 
            background: #f8f9fa; padding: 15px; border-radius: 8px;
            text-align: center; border-left: 4px solid #3498db;
        }
        .metric-value { font-size: 1.4em; font-weight: bold; color: #2c3e50; }
        .metric-label { font-size: 0.8em; color: #7f8c8d; text-transform: uppercase; }

        .logs { 
            background: #1a1a1a; color: #00ff41; padding: 15px; 
            border-radius: 8px; font-family: 'Courier New', monospace; 
            height: 300px; overflow-y: auto; border: 2px solid #333;
            font-size: 0.85em;
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

        .footer { text-align: center; margin-top: 20px; color: #7f8c8d; font-size: 0.85em; }
        .setup-guide { 
            background: linear-gradient(135deg, #e3f2fd, #bbdefb); 
            border: 2px solid #2196f3; padding: 20px; border-radius: 10px; 
            margin: 20px 0;
        }
    </style>
    <meta http-equiv="refresh" content="15">
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🛡️ Sleep-Aware AFK Bot</h1>
            <div class="subtitle">Enhanced Render Sleep Prevention System</div>
        </div>

        <div class="status-bar">
            <div class="status-card ${status.connected ? 'connected' : 'disconnected'}">
                ${status.connected ? '🟢 BOT CONNECTED' : '🔴 BOT DISCONNECTED'}
            </div>
            <div class="status-card sleep-${status.sleepRisk.toLowerCase()}">
                ${status.sleepRisk === 'LOW' ? '🛡️ SLEEP PROTECTED' : 
                  status.sleepRisk === 'MEDIUM' ? '⚠️ SLEEP RISK' : '🚨 SLEEP DANGER'}
            </div>
        </div>

        ${status.sleepRisk === 'HIGH' ? `
        <div class="alert alert-danger">
            🚨 HIGH SLEEP RISK: No external pings detected! Set up UptimeRobot monitoring immediately.
            <br><small>Service will sleep without external pings every 5 minutes</small>
        </div>
        ` : status.sleepRisk === 'MEDIUM' ? `
        <div class="alert alert-warning">
            ⚠️ External ping monitoring may not be working optimally. Check your UptimeRobot setup.
        </div>
        ` : ''}

        ${status.externalPingCount === 0 ? `
        <div class="setup-guide">
            <h3 style="margin-top: 0; color: #1976d2;">📋 Setup External Monitoring (Required)</h3>
            <p><strong>Your service WILL sleep without external pings!</strong></p>
            <ol style="text-align: left; max-width: 600px; margin: 0 auto;">
                <li>Go to <a href="https://uptimerobot.com" target="_blank">uptimerobot.com</a></li>
                <li>Create free account</li>
                <li>Add HTTP(s) monitor</li>
                <li>URL: <code>https://your-app.onrender.com/keep-alive</code></li>
                <li>Interval: 5 minutes</li>
                <li>Save monitor</li>
            </ol>
        </div>
        ` : `
        <div class="alert alert-info">
            ✅ External monitoring active! ${status.externalPingCount} pings received. Last: ${status.lastExternalPing}
        </div>
        `}

        ${status.sleepCycles > 0 ? `
        <div class="alert alert-warning">
            💤 ${status.sleepCycles} sleep cycles detected. Service has been sleeping and waking.
        </div>
        ` : ''}

        <div class="metrics">
            <div class="metric">
                <div class="metric-value">${status.username}</div>
                <div class="metric-label">Bot Name</div>
            </div>
            <div class="metric">
                <div class="metric-value">${status.server}</div>
                <div class="metric-label">Server</div>
            </div>
            <div class="metric">
                <div class="metric-value">${Math.floor(status.serviceUptime / 3600)}h ${Math.floor((status.serviceUptime % 3600) / 60)}m</div>
                <div class="metric-label">Service Uptime</div>
            </div>
            <div class="metric">
                <div class="metric-value">${Math.floor(status.sessionUptime / 60)}m</div>
                <div class="metric-label">Bot Session</div>
            </div>
            <div class="metric">
                <div class="metric-value">${status.externalPingCount}</div>
                <div class="metric-label">External Pings</div>
            </div>
            <div class="metric">
                <div class="metric-value">${status.internalPingCount}</div>
                <div class="metric-label">Internal Pings</div>
            </div>
            <div class="metric">
                <div class="metric-value">${status.sleepCycles}</div>
                <div class="metric-label">Sleep Cycles</div>
            </div>
            <div class="metric">
                <div class="metric-value">${status.moving ? status.pattern : 'Stopped'}</div>
                <div class="metric-label">Movement</div>
            </div>
        </div>

        <h3 style="color: #2c3e50; margin: 20px 0 10px 0;">📋 Activity Logs</h3>
        <div class="logs">
${status.recentLogs.map(log => `<div class="log-${log.type}">[${log.age}s ago] ${log.message}</div>`).join('\n')}
        </div>

        <div class="controls">
            <button class="btn" onclick="location.reload()">🔄 Refresh</button>
            <button class="btn" onclick="fetch('/api/pattern/gentle', {method: 'POST'}).then(() => setTimeout(() => location.reload(), 1000))">🕊️ Gentle</button>
            <button class="btn" onclick="fetch('/api/pattern/circle', {method: 'POST'}).then(() => setTimeout(() => location.reload(), 1000))">🔵 Circle</button>
            <button class="btn" onclick="fetch('/api/pattern/random', {method: 'POST'}).then(() => setTimeout(() => location.reload(), 1000))">🎲 Random</button>
        </div>

        <div class="footer">
            <div><strong>Sleep-Aware AFK Bot v3.0</strong></div>
            <div>Prevention Status: ${status.preventionStatus}</div>
            <div>Last External Ping: ${status.lastExternalPing}</div>
            ${status.sleepDetected ? '<div style="color: #e74c3c;"><strong>⚠️ SLEEP MODE DETECTED</strong></div>' : ''}
        </div>
    </div>
</body>
</html>`;

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);

    } else if (url === '/api/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(sleepAwareBot.getStatus()));

    } else if (url.startsWith('/api/pattern/') && req.method === 'POST') {
        const pattern = url.split('/')[3];
        const success = sleepAwareBot.changePattern(pattern);
        res.writeHead(success ? 200 : 400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success, pattern }));

    } else {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 - Not Found</h1><p><a href="/">← Back to Dashboard</a></p>');
    }
});

// Start server
server.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`🌐 Sleep-Aware Dashboard running on port ${HTTP_PORT}`);
    console.log('🔗 Keep-Alive URL: https://your-app.onrender.com/keep-alive');
    console.log('🛡️ Set up UptimeRobot monitoring to prevent sleep!');

    sleepAwareBot.createBot();
});

// Graceful shutdown
const shutdown = () => {
    console.log('\n🛑 Shutting down sleep-aware bot...');
    sleepAwareBot.cleanup();

    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });

    setTimeout(() => {
        console.log('🚨 Force exit');
        process.exit(1);
    }, 15000);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('✅ Sleep-Aware AFK Bot v3.0 initialized');
console.log('📋 SETUP REQUIRED: Configure UptimeRobot monitoring to prevent sleep');

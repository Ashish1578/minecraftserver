const mineflayer = require('mineflayer');
const { pathfinder, Movements } = require('mineflayer-pathfinder');
const http = require('http');

// Bot configuration with stability improvements
const BOT_CONFIG = {
    host: process.env.SERVER_HOST || 'localhost',
    port: parseInt(process.env.SERVER_PORT) || 25565,
    username: process.env.BOT_USERNAME || 'AFKBot',
    password: process.env.BOT_PASSWORD || '',
    version: process.env.MC_VERSION || '1.21.8',
    auth: process.env.AUTH_TYPE || 'offline',
    // Add stability options
    keepAlive: true,
    checkTimeoutInterval: 30000, // 30 seconds
    hideErrors: false
};

// HTTP server configuration
const HTTP_PORT = process.env.PORT || 10000;

// Stability settings
const STABILITY_CONFIG = {
    minReconnectDelay: 30000, // 30 seconds minimum between reconnects
    maxReconnectDelay: 600000, // 10 minutes maximum
    maxContinuousReconnects: 5, // Max reconnects before long pause
    longPauseDelay: 1200000, // 20 minutes pause after continuous failures
    movementInterval: 20000, // 20 seconds between movements (slower)
    chatCooldown: 60000, // 1 minute between chat messages
    healthCheckInterval: 180000, // 3 minutes between health checks
    connectionStabilityCheck: 10000 // 10 seconds to consider connection stable
};

console.log('🔍 Bot Configuration:');
console.log('SERVER_HOST:', process.env.SERVER_HOST || '❌ NOT SET');
console.log('SERVER_PORT:', process.env.SERVER_PORT || '❌ NOT SET');
console.log('BOT_USERNAME:', process.env.BOT_USERNAME || '❌ NOT SET');
console.log('MC_VERSION:', process.env.MC_VERSION || '❌ NOT SET (using 1.21.8)');
console.log('AUTH_TYPE:', process.env.AUTH_TYPE || '❌ NOT SET (using offline)');

// Movement patterns (less frequent, gentler)
const MOVEMENT_PATTERNS = {
    circle: { forward: 800, right: 800, back: 800, left: 800 },
    square: { forward: 1500, right: 400, back: 1500, left: 400 },
    random: { min: 800, max: 2000 },
    gentle: { forward: 500, right: 500, back: 500, left: 500 }
};

class StableAFKBot {
    constructor() {
        this.bot = null;
        this.isMoving = false;
        this.currentPattern = 'gentle'; // Start with gentle pattern
        this.movementInterval = null;
        this.respawnAttempts = 0;
        this.maxRespawnAttempts = 3; // Reduced from 5
        this.reconnectAttempts = 0;
        this.continuousReconnects = 0;
        this.maxReconnectAttempts = 15;
        this.isConnected = false;
        this.connectionStable = false;
        this.lastActivity = Date.now();
        this.connectionTime = null;
        this.totalReconnects = 0;
        this.logs = [];
        this.serverVersion = null;
        this.lastChatTime = 0;
        this.disconnectionReason = '';
        this.stabilityTimer = null;
        this.healthCheckTimer = null;
        this.kickCount = 0;
        this.errorCount = 0;
    }

    addLog(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] ${message}`;
        this.logs.push({ message: logEntry, type, timestamp });

        // Keep only last 150 logs
        if (this.logs.length > 150) {
            this.logs = this.logs.slice(-150);
        }

        console.log(logEntry);
    }

    getStatus() {
        return {
            service: 'Stable Minecraft AFK Bot',
            connected: this.isConnected,
            stable: this.connectionStable,
            username: BOT_CONFIG.username,
            server: `${BOT_CONFIG.host}:${BOT_CONFIG.port}`,
            serverVersion: this.serverVersion,
            botVersion: BOT_CONFIG.version,
            moving: this.isMoving,
            pattern: this.currentPattern,
            connectionTime: this.connectionTime,
            lastActivity: new Date(this.lastActivity).toISOString(),
            totalReconnects: this.totalReconnects,
            continuousReconnects: this.continuousReconnects,
            kickCount: this.kickCount,
            errorCount: this.errorCount,
            disconnectionReason: this.disconnectionReason,
            health: this.bot?.health || 0,
            food: this.bot?.food || 0,
            position: this.bot?.entity?.position ? {
                x: Math.round(this.bot.entity.position.x),
                y: Math.round(this.bot.entity.position.y),
                z: Math.round(this.bot.entity.position.z)
            } : null,
            uptime: this.connectionTime ? Math.floor((Date.now() - this.connectionTime) / 1000) : 0,
            recentLogs: this.logs.slice(-20).map(log => ({ message: log.message.replace(/\[.*?\] /, ''), type: log.type }))
        };
    }

    createBot() {
        this.addLog(`🚀 Creating stable bot connection to ${BOT_CONFIG.host}:${BOT_CONFIG.port}`, 'info');
        this.addLog(`🎮 Using Minecraft version: ${BOT_CONFIG.version}`, 'info');
        this.addLog(`🛡️ Stability mode: Enhanced connection handling`, 'info');

        try {
            this.bot = mineflayer.createBot(BOT_CONFIG);
            this.setupEventHandlers();
            this.setupPathfinder();
            this.setupStabilityTimers();
        } catch (error) {
            this.addLog(`❌ Failed to create bot: ${error.message}`, 'error');
            this.handleConnectionError();
        }
    }

    setupEventHandlers() {
        this.bot.on('login', () => {
            this.addLog(`✅ Bot logged in successfully as ${this.bot.username}`, 'success');
            this.addLog(`🌐 Connected to server: ${BOT_CONFIG.host}:${BOT_CONFIG.port}`, 'success');
            this.addLog(`🎮 Server version: ${this.bot.version || 'Unknown'}`, 'info');

            this.serverVersion = this.bot.version;
            this.isConnected = true;
            this.connectionTime = Date.now();
            this.reconnectAttempts = 0;
            this.lastActivity = Date.now();
            this.disconnectionReason = '';
            this.errorCount = 0;

            // Start stability check timer
            this.stabilityTimer = setTimeout(() => {
                this.connectionStable = true;
                this.continuousReconnects = 0; // Reset after stable connection
                this.addLog('🛡️ Connection marked as stable', 'success');
            }, STABILITY_CONFIG.connectionStabilityCheck);

            this.startStableAFKBehavior();
        });

        this.bot.on('spawn', () => {
            this.addLog('🎯 Bot spawned successfully in game world', 'success');
            this.respawnAttempts = 0;
            this.lastActivity = Date.now();

            // Wait longer before starting movement for stability
            if (!this.isMoving) {
                setTimeout(() => {
                    if (this.isConnected) {
                        this.startStableMovement();
                    }
                }, 8000); // 8 seconds delay
            }
        });

        this.bot.on('death', () => {
            this.addLog('💀 Bot died in game, attempting respawn...', 'warning');
            this.stopMovement();
            this.lastActivity = Date.now();
            setTimeout(() => this.attemptRespawn(), 5000); // Longer delay
        });

        this.bot.on('respawn', () => {
            this.addLog('🔄 Bot respawned successfully', 'success');
            this.lastActivity = Date.now();
            setTimeout(() => {
                if (this.isConnected) {
                    this.startStableMovement();
                }
            }, 5000);
        });

        this.bot.on('kicked', (reason) => {
            this.kickCount++;
            this.addLog(`⚠️ Bot was KICKED from server: ${reason}`, 'error');
            this.addLog(`🚫 Total kicks: ${this.kickCount}`, 'warning');
            this.disconnectionReason = `Kicked: ${reason}`;
            this.isConnected = false;
            this.connectionStable = false;

            // Longer delay after being kicked
            const kickDelay = Math.min(60000 + (this.kickCount * 30000), 300000); // 1-5 minutes based on kick count
            this.addLog(`⏳ Waiting ${kickDelay/1000} seconds before reconnect due to kick`, 'info');

            setTimeout(() => this.handleReconnection(), kickDelay);
        });

        this.bot.on('error', (err) => {
            this.errorCount++;
            this.addLog(`❌ Bot error [${this.errorCount}]: ${err.message} (${err.code || 'No code'})`, 'error');
            this.isConnected = false;
            this.connectionStable = false;
            this.disconnectionReason = `Error: ${err.message}`;

            // Handle specific errors
            if (err.code === 'ECONNREFUSED') {
                this.addLog('🔧 Connection refused - server may be offline or blocking connections', 'warning');
            } else if (err.code === 'ETIMEDOUT') {
                this.addLog('🔧 Connection timeout - network issues or server overloaded', 'warning');
            } else if (err.code === 'ENOTFOUND') {
                this.addLog('🔧 Server hostname not found - check SERVER_HOST', 'warning');
            } else if (err.message && err.message.includes('This server is version')) {
                const versionMatch = err.message.match(/This server is version ([\d\.]+)/);
                if (versionMatch) {
                    const serverVersion = versionMatch[1];
                    this.addLog(`🔧 Server version mismatch detected: ${serverVersion}`, 'warning');
                    BOT_CONFIG.version = serverVersion;
                    this.addLog(`🔄 Updated bot version to match server: ${serverVersion}`, 'info');
                }
            } else if (err.message && err.message.includes('Invalid username')) {
                this.addLog('🔧 Invalid username - try changing BOT_USERNAME', 'warning');
            }

            this.handleConnectionError();
        });

        this.bot.on('end', (reason) => {
            this.addLog(`🔌 Bot disconnected from server. Reason: ${reason || 'Unknown'}`, 'warning');
            this.isConnected = false;
            this.connectionStable = false;
            this.disconnectionReason = reason || 'Connection ended';
            this.stopMovement();
            this.clearTimers();

            // Longer delay for stability
            setTimeout(() => this.handleReconnection(), STABILITY_CONFIG.minReconnectDelay);
        });

        this.bot.on('chat', (username, message) => {
            if (username === this.bot.username) return;

            this.addLog(`💬 ${username}: ${message}`, 'chat');
            this.lastActivity = Date.now();

            // Very conservative chat responses to avoid spam detection
            if (message.toLowerCase().includes(this.bot.username.toLowerCase()) && 
                Date.now() - this.lastChatTime > STABILITY_CONFIG.chatCooldown) {

                setTimeout(() => {
                    if (this.bot && this.bot.chat && this.isConnected && this.connectionStable) {
                        this.bot.chat('AFK bot is active');
                        this.lastChatTime = Date.now();
                        this.addLog('📢 Responded to mention', 'info');
                    }
                }, 3000); // 3 second delay before responding
            }
        });

        // Handle keepalive
        this.bot.on('keep_alive', () => {
            this.lastActivity = Date.now();
        });
    }

    setupStabilityTimers() {
        // Health check timer
        this.healthCheckTimer = setInterval(() => {
            if (this.isConnected && this.connectionStable) {
                this.performHealthCheck();
            }
        }, STABILITY_CONFIG.healthCheckInterval);
    }

    performHealthCheck() {
        if (!this.bot || !this.isConnected) return;

        const timeSinceLastActivity = Date.now() - this.lastActivity;

        if (timeSinceLastActivity > 900000) { // 15 minutes of no activity
            this.addLog('⚠️ No activity for 15 minutes - potential connection issue', 'warning');

            // Try a gentle ping by looking around
            try {
                if (this.bot.entity) {
                    const yaw = Math.random() * Math.PI * 2;
                    this.bot.look(yaw, 0);
                    this.addLog('🔄 Performed health check (look around)', 'info');
                    this.lastActivity = Date.now();
                }
            } catch (error) {
                this.addLog(`❌ Health check failed: ${error.message}`, 'error');
                this.handleReconnection();
            }
        }
    }

    clearTimers() {
        if (this.stabilityTimer) {
            clearTimeout(this.stabilityTimer);
            this.stabilityTimer = null;
        }
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }
    }

    handleConnectionError() {
        this.clearTimers();
        this.continuousReconnects++;
        this.totalReconnects++;

        // If too many continuous reconnects, take a long pause
        if (this.continuousReconnects >= STABILITY_CONFIG.maxContinuousReconnects) {
            this.addLog(`🛑 Too many continuous reconnects (${this.continuousReconnects}), taking extended pause`, 'error');
            this.addLog(`💤 Pausing for ${STABILITY_CONFIG.longPauseDelay/60000} minutes to avoid server stress`, 'info');

            setTimeout(() => {
                this.continuousReconnects = 0;
                this.reconnectAttempts = 0;
                this.addLog('⏰ Extended pause complete, resuming connection attempts', 'info');
                this.handleReconnection();
            }, STABILITY_CONFIG.longPauseDelay);
            return;
        }

        this.handleReconnection();
    }

    handleReconnection() {
        this.reconnectAttempts++;

        if (this.reconnectAttempts > this.maxReconnectAttempts) {
            this.addLog(`❌ Max reconnection attempts (${this.maxReconnectAttempts}) reached`, 'error');
            this.addLog('💤 Entering extended maintenance mode (30 minutes)', 'warning');

            setTimeout(() => {
                this.reconnectAttempts = 0;
                this.continuousReconnects = 0;
                this.addLog('⏰ Maintenance mode complete, resuming operations', 'info');
                this.reconnect();
            }, 1800000); // 30 minutes
        } else {
            // Progressive delay: starts at 30s, increases with failures
            const baseDelay = STABILITY_CONFIG.minReconnectDelay;
            const additionalDelay = (this.reconnectAttempts - 1) * 15000; // +15s per attempt
            const totalDelay = Math.min(baseDelay + additionalDelay, STABILITY_CONFIG.maxReconnectDelay);

            this.addLog(`🔄 Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${totalDelay/1000}s`, 'info');

            setTimeout(() => {
                this.reconnect();
            }, totalDelay);
        }
    }

    setupPathfinder() {
        try {
            this.bot.loadPlugin(pathfinder);
        } catch (error) {
            this.addLog(`⚠️ Pathfinder plugin failed to load: ${error.message}`, 'warning');
        }
    }

    startStableAFKBehavior() {
        this.addLog('🤖 Starting stable AFK behavior with enhanced anti-detection', 'info');

        // Very conservative initial message
        setTimeout(() => {
            if (this.bot && this.bot.chat && this.isConnected && this.connectionStable) {
                this.bot.chat('AFK Bot online');
                this.lastChatTime = Date.now();
            }
        }, 15000); // 15 second delay

        // Start movement after ensuring connection is stable
        setTimeout(() => {
            if (this.isConnected && this.connectionStable) {
                this.startStableMovement();
            }
        }, 20000); // 20 second delay
    }

    startStableMovement() {
        if (this.isMoving || !this.bot || !this.bot.entity || !this.isConnected) {
            this.addLog('⚠️ Movement start skipped - conditions not met', 'warning');
            return;
        }

        this.addLog(`🚶 Starting stable movement pattern: ${this.currentPattern}`, 'info');
        this.isMoving = true;

        const stableMove = () => {
            if (!this.bot || !this.bot.entity || !this.isMoving || !this.isConnected || !this.connectionStable) {
                return;
            }

            try {
                this.lastActivity = Date.now();
                const pattern = MOVEMENT_PATTERNS[this.currentPattern];

                if (this.currentPattern === 'random') {
                    this.gentleRandomMovement();
                } else {
                    this.gentlePatternMovement(pattern);
                }
            } catch (error) {
                this.addLog(`Movement error: ${error.message}`, 'error');
                this.stopMovement();
                setTimeout(() => {
                    if (this.isConnected && this.connectionStable) {
                        this.startStableMovement();
                    }
                }, 10000);
            }
        };

        // Initial movement
        setTimeout(stableMove, 2000);

        // Set up gentle movement interval
        this.movementInterval = setInterval(stableMove, STABILITY_CONFIG.movementInterval);
    }

    gentleRandomMovement() {
        if (!this.bot || !this.bot.setControlState) return;

        const directions = ['forward', 'back', 'left', 'right'];
        const direction = directions[Math.floor(Math.random() * directions.length)];
        const duration = Math.random() * (MOVEMENT_PATTERNS.random.max - MOVEMENT_PATTERNS.random.min) + MOVEMENT_PATTERNS.random.min;

        this.bot.setControlState(direction, true);

        setTimeout(() => {
            if (this.bot && this.isConnected) {
                this.bot.clearControlStates();

                // Very occasional jump (reduced frequency)
                if (Math.random() < 0.2) {
                    setTimeout(() => {
                        if (this.bot && this.isConnected) {
                            this.bot.setControlState('jump', true);
                            setTimeout(() => {
                                if (this.bot && this.isConnected) {
                                    this.bot.setControlState('jump', false);
                                }
                            }, 400);
                        }
                    }, 500);
                }
            }
        }, duration);
    }

    gentlePatternMovement(pattern) {
        const movements = Object.entries(pattern);
        let currentMove = 0;

        const executeGentleMove = () => {
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
                            // Longer pause between moves for stability
                            setTimeout(executeGentleMove, 800);
                        }
                    }
                }, duration);
            }
        };

        executeGentleMove();
    }

    stopMovement() {
        this.addLog('⏹️ Stopping movement for stability', 'info');
        this.isMoving = false;
        if (this.movementInterval) {
            clearInterval(this.movementInterval);
            this.movementInterval = null;
        }
        if (this.bot && this.bot.clearControlStates) {
            try {
                this.bot.clearControlStates();
            } catch (error) {
                this.addLog(`Warning during movement stop: ${error.message}`, 'warning');
            }
        }
    }

    attemptRespawn() {
        if (!this.bot) return;

        this.respawnAttempts++;
        this.addLog(`⚰️ Respawn attempt ${this.respawnAttempts}/${this.maxRespawnAttempts}`, 'info');

        if (this.respawnAttempts > this.maxRespawnAttempts) {
            this.addLog('❌ Max respawn attempts reached, reconnecting for fresh start', 'warning');
            this.reconnect();
            return;
        }

        try {
            this.bot.respawn();
        } catch (error) {
            this.addLog(`Respawn error: ${error.message}`, 'error');
            setTimeout(() => this.attemptRespawn(), 8000);
        }
    }

    reconnect() {
        this.addLog('🔄 Initiating stable reconnection sequence...', 'info');
        this.stopMovement();
        this.clearTimers();
        this.isConnected = false;
        this.connectionStable = false;
        this.connectionTime = null;
        this.serverVersion = null;

        if (this.bot) {
            try {
                this.bot.end();
            } catch (error) {
                this.addLog(`Warning during bot cleanup: ${error.message}`, 'warning');
            }
            this.bot = null;
        }

        // Wait before creating new bot
        setTimeout(() => {
            this.createBot();
        }, 8000);
    }

    changePattern(newPattern) {
        if (MOVEMENT_PATTERNS[newPattern]) {
            this.addLog(`🔄 Changed movement pattern to: ${newPattern}`, 'info');
            this.currentPattern = newPattern;
            if (this.isMoving) {
                this.stopMovement();
                setTimeout(() => {
                    if (this.isConnected && this.connectionStable) {
                        this.startStableMovement();
                    }
                }, 3000);
            }
            return true;
        }
        return false;
    }
}

// Create the stable bot instance
const stableBot = new StableAFKBot();

// Create HTTP server with enhanced stability dashboard
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

    if (url === '/') {
        const status = stableBot.getStatus();
        const html = `
<!DOCTYPE html>
<html>
<head>
    <title>🛡️ Stable Minecraft AFK Bot</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            margin: 0; padding: 20px; background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%); 
            min-height: 100vh; color: #333;
        }
        .container { 
            max-width: 1200px; margin: 0 auto; background: rgba(255,255,255,0.95); 
            padding: 30px; border-radius: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        }
        .header { text-align: center; margin-bottom: 30px; }
        .header h1 { color: #2c3e50; margin: 0; font-size: 2.5em; }
        .status-bar { display: flex; justify-content: center; gap: 20px; margin: 20px 0; flex-wrap: wrap; }
        .status { 
            padding: 12px 24px; border-radius: 25px; color: white; font-weight: bold;
            text-transform: uppercase; letter-spacing: 1px; font-size: 0.9em;
        }
        .connected { background: linear-gradient(45deg, #27ae60, #2ecc71); }
        .disconnected { background: linear-gradient(45deg, #e74c3c, #c0392b); }
        .stable { background: linear-gradient(45deg, #3498db, #2980b9); }
        .unstable { background: linear-gradient(45deg, #f39c12, #e67e22); }

        .stats-grid { 
            display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
            gap: 20px; margin: 30px 0; 
        }
        .stat-card { 
            background: linear-gradient(135deg, #f8f9fa, #e9ecef); 
            padding: 20px; border-radius: 12px; text-align: center;
            border-left: 5px solid #3498db;
        }
        .stat-value { font-size: 2em; font-weight: bold; color: #2c3e50; margin: 10px 0; }
        .stat-label { color: #7f8c8d; font-size: 0.9em; text-transform: uppercase; }

        .logs { 
            background: #1a1a1a; color: #00ff41; padding: 20px; 
            border-radius: 10px; font-family: 'Courier New', monospace; 
            height: 400px; overflow-y: auto; margin: 25px 0;
            border: 2px solid #333;
        }
        .log-success { color: #00ff41; }
        .log-error { color: #ff6b6b; }
        .log-warning { color: #feca57; }
        .log-info { color: #74b9ff; }
        .log-chat { color: #a29bfe; }

        .controls { 
            display: flex; flex-wrap: wrap; gap: 15px; justify-content: center; 
            margin: 30px 0; 
        }
        .controls button { 
            background: linear-gradient(45deg, #3498db, #2980b9); 
            color: white; border: none; padding: 12px 24px; 
            border-radius: 8px; cursor: pointer; font-weight: bold;
            transition: all 0.3s; font-size: 1em;
        }
        .controls button:hover { 
            transform: translateY(-2px); 
            box-shadow: 0 5px 15px rgba(52,152,219,0.4);
        }

        .stability-info {
            background: linear-gradient(135deg, #dff9fb, #c7ecee);
            border: 2px solid #00d2d3; padding: 20px; border-radius: 10px;
            margin: 20px 0; text-align: center;
        }

        .alert { 
            padding: 15px; border-radius: 8px; margin: 15px 0; text-align: center;
            font-weight: bold;
        }
        .alert-warning { background: #fff3cd; border: 2px solid #ffc107; color: #856404; }
        .alert-error { background: #f8d7da; border: 2px solid #dc3545; color: #721c24; }

        .refresh { text-align: center; margin: 25px 0; color: #7f8c8d; }
    </style>
    <meta http-equiv="refresh" content="20">
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🛡️ Stable Minecraft AFK Bot</h1>
        </div>

        <div class="status-bar">
            <span class="status ${status.connected ? 'connected' : 'disconnected'}">
                ${status.connected ? '🟢 CONNECTED' : '🔴 DISCONNECTED'}
            </span>
            <span class="status ${status.stable ? 'stable' : 'unstable'}">
                ${status.stable ? '🛡️ STABLE' : '⚠️ STABILIZING'}
            </span>
        </div>

        ${status.kickCount > 3 || status.continuousReconnects > 2 ? `
        <div class="alert alert-warning">
            ⚠️ Connection Issues Detected - Kicks: ${status.kickCount} | Continuous Reconnects: ${status.continuousReconnects}
            <br><small>Bot is using extended delays and gentle behavior to improve stability</small>
        </div>
        ` : ''}

        ${status.disconnectionReason ? `
        <div class="alert alert-error">
            🔍 Last Disconnection: ${status.disconnectionReason}
        </div>
        ` : ''}

        <div class="stability-info">
            <h3>🛡️ Enhanced Stability Features Active</h3>
            <p>Extended reconnection delays • Gentle movement patterns • Anti-spam protection • Connection health monitoring</p>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-label">Server</div>
                <div class="stat-value" style="font-size: 1.2em;">${status.server}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Username</div>
                <div class="stat-value" style="font-size: 1.2em;">${status.username}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Movement</div>
                <div class="stat-value" style="font-size: 1.2em;">${status.moving ? status.pattern : 'Stopped'}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Session Time</div>
                <div class="stat-value">${Math.floor(status.uptime / 3600)}h ${Math.floor((status.uptime % 3600) / 60)}m</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Health</div>
                <div class="stat-value ${status.health < 10 ? 'color: #e74c3c;' : ''}">${status.health}/20</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Food</div>
                <div class="stat-value ${status.food < 10 ? 'color: #e67e22;' : ''}">${status.food}/20</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Total Reconnects</div>
                <div class="stat-value ${status.totalReconnects > 10 ? 'color: #e74c3c;' : ''}">${status.totalReconnects}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Kicks</div>
                <div class="stat-value ${status.kickCount > 0 ? 'color: #e74c3c;' : ''}">${status.kickCount}</div>
            </div>
        </div>

        <h3 style="color: #2c3e50;">📋 Stability Logs</h3>
        <div class="logs">
${status.recentLogs.map(log => `<div class="log-${log.type}">${log.message}</div>`).join('\n')}
        </div>

        <div class="controls">
            <button onclick="location.reload()">🔄 Refresh</button>
            <button onclick="fetch('/api/pattern/gentle', {method: 'POST'}).then(() => setTimeout(() => location.reload(), 1000))">🕊️ Gentle Pattern</button>
            <button onclick="fetch('/api/pattern/circle', {method: 'POST'}).then(() => setTimeout(() => location.reload(), 1000))">🔵 Circle Pattern</button>
            <button onclick="fetch('/api/pattern/square', {method: 'POST'}).then(() => setTimeout(() => location.reload(), 1000))">🔲 Square Pattern</button>
        </div>

        <div class="refresh">
            <small>🔄 Auto-refresh every 20 seconds | Last updated: ${new Date().toLocaleTimeString()}</small><br>
            <small>🛡️ Stability Mode: ${status.stable ? 'Active' : 'Stabilizing Connection...'}</small>
        </div>
    </div>
</body>
</html>`;

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);

    } else if (url === '/api/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(stableBot.getStatus()));

    } else if (url.startsWith('/api/pattern/') && req.method === 'POST') {
        const pattern = url.split('/')[3];
        const success = stableBot.changePattern(pattern);
        res.writeHead(success ? 200 : 400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success, pattern }));

    } else {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 - Not Found</h1><p><a href="/">← Back to Dashboard</a></p>');
    }
});

// Start HTTP server
server.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`🌐 Stable Dashboard running on port ${HTTP_PORT}`);
    console.log('🛡️ Enhanced stability features enabled');
    console.log('🤖 Starting stable Minecraft AFK bot...');

    // Start the stable bot
    stableBot.createBot();
});

// Graceful shutdown
const shutdown = () => {
    console.log('\n🛑 Graceful shutdown initiated...');
    stableBot.stopMovement();
    stableBot.clearTimers();

    if (stableBot.bot) {
        try {
            stableBot.bot.end();
        } catch (error) {
            console.log('Error during shutdown:', error.message);
        }
    }

    server.close(() => {
        console.log('✅ Server closed gracefully');
        process.exit(0);
    });

    setTimeout(() => {
        console.log('🚨 Force exit after timeout');
        process.exit(1);
    }, 15000);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Enhanced connection monitoring with stability focus
setInterval(() => {
    if (stableBot.isConnected && stableBot.bot && !stableBot.bot.ended) {
        // Connection is good, do nothing
        return;
    } else if (!stableBot.isConnected && (!stableBot.bot || stableBot.bot.ended)) {
        // Bot should be reconnecting, check if it's stuck
        const timeSinceLastLog = Date.now() - (stableBot.logs[stableBot.logs.length - 1]?.timestamp || 0);
        if (timeSinceLastLog > 300000) { // 5 minutes of no logs
            stableBot.addLog('⚠️ Bot appears stuck, initiating recovery', 'warning');
            stableBot.reconnect();
        }
    }
}, 120000); // Check every 2 minutes

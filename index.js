const mineflayer = require('mineflayer');
const { pathfinder, Movements } = require('mineflayer-pathfinder');
const http = require('http');

// Bot configuration
const BOT_CONFIG = {
    host: process.env.SERVER_HOST || 'localhost',
    port: parseInt(process.env.SERVER_PORT) || 25565,
    username: process.env.BOT_USERNAME || 'AFKBot',
    password: process.env.BOT_PASSWORD || '',
    version: process.env.MC_VERSION || '1.20.1',
    auth: process.env.AUTH_TYPE || 'offline'
};

// HTTP server configuration for Render Web Service
const HTTP_PORT = process.env.PORT || 10000;

console.log('🔍 Environment Variables:');
console.log('SERVER_HOST:', process.env.SERVER_HOST || '❌ NOT SET');
console.log('SERVER_PORT:', process.env.SERVER_PORT || '❌ NOT SET');
console.log('BOT_USERNAME:', process.env.BOT_USERNAME || '❌ NOT SET');
console.log('HTTP_PORT:', HTTP_PORT);

// Movement patterns
const MOVEMENT_PATTERNS = {
    circle: { forward: 1000, right: 1000, back: 1000, left: 1000 },
    square: { forward: 2000, right: 500, back: 2000, left: 500 },
    random: { min: 500, max: 3000 }
};

class AFKBot {
    constructor() {
        this.bot = null;
        this.isMoving = false;
        this.currentPattern = 'circle';
        this.movementInterval = null;
        this.respawnAttempts = 0;
        this.maxRespawnAttempts = 5;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.isConnected = false;
        this.lastActivity = Date.now();
        this.connectionTime = null;
        this.totalReconnects = 0;
        this.logs = [];
    }

    addLog(message) {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] ${message}`;
        this.logs.push(logEntry);

        // Keep only last 50 logs
        if (this.logs.length > 50) {
            this.logs = this.logs.slice(-50);
        }

        console.log(logEntry);
    }

    getStatus() {
        return {
            service: 'Minecraft AFK Bot',
            connected: this.isConnected,
            username: BOT_CONFIG.username,
            server: `${BOT_CONFIG.host}:${BOT_CONFIG.port}`,
            moving: this.isMoving,
            pattern: this.currentPattern,
            connectionTime: this.connectionTime,
            lastActivity: new Date(this.lastActivity).toISOString(),
            totalReconnects: this.totalReconnects,
            health: this.bot?.health || 0,
            food: this.bot?.food || 0,
            position: this.bot?.entity?.position ? {
                x: Math.round(this.bot.entity.position.x),
                y: Math.round(this.bot.entity.position.y),
                z: Math.round(this.bot.entity.position.z)
            } : null,
            uptime: this.connectionTime ? Math.floor((Date.now() - this.connectionTime) / 1000) : 0,
            recentLogs: this.logs.slice(-10) // Last 10 logs for web interface
        };
    }

    createBot() {
        this.addLog(`🚀 Creating bot connection to ${BOT_CONFIG.host}:${BOT_CONFIG.port}`);

        this.bot = mineflayer.createBot(BOT_CONFIG);
        this.setupEventHandlers();
        this.setupPathfinder();
    }

    setupEventHandlers() {
        this.bot.on('login', () => {
            this.addLog(`✅ Bot logged in as ${this.bot.username}`);
            this.addLog(`🌐 Connected to: ${BOT_CONFIG.host}:${BOT_CONFIG.port}`);
            this.isConnected = true;
            this.connectionTime = Date.now();
            this.reconnectAttempts = 0;
            this.lastActivity = Date.now();
            this.startAFKBehavior();
        });

        this.bot.on('spawn', () => {
            this.addLog('🎯 Bot spawned successfully');
            this.respawnAttempts = 0;
            this.lastActivity = Date.now();
            if (!this.isMoving) {
                setTimeout(() => this.startMovement(), 2000);
            }
        });

        this.bot.on('death', () => {
            this.addLog('💀 Bot died, attempting to respawn...');
            this.stopMovement();
            this.lastActivity = Date.now();
            setTimeout(() => this.respawn(), 2000);
        });

        this.bot.on('respawn', () => {
            this.addLog('🔄 Bot respawned');
            this.lastActivity = Date.now();
            setTimeout(() => this.startMovement(), 3000);
        });

        this.bot.on('kicked', (reason) => {
            this.addLog(`⚠️ Bot was kicked: ${reason}`);
            this.isConnected = false;
            setTimeout(() => this.reconnect(), 5000);
        });

        this.bot.on('error', (err) => {
            this.addLog(`❌ Bot error: ${err.message} (${err.code})`);
            this.isConnected = false;

            if (err.code === 'ECONNREFUSED') {
                this.addLog('🔧 Check SERVER_HOST and ensure Minecraft server is online');
            } else if (err.code === 'ETIMEDOUT') {
                this.addLog('🔧 Connection timeout - server might be offline or blocking connections');
            } else if (err.code === 'ENOTFOUND') {
                this.addLog('🔧 Server hostname not found - check SERVER_HOST spelling');
            }

            this.handleConnectionError();
        });

        this.bot.on('end', () => {
            this.addLog('🔌 Bot disconnected');
            this.isConnected = false;
            this.stopMovement();
            setTimeout(() => this.reconnect(), 15000);
        });

        this.bot.on('chat', (username, message) => {
            if (username === this.bot.username) return;
            this.addLog(`💬 ${username}: ${message}`);
            this.lastActivity = Date.now();

            // Respond to mentions
            if (message.toLowerCase().includes(this.bot.username.toLowerCase())) {
                setTimeout(() => {
                    if (this.bot && this.bot.chat) {
                        this.bot.chat('I am an AFK bot. Visit my status page!');
                    }
                }, 1000);
            }
        });
    }

    handleConnectionError() {
        this.reconnectAttempts++;
        this.totalReconnects++;

        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.addLog(`❌ Max reconnection attempts reached. Waiting 5 minutes...`);
            setTimeout(() => {
                this.reconnectAttempts = 0;
                this.reconnect();
            }, 300000);
        } else {
            const delay = Math.min(30000 * this.reconnectAttempts, 120000);
            this.addLog(`🔄 Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay/1000}s`);
            setTimeout(() => this.reconnect(), delay);
        }
    }

    setupPathfinder() {
        try {
            this.bot.loadPlugin(pathfinder);
        } catch (error) {
            this.addLog(`⚠️ Pathfinder plugin failed: ${error.message}`);
        }
    }

    startAFKBehavior() {
        this.addLog('🤖 Starting AFK behavior...');

        // Send initial message
        setTimeout(() => {
            if (this.bot && this.bot.chat) {
                this.bot.chat('AFK Bot is now active!');
            }
        }, 3000);

        // Start movement
        setTimeout(() => {
            this.startMovement();
        }, 5000);

        // Status updates
        setInterval(() => {
            if (this.bot && this.bot.entity && this.isConnected) {
                const pos = this.bot.entity.position;
                this.addLog(`📍 H:${this.bot.health} F:${this.bot.food} Pos:(${Math.round(pos.x)},${Math.round(pos.y)},${Math.round(pos.z)})`);
            }
        }, 120000); // Every 2 minutes
    }

    startMovement() {
        if (this.isMoving || !this.bot || !this.bot.entity) return;

        this.addLog(`🚶 Starting movement pattern: ${this.currentPattern}`);
        this.isMoving = true;

        const moveInPattern = () => {
            if (!this.bot || !this.bot.entity || !this.isMoving) return;

            try {
                this.lastActivity = Date.now();
                const pattern = MOVEMENT_PATTERNS[this.currentPattern];

                if (this.currentPattern === 'random') {
                    this.randomMovement();
                } else {
                    this.patternMovement(pattern);
                }
            } catch (error) {
                this.addLog(`Movement error: ${error.message}`);
                setTimeout(moveInPattern, 5000);
            }
        };

        moveInPattern();
        this.movementInterval = setInterval(moveInPattern, 8000);
    }

    randomMovement() {
        if (!this.bot) return;

        const directions = ['forward', 'back', 'left', 'right'];
        const direction = directions[Math.floor(Math.random() * directions.length)];
        const duration = Math.random() * (MOVEMENT_PATTERNS.random.max - MOVEMENT_PATTERNS.random.min) + MOVEMENT_PATTERNS.random.min;

        this.bot.setControlState(direction, true);

        setTimeout(() => {
            if (this.bot) {
                this.bot.clearControlStates();
                // Random jump
                if (Math.random() < 0.4) {
                    this.bot.setControlState('jump', true);
                    setTimeout(() => {
                        if (this.bot) this.bot.setControlState('jump', false);
                    }, 500);
                }
            }
        }, duration);
    }

    patternMovement(pattern) {
        const movements = Object.entries(pattern);
        let currentMove = 0;

        const executeMove = () => {
            if (currentMove >= movements.length || !this.isMoving || !this.bot) return;

            const [direction, duration] = movements[currentMove];

            if (this.bot.setControlState) {
                this.bot.setControlState(direction, true);

                setTimeout(() => {
                    if (this.bot) {
                        this.bot.clearControlStates();
                        currentMove++;
                        if (currentMove < movements.length) {
                            setTimeout(executeMove, 300);
                        }
                    }
                }, duration);
            }
        };

        executeMove();
    }

    stopMovement() {
        this.addLog('⏹️ Stopping movement');
        this.isMoving = false;
        if (this.movementInterval) {
            clearInterval(this.movementInterval);
            this.movementInterval = null;
        }
        if (this.bot) {
            this.bot.clearControlStates();
        }
    }

    respawn() {
        if (!this.bot) return;

        this.respawnAttempts++;
        this.addLog(`⚰️ Respawn attempt ${this.respawnAttempts}/${this.maxRespawnAttempts}`);

        if (this.respawnAttempts > this.maxRespawnAttempts) {
            this.addLog('❌ Max respawn attempts reached, reconnecting...');
            this.reconnect();
            return;
        }

        try {
            this.bot.respawn();
        } catch (error) {
            this.addLog(`Respawn error: ${error.message}`);
            setTimeout(() => this.respawn(), 3000);
        }
    }

    reconnect() {
        this.addLog('🔄 Reconnecting...');
        this.stopMovement();
        this.isConnected = false;
        this.connectionTime = null;

        if (this.bot) {
            this.bot.end();
        }

        setTimeout(() => {
            this.createBot();
        }, 5000);
    }

    changePattern(newPattern) {
        if (MOVEMENT_PATTERNS[newPattern]) {
            this.addLog(`🔄 Changed movement pattern to: ${newPattern}`);
            this.currentPattern = newPattern;
            if (this.isMoving) {
                this.stopMovement();
                setTimeout(() => this.startMovement(), 1000);
            }
            return true;
        }
        return false;
    }
}

// Create the bot instance
const afkBot = new AFKBot();

// Create HTTP server for Render Web Service requirement
const server = http.createServer((req, res) => {
    const url = req.url;

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    if (url === '/') {
        // Main dashboard
        const status = afkBot.getStatus();
        const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Minecraft AFK Bot Dashboard</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .status { display: inline-block; padding: 5px 10px; border-radius: 15px; color: white; font-weight: bold; }
        .connected { background-color: #4CAF50; }
        .disconnected { background-color: #f44336; }
        .info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }
        .info-card { background: #f8f9fa; padding: 15px; border-radius: 5px; border-left: 4px solid #007bff; }
        .logs { background: #000; color: #00ff00; padding: 15px; border-radius: 5px; font-family: monospace; height: 300px; overflow-y: scroll; margin: 20px 0; }
        .controls button { background: #007bff; color: white; border: none; padding: 10px 15px; margin: 5px; border-radius: 5px; cursor: pointer; }
        .controls button:hover { background: #0056b3; }
        h1 { color: #333; text-align: center; }
        .refresh { text-align: center; margin: 20px 0; }
    </style>
    <meta http-equiv="refresh" content="10">
</head>
<body>
    <div class="container">
        <h1>🤖 Minecraft AFK Bot Dashboard</h1>

        <div style="text-align: center; margin: 20px 0;">
            <span class="status ${status.connected ? 'connected' : 'disconnected'}">
                ${status.connected ? '🟢 CONNECTED' : '🔴 DISCONNECTED'}
            </span>
        </div>

        <div class="info-grid">
            <div class="info-card">
                <strong>🎮 Server</strong><br>
                ${status.server}
            </div>
            <div class="info-card">
                <strong>👤 Username</strong><br>
                ${status.username}
            </div>
            <div class="info-card">
                <strong>🚶 Movement</strong><br>
                ${status.moving ? `Moving (${status.pattern})` : 'Stopped'}
            </div>
            <div class="info-card">
                <strong>⏱️ Uptime</strong><br>
                ${Math.floor(status.uptime / 60)}m ${status.uptime % 60}s
            </div>
            <div class="info-card">
                <strong>❤️ Health</strong><br>
                ${status.health}/20
            </div>
            <div class="info-card">
                <strong>🍖 Food</strong><br>
                ${status.food}/20
            </div>
            <div class="info-card">
                <strong>📍 Position</strong><br>
                ${status.position ? `(${status.position.x}, ${status.position.y}, ${status.position.z})` : 'Unknown'}
            </div>
            <div class="info-card">
                <strong>🔄 Reconnects</strong><br>
                ${status.totalReconnects}
            </div>
        </div>

        <h3>📋 Recent Logs</h3>
        <div class="logs">
${status.recentLogs.map(log => `${log}`).join('\n')}
        </div>

        <div class="controls">
            <button onclick="location.reload()">🔄 Refresh</button>
            <button onclick="fetch('/api/pattern/circle', {method: 'POST'})">🔵 Circle Pattern</button>
            <button onclick="fetch('/api/pattern/square', {method: 'POST'})">🔲 Square Pattern</button>
            <button onclick="fetch('/api/pattern/random', {method: 'POST'})">🎲 Random Pattern</button>
        </div>

        <div class="refresh">
            <small>🔄 Page auto-refreshes every 10 seconds</small>
        </div>
    </div>
</body>
</html>`;

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);

    } else if (url === '/api/status') {
        // JSON API endpoint
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(afkBot.getStatus()));

    } else if (url.startsWith('/api/pattern/') && req.method === 'POST') {
        // Change movement pattern
        const pattern = url.split('/')[3];
        const success = afkBot.changePattern(pattern);
        res.writeHead(success ? 200 : 400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success, pattern }));

    } else {
        // 404 Not Found
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 - Not Found');
    }
});

// Start HTTP server on required port
server.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`🌐 HTTP server running on port ${HTTP_PORT}`);
    console.log(`📊 Dashboard will be available at: https://your-app.onrender.com`);
    console.log('🤖 Starting AFK bot...');

    // Start the Minecraft bot
    afkBot.createBot();
});

// Handle process termination
const shutdown = () => {
    console.log('\n🛑 Shutting down...');
    afkBot.stopMovement();
    if (afkBot.bot) {
        afkBot.bot.end();
    }
    server.close();
    process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Connection monitor
setInterval(() => {
    if (!afkBot.bot || afkBot.bot.ended) {
        afkBot.addLog('⚠️ Bot disconnected, reconnecting...');
        afkBot.reconnect();
    }
}, 45000); // Check every 45 seconds

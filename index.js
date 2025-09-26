const mineflayer = require('mineflayer');
const { pathfinder, Movements } = require('mineflayer-pathfinder');

// Bot configuration
const BOT_CONFIG = {
    host: process.env.SERVER_HOST || 'localhost',
    port: parseInt(process.env.SERVER_PORT) || 25565,
    username: process.env.BOT_USERNAME || 'AFKBot',
    password: process.env.BOT_PASSWORD || '', // Leave empty for cracked servers
    version: process.env.MC_VERSION || '1.20.1',
    auth: process.env.AUTH_TYPE || 'offline' // 'microsoft' for premium, 'offline' for cracked
};

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
    }

    createBot() {
        console.log('Creating bot with config:', { ...BOT_CONFIG, password: '***' });

        this.bot = mineflayer.createBot(BOT_CONFIG);
        this.setupEventHandlers();
        this.setupPathfinder();
    }

    setupEventHandlers() {
        this.bot.on('login', () => {
            console.log(`✅ Bot logged in as ${this.bot.username}`);
            console.log(`Server: ${BOT_CONFIG.host}:${BOT_CONFIG.port}`);
            this.startAFKBehavior();
        });

        this.bot.on('spawn', () => {
            console.log('🎯 Bot spawned successfully');
            this.respawnAttempts = 0;
            if (!this.isMoving) {
                this.startMovement();
            }
        });

        this.bot.on('death', () => {
            console.log('💀 Bot died, attempting to respawn...');
            this.stopMovement();
            setTimeout(() => this.respawn(), 2000);
        });

        this.bot.on('respawn', () => {
            console.log('🔄 Bot respawned');
            setTimeout(() => this.startMovement(), 3000);
        });

        this.bot.on('kicked', (reason) => {
            console.log('⚠️ Bot was kicked:', reason);
            this.reconnect();
        });

        this.bot.on('error', (err) => {
            console.error('❌ Bot error:', err.message);
            if (err.message.includes('ENOTFOUND') || err.message.includes('ECONNREFUSED')) {
                console.log('🔄 Connection error, retrying in 30 seconds...');
                setTimeout(() => this.reconnect(), 30000);
            }
        });

        this.bot.on('end', () => {
            console.log('🔌 Bot disconnected');
            this.stopMovement();
            setTimeout(() => this.reconnect(), 15000);
        });

        this.bot.on('chat', (username, message) => {
            if (username === this.bot.username) return;
            console.log(`💬 ${username}: ${message}`);

            // Respond to mentions or direct messages
            if (message.toLowerCase().includes(this.bot.username.toLowerCase())) {
                setTimeout(() => {
                    this.bot.chat('I am an AFK bot. Currently active and moving!');
                }, 1000);
            }
        });
    }

    setupPathfinder() {
        this.bot.loadPlugin(pathfinder);
    }

    startAFKBehavior() {
        console.log('🤖 Starting AFK behavior...');

        // Send initial message
        setTimeout(() => {
            this.bot.chat('AFK Bot is now active!');
        }, 2000);

        // Start movement after a brief delay
        setTimeout(() => {
            this.startMovement();
        }, 5000);

        // Periodic status updates
        setInterval(() => {
            if (this.bot && this.bot.entity) {
                console.log(`📍 Bot status - Health: ${this.bot.health}, Food: ${this.bot.food}, Position: ${Math.round(this.bot.entity.position.x)}, ${Math.round(this.bot.entity.position.y)}, ${Math.round(this.bot.entity.position.z)}`);
            }
        }, 60000); // Every minute
    }

    startMovement() {
        if (this.isMoving) return;

        console.log('🚶 Starting movement pattern:', this.currentPattern);
        this.isMoving = true;

        const moveInPattern = () => {
            if (!this.bot || !this.bot.entity || !this.isMoving) return;

            try {
                const pattern = MOVEMENT_PATTERNS[this.currentPattern];

                if (this.currentPattern === 'random') {
                    this.randomMovement();
                } else {
                    this.patternMovement(pattern);
                }
            } catch (error) {
                console.error('Movement error:', error.message);
                setTimeout(moveInPattern, 5000); // Retry after 5 seconds
            }
        };

        moveInPattern();
        this.movementInterval = setInterval(moveInPattern, 10000); // Move every 10 seconds
    }

    randomMovement() {
        const directions = ['forward', 'back', 'left', 'right'];
        const direction = directions[Math.floor(Math.random() * directions.length)];
        const duration = Math.random() * (MOVEMENT_PATTERNS.random.max - MOVEMENT_PATTERNS.random.min) + MOVEMENT_PATTERNS.random.min;

        console.log(`🎲 Random movement: ${direction} for ${duration}ms`);

        this.bot.setControlState(direction, true);

        setTimeout(() => {
            this.bot.clearControlStates();
            // Occasionally jump
            if (Math.random() < 0.3) {
                this.bot.setControlState('jump', true);
                setTimeout(() => this.bot.setControlState('jump', false), 500);
            }
        }, duration);
    }

    patternMovement(pattern) {
        const movements = Object.entries(pattern);
        let currentMove = 0;

        const executeMove = () => {
            if (currentMove >= movements.length || !this.isMoving) return;

            const [direction, duration] = movements[currentMove];
            console.log(`➡️ Pattern movement: ${direction} for ${duration}ms`);

            this.bot.setControlState(direction, true);

            setTimeout(() => {
                this.bot.clearControlStates();
                currentMove++;
                if (currentMove < movements.length) {
                    setTimeout(executeMove, 500); // Brief pause between movements
                }
            }, duration);
        };

        executeMove();
    }

    stopMovement() {
        console.log('⏹️ Stopping movement');
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
        console.log(`⚰️ Respawn attempt ${this.respawnAttempts}/${this.maxRespawnAttempts}`);

        if (this.respawnAttempts > this.maxRespawnAttempts) {
            console.log('❌ Max respawn attempts reached, reconnecting...');
            this.reconnect();
            return;
        }

        try {
            this.bot.respawn();
        } catch (error) {
            console.error('Respawn error:', error.message);
            setTimeout(() => this.respawn(), 3000);
        }
    }

    reconnect() {
        console.log('🔄 Reconnecting...');
        this.stopMovement();

        if (this.bot) {
            this.bot.end();
        }

        setTimeout(() => {
            this.createBot();
        }, 5000);
    }

    changePattern(newPattern) {
        if (MOVEMENT_PATTERNS[newPattern]) {
            console.log(`🔄 Changing movement pattern to: ${newPattern}`);
            this.currentPattern = newPattern;
            if (this.isMoving) {
                this.stopMovement();
                setTimeout(() => this.startMovement(), 1000);
            }
        }
    }
}

// Create and start the bot
const afkBot = new AFKBot();

// Handle process termination
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down AFK bot...');
    afkBot.stopMovement();
    if (afkBot.bot) {
        afkBot.bot.end();
    }
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down...');
    afkBot.stopMovement();
    if (afkBot.bot) {
        afkBot.bot.end();
    }
    process.exit(0);
});

// Start the bot
console.log('🚀 Starting Minecraft AFK Bot...');
afkBot.createBot();

// Keep the process alive
setInterval(() => {
    if (!afkBot.bot || afkBot.bot.ended) {
        console.log('⚠️ Bot disconnected, attempting reconnection...');
        afkBot.reconnect();
    }
}, 30000); // Check every 30 seconds

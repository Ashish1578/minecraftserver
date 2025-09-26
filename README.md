# Minecraft AFK bot Web Service Deployment Guide (Free Tier)

## 🌐 HTTP Server + Minecraft Bot Combo

This version includes both:
- 🤖 Minecraft AFK Bot (background process)  
- 🌐 HTTP Server (satisfies Render Web Service requirements)
- 📊 Web Dashboard (monitor your bot status)

## Render Web Service Setup

### 1. Create Web Service
- Go to Render Dashboard
- Click "New +" → **Web Service**
- Connect your GitHub repository

### 2. Configure Settings
```
Name: minecraft-afk-bot
Build Command: npm install
Start Command: npm start
```

### 3. Environment Variables
```
SERVER_HOST = your-minecraft-server.com
SERVER_PORT = 25565
BOT_USERNAME = YourBotName
AUTH_TYPE = offline
```

### 4. Deploy & Access
After deployment, you'll get a URL like:
`https://minecraft-afk-bot-xyz.onrender.com`

## 📊 Web Dashboard Features

Visit your app URL to see:
- ✅ Connection status (Connected/Disconnected)
- 🎮 Server info and bot username
- 📍 Real-time position, health, food stats
- 📋 Live logs from the bot
- 🎮 Movement pattern controls (Circle, Square, Random)
- ⏱️ Uptime tracking
- 🔄 Auto-refresh every 10 seconds

## 🔧 How It Works

1. **HTTP Server** runs on port 10000 (Render's requirement)
2. **Minecraft Bot** connects to your server in the background
3. **Dashboard** shows real-time bot status
4. **Both processes** run simultaneously in one container

## 🎮 API Endpoints

- `GET /` - Web dashboard
- `GET /api/status` - JSON status
- `POST /api/pattern/circle` - Change to circle movement
- `POST /api/pattern/square` - Change to square movement  
- `POST /api/pattern/random` - Change to random movement

## ✅ Success Indicators

**In Render Logs:**
```
🌐 HTTP server running on port 10000
📊 Dashboard will be available at: https://your-app.onrender.com
🤖 Starting AFK bot...
✅ Bot logged in as YourBotName
🎯 Bot spawned successfully
🚶 Starting movement pattern: circle
```

**In Browser:**
- Green "CONNECTED" status
- Live position updates
- Movement pattern active
- Logs showing activity

## 🆓 Free Tier Benefits

- ✅ Satisfies port binding requirement
- ✅ No "no open ports" errors  
- ✅ Web dashboard to monitor bot
- ✅ Remote control via web interface
- ✅ Stays within free tier limits

## 🛠️ Troubleshooting

**Bot shows disconnected:**
- Check environment variables (SERVER_HOST, etc.)
- Verify Minecraft server is online
- Check logs in dashboard for specific errors

**Can't access dashboard:**
- Wait for deployment to complete
- Check Render service URL
- Ensure no build errors in logs

This approach gives you both a working AFK bot AND satisfies Render's Web Service requirements!


# 🚨 RENDER SLEEP PREVENTION SOLUTION

## Problem: Render Free Tier Services Sleep After 15 Minutes
Render's free tier automatically spins down web services after 15 minutes of inactivity (no HTTP requests), causing your Minecraft bot to disconnect.

## 🎯 COMPLETE SOLUTION: External + Internal Keep-Alive

### Part 1: External Ping Services (RECOMMENDED)

#### 🥇 UptimeRobot (Best Option - FREE)
1. Sign up at https://uptimerobot.com
2. Create "HTTP(s)" monitor
3. URL: `https://your-app-name.onrender.com/keep-alive`
4. Interval: **5 minutes** (free plan minimum)
5. Keyword to check: `OK` (optional but recommended)

**Benefits:**
- ✅ 50 monitors FREE forever
- ✅ 5-minute intervals (perfect for 15-min sleep timer)
- ✅ Email/SMS alerts if your service goes down
- ✅ No resource usage on your app
- ✅ Works even if your app crashes

#### 🥈 Alternative Free Services:
- **Freshping**: 50 monitors, 1-minute intervals - https://www.freshworks.com/apps/freshping/
- **Cron-Job.org**: Custom schedules - https://console.cron-job.org/
- **Pulsetic**: 10 monitors, 5-minute intervals - https://pulsetic.com

### Part 2: Enhanced Internal Keep-Alive (Backup)

The bot includes an internal keep-alive system as backup:
- Self-pings every 10 minutes
- Only activates if external pings fail
- Tracks successful external vs internal pings
- Automatically adjusts intervals

### Part 3: Sleep-Resilient Bot Design

Enhanced bot features:
- **Wake-up detection**: Detects when service wakes from sleep
- **Rapid reconnection**: Immediately reconnects after wake
- **Sleep counters**: Tracks sleep cycles and wake times
- **Extended timeouts**: Handles cold starts after sleep
- **Graceful degradation**: Continues working through sleep cycles

## 📊 Setup Instructions

### Step 1: Deploy Your Bot (Normal Process)
Deploy the enhanced bot code to Render as Web Service

### Step 2: Set Up External Monitoring
1. Go to https://uptimerobot.com
2. Create free account
3. Add monitor:
   - **Type**: HTTP(s)
   - **URL**: `https://your-app-name.onrender.com/keep-alive`
   - **Interval**: 5 minutes
   - **Keyword**: `OK`
4. Save monitor

### Step 3: Verify Setup
Check your Render dashboard after 20 minutes:
- Should see regular HTTP requests every 5 minutes
- Bot should stay connected continuously
- No "spinning up" messages in logs

## 🎯 Success Indicators

**Working Correctly:**
```
🔄 External ping received from UptimeRobot
🌐 Service staying awake - no sleep detected
🤖 Bot continuous uptime: 2h 34m
✅ 0 sleep cycles detected
```

**Needs Attention:**
```
⚠️ No external pings for 15+ minutes
💤 Service sleep detected - waking up
🚨 Multiple sleep cycles (check external monitor)
```

## 💡 Pro Tips

1. **Use UptimeRobot's keyword monitoring** - checks for "OK" response, not just HTTP 200
2. **Set up email alerts** - get notified if external monitoring fails
3. **Test your setup** - disable external monitor temporarily to verify sleep behavior
4. **Multiple monitors** - can set up 2-3 different services for redundancy
5. **Custom intervals** - 4-5 minutes is ideal (well under 15-minute limit)

## 🔧 Troubleshooting

**Bot Still Disconnecting:**
- Check UptimeRobot monitor status (should be "Up")
- Verify correct URL in monitor (must include /keep-alive)
- Ensure 5-minute intervals or less
- Check Render logs for external ping requests

**UptimeRobot Shows "Down":**
- Your app might be crashing (check Render logs)
- Wrong URL or endpoint
- Render service limits exceeded

**Multiple Sleep Cycles:**
- External monitor might be failing
- Set up backup monitor with different service
- Check UptimeRobot account limits

## 📈 Resource Usage

**External Method:** 0% app resources (recommended)
**Internal Method:** ~1% CPU, minimal RAM
**Combined:** Best reliability with minimal overhead

This solution will keep your Render service awake 24/7 and ensure your Minecraft bot stays connected continuously!

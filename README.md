# AppleMC Bot Manager — Local PC Setup

## Requirements
- **Node.js v18+** — download at https://nodejs.org (pick the LTS version)
- That's it.

---

## Setup (one time)

1. Extract this folder anywhere on your PC
2. Open the folder, double-click **`start.bat`**
   - First run installs dependencies automatically
3. Browser opens at **http://localhost:3000**

---

## Starting after first setup

Double-click **`start.bat`** every time.  
Or open a terminal in the folder and run:
```
node index.js
```

---

## Config (optional)

Edit **`.env`** to change settings:

| Setting | Default | What it does |
|---|---|---|
| `PORT` | `3000` | Port the UI runs on |
| `ADMIN_KEY` | _(blank)_ | Password to protect the UI. Leave blank for no password |
| `WEBSHARE_API_KEY` | _(blank)_ | Auto-loads your Webshare proxy pool on startup |

---

## Bot flow

1. Launch bot → bot spawns frozen, no movement
2. ANTIBOT check passes → status shows **"waiting for captcha"**
3. Go to **Captcha Viewer**, fetch the captcha image
4. Type the answer, hit **Submit**
5. Bot automatically sends `/register password password` after 4.5 seconds
6. Bot stays still — done

---

## Folder structure

```
applemc-local/
├── index.js          ← server entry point
├── botManager.js     ← bot logic
├── proxyManager.js   ← proxy pool
├── captchaSolver.js  ← captcha handling
├── package.json      ← dependencies
├── .env              ← config
├── start.bat         ← Windows launcher
└── public/
    └── index.html    ← web UI
```

---

## Discord Bot Setup

### 1. Create a Discord application
1. Go to https://discord.com/developers/applications
2. Click **New Application** → name it anything
3. Go to **Bot** tab → click **Add Bot**
4. Under **Token** → click **Reset Token** → copy it → paste into `.env` as `DISCORD_TOKEN`
5. Go to **OAuth2** → **General** → copy **Client ID** → paste into `.env` as `DISCORD_CLIENT_ID`

### 2. Invite the bot to your server
1. Go to **OAuth2** → **URL Generator**
2. Scopes: check `bot` and `applications.commands`
3. Bot permissions: check `Send Messages`, `Embed Links`, `Attach Files`, `Use Slash Commands`
4. Copy the URL → open it → invite to your server

### 3. Set env vars on Railway
Add these in Railway → your service → **Variables**:
- `DISCORD_TOKEN` — your bot token
- `DISCORD_CLIENT_ID` — your application client ID  
- `DISCORD_GUILD_ID` — your server ID (right-click server → Copy Server ID). Optional but makes commands register instantly.

### 4. Deploy
Push to GitHub, Railway redeploys automatically. Bot comes online in Discord.

---

## Discord Commands

| Command | What it does |
|---|---|
| `/launch count:5` | Launch 5 bots |
| `/status` | Show all bots with status |
| `/logs username:ShadowFrost91` | Get bot logs |
| `/kill username:ShadowFrost91` | Kill one bot |
| `/killall` | Kill all bots |
| `/chat username:X message:hello` | Make bot chat |
| `/captcha username:X` | Get captcha image |
| `/solvecaptcha username:X answer:abc123` | Submit captcha answer |
| `/goto username:X x:100 y:64 z:200` | Pathfind to coords |
| `/follow username:X target:PlayerName` | Follow a player |
| `/stop username:X` | Freeze bot |
| `/look username:X x:0 y:64 z:0` | Look at coords |
| `/randomwalk username:X` | Wander randomly |
| `/jump username:X` | Jump |
| `/sneak username:X on:true` | Toggle sneak |
| `/sprint username:X on:true` | Toggle sprint |
| `/proxy proxy:31.59.20.176:6754:user:pass` | Set proxy |
| `/webshare apikey:YOUR_KEY` | Load Webshare pool |
| `/proxystats` | Show proxy stats |
| `/cmd username:X command:/spawn` | Send any command |
| `/help` | List all commands |

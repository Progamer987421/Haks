const mineflayer  = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { GoalBlock, GoalFollow, GoalLookAtBlock, GoalXZ, GoalNear } = goals;
const { SocksClient } = require('socks');
const ProxyManager = require('./proxyManager');

const SERVER_HOST    = process.env.MC_HOST;
const SERVER_PORT    = parseInt(process.env.MC_PORT) || 25565;
const SERVER_VERSION = process.env.MC_VERSION;
const BOT_PASSWORD   = '231182';
const AUTH_DELAY     = 3500; // ms after spawn before sending auth

// ── Username generator ────────────────────────────────────────────
function randomUsername() {
  const prefixes = [
    'Shadow','Dark','Silent','Frost','Blaze','Storm','Night','Iron','Swift','Ghost',
    'Hyper','Sniper','Toxic','Lucky','Rapid','Viper','Stealth','Neon','Cyber','Pixel',
    'Alpha','Omega','Chaos','Rogue','Void','Elite','Turbo','Ninja','Epic','Savage',
    'Cool','Pro','Mad','Bad','Wild','Rad','Bold','Grim','Nova','Apex',
    'Skull','Blade','Claw','Fang','Wolf','Bear','Eagle','Hawk','Fox','Lynx',
    'Cr1py','Xeno','Zeph','Ryze','Koda','Axel','Dusk','Rave','Cruz','Slate',
    'Glitch','Static','Binary','Vector','Cipher','Matrix','Pulse','Flux','Drift','Surge',
  ];

  const suffixes = [
    'xx','xX','XX','_x','x_','XD','YT','TV','GG','PvP',
    'Pro','God','Bot','King','Lord','Star','Ace','One','Two',
    '_HD','_4K','HD','Gaming','Plays','Live','Real','True','OG','MVP',
  ];

  const numbers = () => {
    const style = Math.floor(Math.random() * 4);
    if (style === 0) return String(Math.floor(Math.random() * 99) + 1);           // 1–99
    if (style === 1) return String(Math.floor(Math.random() * 900) + 100);        // 100–999
    if (style === 2) return String(Math.floor(Math.random() * 9000) + 1000);      // 1000–9999
    return String(Math.floor(Math.random() * 90) + 10);                           // 10–99
  };

  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const cap  = s   => s.charAt(0).toUpperCase() + s.slice(1);

  const style = Math.floor(Math.random() * 6);

  if (style === 0) return pick(prefixes) + numbers();                              // Shadow91
  if (style === 1) return pick(prefixes) + pick(prefixes);                         // ShadowFrost
  if (style === 2) return pick(prefixes) + pick(suffixes);                         // ShadowXD
  if (style === 3) return pick(prefixes) + pick(prefixes) + numbers();             // ShadowFrost301
  if (style === 4) return pick(prefixes) + '_' + pick(prefixes);                   // Shadow_Frost
  return pick(prefixes) + pick(suffixes) + numbers();                              // ShadowXD91
}

class BotManager {
  constructor() {
    this.bots         = {};
    this.meta         = {};
    this.logs         = {};
    this.accounts     = {};
    this.timers       = {};

    // Single static proxy — set via UI, takes priority over ProxyManager pool
    this.staticProxy  = null;

    this.proxyManager = process.env.WEBSHARE_API_KEY
      ? new ProxyManager(process.env.WEBSHARE_API_KEY)
      : null;
    this._proxyReady  = this.proxyManager ? this.proxyManager.init() : Promise.resolve();
  }

  // ── Static proxy ──────────────────────────────────────────────
  setStaticProxy(proxyStr) {
    if (!proxyStr) { this.staticProxy = null; return { ok: true, msg: 'Proxy cleared' }; }
    try {
      this.staticProxy = ProxyManager._parseProxyString(proxyStr);
      return { ok: true, host: this.staticProxy.host, port: this.staticProxy.port };
    } catch (e) {
      return { error: e.message };
    }
  }

  _getProxy() {
    if (this.staticProxy) return this.staticProxy;
    if (this.proxyManager) return this.proxyManager.next();
    return null;
  }

  // ── Create bots ───────────────────────────────────────────────
  createBots(count = 1) {
    const created = [];
    for (let i = 0; i < count; i++) {
      let username;
      do { username = randomUsername(); }
      while (Object.values(this.accounts).find(a => a.username === username));

      const id = username;
      this.accounts[id] = { username, password: BOT_PASSWORD, created: Date.now() };
      this.meta[id] = {
        username,
        status:           'connecting',
        created:          Date.now(),
        reconnects:       0,
        autoRejoin:       false,  // MANUAL only — use /reconnect from UI
        registered:       false,
        verificationKick: false,
        inBanana:         false,
        captchaPending:   false,
        antiBotLocked:    false,
        captchaImage:     null,
        proxy:            null,
        _spawnTime:       0,
      };
      this.logs[id] = [];
      this._proxyReady
        .then(() => this._spawnBot(id))
        .catch(err => this._log(id, `Spawn chain error: ${err.message}`));
      created.push(id);
    }
    return { success: true, created };
  }

  // ── Spawn ─────────────────────────────────────────────────────
  async _spawnBot(id) {
    try {
    if (!this.meta[id]) return;
    const { username } = this.accounts[id];
    const proxy = this._getProxy();
    this.meta[id].proxy = proxy;

    this._log(id, proxy
      ? `Connecting as ${username} via ${proxy.host}:${proxy.port}`
      : `Connecting as ${username} (no proxy)`);

    // Use SocksClient.createConnection then pass socket via mineflayer connect override
    let bot;
    try {
      const botOptions = {
        host:                 SERVER_HOST,
        port:                 SERVER_PORT,
        username,
        version:              SERVER_VERSION,
        auth:                 'offline',
        checkTimeoutInterval: 120000,
        closeTimeout:         600,
        keepAlive:            true,
        hideErrors:           false,
      };

      if (proxy) {
        // Override the connect function — mineflayer calls this with (client, options)
        // We ignore both and return a pre-tunneled socket via the undocumented _client path.
        // Instead: monkey-patch net.connect for this one createBot call only.
        const net = require('net');
        const originalConnect = net.connect.bind(net);
        let patched = false;
        net.connect = (opts, cb) => {
          if (!patched && opts && opts.host === SERVER_HOST) {
            patched = true;
            net.connect = originalConnect; // restore immediately
            const sock = new net.Socket();
            SocksClient.createConnection({
              proxy: {
                host:     proxy.host,
                port:     proxy.port,
                type:     5,
                userId:   proxy.username,
                password: proxy.password,
              },
              command:     'connect',
              destination: { host: SERVER_HOST, port: SERVER_PORT },
              existing_socket: sock,
            }).then(({ socket }) => {
              this._log(id, `SOCKS5 tunnel established via ${proxy.host}:${proxy.port}`);
              if (cb) socket.once('connect', cb);
            }).catch(err => {
              this._log(id, `SOCKS5 error: ${err.message} — direct fallback`);
              net.connect = originalConnect;
              if (this.proxyManager && !this.staticProxy) this.proxyManager.markFailed(proxy.host, proxy.port);
              const fallback = originalConnect(opts, cb);
              fallback.on('error', e => this._log(id, `Fallback error: ${e.message}`));
            });
            return sock;
          }
          return originalConnect(opts, cb);
        };
      }

      bot = mineflayer.createBot(botOptions);
    } catch (err) {
      this._log(id, `Spawn error: ${err.message}`);
      this._scheduleReconnect(id);
      return;
    }

    bot.loadPlugin(pathfinder);
    // No auto captcha solver — enter captcha manually via UI

    // ── Spawn event — LOCK movement immediately ────────────────
    bot.once('spawn', () => {
      this.meta[id].status        = 'verifying...';
      this.meta[id].antiBotLocked = true;
      this.meta[id]._spawnTime    = Date.now();
      this._log(id, 'Spawned — movement LOCKED, waiting for ANTIBOT clearance');

      // Zero all controls
      ['forward','back','left','right','jump','sneak','sprint'].forEach(k => {
        try { bot.setControlState(k, false); } catch (_) {}
      });
      try { bot.pathfinder.setGoal(null); } catch (_) {}

      // Auth triggered only by ANTIBOT clear message — no fixed timer.
      // Bot stays fully frozen until server confirms verification passed.
      this._log(id, 'Waiting for ANTIBOT clear message before any action');
    });

    // ── Message listener ──────────────────────────────────────
    bot.on('message', (jsonMsg) => {
      const text = jsonMsg.toString();
      this._log(id, `[MSG] ${text}`);

      if (/already registered/i.test(text)) this.meta[id].registered = true;

      // ANTIBOT "stand still" — re-enforce lock
      if (/do not move|please do not move|stand still|don.t move/i.test(text)) {
        this.meta[id].antiBotLocked = true;
        ['forward','back','left','right','jump','sneak','sprint'].forEach(k => {
          try { bot.setControlState(k, false); } catch (_) {}
        });
        try { bot.pathfinder.setGoal(null); } catch (_) {}
        this._log(id, 'ANTIBOT: movement lock confirmed');
      }

      // ANTIBOT clear — trigger auth immediately after clearance
      if (this.meta[id].antiBotLocked &&
          /verified|you have passed|verification (complete|passed|successful)|you may (now )?move|bot.?check passed/i.test(text)) {
        this.meta[id].antiBotLocked = false;
        this._log(id, 'ANTIBOT: cleared — movement unlocked, triggering auth');
        clearTimeout(this.meta[id]._authFallback);
        // Small delay so server finishes its own state update before we send chat
        setTimeout(() => this._doAuth(id, bot), 800);
      }

      // Registration success — bot stays still, no /login sent
      if (/registered|successfully registered|you are now registered|logged in|successfully authenticated|you are now logged/i.test(text)) {
        this.meta[id].status = 'online ✓';
        this.meta[id].captchaPending = false;
        this._log(id, 'Registered/authed — bot standing still');
        // Bot just stands. No /login. No /server banana. No movement.
      }

      if (/wrong password|incorrect password/i.test(text)) {
        this._log(id, 'Wrong password — killing bot');
        this.killBot(id);
      }

      if (/connecting you to|sending you to|transferring/i.test(text)) {
        this.meta[id].verificationKick = true;
        this._log(id, 'Server transfer detected');
      }
    });

    bot.on('chat', (uname, message) => {
      if (uname === bot.username) return;
      this._log(id, `<${uname}> ${message}`);
    });

    bot.on('kicked', (reason) => {
      const r = typeof reason === 'string' ? reason : JSON.stringify(reason);
      this._log(id, `Kicked: ${r}`);
      // Never auto-reconnect — user must hit /reconnect from UI
      const isVerify = /verify|bot.?check|captcha|not a bot|human|challenge|failed the bot/i.test(r);
      this.meta[id].status = isVerify ? 'kicked — ANTIBOT (reconnect manually)' : 'kicked (reconnect manually)';
      this.meta[id].verificationKick = false;
      this.meta[id].captchaImage = null;
      this._cleanup(id);
    });

    bot.on('error', err => {
      this._log(id, `Bot error: ${err.message}`);
    });

    // Explicitly handle keepalive packets to prevent timeout
    bot._client.on('keep_alive', (packet) => {
      try {
        bot._client.write('keep_alive', { keepAliveId: packet.keepAliveId });
      } catch (_) {}
    });

    bot.on('end', (reason) => {
      this._log(id, `Disconnected: ${reason}`);
      this.meta[id].inBanana = false;
      this._cleanup(id);
      // Auto-reconnect on keepAliveError/timeout — manual reconnect for everything else
      if (reason === 'keepAliveError' || reason === 'timeout') {
        this._log(id, 'keepAlive disconnect — auto-reconnecting in 5s');
        if (this.meta[id]) this.meta[id].status = 'reconnecting...';
        setTimeout(() => {
          if (this.meta[id]) this._spawnBot(id).catch(e => this._log(id, `Respawn error: ${e.message}`));
        }, 5000);
        return;
      }
      if (this.meta[id]) this.meta[id].status = 'disconnected (reconnect manually)';
    });

    bot.on('error', (err) => this._log(id, `Error: ${err.message}`));

    bot.on('death', () => {
      this._log(id, 'Died — respawning');
      try { bot.respawn(); } catch (_) {}
    });

    this.meta[id]._spawnTime = Date.now();
    this.bots[id] = bot;
    } catch (err) {
      this._log(id, `_spawnBot uncaught: ${err.message}`);
      if (this.meta[id]) this.meta[id].status = 'error — reconnect manually';
    }
  }

  // ── Commands ──────────────────────────────────────────────────
  async runCommand(id, cmd) {
    if (!this.meta[id]) return { error: 'Bot not found' };
    const bot = this.bots[id];
    cmd = cmd.trim();

    switch (cmd) {
      case '/freeze':
        this.meta[id].antiBotLocked = true;
        if (bot) ['forward','back','left','right','jump','sneak','sprint'].forEach(k => {
          try { bot.setControlState(k, false); } catch (_) {}
        });
        return { ok: true, msg: 'Bot frozen' };

      case '/unfreeze':
        this.meta[id].antiBotLocked = false;
        return { ok: true, msg: 'Bot unfrozen' };

      case '/respawn':
        try { if (bot) bot.respawn(); return { ok: true, msg: 'Respawned' }; }
        catch (e) { return { error: e.message }; }

      case '/look_random':
        try {
          if (bot) bot.look(Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.8, false);
          return { ok: true, msg: 'Looked' };
        } catch (e) { return { error: e.message }; }

      case '/reconnect':
        this.meta[id].autoRejoin = true;
        if (this.bots[id]) { try { this.bots[id].quit(); } catch (_) {} }
        this._cleanup(id);
        setTimeout(() => this._spawnBot(id), 1000);
        return { ok: true, msg: 'Reconnecting...' };

      case '/status':
        return { ok: true, msg: `status=${this.meta[id].status} | locked=${this.meta[id].antiBotLocked} | proxy=${this.meta[id].proxy ? this.meta[id].proxy.host + ':' + this.meta[id].proxy.port : 'direct'}` };
    }

    // ── Movement commands ─────────────────────────────────────────
    // :goto x y z
    if (cmd.startsWith(':goto ')) {
      const parts = cmd.split(' ').slice(1).map(Number);
      if (parts.length < 3 || parts.some(isNaN)) return { error: 'Usage: :goto x y z' };
      const [x, y, z] = parts;
      try {
        const mcData = require('minecraft-data')(bot.version);
        const moves  = new Movements(bot, mcData);
        bot.pathfinder.setMovements(moves);
        bot.pathfinder.setGoal(new GoalBlock(x, y, z));
        this._log(id, `Pathfinding to ${x} ${y} ${z}`);
        this.meta[id].status = `walking → ${x},${y},${z}`;
        return { ok: true, action: 'goto', x, y, z };
      } catch (e) { return { error: e.message }; }
    }

    // :gotoxz x z  (ignores Y, good for surface nav)
    if (cmd.startsWith(':gotoxz ')) {
      const parts = cmd.split(' ').slice(1).map(Number);
      if (parts.length < 2 || parts.some(isNaN)) return { error: 'Usage: :gotoxz x z' };
      const [x, z] = parts;
      try {
        const mcData = require('minecraft-data')(bot.version);
        const moves  = new Movements(bot, mcData);
        bot.pathfinder.setMovements(moves);
        bot.pathfinder.setGoal(new GoalXZ(x, z));
        this._log(id, `Pathfinding to XZ ${x} ${z}`);
        this.meta[id].status = `walking → ${x},_,${z}`;
        return { ok: true, action: 'gotoxz', x, z };
      } catch (e) { return { error: e.message }; }
    }

    // :follow username
    if (cmd.startsWith(':follow ')) {
      const target = cmd.split(' ').slice(1).join(' ').trim();
      if (!target) return { error: 'Usage: :follow username' };
      try {
        const player = bot.players[target];
        if (!player || !player.entity) return { error: `Player "${target}" not found or not in range` };
        const mcData = require('minecraft-data')(bot.version);
        const moves  = new Movements(bot, mcData);
        bot.pathfinder.setMovements(moves);
        bot.pathfinder.setGoal(new GoalFollow(player.entity, 2), true);
        this._log(id, `Following ${target}`);
        this.meta[id].status = `following ${target}`;
        this.meta[id].following = target;
        // Keep updating goal as player moves
        if (this.meta[id]._followInterval) clearInterval(this.meta[id]._followInterval);
        this.meta[id]._followInterval = setInterval(() => {
          if (!this.bots[id]) { clearInterval(this.meta[id]._followInterval); return; }
          const p = bot.players[target];
          if (p && p.entity) {
            bot.pathfinder.setGoal(new GoalFollow(p.entity, 2), true);
          }
        }, 1000);
        return { ok: true, action: 'follow', target };
      } catch (e) { return { error: e.message }; }
    }

    // :unfollow — stop following
    if (cmd === ':unfollow' || cmd === ':stop') {
      try {
        bot.pathfinder.setGoal(null);
        if (this.meta[id]._followInterval) { clearInterval(this.meta[id]._followInterval); this.meta[id]._followInterval = null; }
        if (this.meta[id]._randomWalkInterval) { clearInterval(this.meta[id]._randomWalkInterval); this.meta[id]._randomWalkInterval = null; }
        ['forward','back','left','right','jump','sneak','sprint'].forEach(k => { try { bot.setControlState(k, false); } catch (_) {} });
        this._log(id, 'Movement stopped');
        this.meta[id].status = 'online ✓';
        this.meta[id].following = null;
        return { ok: true, action: 'stop' };
      } catch (e) { return { error: e.message }; }
    }

    // :randomwalk  — wander randomly
    if (cmd === ':randomwalk') {
      try {
        const mcData = require('minecraft-data')(bot.version);
        const moves  = new Movements(bot, mcData);
        bot.pathfinder.setMovements(moves);
        if (this.meta[id]._randomWalkInterval) clearInterval(this.meta[id]._randomWalkInterval);
        const wander = () => {
          if (!this.bots[id]) return;
          const pos = bot.entity.position;
          const x   = pos.x + (Math.random() * 20 - 10);
          const z   = pos.z + (Math.random() * 20 - 10);
          bot.pathfinder.setGoal(new GoalXZ(Math.floor(x), Math.floor(z)));
        };
        wander();
        this.meta[id]._randomWalkInterval = setInterval(wander, 5000);
        this._log(id, 'Random walk started');
        this.meta[id].status = 'wandering';
        return { ok: true, action: 'randomwalk' };
      } catch (e) { return { error: e.message }; }
    }

    // :look x y z — turn to face coordinates
    if (cmd.startsWith(':look ')) {
      const parts = cmd.split(' ').slice(1).map(Number);
      if (parts.length < 3 || parts.some(isNaN)) return { error: 'Usage: :look x y z' };
      const [x, y, z] = parts;
      try {
        await bot.lookAt({ x, y, z });
        this._log(id, `Looking at ${x} ${y} ${z}`);
        return { ok: true, action: 'look', x, y, z };
      } catch (e) { return { error: e.message }; }
    }

    // :jump — single jump
    if (cmd === ':jump') {
      try {
        bot.setControlState('jump', true);
        setTimeout(() => { try { bot.setControlState('jump', false); } catch (_) {} }, 200);
        this._log(id, 'Jumped');
        return { ok: true, action: 'jump' };
      } catch (e) { return { error: e.message }; }
    }

    // :sneak / :unsneak
    if (cmd === ':sneak') {
      try { bot.setControlState('sneak', true); this._log(id, 'Sneaking'); return { ok: true, action: 'sneak' }; }
      catch (e) { return { error: e.message }; }
    }
    if (cmd === ':unsneak') {
      try { bot.setControlState('sneak', false); this._log(id, 'Unsneaked'); return { ok: true, action: 'unsneak' }; }
      catch (e) { return { error: e.message }; }
    }

    // :sprint / :unsprint
    if (cmd === ':sprint') {
      try { bot.setControlState('sprint', true); this._log(id, 'Sprinting'); return { ok: true, action: 'sprint' }; }
      catch (e) { return { error: e.message }; }
    }
    if (cmd === ':unsprint') {
      try { bot.setControlState('sprint', false); this._log(id, 'Sprint off'); return { ok: true, action: 'unsprint' }; }
      catch (e) { return { error: e.message }; }
    }

    // Any other /command or message — send to server
    if (!bot) return { error: 'Bot not online' };
    try {
      bot.chat(cmd);
      this._log(id, `[CMD] ${cmd}`);
      // If captcha is pending, this cmd is the captcha answer
      // Auto-send /register immediately after
      if (this.meta[id].captchaPending) {
        this._log(id, 'Captcha answer sent — auto-registering');
        setTimeout(() => this._register(id, bot), 4500);
      }
      return { ok: true };
    } catch (e) { return { error: e.message }; }
  }

  // ── Auth helper — called after ANTIBOT clears ───────────────
  // Flow: ANTIBOT clear → wait for captcha (manual) → /register only
  // Bot stays frozen until captcha is submitted via UI, then registers.
  _doAuth(id, bot) {
    if (!this.bots[id] || !this.meta[id]) return;
    if (this.meta[id].antiBotLocked) {
      this._log(id, '_doAuth skipped — still locked');
      return;
    }
    // Don't send anything yet — wait for captcha to be solved manually
    this.meta[id].status = 'waiting for captcha';
    this.meta[id].captchaPending = true;
    this._log(id, 'ANTIBOT cleared — bot frozen, waiting for captcha solve via UI');
  }

  // Called by runCommand when captcha answer is submitted
  // After captcha answer is sent, send /register — no /login
  _register(id, bot) {
    if (!this.bots[id] || !this.meta[id]) return;
    if (this.meta[id].registered) {
      this._log(id, 'Already registered — no action');
      return;
    }
    this.meta[id].status = 'registering';
    this.meta[id].captchaPending = false;
    try { bot.chat(`/register ${BOT_PASSWORD} ${BOT_PASSWORD}`); } catch (_) {}
    this._log(id, 'Sent /register — done, no /login');
    this.meta[id].registered = true;
  }

  getCaptchaImage(id) {
    if (!this.meta[id]) return { error: 'Bot not found' };
    return { image: this.meta[id].captchaImage || null };
  }

  // ── Getters ───────────────────────────────────────────────────
  getAccounts() {
    return Object.entries(this.accounts).map(([id, a]) => ({
      id,
      username:      a.username,
      password:      a.password,
      created:       new Date(a.created).toISOString(),
      online:        !!this.bots[id],
      status:        this.meta[id]?.status || 'unknown',
      reconnects:    this.meta[id]?.reconnects || 0,
      captchaImage:  this.meta[id]?.captchaImage || null,
      antiBotLocked: this.meta[id]?.antiBotLocked || false,
      uptime:        Math.floor((Date.now() - (this.meta[id]?.created || Date.now())) / 1000),
    }));
  }

  getStatus() {
    return Object.entries(this.meta).map(([id, m]) => ({
      id,
      username:   m.username,
      status:     m.status,
      uptime:     Math.floor((Date.now() - m.created) / 1000),
      reconnects: m.reconnects,
      online:     !!this.bots[id],
      registered: m.registered,
      proxy:      m.proxy ? `${m.proxy.host}:${m.proxy.port}` : 'direct',
    }));
  }

  getProxyStats() {
    if (this.staticProxy) {
      return { enabled: true, mode: 'static', host: this.staticProxy.host, port: this.staticProxy.port, pool: 1, total: 1, residential: 0, failed: 0 };
    }
    if (!this.proxyManager) return { enabled: false };
    return { enabled: true, mode: 'webshare', ...this.proxyManager.getStats() };
  }

  getLogs(id) {
    if (!this.meta[id]) return { error: 'Not found' };
    return { id, logs: this.logs[id].slice(-150) };
  }

  // ── Control ───────────────────────────────────────────────────
  killBot(id) {
    if (!this.meta[id]) return { error: 'Not found' };
    this.meta[id].autoRejoin = false;
    clearTimeout(this.timers[id]);
    if (this.bots[id]) { try { this.bots[id].quit(); } catch (_) {} }
    this._cleanup(id);
    this.meta[id].status = 'killed';
    return { success: true };
  }

  killAll() {
    Object.keys(this.meta).forEach(id => {
      this.meta[id].autoRejoin = false;
      clearTimeout(this.timers[id]);
      if (this.bots[id]) { try { this.bots[id].quit(); } catch (_) {} }
      this._cleanup(id);
      this.meta[id].status = 'killed';
    });
  }

  sendChat(id, message) {
    if (!this.bots[id]) return { error: 'Bot not online' };
    if (!message) return { error: 'message required' };
    this.bots[id].chat(message);
    return { success: true };
  }

  // ── Internal ──────────────────────────────────────────────────
  _scheduleReconnect(id) {
    if (!this.meta[id]) return;
    const delay = Math.min(5000 * Math.pow(1.5, this.meta[id].reconnects), 60000);
    this.meta[id].reconnects++;
    this.meta[id].captchaPending = false;
    this.meta[id].status = `reconnecting (${Math.round(delay / 1000)}s)`;
    this._log(id, `Reconnecting in ${Math.round(delay / 1000)}s`);
    this.timers[id] = setTimeout(() => this._spawnBot(id), delay);
  }

  _randomDelay() { return Math.floor(Math.random() * 5000) + 6000; }

  _cleanup(id) { delete this.bots[id]; }

  _log(id, msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(`[${id}] ${msg}`);
    if (!this.logs[id]) this.logs[id] = [];
    this.logs[id].push(line);
    if (this.logs[id].length > 500) this.logs[id].shift();
  }
}

module.exports = BotManager;

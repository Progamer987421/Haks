require('dotenv').config();

// Prevent crashes from unhandled async errors
process.on('unhandledRejection', (reason) => {
  console.error('[UNCAUGHT] Unhandled rejection:', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT] Exception:', err.message);
});

const express      = require('express');
const BotManager   = require('./botManager');
const ProxyManager = require('./proxyManager');

const app     = express();
const PORT    = process.env.PORT || 3000;
const manager = new BotManager();

app.use(express.json());
app.use(express.static('public'));

// ── Auth middleware ───────────────────────────────────────────────
const auth = (req, res, next) => {
  const key = req.headers['x-admin-key'] || req.query.key;
  if (process.env.ADMIN_KEY && key !== process.env.ADMIN_KEY)
    return res.status(401).json({ error: 'Unauthorized' });
  next();
};

// ── Bot routes ────────────────────────────────────────────────────
app.get('/status',        auth, (req, res) => res.json(manager.getStatus()));
app.get('/accounts',      auth, (req, res) => res.json(manager.getAccounts()));

app.post('/bot/create',   auth, (req, res) => res.json(manager.createBots(req.body.count || 1)));
app.post('/killall',      auth, (req, res) => { manager.killAll(); res.json({ success: true }); });

app.post('/bot/:id/kill', auth, (req, res) => res.json(manager.killBot(req.params.id)));
app.post('/bot/:id/chat', auth, (req, res) => res.json(manager.sendChat(req.params.id, req.body.message)));
app.get('/bot/:id/logs',  auth, (req, res) => res.json(manager.getLogs(req.params.id)));

app.post('/bot/:id/cmd',  auth, async (req, res) => {
  if (!req.body.cmd) return res.status(400).json({ error: 'cmd required' });
  try {
    const result = await manager.runCommand(req.params.id, req.body.cmd);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/bot/:id/captcha', auth, (req, res) => res.json(manager.getCaptchaImage(req.params.id)));

// ── Proxy routes ──────────────────────────────────────────────────
app.post('/proxy/init', auth, async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) return res.status(400).json({ error: 'apiKey required' });
  try {
    const pm = new ProxyManager(apiKey);
    await pm.init();
    manager.proxyManager = pm;
    manager._proxyReady  = Promise.resolve();
    res.json({ ok: true, pool: pm.count() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/proxy/custom', auth, (req, res) => {
  const { proxy } = req.body;
  if (proxy === undefined) return res.status(400).json({ error: 'proxy required' });
  const result = manager.setStaticProxy(proxy || null);
  res.json(result);
});

app.get('/proxy/stats', auth, (req, res) => res.json(manager.getProxyStats()));

// ── Health ────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.send('OK'));
app.get('/',       (_, res) => res.sendFile(__dirname + '/public/index.html'));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  AppleMC Bot Manager`);
  console.log(`  Port: ${PORT}`);
  console.log(`  Railway URL: check your Railway dashboard\n`);
});

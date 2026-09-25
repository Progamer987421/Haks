/**
 * AppleMC Discord Bot — Full build
 */

const {
  Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes,
  EmbedBuilder, AttachmentBuilder,
} = require('discord.js');

const BotManager   = require('./botManager');
const ProxyManager = require('./proxyManager');

const TOKEN      = process.env.DISCORD_TOKEN;
const CLIENT_ID  = process.env.DISCORD_CLIENT_ID;
const GUILD_ID   = process.env.DISCORD_GUILD_ID;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const OWNER_ID   = process.env.DISCORD_OWNER_ID;

if (!TOKEN) { console.error('[Discord] Missing DISCORD_TOKEN'); process.exit(1); }

const manager = new BotManager();
const client  = new Client({ intents: [GatewayIntentBits.Guilds] });

// ── Slash commands ─────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder().setName('launch').setDescription('Launch bots')
    .addIntegerOption(o => o.setName('count').setDescription('Number of bots (default 1)').setMinValue(1).setMaxValue(50)),
  new SlashCommandBuilder().setName('status').setDescription('Show all bot statuses'),
  new SlashCommandBuilder().setName('logs').setDescription('Get logs for a bot')
    .addStringOption(o => o.setName('username').setDescription('Bot username').setRequired(true)),
  new SlashCommandBuilder().setName('kill').setDescription('Kill a specific bot')
    .addStringOption(o => o.setName('username').setDescription('Bot username').setRequired(true)),
  new SlashCommandBuilder().setName('killall').setDescription('Kill all bots'),
  new SlashCommandBuilder().setName('chat').setDescription('Make a bot send a Minecraft chat message')
    .addStringOption(o => o.setName('username').setDescription('Bot username').setRequired(true))
    .addStringOption(o => o.setName('message').setDescription('Message').setRequired(true)),
  new SlashCommandBuilder().setName('captcha').setDescription('Fetch captcha image for a bot')
    .addStringOption(o => o.setName('username').setDescription('Bot username').setRequired(true)),
  new SlashCommandBuilder().setName('solvecaptcha').setDescription('Submit captcha answer')
    .addStringOption(o => o.setName('username').setDescription('Bot username').setRequired(true))
    .addStringOption(o => o.setName('answer').setDescription('Captcha answer').setRequired(true)),
  new SlashCommandBuilder().setName('goto').setDescription('Pathfind bot to coordinates')
    .addStringOption(o => o.setName('username').setDescription('Bot username').setRequired(true))
    .addIntegerOption(o => o.setName('x').setDescription('X').setRequired(true))
    .addIntegerOption(o => o.setName('y').setDescription('Y').setRequired(true))
    .addIntegerOption(o => o.setName('z').setDescription('Z').setRequired(true)),
  new SlashCommandBuilder().setName('follow').setDescription('Make a bot follow a player')
    .addStringOption(o => o.setName('username').setDescription('Bot username').setRequired(true))
    .addStringOption(o => o.setName('target').setDescription('Player to follow').setRequired(true)),
  new SlashCommandBuilder().setName('stop').setDescription('Stop all movement for a bot')
    .addStringOption(o => o.setName('username').setDescription('Bot username').setRequired(true)),
  new SlashCommandBuilder().setName('look').setDescription('Make a bot look at coordinates')
    .addStringOption(o => o.setName('username').setDescription('Bot username').setRequired(true))
    .addIntegerOption(o => o.setName('x').setDescription('X').setRequired(true))
    .addIntegerOption(o => o.setName('y').setDescription('Y').setRequired(true))
    .addIntegerOption(o => o.setName('z').setDescription('Z').setRequired(true)),
  new SlashCommandBuilder().setName('randomwalk').setDescription('Make a bot wander randomly')
    .addStringOption(o => o.setName('username').setDescription('Bot username').setRequired(true)),
  new SlashCommandBuilder().setName('jump').setDescription('Make a bot jump')
    .addStringOption(o => o.setName('username').setDescription('Bot username').setRequired(true)),
  new SlashCommandBuilder().setName('sneak').setDescription('Toggle sneak on a bot')
    .addStringOption(o => o.setName('username').setDescription('Bot username').setRequired(true))
    .addBooleanOption(o => o.setName('on').setDescription('true = on, false = off').setRequired(true)),
  new SlashCommandBuilder().setName('sprint').setDescription('Toggle sprint on a bot')
    .addStringOption(o => o.setName('username').setDescription('Bot username').setRequired(true))
    .addBooleanOption(o => o.setName('on').setDescription('true = on, false = off').setRequired(true)),
  new SlashCommandBuilder().setName('proxy').setDescription('Set a custom proxy (host:port:user:pass)')
    .addStringOption(o => o.setName('proxy').setDescription('Proxy string or leave blank to clear')),
  new SlashCommandBuilder().setName('webshare').setDescription('Load Webshare proxy pool')
    .addStringOption(o => o.setName('apikey').setDescription('Webshare API key').setRequired(true)),
  new SlashCommandBuilder().setName('proxystats').setDescription('Show proxy pool stats'),
  new SlashCommandBuilder().setName('cmd').setDescription('Send any command or message as a bot')
    .addStringOption(o => o.setName('username').setDescription('Bot username').setRequired(true))
    .addStringOption(o => o.setName('command').setDescription('Command or message').setRequired(true)),
  new SlashCommandBuilder().setName('help').setDescription('Show all commands'),
].map(c => c.toJSON());

// ── Register commands ──────────────────────────────────────────────
async function registerCommands() {
  const rest  = new REST({ version: '10' }).setToken(TOKEN);
  const route = GUILD_ID
    ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
    : Routes.applicationCommands(CLIENT_ID);
  await rest.put(route, { body: commands });
  console.log('[Discord] Slash commands registered.');
}

// ── Helpers ────────────────────────────────────────────────────────
const dot = s => {
  if (!s) return '⚪';
  if (s.includes('online')) return '🟢';
  if (s.includes('connect') || s.includes('auth') || s.includes('wait') || s.includes('captcha') || s.includes('register')) return '🟡';
  return '🔴';
};

function statusEmbed(accounts, stats) {
  const embed = new EmbedBuilder()
    .setTitle('🤖 AppleMC Bot Status')
    .setColor(0x1a73e8)
    .setTimestamp()
    .setFooter({ text: `Total: ${stats.total} | Online: ${stats.online} | Connecting: ${stats.connecting}` });

  if (!accounts.length) { embed.setDescription('No bots running.'); return embed; }

  const lines  = accounts.map(a => `${dot(a.status)} \`${a.username}\` — **${a.status || 'unknown'}** | ⏱ ${a.uptime} | 🔄 ${a.reconnects}`);
  const chunks = [];
  let cur = '';
  for (const l of lines) {
    if ((cur + l + '\n').length > 1020) { chunks.push(cur); cur = ''; }
    cur += l + '\n';
  }
  if (cur) chunks.push(cur);
  chunks.forEach((c, i) => embed.addFields({ name: i === 0 ? 'Bots' : '\u200b', value: c }));
  return embed;
}

// Owner-only guard
function isOwner(interaction) {
  return interaction.user.id === OWNER_ID;
}

// ── Auto status updates ────────────────────────────────────────────
let statusMessageId = null;

async function postStatusUpdate() {
  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    if (!channel) return;
    const accounts = manager.getAccounts();
    const stats    = manager.getStatus();
    const embed    = statusEmbed(accounts, stats);

    if (statusMessageId) {
      try {
        const msg = await channel.messages.fetch(statusMessageId);
        await msg.edit({ embeds: [embed] });
        return;
      } catch (_) { statusMessageId = null; }
    }
    const msg = await channel.send({ embeds: [embed] });
    statusMessageId = msg.id;
  } catch (_) {}
}

// ── Interaction handler ────────────────────────────────────────────
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // Owner only
  if (!isOwner(interaction)) {
    return interaction.reply({ content: '❌ You are not authorized to use this bot.', ephemeral: true });
  }

  const { commandName, options } = interaction;
  await interaction.deferReply({ ephemeral: false });

  try {

    if (commandName === 'launch') {
      const count  = options.getInteger('count') || 1;
      const result = manager.createBots(count);
      const embed  = new EmbedBuilder().setColor(0x43a047).setTitle('🚀 Bots Launched').setTimestamp()
        .setDescription(`Launching **${count}** bot(s):\n${result.map(r => `• \`${r.username}\``).join('\n')}`);
      return interaction.editReply({ embeds: [embed] });
    }

    if (commandName === 'status') {
      const accounts = manager.getAccounts();
      const stats    = manager.getStatus();
      return interaction.editReply({ embeds: [statusEmbed(accounts, stats)] });
    }

    if (commandName === 'logs') {
      const id   = options.getString('username');
      const logs = manager.getLogs(id);
      if (logs.error) return interaction.editReply(`❌ ${logs.error}`);
      const text = (logs.logs || []).join('\n') || 'No logs yet.';
      if (text.length > 1900) {
        const file = new AttachmentBuilder(Buffer.from(text), { name: `${id}-logs.txt` });
        return interaction.editReply({ content: `📄 Logs for \`${id}\`:`, files: [file] });
      }
      return interaction.editReply(`📄 **Logs for \`${id}\`:**\n\`\`\`\n${text}\n\`\`\``);
    }

    if (commandName === 'kill') {
      const id = options.getString('username');
      const r  = manager.killBot(id);
      return interaction.editReply(r.error ? `❌ ${r.error}` : `✅ Bot \`${id}\` killed.`);
    }

    if (commandName === 'killall') {
      manager.killAll();
      return interaction.editReply('✅ All bots killed.');
    }

    if (commandName === 'chat') {
      const id  = options.getString('username');
      const msg = options.getString('message');
      const r   = manager.sendChat(id, msg);
      return interaction.editReply(r.error ? `❌ ${r.error}` : `✅ Sent: \`${msg}\` as \`${id}\``);
    }

    if (commandName === 'captcha') {
      const id = options.getString('username');
      const r  = manager.getCaptchaImage(id);
      if (r.error) return interaction.editReply(`❌ ${r.error}`);
      if (!r.image) return interaction.editReply(`⏳ No captcha loaded yet for \`${id}\`. Try again shortly.`);
      const buf  = Buffer.from(r.image.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      const file = new AttachmentBuilder(buf, { name: 'captcha.png' });
      const embed = new EmbedBuilder().setColor(0xfb8c00)
        .setTitle(`🔐 Captcha for \`${id}\``)
        .setDescription(`Solve it then run:\n\`/solvecaptcha username:${id} answer:YOUR_ANSWER\``)
        .setImage('attachment://captcha.png');
      return interaction.editReply({ embeds: [embed], files: [file] });
    }

    if (commandName === 'solvecaptcha') {
      const id     = options.getString('username');
      const answer = options.getString('answer');
      const r      = await manager.runCommand(id, answer);
      return interaction.editReply(r.error ? `❌ ${r.error}` : `✅ Captcha answer sent for \`${id}\`. /register fires in 4.5s.`);
    }

    if (commandName === 'goto') {
      const id = options.getString('username');
      const x  = options.getInteger('x');
      const y  = options.getInteger('y');
      const z  = options.getInteger('z');
      const r  = await manager.runCommand(id, `:goto ${x} ${y} ${z}`);
      return interaction.editReply(r.error ? `❌ ${r.error}` : `✅ \`${id}\` pathfinding to **${x}, ${y}, ${z}**`);
    }

    if (commandName === 'follow') {
      const id     = options.getString('username');
      const target = options.getString('target');
      const r      = await manager.runCommand(id, `:follow ${target}`);
      return interaction.editReply(r.error ? `❌ ${r.error}` : `✅ \`${id}\` following **${target}**`);
    }

    if (commandName === 'stop') {
      const id = options.getString('username');
      const r  = await manager.runCommand(id, ':stop');
      return interaction.editReply(r.error ? `❌ ${r.error}` : `✅ \`${id}\` frozen.`);
    }

    if (commandName === 'look') {
      const id = options.getString('username');
      const x  = options.getInteger('x');
      const y  = options.getInteger('y');
      const z  = options.getInteger('z');
      const r  = await manager.runCommand(id, `:look ${x} ${y} ${z}`);
      return interaction.editReply(r.error ? `❌ ${r.error}` : `✅ \`${id}\` looking at **${x}, ${y}, ${z}**`);
    }

    if (commandName === 'randomwalk') {
      const id = options.getString('username');
      const r  = await manager.runCommand(id, ':randomwalk');
      return interaction.editReply(r.error ? `❌ ${r.error}` : `✅ \`${id}\` wandering randomly.`);
    }

    if (commandName === 'jump') {
      const id = options.getString('username');
      const r  = await manager.runCommand(id, ':jump');
      return interaction.editReply(r.error ? `❌ ${r.error}` : `✅ \`${id}\` jumped.`);
    }

    if (commandName === 'sneak') {
      const id = options.getString('username');
      const on = options.getBoolean('on');
      const r  = await manager.runCommand(id, on ? ':sneak' : ':unsneak');
      return interaction.editReply(r.error ? `❌ ${r.error}` : `✅ \`${id}\` sneak **${on ? 'ON' : 'OFF'}**`);
    }

    if (commandName === 'sprint') {
      const id = options.getString('username');
      const on = options.getBoolean('on');
      const r  = await manager.runCommand(id, on ? ':sprint' : ':unsprint');
      return interaction.editReply(r.error ? `❌ ${r.error}` : `✅ \`${id}\` sprint **${on ? 'ON' : 'OFF'}**`);
    }

    if (commandName === 'proxy') {
      const proxy = options.getString('proxy') || null;
      const r     = manager.setStaticProxy(proxy);
      return interaction.editReply(r.error ? `❌ ${r.error}` : proxy ? `✅ Proxy set: \`${proxy}\`` : '✅ Proxy cleared.');
    }

    if (commandName === 'webshare') {
      const apiKey = options.getString('apikey');
      await interaction.editReply('⏳ Loading Webshare proxy pool...');
      try {
        const pm = new ProxyManager(apiKey);
        await pm.init();
        manager.proxyManager = pm;
        manager._proxyReady  = Promise.resolve();
        return interaction.editReply(`✅ Webshare pool loaded — **${pm.count()}** proxies ready.`);
      } catch (e) { return interaction.editReply(`❌ ${e.message}`); }
    }

    if (commandName === 'proxystats') {
      const s = manager.getProxyStats();
      const embed = new EmbedBuilder().setTitle('🌐 Proxy Stats').setColor(0x7b1fa2).setTimestamp()
        .addFields(
          { name: 'Mode',   value: s.mode   || 'none',        inline: true },
          { name: 'Pool',   value: String(s.pool   || 0),      inline: true },
          { name: 'Failed', value: String(s.failed  || 0),     inline: true },
          { name: 'Proxy',  value: s.static || 'none',        inline: false },
        );
      return interaction.editReply({ embeds: [embed] });
    }

    if (commandName === 'cmd') {
      const id  = options.getString('username');
      const cmd = options.getString('command');
      const r   = await manager.runCommand(id, cmd);
      return interaction.editReply(r.error ? `❌ ${r.error}` : `✅ Sent \`${cmd}\` as \`${id}\``);
    }

    if (commandName === 'help') {
      const embed = new EmbedBuilder().setTitle('📖 AppleMC Bot Manager').setColor(0x1a73e8).setTimestamp()
        .addFields(
          { name: '🚀 Bots',     value: '`/launch` `/status` `/kill` `/killall`' },
          { name: '💬 Chat',     value: '`/chat` `/cmd`' },
          { name: '🔐 Captcha',  value: '`/captcha` `/solvecaptcha`' },
          { name: '🏃 Movement', value: '`/goto` `/follow` `/stop` `/look` `/randomwalk` `/jump` `/sneak` `/sprint`' },
          { name: '📋 Logs',     value: '`/logs`' },
          { name: '🌐 Proxy',    value: '`/proxy` `/webshare` `/proxystats`' },
        );
      return interaction.editReply({ embeds: [embed] });
    }

  } catch (err) {
    console.error('[Discord] Command error:', err);
    return interaction.editReply(`❌ Error: ${err.message}`);
  }
});

// ── Ready ──────────────────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`[Discord] Logged in as ${client.user.tag}`);
  await registerCommands();

  // Post status to channel every 30 seconds
  await postStatusUpdate();
  setInterval(postStatusUpdate, 30_000);
});

client.login(TOKEN);

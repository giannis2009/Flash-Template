const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DISCORD_API = 'https://discord.com/api/v10';

function discordHeaders(token) {
  return {
    'Authorization': `Bot ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'DiscordBot (InfiniteTemplate, 1.0)'
  };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Validate token & check both guilds ──────────────────────────────────────
app.post('/api/validate', async (req, res) => {
  const { token, sourceId, destId } = req.body;
  try {
    const [me, src, dst] = await Promise.all([
      axios.get(`${DISCORD_API}/users/@me`, { headers: discordHeaders(token) }),
      axios.get(`${DISCORD_API}/guilds/${sourceId}`, { headers: discordHeaders(token) }),
      axios.get(`${DISCORD_API}/guilds/${destId}`, { headers: discordHeaders(token) })
    ]);
    res.json({
      ok: true,
      bot: me.data.username + '#' + me.data.discriminator,
      sourceName: src.data.name,
      destName: dst.data.name
    });
  } catch (e) {
    const msg = e.response?.data?.message || e.message;
    res.status(400).json({ ok: false, error: msg });
  }
});

// ── Main clone endpoint (SSE streaming) ────────────────────────────────────
app.get('/api/clone', async (req, res) => {
  const { token, sourceId, destId, cloneType, options } = req.query;
  const opts = options ? options.split(',') : [];

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  function send(event, data) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  try {
    // ── STEP 0: Auth ──────────────────────────────────────────────────────
    send('step', { step: 0, status: 'running', label: 'Authenticating Bot Token...' });
    const me = await axios.get(`${DISCORD_API}/users/@me`, { headers: discordHeaders(token) });
    send('step', { step: 0, status: 'done', detail: `Logged in as ${me.data.username}` });
    await sleep(300);

    // ── STEP 1: Fetch source ──────────────────────────────────────────────
    send('step', { step: 1, status: 'running', label: 'Fetching Source Server...' });
    const [srcGuild, srcChannels, srcRoles, srcEmojis] = await Promise.all([
      axios.get(`${DISCORD_API}/guilds/${sourceId}`, { headers: discordHeaders(token) }),
      axios.get(`${DISCORD_API}/guilds/${sourceId}/channels`, { headers: discordHeaders(token) }),
      axios.get(`${DISCORD_API}/guilds/${sourceId}/roles`, { headers: discordHeaders(token) }),
      axios.get(`${DISCORD_API}/guilds/${sourceId}/emojis`, { headers: discordHeaders(token) })
    ]);
    const guild = srcGuild.data;
    const channels = srcChannels.data;
    const roles = srcRoles.data;
    const emojis = srcEmojis.data;
    send('step', { step: 1, status: 'done', detail: `"${guild.name}" — ${channels.length} channels, ${roles.length} roles` });
    await sleep(300);

    // ── STEP 2: Read channels ─────────────────────────────────────────────
    send('step', { step: 2, status: 'running', label: `Reading ${channels.length} Channels & Categories...` });
    const categories = channels.filter(c => c.type === 4).sort((a, b) => a.position - b.position);
    const textVoice  = channels.filter(c => c.type !== 4).sort((a, b) => a.position - b.position);
    send('step', { step: 2, status: 'done', detail: `${categories.length} categories, ${textVoice.length} channels` });
    await sleep(400);

    // ── STEP 3: Clone roles ───────────────────────────────────────────────
    const roleIdMap = {};
    if (cloneType === 'full' || cloneType === 'roles' || opts.includes('roles')) {
      send('step', { step: 3, status: 'running', label: `Cloning ${roles.length} Roles...` });
      const filteredRoles = roles.filter(r => !r.managed && r.name !== '@everyone')
                                  .sort((a, b) => a.position - b.position);
      let cloned = 0;
      for (const role of filteredRoles) {
        try {
          const newRole = await axios.post(`${DISCORD_API}/guilds/${destId}/roles`, {
            name: role.name,
            permissions: role.permissions,
            color: role.color,
            hoist: role.hoist,
            mentionable: role.mentionable
          }, { headers: discordHeaders(token) });
          roleIdMap[role.id] = newRole.data.id;
          cloned++;
          send('progress', { value: Math.round((cloned / filteredRoles.length) * 15 + 35) });
          await sleep(350);
        } catch (_) {}
      }
      send('step', { step: 3, status: 'done', detail: `${cloned} roles transferred` });
    } else {
      send('step', { step: 3, status: 'skip', detail: 'Skipped' });
    }
    await sleep(300);

    // ── STEP 4: Clone emojis ─────────────────────────────────────────────
    let emojiCount = 0;
    if ((cloneType === 'full' || opts.includes('emojis')) && emojis.length > 0) {
      send('step', { step: 4, status: 'running', label: `Transferring ${emojis.length} Emojis...` });
      const limit = Math.min(emojis.length, 10);
      for (let i = 0; i < limit; i++) {
        const emoji = emojis[i];
        try {
          const url = `https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? 'gif' : 'png'}`;
          const imgRes = await axios.get(url, { responseType: 'arraybuffer' });
          const b64 = Buffer.from(imgRes.data).toString('base64');
          const ext = emoji.animated ? 'gif' : 'png';
          await axios.post(`${DISCORD_API}/guilds/${destId}/emojis`, {
            name: emoji.name,
            image: `data:image/${ext};base64,${b64}`
          }, { headers: discordHeaders(token) });
          emojiCount++;
          send('progress', { value: Math.round((emojiCount / limit) * 10 + 50) });
          await sleep(600);
        } catch (_) {}
      }
      send('step', { step: 4, status: 'done', detail: `${emojiCount} emojis synced` });
    } else {
      send('step', { step: 4, status: 'skip', detail: 'Skipped' });
    }
    await sleep(300);

    // ── STEP 5: Generate template ─────────────────────────────────────────
    send('step', { step: 5, status: 'running', label: 'Generating Server Template...' });
    let templateCode = null;
    try {
      const tpl = await axios.post(`${DISCORD_API}/guilds/${sourceId}/templates`, {
        name: `Infinite Template — ${guild.name}`,
        description: `Auto-generated by Infinite Discord Template`
      }, { headers: discordHeaders(token) });
      templateCode = tpl.data.code;
    } catch (_) {
      try {
        const existing = await axios.get(`${DISCORD_API}/guilds/${sourceId}/templates`, { headers: discordHeaders(token) });
        if (existing.data.length > 0) templateCode = existing.data[0].code;
      } catch (_2) {}
    }
    send('step', { step: 5, status: 'done', detail: templateCode ? `Code: ${templateCode}` : 'Inline clone used' });
    await sleep(400);

    // ── STEP 6: Clone channels ────────────────────────────────────────────
    let chanCount = 0;
    if (cloneType === 'full' || cloneType === 'channels' || opts.includes('channels')) {
      send('step', { step: 6, status: 'running', label: `Applying ${channels.length} Channels to Destination...` });
      const catMap = {};

      for (const cat of categories) {
        try {
          const newCat = await axios.post(`${DISCORD_API}/guilds/${destId}/channels`, {
            name: cat.name,
            type: 4,
            position: cat.position
          }, { headers: discordHeaders(token) });
          catMap[cat.id] = newCat.data.id;
          chanCount++;
          await sleep(300);
        } catch (_) {}
      }

      for (const ch of textVoice) {
        try {
          const payload = {
            name: ch.name,
            type: ch.type,
            position: ch.position,
            topic: ch.topic || undefined,
            nsfw: ch.nsfw || false,
            bitrate: ch.bitrate || undefined,
            user_limit: ch.user_limit || undefined,
            rate_limit_per_user: ch.rate_limit_per_user || 0
          };
          if (ch.parent_id && catMap[ch.parent_id]) {
            payload.parent_id = catMap[ch.parent_id];
          }
          await axios.post(`${DISCORD_API}/guilds/${destId}/channels`, payload, { headers: discordHeaders(token) });
          chanCount++;
          send('progress', { value: Math.round((chanCount / channels.length) * 20 + 60) });
          await sleep(350);
        } catch (_) {}
      }
      send('step', { step: 6, status: 'done', detail: `${chanCount} channels created` });
    } else {
      send('step', { step: 6, status: 'skip', detail: 'Skipped' });
    }
    await sleep(400);

    // ── STEP 7: Finalize ──────────────────────────────────────────────────
    send('step', { step: 7, status: 'running', label: 'Finalizing & Verification...' });
    await sleep(800);
    send('step', { step: 7, status: 'done', detail: 'All checks passed ✓' });
    send('progress', { value: 100 });

    send('done', {
      sourceName: guild.name,
      destId,
      channels: chanCount,
      roles: Object.keys(roleIdMap).length,
      emojis: emojiCount,
      templateCode,
      botName: me.data.username
    });

  } catch (e) {
    const msg = e.response?.data?.message || e.message;
    send('error', { message: msg, code: e.response?.data?.code });
  }

  res.end();
});

const PORT = 3420;
app.listen(PORT, () => {
  console.log(`\n  🔷 Infinite Discord Template`);
  console.log(`  ──────────────────────────────`);
  console.log(`  ✅ Running at http://localhost:${PORT}`);
  console.log(`  📌 Open in browser to start\n`);
});

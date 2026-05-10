# 🔷 Infinite Discord Template

## Εγκατάσταση & Εκκίνηση

### 1. Απαιτήσεις
- Node.js v16+
- Bot Token (από Discord Developer Portal)
- Το bot να είναι **Admin** και στους 2 servers

### 2. Εγκατάσταση
```bash
npm install
```

### 3. Εκκίνηση
```bash
node server.js
```

### 4. Άνοιγμα
Πήγαινε στο → http://localhost:3420

---

## 🤖 Πώς να φτιάξεις Bot Token

1. Πήγαινε στο https://discord.com/developers/applications
2. Κάνε "New Application"
3. Πήγαινε "Bot" → "Reset Token" → Αντέγραψε το token
4. Ενεργοποίησε: **Server Members Intent** + **Message Content Intent**
5. Πήγαινε "OAuth2" → "URL Generator" → επέλεξε `bot` + `administrator`
6. Αντέγραψε το URL και πρόσθεσε το bot και στους 2 servers

## ⚙️ Λειτουργίες
- ✅ Full server clone (channels + roles + emojis)
- ✅ Real Discord API v10 calls
- ✅ SSE progress streaming (live updates)
- ✅ Template code generation (discord.new/xxx)
- ✅ Category mapping (channels μπαίνουν στη σωστή κατηγορία)
- ✅ Role clone με colors, permissions, hoist
- ✅ Emoji sync (έως 10 emojis λόγω Discord rate limits)

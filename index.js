require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();

function parseTargets() {
  const raw = process.env.TARGET_WORD || "";
  return raw
    .split(",")
    .map(w => w.trim().toLowerCase())
    .filter(Boolean);
}

const targetWords = parseTargets();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const db = new sqlite3.Database('./wordcount.db');

db.run(`
  CREATE TABLE IF NOT EXISTS counts (
    userId TEXT,
    username TEXT,
    word TEXT,
    count INTEGER DEFAULT 0,
    PRIMARY KEY (userId, word)
  )
`);

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log("Targets:", targetWords);
});

function incrementCount(userId, username, word) {
  db.run(
    `
    INSERT INTO counts (userId, username, word, count)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(userId, word)
    DO UPDATE SET count = count + 1, username = ?
    `,
    [userId, username, word, username]
  );
}

// Heuristic rule:
// - counts if the word STARTS with the target (bru -> bruhwhat counts)
// - but tries to avoid common “real word” continuations like bru + sh = brush
function shouldCount(fullWord, target) {
  if (!fullWord || !target) return false;
  if (!fullWord.startsWith(target)) return false;

  const remainder = fullWord.slice(target.length);
  if (!remainder) return true; // exact match

  // Block some common “real word” continuations for short targets (bru + sh = brush)
  // You can add more endings here if you find false positives.
  const blockedRemainders = new Set(["ht", "eria", "hness", "ella", "gled", "garded", "gled", "hed", "ra", "hty", "iri", "ras", "re"]);
  if (blockedRemainders.has(remainder)) return false;

  // Your previous “vowel remainder” rule (keeps it simple):
  if (/^[aeiou]/.test(remainder)) return false;

  return true;
}

function extractWords(text) {
  return (text || "")
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.replace(/[^a-z]/g, ""))
    .filter(Boolean);
}

client.on("messageCreate", async (message) => {
  if (!message.guild) return;
  if (message.author.bot) return;

  const content = message.content || "";

  // Count targets in normal messages
  const wordsInMessage = extractWords(content);
  for (const fullWord of wordsInMessage) {
    for (const target of targetWords) {
      if (shouldCount(fullWord, target)) {
        incrementCount(message.author.id, message.author.username, target);
      }
    }
  }

  // Commands
  if (content.startsWith("!count")) {
    const args = content.split(" ");
    const targetWord = (args[1] || "").toLowerCase();

    if (targetWord) {
      db.get(
        "SELECT count FROM counts WHERE userId = ? AND word = ?",
        [message.author.id, targetWord],
        (err, row) => {
          const count = row ? row.count : 0;
          message.reply(`You have said "${targetWord}" ${count} times.`);
        }
      );
    } else {
      db.get(
        "SELECT SUM(count) as total FROM counts WHERE userId = ?",
        [message.author.id],
        (err, row) => {
          const total = row && row.total ? row.total : 0;
          message.reply(`You have said the NWORD ${total} times.`);
        }
      );
    }
  }

  if (content.startsWith("!leaderboard")) {
    const args = content.split(" ");
    const targetWord = (args[1] || "").toLowerCase();

    if (targetWord) {
      db.all(
        "SELECT username, count FROM counts WHERE word = ? ORDER BY count DESC LIMIT 10",
        [targetWord],
        (err, rows) => {
          if (!rows || !rows.length) return message.reply(`No data yet for "${targetWord}".`);
          let reply = `**Leaderboard for "${targetWord}"**\n`;
          rows.forEach((row, index) => {
            reply += `${index + 1}. ${row.username} - ${row.count}\n`;
          });
          message.reply(reply);
        }
      );
    } else {
      db.all(
        `SELECT username, SUM(count) as total
         FROM counts
         GROUP BY userId
         ORDER BY total DESC
         LIMIT 10`,
        [],
        (err, rows) => {
          if (!rows || !rows.length) return message.reply("No data yet.");
          let reply = `**nga leaderboard**\n`;
          rows.forEach((row, index) => {
            reply += `${index + 1}. ${row.username} - ${row.total}\n`;
          });
          message.reply(reply);
        }
      );
    }
  }

  if (content === "!backfill") {
    message.reply("Starting full server backfill...");
    await backfillAllChannels(message.guild);
    message.reply("Backfill complete.");
  }
});

async function backfillAllChannels(guild) {
  const words = parseTargets();

  const channels = guild.channels.cache.filter(ch => ch.isTextBased());

  for (const channel of channels.values()) {
    let lastId;

    while (true) {
      const options = { limit: 100 };
      if (lastId) options.before = lastId;

      const messages = await channel.messages.fetch(options);
      if (messages.size === 0) break;

      messages.forEach(msg => {
        if (msg.author.bot) return;

        const wordsInMsg = extractWords(msg.content);
        for (const fullWord of wordsInMsg) {
          for (const target of words) {
            if (shouldCount(fullWord, target)) {
              incrementCount(msg.author.id, msg.author.username, target);
            }
          }
        }
      });

      lastId = messages.last().id;
    }
  }
}

client.login(process.env.TOKEN)
  .then(() => console.log("Bot logged in!"))
  .catch(err => console.error("Login failed:", err));

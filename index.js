const fs = require("fs");
const wordListPath = require("word-list");
const englishWords = new Set(
  fs.readFileSync(wordListPath, "utf8").split("\n")
);
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const token = process.env.TOKEN;
const targetWords = process.env.TARGET_WORD;


const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
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
});

function incrementCount(userId, username, word) {
    db.run(`
        INSERT INTO counts (userId, username, word, count)
        VALUES (?, ?, ?, 1)
        ON CONFLICT(userId, word)
        DO UPDATE SET count = count + 1, username = ?
    `, [userId, username, word, username]);
}


client.on("messageCreate", async message => {
  if (message.author.bot) return;

  const wordsInMessage = message.content
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.replace(/[^a-z]/g, "")); // remove punctuation

  wordsInMessage.forEach(fullWord => {

    if (!fullWord) return;

    targetWords.forEach(target => {

      if (fullWord.includes(target)) {

        const isRealWord = englishWords.has(fullWord);

        if (!isRealWord) {
          // Count it
          console.log(`Counted: ${fullWord} (contains ${target})`);
          // increment database here
        }

      }

    });

  });
});


    // Commands
    if (content.startsWith("!count")) {
    const args = content.split(" ");
    const targetWord = args[1];

    // If specific word provided
    if (targetWord) {
        db.get(
            "SELECT count FROM counts WHERE userId = ? AND word = ?",
            [message.author.id, targetWord],
            (err, row) => {
                const count = row ? row.count : 0;
                message.reply(`You have said "${targetWord}" ${count} times.`);
            }
        );
    } 
    // If no word provided → combine all
    else {
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
    const targetWord = args[1];

    // If specific word provided
    if (targetWord) {
        db.all(
            "SELECT username, count FROM counts WHERE word = ? ORDER BY count DESC LIMIT 10",
            [targetWord],
            (err, rows) => {
                if (!rows.length) {
                    return message.reply(`No data yet for "${targetWord}".`);
                }

                let reply = `**Leaderboard for "${targetWord}"**\n`;
                rows.forEach((row, index) => {
                    reply += `${index + 1}. ${row.username} - ${row.count}\n`;
                });

                message.reply(reply);
            }
        );
    } 
    // If no word provided → combined leaderboard
    else {
        db.all(
            `SELECT username, SUM(count) as total 
             FROM counts 
             GROUP BY userId 
             ORDER BY total DESC 
             LIMIT 10`,
            [],
            (err, rows) => {
                if (!rows.length) {
                    return message.reply("No data yet.");
                }

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
    const words = process.env.TARGET_WORD
        .split(',')
        .map(w => w.trim().toLowerCase());

    const channels = guild.channels.cache.filter(
        ch => ch.isTextBased()
    );

    for (const channel of channels.values()) {
        let lastId;

        while (true) {
            const options = { limit: 100 };
            if (lastId) options.before = lastId;

            const messages = await channel.messages.fetch(options);
            if (messages.size === 0) break;

            messages.forEach(msg => {
                if (msg.author.bot) return;

                const content = msg.content.toLowerCase();

                words.forEach(word => {
                    if (content.includes(word)) {
                        incrementCount(msg.author.id, msg.author.username, word);
                    }
                });
            });

            lastId = messages.last().id;
        }
    }
}


require('dotenv').config(); // optional; only for local dev

client.login(process.env.TOKEN)
  .then(() => console.log("Bot logged in!"))
  .catch(err => console.error("Login failed:", err));


const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('✅ লারা মিউজিক বট সফলভাবে রান করছে!');
});

app.listen(port, () => {
  console.log(`Web server is running on port ${port}`);
});

// এর নিচ থেকে আপনার বটের বাকি কোড (Client, play-dl ইত্যাদি) শুরু হবে... { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const play = require('play-dl');
require('dotenv').config();

// বটের ইন্টেন্ট বা পারমিশন সেটআপ
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const PREFIX = '!'; // বটের প্রিফিক্স

client.once('ready', () => {
    console.log(`✅ ${client.user.tag} হিসেবে বট অনলাইন হয়েছে!`);
});

client.on('messageCreate', async (message) => {
    // মেসেজটি বট থেকে আসলে বা প্রিফিক্স না থাকলে স্কিপ করবে
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // ১. প্লে কমান্ড (!play <গানের নাম বা লিংক>)
    if (command === 'play') {
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) {
            return message.reply('❌ গান শোনার জন্য আগে আপনাকে একটি ভয়েস চ্যানেলে জয়েন করতে হবে!');
        }

        const songName = args.join(' ');
        if (!songName) {
            return message.reply('❌ দয়া করে গানের নাম বা ইউটিউব লিংক দিন। যেমন: `!play fariha` ');
        }

        await message.channel.send(`🔍 **"${songName}"** গানটি খোঁজা হচ্ছে...`);

        try {
            // ইউটিউব থেকে গান সার্চ করা
            const yt_info = await play.search(songName, { limit: 1 });
            if (!yt_info.length) return message.reply('❌ কোনো গান খুঁজে পাওয়া যায়নি!');

            const stream = await play.stream(yt_info[0].url);
            
            // ভয়েস চ্যানেলে কানেক্ট করা
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: message.guild.id,
                adapterCreator: message.guild.voiceAdapterCreator,
            });

            // অডিও প্লেয়ার তৈরি ও প্লে করা
            const player = createAudioPlayer();
            const resource = createAudioResource(stream.stream, { inputType: stream.type });

            player.play(resource);
            connection.subscribe(player);

            await message.channel.send(`🎶 এখন প্লে হচ্ছে: **${yt_info[0].title}**`);

            // গান শেষ হলে চ্যানেল ধরে রাখা বা লিভ করা
            player.on(AudioPlayerStatus.Idle, () => {
                connection.destroy();
            });

        } catch (error) {
            console.error(error);
            message.reply('❌ গানটি প্লে করার সময় একটি সমস্যা হয়েছে!');
        }
    }

    // ২. স্টপ কমান্ড (!stop)
    if (command === 'stop') {
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) return message.reply('❌ আপনাকে ভয়েস চ্যানেলে থাকতে হবে!');
        
        const { getVoiceConnection } = require('@discordjs/voice');
        const connection = getVoiceConnection(message.guild.id);

        if (connection) {
            connection.destroy();
            return message.reply('🛑 গান বন্ধ করা হয়েছে এবং বট চ্যানেল থেকে বিদায় নিয়েছে!');
        } else {
            return message.reply('❌ বট এখন কোনো ভয়েস চ্যানেলে নেই!');
        }
    }
});

// আপনার বটের টোকেন দিয়ে লগইন করা
client.login(process.env.DISCORD_TOKEN);

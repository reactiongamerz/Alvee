// ১. রেন্ডার হোস্টিংয়ের পোর্ট এরর ফিক্স করার জন্য এক্সপ্রেস সার্ভার
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('✅ লারা মিউজিক বট ২৪ ঘন্টা সফলভাবে রান করছে!');
});

app.listen(port, () => {
  console.log(`Web server is running on port ${port}`);
});

// ২. বটের মূল মডিউলগুলো ইমপোর্ট করা
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const play = require('play-dl');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const PREFIX = '!';
const TOKEN = process.env.DISCORD_TOKEN;
const queues = new Map(); // প্রতিটি সার্ভারের গান জমানোর জন্য কিউ ম্যাপ

// ৩. স্ল্যাশ কমান্ডগুলো রেজিস্টার করার জন্য তালিকা
const commands = [
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('ইউটিউব থেকে গান প্লে করুন')
        .addStringOption(option => option.setName('song').setDescription('গানের নাম বা লিংক').setRequired(true)),
    new SlashCommandBuilder().setName('skip').setDescription('চলতি গানটি স্কিপ করুন'),
    new SlashCommandBuilder().setName('stop').setDescription('সব গান বন্ধ করে বট লিভ করান'),
    new SlashCommandBuilder().setName('queue').setDescription('গানের সিরিয়াল বা তালিকা দেখুন'),
    new SlashCommandBuilder().setName('pause').setDescription('গান সাময়িক থামিয়ে রাখুন'),
    new SlashCommandBuilder().setName('resume').setDescription('থামানো গান আবার চালু করুন'),
    new SlashCommandBuilder().setName('loop').setDescription('একই গান বারবার বাজানো অন/অফ করুন'),
    new SlashCommandBuilder().setName('ping').setDescription('বটের লেটেন্সি চেক করুন')
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`✅ ${client.user.tag} হিসেবে লারা মিউজিক বট অনলাইন!`);
    
    // মোবাইল বা রেন্ডার হোস্টিংয়ে ইউটিউব ব্লকিং এড়ানোর জন্য টোকেন সেটআপ
    try {
        await play.setToken({
            youtube: {
                cookie: "" 
            }
        });
        console.log('Play-dl token sets successfully.');
    } catch (e) {
        console.error('Play-dl token error:', e);
    }
    
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Successfully registered Lara bot application commands.');
    } catch (error) {
        console.error(error);
    }
});

// ৪. গান প্লে করার মেইন ফাংশন (Queue, Loop ও ইউটিউব স্ট্রিম হ্যান্ডেলার)
async function playSong(guildId, song) {
    const serverQueue = queues.get(guildId);
    if (!song) {
        if (serverQueue && serverQueue.connection) {
            serverQueue.connection.destroy();
        }
        queues.delete(guildId);
        return;
    }

    try {
        // ইউটিউব থেকে অডিও স্ট্রিম নেওয়ার ব্যাকআপ মেথডসহ সেটআপ
        const stream = await play.stream(song.url, { seek: 0, quality: 0 }).catch(async (err) => {
            console.log("Stream error, retrying with search...");
            const nextSearch = await play.search(song.title, { limit: 1 });
            return await play.stream(nextSearch.url);
        });

        const resource = createAudioResource(stream.stream, { inputType: stream.type });
        
        serverQueue.player.play(resource);
        
        // লারা বটের মতো সুন্দর মেসেজ বক্স (Embed)
        const embed = new EmbedBuilder()
            .setColor('#00ffcc')
            .setDescription(`🎶 এখন প্লে হচ্ছে: **[${song.title}](${song.url})**`);
        
        serverQueue.textChannel.send({ embeds: [embed] });
    } catch (error) {
        console.error("PlaySong Error:", error);
        serverQueue.textChannel.send('❌ ইউটিউব থেকে গানটি লোড করা যায়নি। পরের গানটি চেষ্টা করা হচ্ছে...');
        serverQueue.songs.shift();
        if (serverQueue.songs.length > 0) {
            playSong(guildId, serverQueue.songs);
        } else {
            if (serverQueue.connection) serverQueue.connection.destroy();
            queues.delete(guildId);
        }
    }
}

// ৫. কমন কমান্ড প্রসেসর (যা প্রিফিক্স এবং স্ল্যাশ দুই জায়গাতেই কাজ করবে)
async function handleMusicCommands(action, context, args = null, isSlash = false) {
    const guildId = context.guild.id;
    const member = context.member;
    const voiceChannel = member.voice.channel;
    const textChannel = context.channel;
    let serverQueue = queues.get(guildId);

    if (action === 'ping') {
        const replyText = `🏓 পং! বটের লেটেন্সি: ${Date.now() - context.createdTimestamp}ms`;
        return isSlash ? context.reply(replyText) : context.reply(replyText);
    }

    if (!voiceChannel) {
        const msg = '❌ আগে আপনাকে একটি ভয়েস চ্যানেলে জয়েন করতে হবে!';
        return isSlash ? context.reply({ content: msg, ephemeral: true }) : context.reply(msg);
    }

    if (action === 'play') {
        const songName = args;
        if (isSlash) await context.deferReply();
        else await textChannel.send(`🔍 **"${songName}"** খোঁজা হচ্ছে...`);

        try {
            const yt_info = await play.search(songName, { limit: 1 });
            if (!yt_info.length) {
                return isSlash ? context.editReply('❌ কোনো গান খুঁজে পাওয়া যায়নি!') : context.reply('❌ কোনো গান খুঁজে পাওয়া যায়নি!');
            }

            const song = { title: yt_info[0].title, url: yt_info[0].url };

            if (!serverQueue) {
                const queueConstruct = {
                    textChannel: textChannel,
                    voiceChannel: voiceChannel,
                    connection: null,
                    player: createAudioPlayer(),
                    songs: [],
                    loop: false
                };

                queues.set(guildId, queueConstruct);
                queueConstruct.songs.push(song);

                const connection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: guildId,
                    adapterCreator: context.guild.voiceAdapterCreator,
                });

                queueConstruct.connection = connection;
                connection.subscribe(queueConstruct.player);

                if (isSlash) await context.editReply(`✅ **${song.title}** গানটি খোঁজা সফল হয়েছে!`);
                
                playSong(guildId, queueConstruct.songs[0]);

                queueConstruct.player.on(AudioPlayerStatus.Idle, () => {
                    if (queueConstruct.loop) {
                        playSong(guildId, queueConstruct.songs[0]);
                    } else {
                        queueConstruct.songs.shift();
                        playSong(guildId, queueConstruct.songs[0]);
                    }
                });

            } else {
                serverQueue.songs.push(song);
                const msg = `✅ **${song.title}** গানটি সিরিয়ালে (Queue) যোগ করা হয়েছে!`;
                return isSlash ? context.editReply(msg) : textChannel.send(msg);
            }
        } catch (err) {
            console.error(err);
            return isSlash ? context.editReply('❌ গান লোড করতে সমস্যা হয়েছে!') : context.reply('❌ গান লোড করতে সমস্যা হয়েছে!');
        }
    }

    if (!serverQueue) {
        const msg = '❌ বর্তমানে সার্ভারে কোনো গান চলছে না!';
        return isSlash ? context.reply(msg) : context.reply(msg);
    }

    if (action === 'skip') {
        serverQueue.player.stop();
        const msg = '⏭️ চলতি গানটি স্কিপ করা হয়েছে!';
        return isSlash ? context.reply(msg) : context.reply(msg);
    }

    if (action === 'stop') {
        serverQueue.songs = [];
        serverQueue.player.stop();
        if (serverQueue.connection) serverQueue.connection.destroy();
        queues.delete(guildId);
        const msg = '🛑 সব গান বন্ধ করা হয়েছে এবং বট চ্যানেল লিভ করেছে!';
        return isSlash ? context.reply(msg) : context.reply(msg);
    }

    if (action === 'pause') {
        serverQueue.player.pause();
        const msg = '⏸️ গানটি পজ (Pause) করা হয়েছে।';
        return isSlash ? context.reply(msg) : context.reply(msg);
    }

    if (action === 'resume') {
        serverQueue.player.unpause();
        const msg = '▶️ গানটি আবার চালু করা হয়েছে।';
        return isSlash ? context.reply(msg) : context.reply(msg);
    }

    if (action === 'loop') {
        serverQueue.loop = !serverQueue.loop;
        const msg = `🔄 লুপ মোড এখন **${serverQueue.loop ? 'চালু (ON)' : 'বন্ধ (OFF)'}** করা হয়েছে!`;
        return isSlash ? context.reply(msg) : context.reply(msg);
    }

    if (action === 'queue') {
        let queueList = `🎵 **চলতি গানের তালিকা:**\n`;
        serverQueue.songs.forEach((song, index) => {
            queueList += `${index === 0 ? '▶️ এখন চলছে' : `${index}.`} - **${song.title}**\n`;
        });
        return isSlash ? context.reply(queueList) : context.reply(queueList);
    }
}

// ৬. প্রিফিক্স (!) ইভেন্ট হ্যান্ডলার
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'play' || command === 'p') {
        const songName = args.join(' ');
        if (!songName) return message.reply('❌ গানের নাম দিন। যেমন: `!play fariha` ');
        await handleMusicCommands('play', message, songName, false);
    } else if (['skip', 'stop', 'pause', 'resume', 'loop', 'queue', 'ping'].includes(command)) {
        await handleMusicCommands(command, message, null, false);
    }
});

// ७. স্ল্যাশ (/) ইভেন্ট হ্যান্ডলার
client.on('interactionCreate', async (interaction) => {

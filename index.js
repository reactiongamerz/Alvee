// ১. রেন্ডার হোস্টিংয়ের পোর্ট এরর ফিক্স করার জন্য এক্সপ্রেস সার্ভার
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('✅ লারা মিউজিক বট সফলভাবে রান করছে!');
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Web server is running on port ${port}`);
});

// ২. বটের মূল মডিউলগুলো ইমপোর্ট করা
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, StreamType } = require('@discordjs/voice');
const ytdl = require('@distube/ytdl-core');
const ytSearch = require('yt-search');
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
    
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Successfully registered Lara bot application commands.');
    } catch (error) {
        console.error(error);
    }
});

// ৪. গান প্লে করার মেইন ফাংশন (Queue ও অডিও স্ট্রিম হ্যান্ডেলার)
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
        // ytdl-core দিয়ে হাই কোয়ালিটি অডিও স্ট্রিম নেওয়া এবং ইউটিউব ব্লকিং বাইপাস করা
        const stream = ytdl(song.url, {
            filter: 'audioonly',
            highWaterMark: 1 << 25,
            quality: 'highestaudio',
            requestOptions: {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5'
                }
            }
        });

        // অডিও রিসোর্স তৈরি করা (Opus স্ট্রিমকে সাপোর্ট করার জন্য)
        const resource = createAudioResource(stream, {
            inputType: StreamType.Arbitrary
        });
        
        serverQueue.player.play(resource);
        
        // লারা বটের মতো সুন্দর মেসেজ বক্স (Embed)
        const embed = new EmbedBuilder()
            .setColor('#00ffcc')
            .setDescription(`🎶 এখন প্লে হচ্ছে: **[${song.title}](${song.url})**`);
        
        serverQueue.textChannel.send({ embeds: [embed] });
    } catch (error) {
        console.error("PlaySong Error:", error);
        serverQueue.textChannel.send('❌ গানটি প্লে করতে সমস্যা হয়েছে, পরবর্তী গানে যাওয়া হচ্ছে।');
        serverQueue.songs.shift();
        playSong(guildId, serverQueue.songs);
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
            let videoUrl = songName;
            let videoTitle = songName;

            // যদি লিংক না দিয়ে শুধু নাম লেখে, তবে yt-search দিয়ে সার্চ করবে
            if (!ytdl.validateURL(songName)) {
                const searchResult = await ytSearch(songName);
                const video = searchResult.videos[0];
                if (!video) {
                    return isSlash ? context.editReply('❌ কোনো গান খুঁজে পাওয়া যায়নি!') : context.reply('❌ কোনো গান খুঁজে পাওয়া যায়নি!');
                }
                videoUrl = video.url;
                videoTitle = video.title;
            } else {
                const info = await ytdl.getBasicInfo(songName);
                videoTitle = info.videoDetails.title;
            }

            const song = { title: videoTitle, url: videoUrl };

            if (!serverQueue) {
                // ডিসকর্ড ভয়েস চ্যানেলের নতুন সিকিউরিটি ফিক্সসহ কানেকশন তৈরি
                const connection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: guildId,
                    adapterCreator: context.guild.voiceAdapterCreator,
                    selfDeaf: true,  // ডিসকর্ডের নতুন কানেকশন সিকিউরিটি ফিক্স
                    selfMute: false
                });

                const queueConstruct = {
                    textChannel: textChannel,
                    voiceChannel: voiceChannel,
                    connection: connection,
                    player: createAudioPlayer(),
                    songs: [song],
                    loop: false
                };

                queues.set(guildId, queueConstruct);
                connection.subscribe(queueConstruct.player);

                if (isSlash) await context.editReply(`✅ গান খোঁজা সফল হয়েছে!`);
                
                playSong(guildId, queueConstruct.songs);

                queueConstruct.player.on(AudioPlayerStatus.Idle, () => {
                    if (queueConstruct.loop) {
                        playSong(guildId, queueConstruct.songs);
                    } else {
                        queueConstruct.songs.shift();
                        playSong(guildId, queueConstruct.songs);
                    }
                });

                // যদি প্লেয়ারে কোনো ইন্টারনাল এরর আসে তা হ্যান্ডেল করা
                queueConstruct.player.on('error', error => {
                    console.error(`Player Error: ${error.message}`);
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

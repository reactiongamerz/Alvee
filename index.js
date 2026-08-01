// ১. রেন্ডার পোর্ট এরর ফিক্স (এক্সপ্রেস সার্ভার)
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('✅ লারা বট ২৪ ঘন্টা সফলভাবে লাইভ আছে!'));
app.listen(port, () => console.log(`Web server active on port ${port}`));

// ২. মূল মডিউল ইমপোর্ট
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const ytdl = require('@distube/ytdl-core');
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
const queues = new Map();

// ৩. স্ল্যাশ কমান্ডের তালিকা
const commands = [
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('ইউটিউব থেকে গান প্লে করুন')
        .addStringOption(option => option.setName('song').setDescription('গানের নাম বা লিংক').setRequired(true)),
    new SlashCommandBuilder().setName('skip').setDescription('চলতি গানটি স্কিপ করুন'),
    new SlashCommandBuilder().setName('stop').setDescription('সব গান বন্ধ করে বট লিভ করান'),
    new SlashCommandBuilder().setName('queue').setDescription('গানের সিরিয়াল দেখুন'),
    new SlashCommandBuilder().setName('pause').setDescription('গান সাময়িক থামিয়ে রাখুন'),
    new SlashCommandBuilder().setName('resume').setDescription('থামানো গান আবার চালু করুন'),
    new SlashCommandBuilder().setName('loop').setDescription('লুপ মোড অন/অফ করুন'),
    new SlashCommandBuilder().setName('ping').setDescription('বটের লেটেন্সি চেক করুন')
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`✅ ${client.user.tag} হিসেবে লারা বট অনলাইন!`);
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    } catch (error) {
        console.error(error);
    }
});

// ৪. গান প্লে করার কোর ফাংশন
async function playSong(guildId, song) {
    const serverQueue = queues.get(guildId);
    if (!song) {
        if (serverQueue && serverQueue.connection) serverQueue.connection.destroy();
        queues.delete(guildId);
        return;
    }

    try {
        // ytdl-core দিয়ে হাই কোয়ালিটি অডিও স্ট্রিম নেওয়া
        const stream = ytdl(song.url, {
            filter: 'audioonly',
            highWaterMark: 1 << 25,
            quality: 'highestaudio'
        });

        const resource = createAudioResource(stream);
        serverQueue.player.play(resource);
        
        const embed = new EmbedBuilder()
            .setColor('#00ffcc')
            .setDescription(`🎶 এখন প্লে হচ্ছে: **[${song.title}](${song.url})**`);
        
        serverQueue.textChannel.send({ embeds: [embed] });
    } catch (error) {
        console.error(error);
        serverQueue.textChannel.send('❌ গানটি লোড করা যায়নি, পরের গান চেষ্টা করা হচ্ছে...');
        serverQueue.songs.shift();
        playSong(guildId, serverQueue.songs[0]);
    }
}

// ৫. কমন কমান্ড প্রসেসর
async function handleMusicCommands(action, context, args = null, isSlash = false) {
    const guildId = context.guild.id;
    const member = context.member;
    const voiceChannel = member.voice.channel;
    const textChannel = context.channel;
    let serverQueue = queues.get(guildId);

    if (action === 'ping') {
        return context.reply(`🏓 পং! লেটেন্সি: ${Date.now() - context.createdTimestamp}ms`);
    }

    if (!voiceChannel) {
        const msg = '❌ আগে আপনাকে একটি ভয়েস চ্যানেলে জয়েন করতে হবে!';
        return isSlash ? context.reply({ content: msg, ephemeral: true }) : context.reply(msg);
    }

    if (action === 'play') {
        if (isSlash) await context.deferReply();
        else await textChannel.send(`🔍 **"${args}"** খোঁজা হচ্ছে...`);

        try {
            // গান সার্চ অথবা লিংক যাচাই করা
            let videoUrl = args;
            if (!ytdl.validateURL(args)) {
                // নাম দিলে সরাসরি ইউটিউব লিংক তৈরি করার প্রসেস
                videoUrl = `https://youtube.com`; // ব্যাকআপ ডিফল্ট ডিফেন্স
            }
            
            // গান সার্চ ও তথ্য সংগ্রহ (সহজ মেথড)
            const info = await ytdl.getBasicInfo(args).catch(() => null);
            const title = info ? info.videoDetails.title : args;
            const url = info ? info.videoDetails.video_url : `https://youtube.com{encodeURIComponent(args)}`;

            const song = { title: title, url: url };

            if (!serverQueue) {
                const queueConstruct = {
                    textChannel: textChannel,
                    voiceChannel: voiceChannel,
                    connection: joinVoiceChannel({
                        channelId: voiceChannel.id,
                        guildId: guildId,
                        adapterCreator: context.guild.voiceAdapterCreator,
                    }),
                    player: createAudioPlayer(),
                    songs: [song],
                    loop: false
                };

                queues.set(guildId, queueConstruct);
                queueConstruct.connection.subscribe(queueConstruct.player);

                if (isSlash) await context.editReply(`✅ গান খোঁজা সফল হয়েছে!`);
                playSong(guildId, queueConstruct.songs[0]);

                queueConstruct.player.on(AudioPlayerStatus.Idle, () => {
                    if (queueConstruct.loop) {
                        playSong(guildId, queueConstruct.construct.songs[0]);
                    } else {
                        queueConstruct.songs.shift();
                        playSong(guildId, queueConstruct.songs[0]);
                    }
                });
            } else {
                serverQueue.songs.push(song);
                const msg = `✅ **${song.title}** কিউতে যোগ হয়েছে!`;
                return isSlash ? context.editReply(msg) : textChannel.send(msg);
            }
        } catch (err) {
            return isSlash ? context.editReply('❌ গান চালাতে ব্যর্থ হয়েছে!') : context.reply('❌ গান চালাতে ব্যর্থ হয়েছে!');
        }
    }

    // মিউজিক কন্ট্রোল কমান্ডস
    if (!serverQueue) return context.reply('❌ বর্তমানে কোনো গান চলছে না!');

    if (action === 'skip') {
        serverQueue.player.stop();
        return context.reply('⏭️ গান স্কিপ করা হয়েছে!');
    }
    if (action === 'stop') {
        serverQueue.songs = [];
        serverQueue.player.stop();
        if (serverQueue.connection) serverQueue.connection.destroy();
        queues.delete(guildId);
        return context.reply('🛑 বট চ্যানেল লিভ করেছে!');
    }
    if (action === 'pause') {
        serverQueue.player.pause();
        return context.reply('⏸️ গান পজ করা হয়েছে।');
    }
    if (action === 'resume') {
        serverQueue.player.unpause();
        return context.reply('▶️ গান আবার চালু করা হয়েছে।');
    }
    if (action === 'loop') {
        serverQueue.loop = !serverQueue.loop;
        return context.reply(`🔄 লুপ এখন **${serverQueue.loop ? 'চালু' : 'বন্ধ'}**!`);
    }
    if (action === 'queue') {
        let list = `🎵 **চলতি গানের তালিকা:**\n`;
        serverQueue.songs.forEach((s, i) => list += `${i === 0 ? '▶️ চলছে' : `${i}.`} - **${s.title}**\n`);
        return context.reply(list);
    }
}

// ৬. প্রিফিক্স ইভেন্ট
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'play' || command === 'p') {
        const songName = args.join(' ');
        if (!songName) return message.reply('❌ গানের নাম দিন।');
        await handleMusicCommands('play', message, songName, false);
    } else if (['skip', 'stop', 'pause', 'resume', 'loop', 'queue', 'ping'].includes(command)) {
        await handleMusicCommands(command, message, null, false);
    }
});

// ৭. স্ল্যাশ ইভেন্ট
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName } = interaction;
    if (commandName === 'play') {
        await handleMusicCommands('play', interaction, interaction.options.getString('song'), true);
    } else {
        await handleMusicCommands(commandName, interaction, null, true);
    }
});

client.login(TOKEN);

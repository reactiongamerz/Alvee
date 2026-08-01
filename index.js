// ১. রেন্ডার পোর্ট এরর ফিক্স (এক্সপ্রেস সার্ভার)
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Lara Bot is Live and Stable!'));
app.listen(port, '0.0.0.0', () => console.log(`Web server active on port ${port}`));

// ২. মডিউল ইমপোর্ট
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, StreamType } = require('@discordjs/voice');
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
const queues = new Map();

client.once('ready', async () => {
    console.log(`✅ ${client.user.tag} অনলাইন হয়েছে (Stable Edition)!`);
    
    // স্ল্যাশ কমান্ড রেজিস্ট্রেশন
    const commands = [
        new SlashCommandBuilder()
            .setName('play')
            .setDescription('যেকোনো গান প্লে করুন')
            .addStringOption(option => option.setName('song').setDescription('গানের নাম বা লিংক').setRequired(true)),
        new SlashCommandBuilder().setName('skip').setDescription('চলতি গানটি স্কিপ করুন'),
        new SlashCommandBuilder().setName('stop').setDescription('সব গান বন্ধ করে বট লিভ করান')
    ].map(command => command.toJSON());

    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    } catch (error) {
        console.error(error);
    }
});

// গান প্লে করার মূল মেথড
async function playSong(guildId, song) {
    const serverQueue = queues.get(guildId);
    if (!song) {
        if (serverQueue && serverQueue.connection) serverQueue.connection.destroy();
        queues.delete(guildId);
        return;
    }

    try {
        // play-dl এর ডিরেক্ট নো-অথেনটিকেশন সাউন্ডক্লাউড স্ট্রিমার সোর্স বাধ্যতামুলক করা হলো
        let stream;
        if (song.url.includes('soundcloud.com')) {
            stream = await play.stream_soundcloud(song.url);
        } else {
            // যদি নাম দিয়ে সার্চ করা হয়, তবে সাউন্ডক্লাউড থেকে ফ্রেশ ডাটা স্ক্র্যাপ করবে
            const searchResult = await play.search(song.title, { source: { soundcloud: "tracks" }, limit: 1 });
            if (searchResult.length > 0) {
                stream = await play.stream_soundcloud(searchResult[0].url);
            } else {
                throw new Error("No SoundCloud tracks found");
            }
        }

        const resource = createAudioResource(stream.stream, { inputType: stream.type });
        serverQueue.player.play(resource);
        
        const embed = new EmbedBuilder()
            .setColor('#ff5500')
            .setDescription(`🎶 এখন প্লে হচ্ছে: **[${song.title}](${song.url})**`);
        serverQueue.textChannel.send({ embeds: [embed] });

    } catch (error) {
        console.error("Playback Error:", error);
        serverQueue.textChannel.send('❌ স্ট্রিমটি লোড হতে সমস্যা হয়েছে, পরবর্তী গান চেষ্টা করা হচ্ছে...');
        serverQueue.songs.shift();
        playSong(guildId, serverQueue.songs);
    }
}

// কমান্ড প্রসেসর ফাংশন
async function handlePlay(context, songName, isSlash = false) {
    const voiceChannel = context.member.voice.channel;
    if (!voiceChannel) {
        const msg = '❌ আগে আপনাকে একটি ভয়েস চ্যানেলে জয়েন করতে হবে!';
        return isSlash ? context.reply({ content: msg, ephemeral: true }) : context.reply(msg);
    }

    if (isSlash) await context.deferReply();
    else await context.channel.send(`🔍 গানটি খোঁজা হচ্ছে...`);

    try {
        let videoUrl = songName;
        let videoTitle = songName;

        // সাউন্ডক্লাউড ডেটাবেস সার্চ ইন্টিগ্রেশন
        const searchResult = await play.search(songName, { source: { soundcloud: "tracks" }, limit: 1 });
        if (!searchResult || searchResult.length === 0) {
            const errorMsg = '❌ দুঃখিত, সাউন্ডক্লাউড ডেটাবেসে এই গানটি খুঁজে পাওয়া যায়নি!';
            return isSlash ? context.editReply(errorMsg) : context.channel.send(errorMsg);
        }

        videoUrl = searchResult[0].url;
        videoTitle = searchResult[0].title;

        const song = { title: videoTitle, url: videoUrl };
        let serverQueue = queues.get(context.guild.id);

        if (!serverQueue) {
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: context.guild.id,
                adapterCreator: context.guild.voiceAdapterCreator,
                selfDeaf: true,
                selfMute: false
            });

            const queueConstruct = {
                textChannel: context.channel,
                voiceChannel: voiceChannel,
                connection: connection,
                player: createAudioPlayer(),
                songs: [song],
                loop: false
            };

            queues.set(context.guild.id, queueConstruct);
            connection.subscribe(queueConstruct.player);

            if (isSlash) await context.editReply(`✅ গান খোঁজা সফল হয়েছে!`);
            playSong(context.guild.id, queueConstruct.songs[0]);

            queueConstruct.player.on(AudioPlayerStatus.Idle, () => {
                queueConstruct.songs.shift();
                playSong(context.guild.id, queueConstruct.songs[0]);
            });

            queueConstruct.player.on('error', error => {
                console.error(`Player error: ${error.message}`);
            });

        } else {
            serverQueue.songs.push(song);
            const msg = `✅ **${song.title}** কিউতে যোগ করা হয়েছে!`;
            return isSlash ? context.editReply(msg) : context.channel.send(msg);
        }
    } catch (e) {
        console.error(e);
        if (isSlash) await context.editReply('❌ গান প্রসেস করতে ব্যর্থ হয়েছে!');
        else await context.channel.send('❌ গান প্রসেস করতে ব্যর্থ হয়েছে!');
    }
}

// ৩. চ্যাট মেসেজ ইভেন্ট (! কমান্ড)
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'play' || command === 'p') {
        const songName = args.join(' ');
        if (!songName) return message.reply('❌ গানের নাম দিন।');
        await handlePlay(message, songName, false);
    }

    const serverQueue = queues.get(message.guild.id);
    if (!serverQueue) return;

    if (command === 'skip') {
        serverQueue.player.stop();
        return message.reply('⏭️ গান স্কিপ করা হয়েছে!');
    }
    if (command === 'stop') {
        serverQueue.songs = [];
        serverQueue.player.stop();
        if (serverQueue.connection) serverQueue.connection.destroy();
        queues.delete(message.guild.id);
        return message.reply('🛑 বট চ্যানেল লিভ করেছে!');
    }
});

// ৪. স্ল্যাশ ইভেন্ট (/ কমান্ড)
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName } = interaction;

    if (commandName === 'play') {
        const songName = interaction.options.getString('song');
        await handlePlay(interaction, songName, true);
    }

    const serverQueue = queues.get(interaction.guild.id);
    if (!serverQueue) return interaction.reply('❌ বর্তমানে কোনো গান চলছে না!');

    if (commandName === 'skip') {
        serverQueue.player.stop();
        return interaction.reply('⏭️ গান স্কিপ করা হয়েছে!');
    }
    if (commandName === 'stop') {
        serverQueue.songs = [];
        serverQueue.player.stop();
        if (serverQueue.connection) serverQueue.connection.destroy();
        queues.delete(interaction.guild.id);
        return interaction.reply('🛑 সব গান বন্ধ করা হয়েছে!');
    }
});

client.login(TOKEN);

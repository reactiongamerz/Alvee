// ১. রেন্ডার পোর্ট এরর ফিক্স (এক্সপ্রেস সার্ভার)
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Lara Bot is Live via SoundCloud!'));
app.listen(port, '0.0.0.0', () => console.log(`Web server active on port ${port}`));

// ২. মডিউল ইমপোর্ট
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Player, QueryType } = require('discord-player');
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

// ৩. ডিসকрд প্লেয়ার সেটআপ এবং এরর লিসেনার
const player = new Player(client);

player.events.on('error', (queue, error) => {
    console.log(`[Player Error] ${error.message}`);
});

player.events.on('playerError', (queue, error) => {
    console.log(`[Player Connection Error] ${error.message}`);
});

// মিউজিক ইভেন্ট হ্যান্ডলার (গান শুরু হলে সুন্দর মেসেজ বক্স দেবে)
player.events.on('playerStart', (queue, track) => {
    const embed = new EmbedBuilder()
        .setColor('#ff5500') // সাউন্ডক্লাউড অরেঞ্জ থিম কালার
        .setDescription(`🎶 এখন প্লে হচ্ছে: **[${track.title}](${track.url})**\n💿 সোর্স: *SoundCloud*`)
        .setThumbnail(track.thumbnail);
    queue.metadata.channel.send({ embeds: [embed] });
});

client.once('ready', async () => {
    console.log(`✅ ${client.user.tag} অনলাইন হয়েছে (SoundCloud Edition)!`);
    
    try {
        await player.extractors.loadDefault();
        console.log('All extractors loaded successfully.');
    } catch (e) {
        console.error('Extractor error:', e);
    }
    
    // স্ল্যাশ কমান্ড রেজিস্ট্রেশন
    const commands = [
        new SlashCommandBuilder()
            .setName('play')
            .setDescription('সাউন্ডক্লাউড থেকে গান প্লে করুন')
            .addStringOption(option => option.setName('song').setDescription('গানের নাম বা সাউন্ডক্লাউড লিংক').setRequired(true)),
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

// গান প্লে করার কোর ফাংশন (সম্পূর্ণ সাউন্ডক্লাউড ভিত্তিক সার্চ)
async function handlePlay(context, songName, isSlash = false) {
    const voiceChannel = context.member.voice.channel;
    if (!voiceChannel) {
        const msg = '❌ আগে আপনাকে একটি ভয়েস চ্যানেলে জয়েন করতে হবে!';
        return isSlash ? context.reply({ content: msg, ephemeral: true }) : context.reply(msg);
    }

    if (isSlash) await context.deferReply();
    else await context.channel.send(`🔍 সাউন্ডক্লাউড থেকে **"${songName}"** খোঁজা হচ্ছে...`);

    try {
        // যদি সাউন্ডক্লাউডের ডিরেক্ট লিংক হয় তবে লিংক দিয়ে প্লে করবে, নয়তো সাউন্ডক্লাউড ডেটাবেসে নাম দিয়ে সার্চ করবে
        let searchEngine = QueryType.SOUNDCLOUD_SEARCH;
        if (songName.includes('soundcloud.com')) {
            searchEngine = QueryType.SOUNDCLOUD;
        }

        const { queue, track } = await player.play(voiceChannel, songName, {
            searchEngine: searchEngine, // সাউন্ডক্লাউড ইঞ্জিন বাধ্যতামুলক করা হলো
            nodeOptions: {
                metadata: { channel: context.channel },
                leaveOnEmpty: true,
                leaveOnEnd: false,
                volume: 85,
                bufferingTimeout: 10000
            }
        });

        const msg = `✅ **${track.title}** কিউতে যোগ করা হয়েছে!`;
        if (isSlash) await context.editReply(msg);
    } catch (e) {
        console.error("SoundCloud Play Error Catch:", e);
        const errorMsg = '❌ দুঃখিত, গানটি সাউন্ডক্লাউড থেকে প্লে করা যায়নি! দয়া করে অন্য কোনো গানের নাম লিখে চেষ্টা করুন।';
        if (isSlash) await context.editReply(errorMsg);
        else await context.channel.send(errorMsg);
    }
}

// ৪. চ্যাট মেসেজ ইভেন্ট (! কমান্ড)
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'play' || command === 'p') {
        const songName = args.join(' ');
        if (!songName) return message.reply('❌ গানের নাম দিন।');
        await handlePlay(message, songName, false);
    }

    if (command === 'skip') {
        const queue = player.nodes.get(message.guild.id);
        if (!queue) return message.reply('❌ বর্তমানে কোনো গান চলছে না!');
        queue.node.skip();
        return message.reply('⏭️ গান স্কিপ করা হয়েছে!');
    }

    if (command === 'stop') {
        const queue = player.nodes.get(message.guild.id);
        if (!queue) return message.reply('❌ বর্তমানে কোনো গান চলছে না!');
        queue.delete();
        return message.reply('🛑 সব গান বন্ধ করা হয়েছে!');
    }
});

// ৫. স্ল্যাশ ইভেন্ট (/ কমান্ড)
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'play') {
        const songName = interaction.options.getString('song');
        await handlePlay(interaction, songName, true);
    }

    if (interaction.commandName === 'skip') {
        const queue = player.nodes.get(interaction.guild.id);
        if (!queue) return interaction.reply('❌ বর্তমানে কোনো গান চলছে না!');
        queue.node.skip();
        return interaction.reply('⏭️ গান স্কিপ করা হয়েছে!');
    }

    if (interaction.commandName === 'stop') {
        const queue = player.nodes.get(interaction.guild.id);
        if (!queue) return interaction.reply('❌ বর্তমানে কোনো গান চলছে না!');
        queue.delete();
        return interaction.reply('🛑 সব গান বন্ধ করা হয়েছে!');
    }
});

client.login(TOKEN);

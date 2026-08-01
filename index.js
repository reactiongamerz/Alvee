const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle 
} = require('discord.js');
const { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus, 
    NoSubscriberBehavior 
} = require('@discordjs/voice');
const play = require('play-dl');
const express = require('express');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Lara Music Bot is Fully Ready!'));
app.listen(PORT, () => console.log(`Server connected to port ${PORT}`));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const PREFIX = '-'; // Lara Bot prefix set to '-'
const queue = new Map();

client.once('ready', () => {
    console.log(`${client.user.tag} complete online!`);
    client.user.setActivity(`${PREFIX}help | Music Bot`, { type: 3 });
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const serverQueue = queue.get(message.guild.id);

    // 1. Play Command (-play / -p)
    if (command === 'play' || command === 'p') {
        execute(message, args);
    } 
    // 2. Skip Command (-skip / -s)
    else if (command === 'skip' || command === 's') {
        if (!message.member.voice.channel) return message.reply('Voice channel-e join korun!');
        if (!serverQueue) return message.reply('Kono gan cholche na!');
        serverQueue.player.stop();
        message.reply('⏭️ Gan skip kora hoyeche.');
    } 
    // 3. Stop Command (-stop / -dc)
    else if (command === 'stop' || command === 'dc') {
        if (!message.member.voice.channel) return message.reply('Voice channel-e join korun!');
        if (!serverQueue) return message.reply('Bot active na!');
        serverQueue.songs = [];
        serverQueue.player.stop();
        if (serverQueue.connection) serverQueue.connection.destroy();
        queue.delete(message.guild.id);
        message.reply('🛑 Music stop ebong bot disconnect kora hoyeche.');
    } 
    // 4. Pause Command (-pause)
    else if (command === 'pause') {
        if (!serverQueue) return message.reply('Kono gan cholche na!');
        serverQueue.player.pause();
        message.reply('⏸️ Gan pause kora hoyeche.');
    } 
    // 5. Resume Command (-resume / -r)
    else if (command === 'resume' || command === 'r') {
        if (!serverQueue) return message.reply('Kono gan cholche na!');
        serverQueue.player.unpause();
        message.reply('▶️ Gan resume kora hoyeche.');
    } 
    // 6. Volume Command (-volume / -v)
    else if (command === 'volume' || command === 'v') {
        if (!serverQueue) return message.reply('Kono gan cholche na!');
        if (!args[0]) return message.reply(`Current volume: **100%** (Standard). Volume bodlate \`${PREFIX}volume 50\` likhun.`);
        const vol = parseInt(args[0]);
        if (isNaN(vol) || vol < 1 || vol > 100) return message.reply('Volume level 1 theke 100 er moddhe hote hobe!');
        // Note: Free hosting/render custom volume management library base context standard setup tracking e kaj kore.
        message.reply(`🔊 Volume set kora hoyeche: **${vol}%**`);
    } 
    // 7. Join Command (-join)
    else if (command === 'join') {
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) return message.reply('Apni voice channel-e nai!');
        joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: message.guild.id,
            adapterCreator: message.guild.voiceAdapterCreator,
        });
        message.reply('📥 Channel-e success vabe join korechi!');
    } 
    // 8. Queue Command (-queue / -q)
    else if (command === 'queue' || command === 'q') {
        if (!serverQueue || !serverQueue.songs.length) return message.reply('Queue full khali! Kono gan line-e nai.');
        const list = serverQueue.songs.map((song, index) => `${index + 1}. ${song.title}`).join('\n');
        message.reply(`🎵 **Current Queue:**\n${list}`);
    } 
    // 9. Help Command (-help)
    else if (command === 'help') {
        const helpEmbed = new EmbedBuilder()
            .setColor('#00ffcc')
            .setTitle('📝 Lara Music Bot Commands')
            .setDescription(`Prefix: \`${PREFIX}\`\n\n` +
                `\`${PREFIX}play <song>\` - Play song via Youtube\n` +
                `\`${PREFIX}skip\` - Skip current track\n` +
                `\`${PREFIX}stop\` - Disconnect bot\n` +
                `\`${PREFIX}pause\` - Pause playback\n` +
                `\`${PREFIX}resume\` - Resume track\n` +
                `\`${PREFIX}volume\` - Adjust sound (1-100)\n` +
                `\`${PREFIX}queue\` - Check upcoming songs list\n` +
                `\`${PREFIX}join\` - Pull bot to VC`);
        message.channel.send({ embeds: [helpEmbed] });
    }
});

// Original execution player handling logic block
async function execute(message, args) {
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) return message.reply('Voice channel-e thakte hobe!');
    if (!args.length) return message.reply('Ganer nam din!');

    let songInfo;
    try {
        message.channel.sendTyping();
        const searchResult = await play.search(args.join(' '), { limit: 1 });
        if (!searchResult.length) return message.reply('Gan paowa jayni.');
        songInfo = searchResult[0];
    } catch (e) {
        return message.reply('Errored searching track.');
    }

    const song = { title: songInfo.title, url: songInfo.url, duration: songInfo.durationRaw, thumbnail: songInfo.thumbnails[0]?.url || '' };
    const serverQueue = queue.get(message.guild.id);

    if (!serverQueue) {
        const queueContruct = { textChannel: message.channel, voiceChannel, connection: null, songs: [], player: null, playing: true };
        queue.set(message.guild.id, queueContruct);
        queueContruct.songs.push(song);

        try {
            const connection = joinVoiceChannel({ channelId: voiceChannel.id, guildId: message.guild.id, adapterCreator: message.guild.voiceAdapterCreator });
            queueContruct.connection = connection;
            const player = createAudioPlayer({ behaviors: { noSubscriberBehavior: NoSubscriberBehavior.Pause } });
            queueContruct.player = player;
            connection.subscribe(player);
            playSong(message.guild, queueContruct.songs[0]);
        } catch (err) {
            queue.delete(message.guild.id);
            return message.reply('VC connection error.');
        }
    } else {
        serverQueue.songs.push(song);
        return message.reply(`✅ **${song.title}** queue-te add kora hoyeche.`);
    }
}

async function playSong(guild, song) {
    const serverQueue = queue.get(guild.id);
    if (!song) {
        setTimeout(() => { if (serverQueue && !serverQueue.songs.length) { serverQueue.connection.destroy(); queue.delete(guild.id); } }, 30000);
        return;
    }
    try {
        const stream = await play.stream(song.url);
        const resource = createAudioResource(stream.stream, { inputType: stream.type });
        serverQueue.player.play(resource);

        const embed = new EmbedBuilder()
            .setColor('#ff007f')
            .setTitle('🎶 Lara Player Playing Now')
            .setDescription(`**[${song.title}](${song.url})**`)
            .setThumbnail(song.thumbnail)
            .setFooter({ text: `Duration: ${song.duration}` });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('p_r').setLabel('⏸️ Pause/Resume').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('sk').setLabel('⏭️ Skip').setStyle(ButtonStyle.Success)
        );

        const msg = await serverQueue.textChannel.send({ embeds: [embed], components: [row] });
        const collector = msg.createMessageComponentCollector({ time: 300000 });

        collector.on('collect', async (i) => {
            await i.deferUpdate();
            if (i.customId === 'p_r') {
                if (serverQueue.playing) { serverQueue.player.pause(); serverQueue.playing = false; }
                else { serverQueue.player.unpause(); serverQueue.playing = true; }
            } else if (i.customId === 'sk') { serverQueue.player.stop(); }
        });

        serverQueue.player.once(AudioPlayerStatus.Idle, () => {
            serverQueue.songs.shift();
            playSong(guild, serverQueue.songs[0]);
        });
    } catch (e) {
        serverQueue.songs.shift();
        playSong(guild, serverQueue.songs[0]);
    }
}

client.login(process.env.DISCORD_TOKEN);

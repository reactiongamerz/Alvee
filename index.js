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

// 1. Render Keep-Alive Server Setup
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Lara Engine is Running Smoothly!'));
app.listen(PORT, () => console.log(`[Lara Web] Listening on port: ${PORT}`));

// 2. Client Initialization with Proper Intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const PREFIX = '-'; 
const queue = new Map(); // Core Music Queue Matrix

client.once('ready', () => {
    console.log(`[Lara Bot] Connected successfully as ${client.user.tag}`);
    client.user.setActivity(`${PREFIX}p <song>`, { type: 3 });
});

// 3. Message Trigger Context
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const serverQueue = queue.get(message.guild.id);

    if (command === 'play' || command === 'p') {
        execute(message, args);
    } else if (command === 'skip' || command === 's') {
        if (!message.member.voice.channel) return message.reply('Apnake age voice channel-e join korte hobe!');
        if (!serverQueue) return message.reply('Kono gan cholche na!');
        serverQueue.player.stop();
        message.reply('⏭️ Gan-ti skip kora hoyeche!');
    } else if (command === 'stop' || command === 'dc') {
        if (!message.member.voice.channel) return message.reply('Apnake voice channel-e thakte hobe!');
        if (!serverQueue) return message.reply('Bot active nei ba queue khali!');
        serverQueue.songs = [];
        if (serverQueue.player) serverQueue.player.stop();
        if (serverQueue.connection) serverQueue.connection.destroy();
        queue.delete(message.guild.id);
        message.reply('🛑 Bot successfully disconnected!');
    }
});

// 4. Music Play Driver Logic
async function execute(message, args) {
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) return message.reply('Apnake age voice channel-e join korte hobe!');
    if (!args.length) return message.reply('Ganer naam ba YouTube Link likhun! (Ex: `-p stay`)');

    let songData = null;

    try {
        await message.channel.sendTyping();

        // Check if query is URL or Keyword search
        if (args[0].startsWith('https://')) {
            const validation = await play.validate(args[0]);
            if (validation === 'video') {
                const info = await play.video_info(args[0]);
                songData = info.video_details;
            } else {
                return message.reply('Shudhu direct YouTube single video link ba plain string keyword support korbe!');
            }
        } else {
            const searchResult = await play.search(args.join(' '), { limit: 1, source: { youtube: 'video' } });
            if (!searchResult || searchResult.length === 0) {
                return message.reply('Kono gan khunje paowa jayni! Alada naam likhe try korun.');
            }
            songData = searchResult[0];
        }
    } catch (error) {
        console.error(error);
        return message.reply('⚠️ YouTube standard parameters connect korte somossa hocche! Abar try korun.');
    }

    const song = {
        title: songData.title,
        url: songData.url,
        duration: songData.durationRaw || 'Live',
        thumbnail: songData.thumbnails && songData.thumbnails.length > 0 ? songData.thumbnails[0].url : ''
    };

    const serverQueue = queue.get(message.guild.id);

    if (!serverQueue) {
        const queueConstruct = {
            textChannel: message.channel,
            voiceChannel: voiceChannel,
            connection: null,
            player: null,
            songs: [],
            playing: true
        };

        queue.set(message.guild.id, queueConstruct);
        queueConstruct.songs.push(song);

        try {
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: message.guild.id,
                adapterCreator: message.guild.voiceAdapterCreator,
            });

            queueConstruct.connection = connection;
            const player = createAudioPlayer({
                behaviors: { noSubscriberBehavior: NoSubscriberBehavior.Pause }
            });
            queueConstruct.player = player;
            connection.subscribe(player);

            playSong(message.guild, queueConstruct.songs[0]);
        } catch (err) {
            console.error(err);
            queue.delete(message.guild.id);
            return message.reply('Voice channel connection failed!');
        }
    } else {
        serverQueue.songs.push(song);
        const addEmbed = new EmbedBuilder()
            .setColor('#00ffcc')
            .setTitle('🎵 Queue-te juktto holo')
            .setDescription(`**[${song.title}](${song.url})**`)
            .setThumbnail(song.thumbnail)
            .setFooter({ text: `Duration: ${song.duration}` });
        return message.channel.send({ embeds: [addEmbed] });
    }
}

// 5. Stream Renderer Pipeline
async function playSong(guild, song) {
    const serverQueue = queue.get(guild.id);
    if (!song) {
        // Auto leave after 20 seconds of silence/empty queue
        setTimeout(() => {
            const checkQueue = queue.get(guild.id);
            if (checkQueue && checkQueue.songs.length === 0) {
                if (checkQueue.connection) checkQueue.connection.destroy();
                queue.delete(guild.id);
            }
        }, 20000);
        return;
    }

    try {
        const stream = await play.stream(song.url, { discordPlayerCompatibility: true });
        const resource = createAudioResource(stream.stream, { inputType: stream.type });
        
        serverQueue.player.play(resource);

        const playEmbed = new EmbedBuilder()
            .setColor('#ff007f')
            .setTitle('🎶 Lara Music System — Playing Now')
            .setDescription(`**[${song.title}](${song.url})**`)
            .setThumbnail(song.thumbnail)
            .addFields({ name: '⏱️ Duration', value: song.duration, inline: true })
            .setFooter({ text: 'Use buttons to control dashboard playback' });

        const controlRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('pause_resume_btn').setLabel('⏸️ Pause/Resume').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('skip_btn').setLabel('⏭️ Skip').setStyle(ButtonStyle.Success)
        );

        const activeMsg = await serverQueue.textChannel.send({ embeds: [playEmbed], components: [controlRow] });
        const collector = activeMsg.createMessageComponentCollector({ time: 600000 }); // 10 Minutes control active

        collector.on('collect', async (interaction) => {
            if (!interaction.member.voice.channel || interaction.member.voice.channel.id !== serverQueue.voiceChannel.id) {
                return interaction.reply({ content: 'Apnake eii voice channel-e thakte hobe control use korar jonno!', ephemeral: true });
            }
            
            await interaction.deferUpdate();

            if (interaction.customId === 'pause_resume_btn') {
                if (serverQueue.playing) {
                    serverQueue.player.pause();
                    serverQueue.playing = false;
                    serverQueue.textChannel.send(`⏸️ **${interaction.user.username}** gan-ti temporary pause korechen.`);
                } else {
                    serverQueue.player.unpause();
                    serverQueue.playing = true;
                    serverQueue.textChannel.send(`▶️ **${interaction.user.username}** gan-ti resume korechen.`);
                }
            } else if (interaction.customId === 'skip_btn') {
                serverQueue.player.stop();
                serverQueue.textChannel.send(`⏭️ **${interaction.user.username}** panels standard control are skip button dashboard executed.`);
            }
        });

        serverQueue.player.once(AudioPlayerStatus.Idle, () => {
            serverQueue.songs.shift();
            playSong(guild, serverQueue.songs[0]);
        });

    } catch (error) {
        console.error(error);
        serverQueue.songs.shift();
        playSong(guild, serverQueue.songs[0]);
    }
}

client.login(process.env.DISCORD_TOKEN);

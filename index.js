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

// Render Node Server Keep-Alive
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Lara Engine Verified & Stable!'));
app.listen(PORT, () => console.log(`[Lara Core] Port dynamic verified: ${PORT}`));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const PREFIX = '-'; 
const queue = new Map();

client.once('ready', () => {
    console.log(`[Online Instance] Complete matching: ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const serverQueue = queue.get(message.guild.id);

    if (command === 'play' || command === 'p') {
        execute(message, args);
    } else if (command === 'skip' || command === 's') {
        if (!message.member.voice.channel) return message.reply('Voice channel-e join kora thakte hobe!');
        if (!serverQueue) return message.reply('Kono track akhon cholche na!');
        serverQueue.player.stop();
        message.reply('⏭️ Gan skip kora hoyeche!');
    } else if (command === 'stop' || command === 'dc') {
        if (!serverQueue) return message.reply('Bot ekhon connection matrix-e nei!');
        serverQueue.songs = [];
        if (serverQueue.player) serverQueue.player.stop();
        if (serverQueue.connection) serverQueue.connection.destroy();
        queue.delete(message.guild.id);
        message.reply('🛑 Disconnected and cleared!');
    }
});

async function execute(message, args) {
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) return message.reply('Apnake prothome ekta voice channel-e join korte hobe!');
    if (!args.length) return message.reply('Ganer naam ba line paste korun! Ex: `-p bol kaffara`');

    let songData = null;

    try {
        await message.channel.sendTyping();
        
        // Handling raw input string queries correctly
        const searchResult = await play.search(args.join(' '), { limit: 1, source: { youtube: 'video' } });
        
        if (!searchResult || searchResult.length === 0) {
            return message.reply('Kono content khunje paowa jayni!');
        }
        
        // FIXED: Accessing index element of array to prevent undefined object parameters
        songData = searchResult[0]; 
    } catch (error) {
        console.error(error);
        return message.reply('⚠️ Search system logic timeout! Abar request pathan.');
    }

    const song = {
        title: songData.title,
        url: songData.url,
        duration: songData.durationRaw || '00:00',
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

            playSong(message.guild, queueConstruct.songs);
        } catch (err) {
            queue.delete(message.guild.id);
            return message.reply('Voice server stream mapping error!');
        }
    } else {
        serverQueue.songs.push(song);
        return message.reply(`✅ **${song.title}** queue list-e add hoyeche!`);
    }
}

async function playSong(guild, songs) {
    const serverQueue = queue.get(guild.id);
    if (!songs || songs.length === 0) {
        setTimeout(() => {
            const finalCheck = queue.get(guild.id);
            if (finalCheck && finalCheck.songs.length === 0) {
                if (finalCheck.connection) finalCheck.connection.destroy();
                queue.delete(guild.id);
            }
        }, 15000);
        return;
    }

    const song = songs[0]; // Pointing to active stack index

    try {
        const stream = await play.stream(song.url, { discordPlayerCompatibility: true });
        const resource = createAudioResource(stream.stream, { inputType: stream.type });
        serverQueue.player.play(resource);

        const playEmbed = new EmbedBuilder()
            .setColor('#ff007f')
            .setTitle('🎶 Lara Player — Now Playing')
            .setDescription(`**[${song.title}](${song.url})**`)
            .setThumbnail(song.thumbnail)
            .setFooter({ text: `Duration: ${song.duration}` });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('p_r_btn').setLabel('⏸️ Pause/Resume').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('sk_btn').setLabel('⏭️ Skip').setStyle(ButtonStyle.Success)
        );

        const activeMsg = await serverQueue.textChannel.send({ embeds: [playEmbed], components: [row] });
        const collector = activeMsg.createMessageComponentCollector({ time: 600000 });

        collector.on('collect', async (interaction) => {
            if (!interaction.member.voice.channel) return interaction.reply({ content: 'Voice channel-e join kora thakun control use korte!', ephemeral: true });
            await interaction.deferUpdate();
            if (interaction.customId === 'p_r_btn') {
                if (serverQueue.playing) {
                    serverQueue.player.pause();
                    serverQueue.playing = false;
                } else {
                    serverQueue.player.unpause();
                    serverQueue.playing = true;
                }
            } else if (interaction.customId === 'sk_btn') {
                serverQueue.player.stop();
            }
        });

        serverQueue.player.once(AudioPlayerStatus.Idle, () => {
            serverQueue.songs.shift();
            playSong(guild, serverQueue.songs);
        });

    } catch (e) {
        console.error(e);
        serverQueue.songs.shift();
        playSong(guild, serverQueue.songs);
    }
}

client.login(process.env.DISCORD_TOKEN);

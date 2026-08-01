const { 
    Client, 
    GatewayIntentBits, 
    REST, 
    Routes, 
    SlashCommandBuilder, 
    EmbedBuilder 
} = require('discord.js');
const { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus, 
    NoSubscriberBehavior 
} = require('@discordjs/voice');
const play = require('play-dl');

// বটের টোকেন এবং ক্লায়েন্ট আইডি এখানে দিন
const TOKEN = 'YOUR_BOT_TOKEN_HERE';
const CLIENT_ID = 'YOUR_CLIENT_ID_HERE';
const BOT_NAME = 'আল*ভী'; // বটের নাম ভ্যারিয়েবল হিসেবে সেট করা হলো

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages
    ]
});

// সার্ভার ভিত্তিক মিউজিক কিউ (Queue) সংরক্ষণের জন্য Map
const queue = new Map();

// slash commands রেজিস্টার করা
const commands = [
    new SlashCommandBuilder()
        .setName('play')
        .setDescription(`${BOT_NAME}-এর মাধ্যমে ইউটিউব লিঙ্ক বা গানের নাম দিয়ে গান বাজান`)
        .addStringOption(option => 
            option.setName('query')
                .setDescription('ইউটিউব URL বা গানের নাম')
                .setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('pause')
        .setDescription('চলতি গানটি থামিয়ে রাখুন (Pause)'),
        
    new SlashCommandBuilder()
        .setName('resume')
        .setDescription('থামিয়ে রাখা গানটি আবার চালু করুন (Resume)'),
        
    new SlashCommandBuilder()
        .setName('skip')
        .setDescription('চলতি গানটি বাদ দিয়ে পরের গানে যান'),
        
    new SlashCommandBuilder()
        .setName('queue')
        .setDescription('বর্তমান গানের তালিকা দেখুন')
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        console.log(`${BOT_NAME} বটের Slash Commands (/) লোড করা হচ্ছে...`);
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log(`${BOT_NAME} বটের Slash Commands সফলভাবে রেজিস্টার হয়েছে!`);
    } catch (error) {
        console.error(error);
    }
})();

client.once('ready', () => {
    console.log(`${BOT_NAME} হিসেবে বট এখন অনলাইন ও প্রস্তুত!`);
});

// ইন্টারঅ্যাকশন হ্যান্ডলার
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, guildId, member, options } = interaction;
    const voiceChannel = member.voice.channel;

    // ভয়েস চ্যানেল চেক
    if (!voiceChannel) {
        return interaction.reply({ content: 'আপনাকে অবশ্যই একটি ভয়েস চ্যানেলে থাকতে হবে!', ephemeral: true });
    }

    let serverQueue = queue.get(guildId);

    if (commandName === 'play') {
        await interaction.deferReply();
        const query = options.getString('query');
        let songInfo = null;

        try {
            // লিঙ্ক নাকি সার্চ টার্ম তা চেক করা
            if (play.yt_validate(query) === 'video') {
                const info = await play.video_info(query);
                songInfo = {
                    title: info.video_details.title,
                    url: info.video_details.url,
                    duration: info.video_details.durationRaw
                };
            } else {
                const searchResults = await play.search(query, { limit: 1 });
                if (searchResults.length === 0) {
                    return interaction.editReply('কোনো গান খুঁজে পাওয়া যায়নি!');
                }
                songInfo = {
                    title: searchResults[0].title,
                    url: searchResults[0].url,
                    duration: searchResults[0].durationRaw
                };
            }

            if (!serverQueue) {
                const queueContruct = {
                    textChannel: interaction.channel,
                    voiceChannel: voiceChannel,
                    connection: null,
                    songs: [],
                    player: null,
                };

                queue.set(guildId, queueContruct);
                queueContruct.songs.push(songInfo);

                try {
                    const connection = joinVoiceChannel({
                        channelId: voiceChannel.id,
                        guildId: guildId,
                        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
                    });

                    queueContruct.connection = connection;
                    
                    const player = createAudioPlayer({
                        behaviors: { noSubscriber: NoSubscriberBehavior.Play }
                    });
                    queueContruct.player = player;
                    connection.subscribe(player);

                    playSong(guildId, queueContruct.songs);
                    
                    const embed = new EmbedBuilder()
                        .setColor('#0099ff')
                        .setTitle(`🎵 গান বাজাচ্ছে: ${BOT_NAME}`)
                        .setDescription(`[${songInfo.title}](${songInfo.url}) [${songInfo.duration}]`)
                        .setFooter({ text: `${BOT_NAME} Music System` });
                    
                    await interaction.editReply({ embeds: [embed] });

                } catch (err) {
                    console.log(err);
                    queue.delete(guildId);
                    return interaction.editReply('ভয়েস চ্যানেলে যুক্ত হতে সমস্যা হয়েছে!');
                }
            } else {
                serverQueue.songs.push(songInfo);
                const embed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle('➕ কিউতে (Queue) যোগ করা হয়েছে')
                    .setDescription(`[${songInfo.title}](${songInfo.url}) [${songInfo.duration}]`)
                    .setFooter({ text: `${BOT_NAME} Music System` });
                return interaction.editReply({ embeds: [embed] });
            }

        } catch (error) {
            console.error(error);
            return interaction.editReply('গানটি প্লে করার সময় একটি সমস্যা হয়েছে।');
        }
    }

    if (commandName === 'pause') {
        if (!serverQueue || !serverQueue.player) return interaction.reply('বর্তমানে কোনো গান চলছে না!');
        serverQueue.player.pause();
        return interaction.reply(`⏸️ ${BOT_NAME} গানটি সাময়িকভাবে থামিয়ে দিয়েছে।`);
    }

    if (commandName === 'resume') {
        if (!serverQueue || !serverQueue.player) return interaction.reply('বর্তমানে কোনো গান চলছে না!');
        serverQueue.player.unpause();
        return interaction.reply(`▶️ ${BOT_NAME} গানটি আবার চালু করেছে।`);
    }

    if (commandName === 'skip') {
        if (!serverQueue) return interaction.reply('স্কিপ করার মতো কোনো গান নেই!');
        serverQueue.player.stop();
        return interaction.reply(`⏭️ ${BOT_NAME} গানটি স্কিপ করে পরের গানে চলে গেছে।`);
    }

    if (commandName === 'queue') {
        if (!serverQueue || serverQueue.songs.length === 0) return interaction.reply('বর্তমানে কিউ একদম খালি!');
        
        let queueString = serverQueue.songs.map((song, index) => {
            return `${index === 0 ? '▶️ **চলতি গান:**' : `${index}.`} [${song.title}](${song.url}) - \`${song.duration}\``;
        }).join('\n');

        const embed = new EmbedBuilder()
            .setColor('#ffff00')
            .setTitle(`🎼 ${BOT_NAME} - বর্তমান গানের তালিকা`)
            .setDescription(queueString);

        return interaction.reply({ embeds: [embed] });
    }
});

// গান প্লে করার মূল ফাংশন
async function playSong(guildId, song) {
    const serverQueue = queue.get(guildId);
    if (!song || song.length === 0) {
        setTimeout(() => {
            if (serverQueue && serverQueue.songs.length === 0) {
                serverQueue.connection.destroy();
                queue.delete(guildId);
            }
        }, 30000); // গান শেষ হওয়ার ৩০ সেকেন্ড পর চ্যানেল লিভ করবে
        return;
    }

    try {
        const currentSong = song[0];
        const stream = await play.stream(currentSong.url);
        const resource = createAudioResource(stream.stream, {
            inputType: stream.type
        });

        serverQueue.player.play(resource);

        serverQueue.player.once(AudioPlayerStatus.Idle, () => {
            serverQueue.songs.shift();
            playSong(guildId, serverQueue.songs);
        });

    } catch (error) {
        console.error(error);
        serverQueue.songs.shift();
        playSong(guildId, serverQueue.songs);
    }
}

client.login(TOKEN);

const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const play = require('play-dl');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const PREFIX = '!'; // বটের প্রিফিক্স
const queue = new Map();

client.once('ready', () => {
    console.log(`✅ ${client.user.tag} এখন কারার মতো থিম ও সব কমান্ডসহ অনলাইন!`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const serverQueue = queue.get(message.guild.id);

    // ১. প্লে কমান্ড (!p বা !play)
    if (command === 'play' || command === 'p') {
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) return message.reply('❌ গান শোনার জন্য আগে একটি ভয়েস চ্যানেলে জয়েন করুন!');

        const searchChannel = args.join(' ');
        if (!searchChannel) return message.reply('ℹ️ ব্যবহার: `!p গানের নাম বা ইউটিউব লিংক`');

        try {
            let yt_info = await play.search(searchChannel, { limit: 1 });
            if (!yt_info || yt_info.length === 0) return message.channel.send('❌ দুঃখিত, কোনো গান পাওয়া যায়নি!');

            const song = {
                title: yt_info[0].title,
                url: yt_info[0].url,
                thumbnail: yt_info[0].thumbnails?.[0]?.url || '',
                duration: yt_info[0].durationRaw || 'Unknown',
                requestedBy: message.author.tag
            };

            if (!serverQueue) {
                const queueContruct = {
                    textChannel: message.channel,
                    voiceChannel: voiceChannel,
                    connection: null,
                    songs: [],
                    player: createAudioPlayer(),
                    playing: true
                };

                queue.set(message.guild.id, queueContruct);
                queueContruct.songs.push(song);

                try {
                    const connection = joinVoiceChannel({
                        channelId: voiceChannel.id,
                        guildId: message.guild.id,
                        adapterCreator: message.guild.voiceAdapterCreator,
                    });
                    queueContruct.connection = connection;
                    
                    playSong(message.guild.id, queueContruct.songs[0]);
                } catch (err) {
                    console.log(err);
                    queue.delete(message.guild.id);
                    return message.channel.send('❌ ভয়েস চ্যানেলে ঢুকতে সমস্যা হয়েছে!');
                }
            } else {
                serverQueue.songs.push(song);
                
                const queueEmbed = new EmbedBuilder()
                    .setColor('#FF007F')
                    .setTitle('🎵 গানটি তালিকায় যোগ করা হয়েছে')
                    .setDescription(`[${song.title}](${song.url})`)
                    .setThumbnail(song.thumbnail)
                    .addFields(
                        { name: '🕒 স্থায়িত্ব', value: song.duration, inline: true },
                        { name: '👤 অনুরোধকারী', value: song.requestedBy, inline: true }
                    )
                    .setFooter({ text: 'Kara Theme Music System' });

                return message.channel.send({ embeds: [queueEmbed] });
            }

        } catch (error) {
            console.error(error);
            message.channel.send('❌ গানটি প্রসেস করার সময় এরর হয়েছে!');
        }
    }

    // ২. স্কিপ কমান্ড (!skip বা !s)
    if (command === 'skip' || command === 's') {
        if (!message.member.voice.channel) return message.reply('❌ এই কমান্ডটি দিতে আগে ভয়েস চ্যানেলে ঢুকুন!');
        if (!serverQueue) return message.reply('❌ এই মুহূর্তে কোনো গান বাজছে না!');
        serverQueue.player.stop();
        return message.reply('⏭️ গানটি স্কিপ করা হলো!');
    }

    // ৩. পজ কমান্ড (!pause)
    if (command === 'pause') {
        if (!serverQueue) return message.reply('❌ কোনো গান বাজছে না!');
        serverQueue.player.pause();
        return message.reply('⏸️ গানটি সাময়িকভাবে থামানো হলো!');
    }

    // ৪. রিজিউম কমান্ড (!resume বা !r)
    if (command === 'resume' || command === 'r') {
        if (!serverQueue) return message.reply('❌ কোনো গান তালিকায় নেই!');
        serverQueue.player.unpause();
        return message.reply('▶️ গানটি আবার চালু করা হলো!');
    }

    // ৫. তালিকা দেখার কমান্ড (!queue বা !q)
    if (command === 'queue' || command === 'q') {
        if (!serverQueue || serverQueue.songs.length === 0) return message.reply('❌ বর্তমানে গান বাজানোর তালিকা খালি!');
        
        let i = 1;
        const songsList = serverQueue.songs.map(song => `**${i++}.** [${song.title}](${song.url}) - \`${song.duration}\``).join('\n');
        
        const qEmbed = new EmbedBuilder()
            .setColor('#1DB954')
            .setTitle('🎶 গান বাজানোর বর্তমান তালিকা (Queue)')
            .setDescription(songsList)
            .setFooter({ text: `অনুরোধে: ${message.author.tag}` });

        return message.channel.send({ embeds: [qEmbed] });
    }

    // ৬. স্টপ কমান্ড (!stop বা !leave)
    if (command === 'stop' || command === 'leave') {
        if (!serverQueue) return message.reply('❌ বট কোনো ভয়েস চ্যানেলে নেই!');
        serverQueue.songs = [];
        if (serverQueue.connection) serverQueue.connection.destroy();
        queue.delete(message.guild.id);
        return message.reply('👋 ভয়েস চ্যানেল থেকে বিদায় নিলাম!');
    }
});

// গান প্লে করার মূল ফাংশন
async fn playSong(guildId, song) {
    const serverQueue = queue.get(guildId);
    if (!song) {
        if (serverQueue && serverQueue.connection) {
            serverQueue.connection.destroy();
        }
        queue.delete(guildId);
        return;
    }

    try {
        let stream = await play.stream(song.url);
        const resource = createAudioResource(stream.stream, { inputType: stream.type });
        
        serverQueue.player.play(resource);
        serverQueue.connection.subscribe(serverQueue.player);

        const nowPlayingEmbed = new EmbedBuilder()
            .setColor('#7289DA')
            .setAuthor({ name: '🎤 এখন বাজছে (Now Playing)' })
            .setTitle(song.title)
            .setURL(song.url)
            .setDescription(`**সময়:** \`${song.duration}\` | **অনুরোধকারী:** \`${song.requestedBy}\``)
            .setThumbnail(song.thumbnail)
            .addFields({ name: '🎛️ কন্ট্রোল কমান্ডস', value: 'বিরতি: `!pause` | চালু: `!resume` | পরবর্তী গান: `!skip` | বন্ধ: `!stop` '})
            .setFooter({ text: 'Karaoke & Premium Audio Theme System' })
            .setTimestamp();

        serverQueue.textChannel.send({ embeds: [nowPlayingEmbed] });

        serverQueue.player.once(AudioPlayerStatus.Idle, () => {
            serverQueue.songs.shift();
            playSong(guildId, serverQueue.songs[0]);
        });

    } catch (err) {
        console.error(err);
    }
}

client.login(process.env.TOKEN);

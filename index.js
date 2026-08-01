const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, getVoiceConnection } = require('@discordjs/voice');
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
const queues = new Map(); // প্রতিটি সার্ভারের গানের সিরিয়াল (Queue) রাখার জন্য

client.once('ready', () => {
    console.log(`✅ ${client.user.tag} হিসেবে লারা মিউজিক বট অনলাইন!`);
});

// গান প্লে করার মেইন ফাংশন
async function playSong(guildId, song) {
    const serverQueue = queues.get(guildId);
    if (!song) {
        serverQueue.connection.destroy();
        queues.delete(guildId);
        return;
    }

    try {
        const stream = await play.stream(song.url);
        const resource = createAudioResource(stream.stream, { inputType: stream.type });
        
        serverQueue.player.play(resource);
        serverQueue.textChannel.send(`🎶 এখন প্লে হচ্ছে: **${song.title}**`);
    } catch (error) {
        console.error(error);
        serverQueue.textChannel.send('❌ গানটি প্লে করতে সমস্যা হচ্ছে, পরবর্তী গানে যাওয়া হচ্ছে।');
        serverQueue.songs.shift();
        playSong(guildId, serverQueue.songs[0]);
    }
}

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const serverQueue = queues.get(message.guild.id);

    // ১. !play <গান> (গান প্লে এবং কিউতে যোগ করা)
    if (command === 'play') {
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) return message.reply('❌ আগে ভয়েস চ্যানেলে জয়েন করুন!');

        const songName = args.join(' ');
        if (!songName) return message.reply('❌ গানের নাম বা লিংক দিন। যেমন: `!play fariha` ');

        await message.channel.send(`🔍 **"${songName}"** খোঁজা হচ্ছে...`);

        try {
            const yt_info = await play.search(songName, { limit: 1 });
            if (!yt_info.length) return message.reply('❌ গান পাওয়া যায়নি!');

            const song = { title: yt_info[0].title, url: yt_info[0].url };

            if (!serverQueue) {
                const queueContruct = {
                    textChannel: message.channel,
                    voiceChannel: voiceChannel,
                    connection: null,
                    player: createAudioPlayer(),
                    songs: [],
                    loop: false
                };

                queues.set(message.guild.id, queueContruct);
                queueContruct.songs.push(song);

                const connection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: message.guild.id,
                    adapterCreator: message.guild.voiceAdapterCreator,
                });

                queueContruct.connection = connection;
                connection.subscribe(queueContruct.player);

                playSong(message.guild.id, queueContruct.songs[0]);

                queueContruct.player.on(AudioPlayerStatus.Idle, () => {
                    if (queueContruct.loop) {
                        // লুপ অন থাকলে একই গান আবার চলবে
                        playSong(message.guild.id, queueContruct.songs[0]);
                    } else {
                        // লুপ অফ থাকলে পরের গান চলবে
                        queueContruct.songs.shift();
                        playSong(message.guild.id, queueContruct.songs[0]);
                    }
                });

            } else {
                serverQueue.songs.push(song);
                return message.channel.send(`✅ **${song.title}** গানটি সিরিয়ালে (Queue) যোগ করা হয়েছে!`);
            }
        } catch (err) {
            console.log(err);
            return message.reply('❌ গানটি লোড করতে সমস্যা হয়েছে!');
        }
    }

    // ২. !skip (চলতি গান বাদ দিয়ে পরের গানে যাওয়া)
    if (command === 'skip') {
        if (!message.member.voice.channel) return message.reply('❌ আপনাকে ভয়েস চ্যানেলে থাকতে হবে!');
        if (!serverQueue || serverQueue.songs.length <= 1) return message.reply('❌ সিরিয়ালে আর কোনো গান নেই যা স্কিপ করা যাবে!');
        
        serverQueue.player.stop();
        return message.reply('⏭️ গানটি স্কিপ করা হয়েছে!');
    }

    // ৩. !stop (সব গান বন্ধ করে বট লিভ করবে)
    if (command === 'stop') {
        if (!message.member.voice.channel) return message.reply('❌ আপনাকে ভয়েস চ্যানেলে থাকতে হবে!');
        if (!serverQueue) return message.reply('❌ কোনো গান চলছে না!');
        
        serverQueue.songs = [];
        serverQueue.player.stop();
        serverQueue.connection.destroy();
        queues.delete(message.guild.id);
        return message.reply('🛑 সব গান বন্ধ করা হয়েছে এবং বট চ্যানেল থেকে বিদায় নিয়েছে!');
    }

    // ৪. !queue (সিরিয়ালে থাকা সব গানের লিস্ট দেখা)
    if (command === 'queue') {
        if (!serverQueue || !serverQueue.songs.length) return message.reply('❌ সিরিয়ালে বর্তমানে কোনো গান নেই!');
        
        let queueList = `🎵 **চলতি গানের তালিকা:**\n`;
        serverQueue.songs.forEach((song, index) => {
            queueList += `${index === 0 ? '▶️ এখন চলছে' : `${index}.`} - **${song.title}**\n`;
        });
        return message.channel.send(queueList);
    }

    // ৫. !pause (গান সাময়িক বন্ধ করা)
    if (command === 'pause') {
        if (!serverQueue) return message.reply('❌ কোনো গান চলছে না!');
        serverQueue.player.pause();
        return message.reply('⏸️ গানটি পজ (Pause) করা হয়েছে।');
    }

    // ৬. !resume (পজ করা গান আবার চালু করা)
    if (command === 'resume') {
        if (!serverQueue) return message.reply('❌ কোনো গান চলছে না!');
        serverQueue.player.unpause();
        return message.reply('▶️ গানটি আবার চালু করা হয়েছে।');
    }

    // ৭. !loop (একই গান বারবার চালানো অন/অফ করা)
    if (command === 'loop') {
        if (!serverQueue) return message.reply('❌ কোনো গান চলছে না!');
        serverQueue.loop = !serverQueue.loop;
        return message.reply(`🔄 লুপ মোড এখন **${serverQueue.loop ? 'চালু (ON)' : 'বন্ধ (OFF)'}** করা হয়েছে!`);
    }
});

client.login(process.env.DISCORD_TOKEN);

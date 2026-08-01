const { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    REST, 
    Routes, 
    EmbedBuilder, 
    ActivityType 
} = require('discord.js');
require('dotenv').config();

// ১. ক্লায়েন্ট ইনিশিয়েলাইজেশন (সব প্রয়োজনীয় ইনটেন্টস সহ)
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ],
    partials: [Partials.Channel, Partials.Message]
});

// বটের ডিফল্ট প্রিফিক্স (লারা বটের মতো পরিবর্তনযোগ্য করার বেস)
const PREFIX = '!'; 

// ২. স্লাশ কমান্ডের ডেটাবেস/লিস্ট তৈরি
const commandsJSON = [
    {
        name: 'ping',
        description: 'বটের লেটেন্সি বা পিং চেক করুন',
    },
    {
        name: 'play',
        description: 'যেকোনো গান প্লে করুন (লারা মিউজিক সিস্টেম)',
        options: [
            {
                name: 'query',
                type: 3, // STRING type
                description: 'গানের নাম বা ইউটিউব লিংক',
                required: true
            }
        ]
    },
    {
        name: 'help',
        description: 'বটের সব কমান্ডের তালিকা দেখুন',
    }
];

// ৩. বটের রেডি ইভেন্ট (অনলাইন হওয়া এবং স্লাশ কমান্ড রেজিস্ট্রি)
client.once('ready', async () => {
    console.log(`Log in সফল হয়েছে! বট হিসেবে প্রস্তুত: ${client.user.tag}`);
    
    // বটের স্ট্যাটাস সেট করা (Lara Bot Style)
    client.user.setActivity({
        name: `${PREFIX}help | /help`,
        type: ActivityType.Listening
    });

    // গ্লোবাল স্লাশ কমান্ড রেজিস্ট্রি করা
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        console.log('স্লাশ (/) কমান্ডগুলো রিফ্রেশ করা হচ্ছে...');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commandsJSON }
        );
        console.log('সফলভাবে সব স্লাশ (/) কমান্ড রেজিস্ট্রি হয়েছে!');
    } catch (error) {
        console.error('স্লাশ কমান্ড লোড করতে ভুল হয়েছে:', error);
    }
});

// ৪. প্রিফিক্স (!) কমান্ড হ্যান্ডলার
client.on('messageCreate', async (message) => {
    // বট নিজে মেসেজ দিলে বা প্রিফিক্স ছাড়া মেসেজ আসলে ইগনোর করবে
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    // পিং কমান্ড (!ping)
    if (commandName === 'ping') {
        const msg = await message.reply('পিং গণনা করা হচ্ছে...');
        const latency = msg.createdTimestamp - message.createdTimestamp;
        return msg.edit(`🏓 পং! বটের লেটেন্সি: **${latency}ms** | API লেটেন্সি: **${Math.round(client.ws.ping)}ms**`);
    }

    // প্লে কমান্ড (!play <গান>)
    if (commandName === 'play') {
        const query = args.join(' ');
        if (!query) return message.reply(`❌ দয়া করে গানের নাম লিখুন! সঠিক ব্যবহার: \`${PREFIX}play [গানের নাম]\``);
        
        if (!message.member.voice.channel) {
            return message.reply('❌ এই কমান্ডটি ব্যবহারের জন্য আপনাকে আগে একটি ভয়েস চ্যানেলে জয়েন করতে হবে!');
        }

        return message.reply(`🎵 **${query}** গানটি খোঁজা হচ্ছে এবং প্লে করার প্রস্তুতি নেওয়া হচ্ছে...`);
    }

    // হেল্প কমান্ড (!help)
    if (commandName === 'help') {
        const helpEmbed = new EmbedBuilder()
            .setColor('#7289DA')
            .setTitle('✨ Lara Bot - কমান্ড হেল্প লিস্ট')
            .setDescription(`বটের বর্তমান প্রিফিক্স হলো: \`${PREFIX}\`\nআপনি নিচের কমান্ডগুলো প্রিফিক্স অথবা স্লাশ (\`/\`) দুটি দিয়েই ব্যবহার করতে পারবেন।`)
            .addFields(
                { name: `• ${PREFIX}ping / /ping`, value: 'বটের গতি বা রেসপন্স টাইম চেক করুন।' },
                { name: `• ${PREFIX}play <গান> / /play`, value: 'ভয়েস চ্যানেলে হাই-কোয়ালিটি গান শুনুন।' },
                { name: `• ${PREFIX}help / /help`, value: 'বটের সব কমান্ডের গাইডলাইন দেখুন।' }
            )
            .setFooter({ text: 'Lara Music System', iconURL: client.user.displayAvatarURL() })
            .setTimestamp();

        return message.reply({ embeds: [helpEmbed] });
    }
});

// ৫. স্লাশ (/) কমান্ড হ্যান্ডলার
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    // স্লাশ পিং (/ping)
    if (commandName === 'ping') {
        const sent = await interaction.reply({ content: 'পিং গণনা করা হচ্ছে...', fetchReply: true });
        const latency = sent.createdTimestamp - interaction.createdTimestamp;
        return interaction.editReply(`🏓 পং! বটের লেটেন্সি: **${latency}ms** | API লেটেন্সি: **${Math.round(client.ws.ping)}ms**`);
    }

    // স্লাশ প্লে (/play)
    if (commandName === 'play') {
        const query = interaction.options.getString('query');
        
        if (!interaction.member.voice.channel) {
            return interaction.reply({ content: '❌ এই কমান্ডটি ব্যবহারের জন্য আপনাকে আগে একটি ভয়েস চ্যানেলে জয়েন করতে হবে!', ephemeral: true });
        }

        return interaction.reply(`🎵 **${query}** গানটি খোঁজা হচ্ছে এবং প্লে করার প্রস্তুতি নেওয়া হচ্ছে...`);
    }

    // স্লাশ হেল্প (/help)
    if (commandName === 'help') {
        const helpEmbed = new EmbedBuilder()
            .setColor('#7289DA')
            .setTitle('✨ Lara Bot - কমান্ড হেল্প লিস্ট')
            .setDescription(`বটের বর্তমান প্রিফিক্স হলো: \`${PREFIX}\`\nআপনি নিচের কমান্ডগুলো প্রিফিক্স অথবা স্লাশ (\`/\`) দুটি দিয়েই ব্যবহার করতে পারবেন।`)
            .addFields(
                { name: `• ${PREFIX}ping / /ping`, value: 'বটের গতি বা রেসপন্স টাইম চেক করুন।' },
                { name: `• ${PREFIX}play <গান> / /play`, value: 'ভয়েস চ্যানেলে হাই-কোয়ালিটি গান শুনুন।' },
                { name: `• ${PREFIX}help / /help`, value: 'বটের সব কমান্ডের গাইডলাইন দেখুন।' }
            )
            .setFooter({ text: 'Lara Music System', iconURL: client.user.displayAvatarURL() })
            .setTimestamp();

        return interaction.reply({ embeds: [helpEmbed] });
    }
});

// ক্র্যাশ হ্যান্ডলিং (বট যেন কোনো ভুলের কারণে বন্ধ না হয়ে যায়)
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});
 // Render-এর পোর্ট সমস্যা সমাধানের জন্য ডামি ওয়েব সার্ভার
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Lara Bot is running 24/7!');
});

app.listen(PORT, () => {
    console.log(`ডামি ওয়েব সার্ভার চালু হয়েছে পোর্ট: ${PORT}`);
});
// ৬. বট লগইন (এনভায়রনমেন্ট ফাইল থেকে টোকেন রিড করবে)
client.login(process.env.TOKEN);

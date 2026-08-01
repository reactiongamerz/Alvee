const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once('ready', () => {
    console.log(`✅ ${client.user.tag} এখন অনলাইন ও প্রস্তুত!`);
});

client.on('messageCreate', async (message) => {
    if (message.content === '!ping') {
        message.reply('🏓 Pong! বট ঠিকঠাক কাজ করছে।');
    }
});

client.login(process.env.TOKEN);

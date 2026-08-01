use std::env;
use serenity::async_trait;
use serenity::prelude::*;
use serenity::model::gateway::Ready;
use serenity::model::channel::Message;

struct Handler;

#[async_trait]
impl EventHandler for Handler {
    async fn message(&self, ctx: Context, msg: Message) {
        if msg.content == "!ping" {
            if let Err(why) = msg.channel_id.say(&ctx.http, "🏓 Pong! বট সচল আছে।").await {
                println!("Error sending message: {:?}", why);
            }
        }
    }

    async fn ready(&self, _: Context, ready: Ready) {
        println!("✅ {} এখন অনলাইন ও প্রস্তুত!", ready.user.name);
    }
}

#[tokio::main]
async fn main() {
    let token = env::var("TOKEN").expect("Expected a token in the environment");
    let intents = GatewayIntents::GUILD_MESSAGES | GatewayIntents::MESSAGE_CONTENT;
    let mut client = Client::builder(&token, intents).event_handler(Handler).await.expect("Err creating client");

    if let Err(why) = client.start().await {
        println!("Client error: {:?}", why);
    }
}

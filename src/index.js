import {
  ChannelType,
  Client,
  GatewayIntentBits,
  ThreadAutoArchiveDuration,
  SlashCommandBuilder,
} from "discord.js";
import { REST, Routes } from "discord.js";

const { TOKEN, CLIENT_ID } = process.env;

const THREAD_ONLY_CHANNELS = [
  "1244781263680831558", // online-events
  "1244779968748322847", // vancovuer-events
  "1244781299525222593", // alberta-events
  "1246187757366411414", // cool-jobs-paid
];

const LOG_CHANNEL = "1251326681113956484";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const commands = [
  new SlashCommandBuilder().setName("ping").setDescription("Pong!"),
  new SlashCommandBuilder()
    .setName("rename")
    .setDescription("Rename the current thread")
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("New thread name")
        .setRequired(true),
    ),
].map((command) => command.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

try {
  console.log("Started refreshing application (/) commands.");

  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });

  console.log("Successfully reloaded application (/) commands.");
} catch (error) {
  console.error(error);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const isSelf = (message) =>
  message.system ||
  message.author.bot ||
  message.author.system ||
  message.author.id === CLIENT_ID;

const log = async (message) => {
  const channel = await client.channels.fetch(LOG_CHANNEL);
  await channel.send({
    content: null,
    embeds: [
      {
        title: "Auto Moderation",
        description: message,
        color: 16773120,
      },
    ],
  });
};

client.on("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "ping") {
    await interaction.reply("Pong!");
  }

  if (interaction.commandName === "rename") {
    const name = interaction.options.getString("name");
    log(
      `${interaction.author.username} (<@${interaction.author.id}>) attempted to rename <#${interaction.channelId}> with "${name}"`,
    );

    if (
      interaction.channel.type !== ChannelType.PublicThread ||
      interaction.channel.ownerId !== CLIENT_ID
    ) {
      await interaction.reply({
        content: "I can only rename threads I've made",
        ephemeral: true,
      });
      return;
    }

    if (!name) {
      await interaction.reply({
        content: "Thread name required.",
        ephemeral: true,
      });
      return;
    }

    try {
      await interaction.channel.edit({ name: name.substring(0, 100) });
    } catch (e) {
      console.error(e);
      await interaction.reply({
        content: "Invalid thread name.",
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      content: "Done!",
      ephemeral: true,
    });
  }
});

const isThreadedChannels = (message) =>
  THREAD_ONLY_CHANNELS.some((id) => id === message.channelId);

const isMediaMessage = (message) =>
  Array.from(message.attachments).length > 0 ||
  /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/gi.test(
    message.content,
  );

client.on("messageCreate", async (message) => {
  if (isSelf(message)) return;
  if (!isThreadedChannels(message)) return;
  if (!isMediaMessage(message)) {
    log(
      `Deleted "${message.content}" from ${message.author.username} (<@${message.author.id}>) in <#${message.channelId}>`,
    );
    const notThreadWarning = await message.reply({
      content: "Please discuss events in their threads (Links and media only)",
    });
    await message.delete();
    await delay(10000);
    await notThreadWarning.delete();
    return;
  }
  if (message.channel.type === ChannelType.PublicThread) return;

  try {
    const thread = await message.startThread({
      autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
      name:
        message.content?.substring(0, 100) ||
        `${message.author.displayName}'s Event`,
    });
    await thread.send(
      `Thank you <@${message.author.id}> for posting this event! Use \`/rename\` to rename this thread :slight_smile:`,
    );
    if (message.crosspostable) {
      await message.crosspost();
    }
  } catch (e) {
    // idk, who cares
    console.error(e);
  }
  return;
});

client.login(TOKEN);

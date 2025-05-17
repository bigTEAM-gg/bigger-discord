import {
  ChannelType,
  Client,
  GatewayIntentBits,
  ThreadAutoArchiveDuration,
  SlashCommandBuilder,
} from "discord.js";
import { REST, Routes } from "discord.js";
import { generateTitle } from './llm.js';

const { TOKEN, CLIENT_ID } = process.env;

const YOU_ONLY_POST_ONCE = [
  // "1373127153884987522" // testing
  "1141394795592421396" // Introductions
]

const THREAD_ONLY_CHANNELS = [
  // "1286168855978442793", // Test channel
  "1244781263680831558", // online-events
  "1244779968748322847", // vancovuer-events
  "1244781299525222593", // alberta-events
  "1246187757366411414", // cool-jobs-paid
  "1286538455274225686", // funny-ai
  "1288215976063668435", // Inktober
  "1293738751360630814", // commisions-open
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

const log = async (message, title = 'Auto Moderation') => {
  // if (true) return; // test channel please ignore
  const channel = await client.channels.fetch(LOG_CHANNEL);
  await channel.send({
    content: null,
    embeds: [
      {
        title: title,
        description: message,
        color: 16773120,
      },
    ],
  });
};

const isMyThread = (channel) => (
  [ChannelType.PublicThread, ChannelType.AnnouncementThread, ChannelType.PrivateThread].some(t => t === channel.type)
  && channel.ownerId === CLIENT_ID
);

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

    if (!isMyThread(interaction.channel)) {
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

    log(
      `${interaction.user.username} (<@${interaction.user.id}>) renamed <#${interaction.channelId}> with "${name}"`,
      'Thread edited'
    );

    await interaction.reply({
      content: "Done!",
      ephemeral: true,
    });
  }
});

const isIntroduction = (message) => 
  YOU_ONLY_POST_ONCE.some((id) => id === message.channelId);


const isThreadedChannels = (message) =>
  THREAD_ONLY_CHANNELS.some((id) => id === message.channelId);

const isMediaMessage = (message) =>
  Array.from(message.attachments).length > 0 ||
  /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/gi.test(
    message.content,
  );

const userHasThreadedBefore = async (message) => {
  return false;
  // const activeThreads = await message.channel.threads.fetchActive();
  // const archivedThreads = await message.channel.threads.fetchArchived();

  // return [...activeThreads.threads.values(), ...archivedThreads.threads.values()].some(thread => {
  //   const starterMessage = thread.fetchStarterMessage();
  //   return starterMessage.author.id === message.author.id;
  // });
}

client.on("messageCreate", async (message) => {
  if (isSelf(message)) return;
  if (isThreadedChannels(message)) {
    if (!isMediaMessage(message)) {
      log(
        `Deleted "${message.content}" from ${message.author.username} (<@${message.author.id}>) in <#${message.channelId}>`,
      );
      const notThreadWarning = await message.reply({
        content: "Please discuss events in their threads (Links and media only)",
      });
      await delay(10000);
      await message.delete();
      await notThreadWarning.delete();
      return;
    }
    if (message.channel.type === ChannelType.PublicThread) return;

    let eventName = `${message.author.displayName}'s Cool Event`;
    eventName = await generateTitle(message.content || eventName);
    const thread = await message.startThread({
      autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
      name: eventName,
    });
    await thread.send(
      `Thank you <@${message.author.id}> for posting this! Use \`/rename\` to rename this thread :slight_smile:`,
    );
    if (message.crosspostable) {
      await message.crosspost();
    }
    return;
  }
  if (isIntroduction(message)) {
    if (message.channel.type === ChannelType.PublicThread) return;

    if (await userHasThreadedBefore(message)) {
      log(
        `Deleted "${message.content}" from ${message.author.username} (<@${message.author.id}>) in <#${message.channelId}>`,
      );
      const userThreadedBeforeWarning = await message.reply({
        content: "You have intro'd already! (Reply in someone's introduction thread)",
      });
      await delay(10000);
      await message.delete();
      await userThreadedBeforeWarning.delete();
    }

    let threadName = `${message.author.displayName}'s Introduction`;
    const thread = await message.startThread({
      autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
      name: threadName,
    });
    await thread.send(
      `Welcome <@${message.author.id}> to the server! A moderator will verify you shortly :slight_smile:`
    );
    return;
  }
});

client.login(TOKEN);

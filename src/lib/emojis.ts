/**
 * Émojis du sélecteur de la page Messages : émojis Unicode natifs, dessinés par le système (aucune
 * image, aucune bibliothèque). Choisis jusqu'à Emoji 12, que Windows 10 sait encore afficher.
 */

export type EmojiGroup = { id: string; label: string; icon: string; emojis: string[] };

const list = (emojis: string) => emojis.split(" ").filter(Boolean);

export const EMOJI_GROUPS: EmojiGroup[] = [
  {
    id: "faces",
    label: "Visages",
    icon: "😀",
    emojis: list(
      "😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 💩 🤡 👻 👽 🤖",
    ),
  },
  {
    id: "hands",
    label: "Gestes",
    icon: "👍",
    emojis: list("👋 🤚 ✋ 🖖 👌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏 💪 👀 🧠 🙈 🙉 🙊"),
  },
  {
    id: "hearts",
    label: "Cœurs",
    icon: "❤️",
    emojis: list("❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💯 💢 💥 💫 💦 💤 🔥 ✨ ⭐ 🌟"),
  },
  {
    id: "game",
    label: "Jeu",
    icon: "🎮",
    emojis: list("🎮 🕹️ ⚔️ 🗡️ 🏹 🛡️ ⛏️ 🪓 🧱 💎 🏆 🥇 🥈 🥉 🎯 🎲 🧩 🏰 🌋 🧨 💣 🐉 🧟 🕷️ 🐷 🐄 🐔 🐺 🐱 🐶 🍀 🌲 🌳 🌵 🍄 🌙 ☀️ 🌧️ ❄️ ⚡ 🌈"),
  },
  {
    id: "food",
    label: "Nourriture",
    icon: "🍕",
    emojis: list("🍎 🍉 🍓 🍒 🍌 🍇 🥕 🥔 🍞 🥖 🧀 🍖 🍗 🥩 🍔 🍟 🍕 🌭 🌮 🍿 🍩 🍪 🎂 🍰 🍫 🍬 🍭 🍦 ☕ 🧃 🥤"),
  },
  {
    id: "symbols",
    label: "Objets et symboles",
    icon: "🎉",
    emojis: list("🎉 🎊 🎁 🎈 🎵 🎶 📣 💬 💭 🔔 ⏰ ⌛ 📌 🔒 🔑 💡 📷 💻 📱 ✅ ❌ ⚠️ ❓ ❗ 🆗 🆒 🆕 🔝 ➡️ ⬅️ ⬆️ ⬇️ 🔁 ➕ ➖ 🟩 🟨 🟥 🟦 🟪"),
  },
];

/** Émojis récents gardés sur le poste. */
const RECENT_KEY = "clover.messages.recent-emojis";
const RECENT_MAX = 24;

export function recentEmojis(): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(stored) ? stored.filter((emoji): emoji is string => typeof emoji === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function rememberEmoji(emoji: string): string[] {
  const next = [emoji, ...recentEmojis().filter((other) => other !== emoji)].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Stockage indisponible : les récents restent le temps de la session.
  }
  return next;
}

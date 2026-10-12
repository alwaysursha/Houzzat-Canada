/**
 * Compact emoji catalog for chat composers. No third-party picker dependency.
 */

export type ChatEmojiCategoryId =
  | "frequent"
  | "smileys"
  | "gestures"
  | "hearts"
  | "objects";

export type ChatEmojiCategory = {
  id: ChatEmojiCategoryId;
  label: string;
  emojis: readonly string[];
};

/**
 * Quick-reaction strip (WhatsApp-inspired order).
 * Legacy 😊 remains allowed for existing MessageReaction rows.
 */
export const CHAT_QUICK_REACTION_KEYS = [
  "👍",
  "❤️",
  "😂",
  "😮",
  "😢",
  "🙏",
  "😡",
] as const;

/** Allowed reaction keys (quick set + legacy smile). */
export const CHAT_REACTION_KEYS = [
  ...CHAT_QUICK_REACTION_KEYS,
  "😊",
] as const;

export type ChatReactionKey = (typeof CHAT_REACTION_KEYS)[number];

export const CHAT_EMOJI_CATEGORIES: readonly ChatEmojiCategory[] = [
  {
    id: "frequent",
    label: "Frequent",
    emojis: [...CHAT_QUICK_REACTION_KEYS, "😊", "🎉", "🔥", "✨", "👏", "💯"],
  },
  {
    id: "smileys",
    label: "Smileys",
    emojis: [
      "😀",
      "😃",
      "😄",
      "😁",
      "😅",
      "😂",
      "🤣",
      "😊",
      "😇",
      "🙂",
      "😉",
      "😌",
      "😍",
      "🥰",
      "😘",
      "😋",
      "😜",
      "🤔",
      "🤨",
      "😐",
      "😑",
      "😶",
      "🙄",
      "😏",
      "😣",
      "😥",
      "😮",
      "😯",
      "😪",
      "😫",
      "🥱",
      "😴",
      "😷",
      "🤒",
      "🤕",
      "🤢",
      "🤮",
      "🥵",
      "🥶",
      "😎",
      "🤓",
      "🧐",
      "😕",
      "😟",
      "🙁",
      "☹️",
      "😮‍💨",
      "😤",
      "😢",
      "😭",
      "😱",
      "😳",
      "🤗",
      "🤭",
      "🤫",
      "🤥",
    ],
  },
  {
    id: "gestures",
    label: "Gestures",
    emojis: [
      "👍",
      "👎",
      "👌",
      "✌️",
      "🤞",
      "🤟",
      "🤘",
      "🤙",
      "👈",
      "👉",
      "👆",
      "👇",
      "☝️",
      "✋",
      "🤚",
      "🖐️",
      "🖖",
      "👋",
      "🤝",
      "🙏",
      "💪",
      "🦾",
      "✍️",
      "💅",
      "🤳",
      "💃",
      "🕺",
      "🙌",
      "👏",
      "👐",
    ],
  },
  {
    id: "hearts",
    label: "Hearts",
    emojis: [
      "❤️",
      "🧡",
      "💛",
      "💚",
      "💙",
      "💜",
      "🖤",
      "🤍",
      "🤎",
      "💔",
      "❣️",
      "💕",
      "💞",
      "💓",
      "💗",
      "💖",
      "💘",
      "💝",
    ],
  },
  {
    id: "objects",
    label: "Objects",
    emojis: [
      "🏠",
      "🏡",
      "🔑",
      "🗝️",
      "📍",
      "📌",
      "📅",
      "🗓️",
      "⏰",
      "💼",
      "📁",
      "📄",
      "📝",
      "✏️",
      "📞",
      "📱",
      "💬",
      "💡",
      "🔔",
      "🎉",
      "🎊",
      "🎁",
      "⭐",
      "🌟",
      "✨",
      "🔥",
      "💰",
      "💵",
      "📈",
      "📉",
      "✅",
      "❌",
      "⚠️",
      "❓",
      "❗",
    ],
  },
] as const;

const REACTION_KEY_SET = new Set<string>(CHAT_REACTION_KEYS);

export function isAllowedChatReactionKey(raw: string): raw is ChatReactionKey {
  return REACTION_KEY_SET.has(raw);
}

export function normalizeChatReactionKey(raw: string): ChatReactionKey | null {
  const key = raw.trim();
  if (!isAllowedChatReactionKey(key)) return null;
  return key;
}

const EMOJI_ALIASES: Record<string, readonly string[]> = {
  "👍": ["thumb", "thumbs", "like", "yes", "approve"],
  "❤️": ["heart", "love", "red"],
  "😂": ["laugh", "lol", "joy", "tears"],
  "😊": ["smile", "happy", "blush"],
  "😮": ["wow", "surprised", "open mouth", "oh"],
  "😢": ["cry", "sad", "tear"],
  "😡": ["angry", "mad", "rage"],
  "🙏": ["pray", "thanks", "please", "folded"],
  "🎉": ["party", "celebrate", "tada"],
  "🔥": ["fire", "lit", "hot"],
  "✨": ["sparkle", "stars"],
  "👏": ["clap", "applause"],
  "🏠": ["home", "house"],
  "💬": ["chat", "message", "speech"],
};

/** Case-insensitive substring filter across the catalog + aliases. */
export function searchChatEmojis(query: string): string[] {
  const q = query.trim().toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const category of CHAT_EMOJI_CATEGORIES) {
    for (const emoji of category.emojis) {
      if (seen.has(emoji)) continue;
      const aliases = EMOJI_ALIASES[emoji] ?? [];
      const aliasHit = aliases.some((alias) => alias.includes(q) || q.includes(alias));
      if (
        !q ||
        emoji.includes(q) ||
        category.label.toLowerCase().includes(q) ||
        aliasHit
      ) {
        seen.add(emoji);
        out.push(emoji);
      }
    }
  }
  return out;
}

/**
 * Insert emoji into a text value at a caret offset (UTF-16 code units,
 * matching textarea selectionStart/selectionEnd).
 */
export function insertEmojiAtCursor(input: {
  value: string;
  emoji: string;
  selectionStart: number;
  selectionEnd: number;
}): { value: string; selectionStart: number; selectionEnd: number } {
  const start = Math.max(0, Math.min(input.selectionStart, input.value.length));
  const end = Math.max(start, Math.min(input.selectionEnd, input.value.length));
  const value =
    input.value.slice(0, start) + input.emoji + input.value.slice(end);
  const caret = start + input.emoji.length;
  return { value, selectionStart: caret, selectionEnd: caret };
}

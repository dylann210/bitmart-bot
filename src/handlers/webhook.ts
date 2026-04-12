import type { Context } from 'hono';
import type { Env, TelegramUpdate, TelegramMessage, TelegramChatMemberUpdated } from '../types';
import { sendMessage, deleteMessage, setMyCommands } from '../telegram/api';
import {
  upsertGroupSettings,
  getGroupSettings,
  insertMember,
  getMemberCount,
  updateWelcomeMessage,
  getAllGroups,
  getMembersByGroup,
  toggleWelcome,
  addViewer,
  removeViewer,
  isViewer,
} from '../db/queries';
import { isAdmin, buildWelcomeMessage, delay, unixToISO, normalizeGroupId } from '../utils';
import { runSync } from './sync';

export async function handleWebhook(c: Context<{ Bindings: Env }>): Promise<Response> {
  const update = (await c.req.json()) as TelegramUpdate;
  const env = c.env;

  if (update.my_chat_member) {
    await handleBotMembership(update.my_chat_member, env);
  } else if (update.chat_member) {
    await handleChatMember(update.chat_member, env, c.executionCtx);
  } else if (update.message) {
    await handleMessage(update.message, env, c.executionCtx);
  }

  return c.json({ ok: true });
}

async function handleBotMembership(
  event: TelegramChatMemberUpdated,
  env: Env
): Promise<void> {
  const { chat, new_chat_member, date } = event;

  if (
    new_chat_member.user.is_bot &&
    (new_chat_member.status === 'member' || new_chat_member.status === 'administrator')
  ) {
    const groupId = String(chat.id);
    const groupTitle = chat.title ?? 'Unknown Group';
    const botAddedAt = unixToISO(date);

    await upsertGroupSettings(env.DB, groupId, groupTitle, botAddedAt);

    const adminIds = env.ADMIN_TG_IDS.split(',').map((id) => id.trim());
    for (const adminId of adminIds) {
      await sendMessage(
        env.TELEGRAM_BOT_TOKEN,
        adminId,
        `Bot has been added to group *${groupTitle}*.\nNew members will be tracked from now on.`
      );
    }
  }
}

async function handleChatMember(
  event: TelegramChatMemberUpdated,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const { chat, from, old_chat_member, new_chat_member, invite_link, date } = event;
  const user = new_chat_member.user;

  // Chỉ xử lý khi user mới join (từ left/kicked → member/restricted/administrator/creator)
  const wasOut = ['left', 'kicked'].includes(old_chat_member.status);
  const isIn = ['member', 'restricted', 'administrator', 'creator'].includes(new_chat_member.status);
  if (!wasOut || !isIn || user.is_bot) return;

  const groupId = String(chat.id);
  const joinedAt = unixToISO(date);

  let invitorId: string | null = null;
  let invitorUsername: string | null = null;
  let inviteLinkStr: string | null = null;

  if (invite_link) {
    // Join qua invite link → creator của link là người mời
    invitorId = String(invite_link.creator.id);
    invitorUsername = invite_link.creator.username ?? null;
    inviteLinkStr = invite_link.invite_link;
  } else if (from.id !== user.id) {
    // Được admin/member thêm trực tiếp
    invitorId = String(from.id);
    invitorUsername = from.username ?? null;
  }
  // Nếu from.id === user.id và không có invite_link → tự join group public (không có người mời)

  await insertMember(
    env.DB, groupId, String(user.id),
    user.username ?? null, user.first_name ?? null, user.last_name ?? null,
    joinedAt, invitorId, invitorUsername, inviteLinkStr
  );

  const settings = await getGroupSettings(env.DB, groupId);
  if (settings?.welcome_enabled === 0) return;

  const memberCount = await getMemberCount(env.DB, groupId);
  const template = settings?.welcome_message ?? env.DEFAULT_WELCOME_MESSAGE;
  const welcomeText = buildWelcomeMessage(template, user, chat, memberCount);
  const sent = await sendMessage(env.TELEGRAM_BOT_TOKEN, chat.id, welcomeText, 'none');

  if (sent.ok && sent.result) {
    const deleteSec = parseInt(env.WELCOME_AUTO_DELETE_SECONDS ?? '5', 10);
    ctx.waitUntil(
      delay(deleteSec * 1000)
        .then(() => deleteMessage(env.TELEGRAM_BOT_TOKEN, chat.id, sent.result!.message_id))
        .catch(() => {})
    );
  }
}

async function handleMessage(
  message: TelegramMessage,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  // new_chat_members là service message cũ của Telegram, không chứa invite_link
  // Việc insert member và gửi welcome đã được chuyển sang handleChatMember (chat_member update)
  if (message.new_chat_members) return;

  // Handle commands
  const text = message.text?.trim() ?? '';
  if (!text.startsWith('/')) return;

  // Block all commands in groups/supergroups
  if (message.chat.type !== 'private') {
    // Optional: Delete the command message if bot is admin to keep group clean
    // await deleteMessage(env.TELEGRAM_BOT_TOKEN, message.chat.id, message.message_id);
    return;
  }

  const [rawCmd, ...args] = text.split(/\s+/);
  const cmd = rawCmd.split('@')[0].toLowerCase();

  const fromId = message.from?.id;
  if (!fromId) return;

  const admin = isAdmin(fromId, env.ADMIN_TG_IDS);
  const viewer = !admin && await isViewer(env.DB, String(fromId));

  const viewerAllowedCmds = ['/listgroups', '/listuser'];

  if (!admin && !viewer) {
    await sendMessage(
      env.TELEGRAM_BOT_TOKEN,
      message.chat.id,
      'You do not have permission to use this command.',
      'none'
    );
    return;
  }

  if (viewer && !viewerAllowedCmds.includes(cmd)) {
    await sendMessage(
      env.TELEGRAM_BOT_TOKEN,
      message.chat.id,
      'You only have access to /listgroups and /listuser.',
      'none'
    );
    return;
  }

  const groupId = String(message.chat.id);

  switch (cmd) {
    case '/setwelcome': {
      const gid = args[0];
      const newMsg = args.slice(1).join(' ');
      if (!gid || !newMsg) {
        await sendMessage(
          env.TELEGRAM_BOT_TOKEN,
          message.chat.id,
          'Usage: `/setwelcome <group_id> <message>`\nVí dụ: `/setwelcome -1003778466273 Chào {mention}!`'
        );
        return;
      }
      const targetGroupId = normalizeGroupId(gid);
      const targetSettings = await getGroupSettings(env.DB, targetGroupId);
      if (!targetSettings) {
        await sendMessage(env.TELEGRAM_BOT_TOKEN, message.chat.id, `Không tìm thấy group \`${targetGroupId}\`.`, 'none');
        return;
      }
      await updateWelcomeMessage(env.DB, targetGroupId, newMsg);
      await sendMessage(env.TELEGRAM_BOT_TOKEN, message.chat.id, `Welcome message đã cập nhật cho group \`${targetGroupId}\`.`, 'none');
      break;
    }

    case '/getwelcome': {
      const gid = args[0];
      if (!gid) {
        await sendMessage(env.TELEGRAM_BOT_TOKEN, message.chat.id, 'Usage: `/getwelcome <group_id>`');
        return;
      }
      const targetGroupId = normalizeGroupId(gid);
      const settings = await getGroupSettings(env.DB, targetGroupId);
      const current = settings?.welcome_message ?? env.DEFAULT_WELCOME_MESSAGE;
      const escaped = current.replace(/_/g, '\\_');
      await sendMessage(
        env.TELEGRAM_BOT_TOKEN,
        message.chat.id,
        `Welcome message của group \`${targetGroupId}\`:\n\n${escaped}`
      );
      break;
    }

    case '/resetwelcome': {
      const gid = args[0];
      if (!gid) {
        await sendMessage(env.TELEGRAM_BOT_TOKEN, message.chat.id, 'Usage: `/resetwelcome <group_id>`');
        return;
      }
      const targetGroupId = normalizeGroupId(gid);
      await updateWelcomeMessage(env.DB, targetGroupId, null);
      await sendMessage(env.TELEGRAM_BOT_TOKEN, message.chat.id, `Welcome message của group \`${targetGroupId}\` đã reset về mặc định.`, 'none');
      break;
    }

    case '/testwelcome': {
      if (!message.from) return;
      let targetGroupId: string;
      const gid = args[0];
      
      if (gid) {
        targetGroupId = normalizeGroupId(gid);
      } else {
        // If no ID provided in private chat, it will test with default settings
        targetGroupId = groupId;
      }

      const settings = await getGroupSettings(env.DB, targetGroupId);
      const memberCount = await getMemberCount(env.DB, targetGroupId);
      const template = settings?.welcome_message ?? env.DEFAULT_WELCOME_MESSAGE;
      
      // Use a dummy chat object if testing for a group in private chat
      const testChat = settings ? { id: parseInt(targetGroupId), title: settings.group_title ?? 'Test Group', type: 'supergroup' as const } : message.chat;
      
      const testText = buildWelcomeMessage(template, message.from, testChat, memberCount);
      const targetChatId = gid ? targetGroupId : message.chat.id;
      const sent = await sendMessage(env.TELEGRAM_BOT_TOKEN, targetChatId, testText, 'none');

      if (sent.ok && sent.result) {
        const deleteSec = parseInt(env.WELCOME_AUTO_DELETE_SECONDS ?? '5', 10);
        ctx.waitUntil(
          delay(deleteSec * 1000).then(() =>
            deleteMessage(env.TELEGRAM_BOT_TOKEN, targetChatId, sent.result!.message_id)
          )
        );
        if (gid) {
          await sendMessage(env.TELEGRAM_BOT_TOKEN, message.chat.id, `Test welcome đã gửi vào group \`${targetGroupId}\`.`, 'none');
        }
      } else if (gid) {
        await sendMessage(env.TELEGRAM_BOT_TOKEN, message.chat.id, `Không thể gửi vào group \`${targetGroupId}\`. Bot có thể chưa có quyền gửi tin nhắn trong group đó.`, 'none');
      }
      break;
    }

    case '/togglewelcome': {
      let targetGroupId: string;
      if (message.chat.type === 'private') {
        const gid = args[0];
        if (!gid) {
          await sendMessage(
            env.TELEGRAM_BOT_TOKEN,
            message.chat.id,
            'Usage: `/togglewelcome <group_id>`',
            'none'
          );
          return;
        }
        targetGroupId = normalizeGroupId(gid);
      } else {
        targetGroupId = groupId;
      }

      const settings = await getGroupSettings(env.DB, targetGroupId);
      if (!settings) {
        await sendMessage(
          env.TELEGRAM_BOT_TOKEN,
          message.chat.id,
          `Bot is not configured for group ${targetGroupId}.`,
          'none'
        );
        return;
      }
      const newState = settings.welcome_enabled === 0;
      await toggleWelcome(env.DB, targetGroupId, newState);
      await sendMessage(
        env.TELEGRAM_BOT_TOKEN,
        message.chat.id,
        `Welcome message for group *${settings.group_title ?? targetGroupId}* has been *${newState ? 'enabled' : 'disabled'}*.`
      );
      break;
    }

    case '/listgroups': {
      if (message.chat.type !== 'private') {
        await sendMessage(
          env.TELEGRAM_BOT_TOKEN,
          message.chat.id,
          'This command can only be used in private chat with the bot.',
          'none'
        );
        return;
      }

      const groups = await getAllGroups(env.DB);
      if (groups.length === 0) {
        await sendMessage(
          env.TELEGRAM_BOT_TOKEN,
          message.chat.id,
          'Bot has not been added to any group yet.',
          'none'
        );
        return;
      }

      const lines: string[] = ['*Groups managed by bot:*\n'];
      for (let i = 0; i < groups.length; i++) {
        const g = groups[i];
        const count = await getMemberCount(env.DB, g.group_id);
        const joinDate = g.bot_added_at ? g.bot_added_at.split('T')[0] : 'Unknown';
        lines.push(
          `${i + 1}. *${g.group_title ?? 'Unknown'}* (group\\_id: \`${g.group_id}\`)\n` +
          `   • Bot joined: ${joinDate}\n` +
          `   • New members tracked: ${count}`
        );
      }

      await sendMessage(env.TELEGRAM_BOT_TOKEN, message.chat.id, lines.join('\n\n'));
      break;
    }

    case '/listuser': {
      if (message.chat.type !== 'private') {
        await sendMessage(
          env.TELEGRAM_BOT_TOKEN,
          message.chat.id,
          'This command can only be used in private chat with the bot.',
          'none'
        );
        return;
      }
      let targetGroupId = args[0];
      if (!targetGroupId) {
        await sendMessage(
          env.TELEGRAM_BOT_TOKEN,
          message.chat.id,
          'Usage: /listuser <group_id>',
          'none'
        );
        return;
      }
      targetGroupId = normalizeGroupId(targetGroupId);
      const members = await getMembersByGroup(env.DB, targetGroupId);
      if (members.length === 0) {
        await sendMessage(
          env.TELEGRAM_BOT_TOKEN,
          message.chat.id,
          `No members found for group ${targetGroupId}.`,
          'none'
        );
        return;
      }
      const lines = [`Members in group ${targetGroupId} (${members.length} total):\n`];
      for (const m of members) {
        const username = m.username ? `@${m.username}` : '(no username)';
        const fullName = [m.first_name, m.last_name].filter(Boolean).join(' ') || '(no name)';
        const date = m.joined_at.replace('T', ' ').substring(0, 16);
        const invitor = m.invitor_username
          ? `@${m.invitor_username}`
          : m.invitor_id
          ? `id:${m.invitor_id}`
          : m.invite_link
          ? `link`
          : '—';
        lines.push(`• ${m.tg_id} | ${fullName} | ${username} | ${date} | invited by: ${invitor}`);
      }
      const CHUNK = 50;
      for (let i = 0; i < lines.length; i += CHUNK) {
        const part = i === 0 ? lines.slice(0, CHUNK) : lines.slice(i, i + CHUNK);
        await sendMessage(env.TELEGRAM_BOT_TOKEN, message.chat.id, part.join('\n'), 'none');
      }
      break;
    }

    case '/addviewer': {
      const viewerId = args[0];
      if (!viewerId) {
        await sendMessage(
          env.TELEGRAM_BOT_TOKEN,
          message.chat.id,
          'Usage: /addviewer <telegram_id>',
          'none'
        );
        return;
      }
      await addViewer(env.DB, viewerId);
      await sendMessage(
        env.TELEGRAM_BOT_TOKEN,
        message.chat.id,
        `View access granted to user ${viewerId}.`,
        'none'
      );
      break;
    }

    case '/removeviewer': {
      const viewerId = args[0];
      if (!viewerId) {
        await sendMessage(
          env.TELEGRAM_BOT_TOKEN,
          message.chat.id,
          'Usage: /removeviewer <telegram_id>',
          'none'
        );
        return;
      }
      await removeViewer(env.DB, viewerId);
      await sendMessage(
        env.TELEGRAM_BOT_TOKEN,
        message.chat.id,
        `View access revoked from user ${viewerId}.`,
        'none'
      );
      break;
    }

    case '/syncnow': {
      await sendMessage(env.TELEGRAM_BOT_TOKEN, message.chat.id, 'Syncing to Google Sheets...', 'none');
      ctx.waitUntil(
        runSync(env).then((result) =>
          sendMessage(env.TELEGRAM_BOT_TOKEN, message.chat.id, result, 'none')
        )
      );
      break;
    }

    case '/resetmenu': {
      await setMyCommands(env.TELEGRAM_BOT_TOKEN);
      await sendMessage(env.TELEGRAM_BOT_TOKEN, message.chat.id, 'Bot command menu has been updated.', 'none');
      break;
    }

    default:
      break;
  }
}

const BASE = 'https://api.telegram.org/bot';

async function call(token: string, method: string, body: object): Promise<unknown> {
  const res = await fetch(`${BASE}${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function sendMessage(
  token: string,
  chatId: number | string,
  text: string,
  parseMode: 'Markdown' | 'HTML' | 'none' = 'Markdown'
): Promise<{ ok: boolean; result?: { message_id: number } }> {
  const body: Record<string, unknown> = { chat_id: chatId, text };
  if (parseMode !== 'none') body.parse_mode = parseMode;
  return call(token, 'sendMessage', body) as Promise<{ ok: boolean; result?: { message_id: number } }>;
}

export async function deleteMessage(
  token: string,
  chatId: number | string,
  messageId: number
): Promise<void> {
  await call(token, 'deleteMessage', {
    chat_id: chatId,
    message_id: messageId,
  });
}

export async function setMyCommands(token: string): Promise<void> {
  // 1. Clear commands for all group-related scopes
  for (const scope of ['default', 'all_group_chats', 'all_chat_administrators']) {
    await call(token, 'setMyCommands', { commands: [], scope: { type: scope } });
  }

  // 2. Set commands only for private chats
  await call(token, 'setMyCommands', {
    commands: [
      { command: 'setwelcome', description: 'Set custom welcome message: /setwelcome <msg>' },
      { command: 'getwelcome', description: 'View current welcome message' },
      { command: 'resetwelcome', description: 'Reset welcome message to default' },
      { command: 'testwelcome', description: 'Send a test welcome message' },
      { command: 'togglewelcome', description: 'Enable/disable welcome: /togglewelcome <group_id>' },
      { command: 'listgroups', description: 'List all groups managed by the bot' },
      { command: 'listuser', description: 'List all members: /listuser <group_id>' },
      { command: 'addviewer', description: 'Grant view access: /addviewer <tg_id>' },
      { command: 'removeviewer', description: 'Revoke view access: /removeviewer <tg_id>' },
      { command: 'syncnow', description: 'Sync data to Google Sheets immediately' },
      { command: 'resetmenu', description: 'Re-register bot command menu' },
    ],
    scope: { type: 'all_private_chats' },
  });
}

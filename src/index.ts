import { Hono } from 'hono';
import type { Env } from './types';
import { handleWebhook } from './handlers/webhook';
import { runSync } from './handlers/sync';
import { setMyCommands } from './telegram/api';

const app = new Hono<{ Bindings: Env }>();

// Telegram webhook endpoint
app.post('/webhook', handleWebhook);

// Setup webhook command registration (call once after deploy)
app.get('/setup-commands', async (c) => {
  await setMyCommands(c.env.TELEGRAM_BOT_TOKEN);
  return c.json({ ok: true, message: 'Commands registered.' });
});

// Health check
app.get('/', (c) => c.json({ ok: true, service: 'bitmart-bot' }));

export default {
  fetch: app.fetch,

  // Cloudflare Cron Trigger — runs at 23:00 GMT+7 (16:00 UTC) daily
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runSync(env));
  },
};

/**
 * Run after deploying to register the Telegram webhook:
 *   BOT_TOKEN=xxx WORKER_URL=https://your-worker.workers.dev node scripts/setup-webhook.mjs
 */

const { BOT_TOKEN, WORKER_URL } = process.env;

if (!BOT_TOKEN || !WORKER_URL) {
  console.error('Usage: BOT_TOKEN=xxx WORKER_URL=https://... node scripts/setup-webhook.mjs');
  process.exit(1);
}

const webhookUrl = `${WORKER_URL}/webhook`;

const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: webhookUrl,
    allowed_updates: ['message', 'my_chat_member', 'chat_member'],
  }),
});

const data = await res.json();
console.log('setWebhook result:', JSON.stringify(data, null, 2));

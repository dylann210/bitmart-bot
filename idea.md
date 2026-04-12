# Idea: Telegram Group Member Tracker Bot

## Tổng quan

Bot Telegram chuyên dùng để **theo dõi thành viên mới tham gia nhóm**, gửi lời chào cá nhân hóa, và tự động sync dữ liệu lên Airtable mỗi tối. Mục tiêu: đơn giản, nhẹ, dễ cấu hình cho từng group.

**Tech stack** (kế thừa từ dự án hiện tại):
- Runtime: Cloudflare Workers
- Framework: Hono
- Database: Cloudflare D1 (SQLite)
- Webhook: Telegram Webhook (không dùng Long Polling)
- Sync: Airtable REST API
- Cron: Cloudflare Cron Trigger (chạy sync ~23:00 GMT+7 mỗi tối)

---

## Tính năng chính

### 1. Theo dõi và quản lý danh sách thành viên mới

**Mô tả:**
- Khi bot được thêm vào group, bot ghi nhận `bot_added_at` và tạo row trong `GroupSettings`. **Không cần xử lý thành viên cũ** vì Telegram API không cung cấp endpoint liệt kê toàn bộ thành viên — chỉ theo dõi từ thời điểm bot join trở đi.
- Khi có **thành viên mới** join group (event `new_chat_members` trong `message`), bot tự động trigger hook → insert bản ghi mới vào bảng `GroupMembers` với `joined_at = thời gian thực join`.
- Mỗi bản ghi gồm: `tg_id`, `username`, `group_id`, `joined_at`.

**Database schema — bảng `GroupMembers`:**
```sql
CREATE TABLE IF NOT EXISTS GroupMembers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id    TEXT NOT NULL,
  tg_id       TEXT NOT NULL,
  username    TEXT,                            -- @username, có thể NULL nếu user chưa đặt
  joined_at   DATETIME NOT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(group_id, tg_id)
);
```

**Database schema — bảng `GroupSettings`:**
```sql
CREATE TABLE IF NOT EXISTS GroupSettings (
  group_id          TEXT PRIMARY KEY,
  group_title       TEXT,
  bot_added_at      DATETIME,            -- thời điểm bot được add vào group
  welcome_message   TEXT,                -- nội dung lời chào tùy chỉnh (NULL = dùng default)
  airtable_base_id  TEXT,                -- Airtable Base ID để sync
  airtable_table    TEXT DEFAULT 'Members',
  updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Flow chi tiết khi bot được add vào group:**
1. Nhận event `my_chat_member` (bot trở thành thành viên/admin).
2. Ghi `bot_added_at = now` và upsert row vào `GroupSettings`.
3. Gửi DM cho admin trong `ADMIN_TG_IDS` thông báo: "Bot đã được thêm vào group *[tên group]*. Sẽ ghi nhận thành viên mới từ bây giờ."

**Flow khi thành viên mới join:**
1. Nhận event `new_chat_members` (field `message.new_chat_members[]`).
2. Với mỗi user trong danh sách (bỏ qua nếu là bot):
   - Insert vào `GroupMembers`: `tg_id`, `username` (nếu có), `joined_at = message.date`.
3. Gửi lời chào vào group (xem tính năng 2).

---

### 2. Gửi lời chào mừng thành viên mới vào group + tự xóa

**Mô tả:**
- Khi thành viên mới join group, bot gửi tin nhắn chào vào **chính group đó**, tag `@username` hoặc dùng `tg_id` của người vừa join.
- Sau N giây (mặc định 60 giây), bot tự xóa tin nhắn chào bằng `deleteMessage` — dùng `ctx.waitUntil` để không block webhook response.

**Flow gửi lời chào:**
1. Bot gửi `sendMessage` vào group với nội dung welcome (có mention thành viên mới).
2. Trong `ctx.waitUntil`, sau N giây chạy `deleteMessage` để xóa tin nhắn vừa gửi.

**Default welcome message (có thể tùy chỉnh):**
```
Chào mừng {mention} đã tham gia {group_title}!
Chúng tôi rất vui khi có bạn ở đây.
```

**Các biến thay thế trong template:**
- `{mention}`: Tag người dùng — dùng `@username` nếu có, fallback là `tg_id`
- `{username}`: @username thuần (nếu không có thì để trống)
- `{tg_id}`: Telegram numeric ID của thành viên mới
- `{group_title}`: Tên group
- `{member_count}`: Số thành viên mới đã join kể từ khi bot được add

> **Lưu ý:** Telegram User object chỉ cung cấp `id` và `username` (optional). Không có trường `full_name` hay `first_name` đáng tin cậy để dùng trong template.

---

### 3. Admin chỉnh sửa lời chào mừng và quản lý group

**Lệnh dành cho admin (dùng trong group hoặc private chat):**
- `/setwelcome <nội dung>` — đặt lời chào tùy chỉnh cho group hiện tại.
- `/getwelcome` — xem lời chào hiện tại đang được dùng.
- `/resetwelcome` — đặt lại về default.
- `/testwelcome` — gửi thử tin nhắn chào vào group ngay (không cần đợi người join).
- `/listgroups` — liệt kê tất cả group mà bot đang hoạt động, kèm tổng số thành viên mới đã ghi nhận.

**Ví dụ output `/listgroups`:**
```
Danh sách group bot đang quản lý:

1. Cộng đồng Dev VN (group_id: -100123)
   • Bot join: 2026-03-15
   • Thành viên mới đã ghi nhận: 42
   • Airtable: ✅ đã cấu hình

2. Marketing Team (group_id: -100456)
   • Bot join: 2026-03-20
   • Thành viên mới đã ghi nhận: 7
   • Airtable: ❌ chưa cấu hình
```

**Quy tắc phân quyền:**
- Chỉ user trong `ADMIN_TG_IDS` mới được dùng các lệnh trên.
- Lệnh `/listgroups` chỉ dùng được trong private chat với bot.

**Lưu trữ:** Nội dung welcome lưu vào `GroupSettings.welcome_message`. Nếu `NULL`, dùng default từ biến môi trường `DEFAULT_WELCOME_MESSAGE`.

**Ví dụ sử dụng `/setwelcome`:**
```
/setwelcome Xin chào {mention}! Bạn là thành viên mới của {group_title}. Hãy đọc nội quy tại #rules nhé!
```

---

### 4. Tự động sync database lên Airtable

**Mô tả:**
- Mỗi tối (~23:00 GMT+7), Cloudflare Cron Trigger sync toàn bộ `GroupMembers` lên Airtable.
- Mỗi group có Airtable Base ID riêng (lưu trong `GroupSettings.airtable_base_id`).
- Nếu group chưa cấu hình, bỏ qua.

**Airtable REST API flow:**
1. Fetch toàn bộ `GroupMembers` cho từng group đã cấu hình `airtable_base_id`.
2. Với mỗi bản ghi, gọi Airtable `PATCH /v0/{baseId}/{tableId}` với `upsert` theo field `tg_id` + `group_id`.
3. Chiến lược: **upsert** (tạo mới nếu chưa có, cập nhật nếu đã có) để tránh duplicate.

**Cấu hình Airtable:**
- Cần Personal Access Token: `AIRTABLE_TOKEN` (secret).
- Admin cấu hình per-group bằng lệnh `/setairtable <base_id> [table_name]`.

**Cột dữ liệu export ra Airtable:**
| Field | Mô tả |
|-------|-------|
| `tg_id` | Telegram user ID (dùng làm upsert key) |
| `username` | @username (nếu có) |
| `group_id` | ID group |
| `group_title` | Tên group |
| `joined_at` | Thời gian tham gia |
| `synced_at` | Thời gian sync gần nhất |

**Lệnh admin liên quan:**
- `/setairtable <base_id> [table_name]` — cấu hình Airtable cho group hiện tại.
- `/syncnow` — trigger sync ngay lập tức (không chờ cron).

**Cron schedule:**
```toml
# wrangler.toml
[triggers]
crons = ["0 16 * * *"]  # 23:00 GMT+7 = 16:00 UTC
```

---

## Sơ đồ luồng dữ liệu

```
Telegram Group
    │
    ├── Bot được add vào group
    │       └── Ghi GroupSettings (bot_added_at, group_title)
    │
    ├── Thành viên mới join
    │       ├── Insert GroupMembers (tg_id, username, joined_at=now)
    │       └── sendMessage chào vào group → ctx.waitUntil(deleteMessage sau N giây)
    │
    └── Admin chạy /setwelcome, /setairtable, /listgroups
            └── Update GroupSettings

Cloudflare Cron (23:00 hàng ngày)
    └── Đọc GroupMembers + GroupSettings
            └── Upsert lên Airtable (per group)
```

---

## Cấu hình và triển khai

**Biến môi trường (Cloudflare Workers vars/secrets):**
| Tên | Loại | Mô tả |
|-----|------|-------|
| `TELEGRAM_BOT_TOKEN` | Secret | Bot token từ @BotFather |
| `ADMIN_TG_IDS` | Var | Danh sách Telegram ID admin (cách nhau bởi dấu phẩy) |
| `DEFAULT_WELCOME_MESSAGE` | Var | Lời chào mặc định nếu group chưa set |
| `AIRTABLE_TOKEN` | Secret | Airtable Personal Access Token |
| `WELCOME_AUTO_DELETE_SECONDS` | Var | Số giây trước khi tự xóa tin nhắn chào (default: 60) |

**Lệnh Telegram cần đăng ký với `/setMyCommands`:**
```
setwelcome     - Đặt lời chào mừng thành viên mới
getwelcome     - Xem lời chào hiện tại
resetwelcome   - Đặt lại lời chào về mặc định
testwelcome    - Gửi thử lời chào vào group
listgroups     - Liệt kê tất cả group bot đang quản lý
setairtable    - Cấu hình Airtable Base ID cho group
syncnow        - Sync dữ liệu lên Airtable ngay
```

---

## Các điểm cần lưu ý kỹ thuật

1. **Telegram API không có endpoint liệt kê thành viên:** Bot chỉ ghi nhận thành viên từ thời điểm được add vào group. Không cần xử lý thành viên cũ.

2. **`username` có thể NULL:** Nhiều user Telegram không đặt username. Template `{mention}` cần fallback về dạng `tg_id` hoặc inline mention `tg://user?id=123` để vẫn tag được người dùng.

3. **`ctx.waitUntil` + `deleteMessage`:** Cloudflare Workers không có `setTimeout` native. Cần dùng `ctx.waitUntil` kết hợp một helper delay (ví dụ: `new Promise(r => setTimeout(r, N * 1000))`) để chờ rồi mới xóa tin nhắn.

4. **Airtable upsert:** Airtable API hỗ trợ upsert qua `performUpsert` field trong PATCH request — cần chỉ định `fieldsToMergeOn: ['tg_id', 'group_id']`.

5. **Rate limiting Airtable:** Airtable free plan giới hạn 5 req/s. Khi sync nhiều group, cần xử lý tuần tự với delay nhỏ giữa các batch.

6. **Quyền bot trong group cần có:**
   - Đọc tin nhắn (để nhận event `new_chat_members`)
   - Gửi tin nhắn
   - Xóa tin nhắn (để auto-delete welcome message)

---

## Phạm vi triển khai (MVP vs Full)

| Tính năng | MVP | Full |
|-----------|-----|------|
| Ghi nhận thành viên mới join (webhook hook) | ✅ | ✅ |
| Welcome message vào group + auto-delete | ✅ | ✅ |
| Admin `/setwelcome`, `/getwelcome`, `/resetwelcome` | ✅ | ✅ |
| Admin `/listgroups` | ✅ | ✅ |
| Cron sync Airtable | ✅ | ✅ |
| `/setairtable` per-group | ✅ | ✅ |
| `/syncnow` thủ công | ✅ | ✅ |
| Hỗ trợ nhiều group đồng thời | ✅ | ✅ |
| Export thống kê tăng trưởng theo tuần/tháng | ❌ | ✅ |
| Dashboard admin (web UI đơn giản) | ❌ | ✅ |

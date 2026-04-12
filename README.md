# Bitmart Bot - Telegram Member Tracker & Welcome Bot

Bot Telegram chuyên nghiệp được xây dựng trên nền tảng **Cloudflare Workers**, giúp tự động theo dõi thành viên mới tham gia nhóm, gửi lời chào mừng cá nhân hóa và đồng bộ hóa dữ liệu lên **Google Sheets**.

## 🚀 Tính năng chính

- **Theo dõi thành viên:** Tự động ghi nhận thông tin thành viên mới (ID, Username, Tên, Người mời, Link mời) ngay khi họ gia nhập nhóm.
- **Chào mừng cá nhân hóa:** Gửi tin nhắn chào mừng kèm các biến động (mention, group title, member count).
- **Tự động dọn dẹp:** Tin nhắn chào mừng tự động xóa sau một khoảng thời gian cấu hình (mặc định 10s) để giữ nhóm sạch sẽ.
- **Đồng bộ hóa Google Sheets:** Tự động sync toàn bộ dữ liệu (Thành viên, Cấu hình nhóm, Người xem) lên Google Sheets hàng ngày qua Cron Trigger hoặc thủ công qua lệnh admin.
- **Quản lý linh hoạt:** Hỗ trợ nhiều nhóm cùng lúc, cho phép admin tùy chỉnh lời chào và bật/tắt tính năng welcome cho từng nhóm.
- **Phân quyền (RBAC):** Chỉ những Admin được chỉ định mới có quyền sử dụng các lệnh cấu hình.

## 🛠 Tech Stack

- **Runtime:** [Cloudflare Workers](https://workers.cloudflare.com/)
- **Framework:** [Hono](https://hono.dev/)
- **Database:** [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite)
- **Data Sync:** [Google Apps Script](https://developers.google.com/apps-script) (Proxy to Google Sheets)
- **Language:** TypeScript
- **Tooling:** Wrangler CLI

## 📋 Cấu hình hệ thống

Các biến môi trường cần thiết trong `wrangler.toml` hoặc Secret:

| Biến | Mô tả |
|------|-------|
| `TELEGRAM_BOT_TOKEN` | Token của bot từ @BotFather (Secret) |
| `ADMIN_TG_IDS` | Danh sách ID Telegram của Admin (cách nhau bởi dấu phẩy) |
| `DEFAULT_WELCOME_MESSAGE` | Lời chào mặc định khi chưa được cấu hình riêng cho nhóm |
| `WELCOME_AUTO_DELETE_SECONDS` | Thời gian (giây) tự động xóa tin nhắn chào mừng |
| `GOOGLE_SHEETS_URL` | URL của Google Apps Script để nhận dữ liệu sync |

## 🚀 Hướng dẫn triển khai

### 1. Cài đặt môi trường
```bash
npm install
```

### 2. Khởi tạo Database
```bash
# Tạo database D1 (nếu chưa có)
npx wrangler d1 create bitmart-bot-db

# Chạy migrations (Local)
npm run db:migrate

# Chạy migrations (Remote)
npm run db:migrate:remote
```

### 3. Deploy lên Cloudflare
```bash
npm run deploy
```

### 4. Cấu hình Webhook
Sau khi deploy, hãy cập nhật URL webhook cho bot:
```bash
# Sử dụng script đi kèm (nhập token và url khi được hỏi)
npm run setup-webhook
```

## 🤖 Danh sách lệnh Admin (Chỉ dùng trong Private Chat)

| Lệnh | Mô tả |
|------|-------|
| `/setwelcome <msg>` | Thiết lập lời chào tùy chỉnh cho nhóm |
| `/getwelcome` | Xem lời chào hiện tại của nhóm |
| `/resetwelcome` | Đặt lại lời chào về mặc định |
| `/togglewelcome <id>`| Bật/Tắt tính năng chào mừng cho nhóm cụ thể |
| `/testwelcome` | Gửi thử tin nhắn chào mừng vào nhóm |
| `/listgroups` | Danh sách các nhóm bot đang quản lý |
| `/listuser <id>` | Danh sách thành viên trong nhóm |
| `/syncnow` | Đồng bộ dữ liệu lên Google Sheets ngay lập tức |
| `/addviewer <id>` | Cấp quyền xem dữ liệu cho người dùng khác |
| `/resetmenu` | Cập nhật lại danh sách lệnh trong menu bot |

## 📊 Sơ đồ dữ liệu

Dữ liệu được lưu trữ tại Cloudflare D1 và sync sang Google Sheets gồm 3 bảng chính:
- **GroupMembers:** Thông tin chi tiết về các thành viên đã tham gia.
- **GroupSettings:** Cấu hình riêng cho từng nhóm (Welcome message, trạng thái bật/tắt).
- **Viewers:** Danh sách người dùng được phép xem thông tin thống kê.

## 📄 License

Dự án này là mã nguồn riêng tư.

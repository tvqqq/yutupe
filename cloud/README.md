# YouTube Collections Cloud

Cloudflare Worker + D1 backend cho AI Groups và YouTube WebSub. Backend không lưu Google access token; token chỉ được verify với Google rồi đổi thành session HMAC có thời hạn 1 giờ.

## Thành phần đã chạy thật

- `POST /v1/auth/google`: verify Google OAuth audience, phát cloud session ngắn hạn.
- `POST /v1/ai/tags`: Workers AI JSON Mode mặc định; OpenAI Responses Structured Outputs là optional override.
- `POST /v1/ai/groups`: phân loại tối đa 1.200 channels, thu gọn prompt cho account lớn và validate lại mọi channel ID.
- `POST /v1/websub/subscriptions`: lưu snapshot subscriptions theo user và enqueue registration.
- `GET|POST /v1/websub/callback`: hub verification, HMAC signature validation, parse Atom và dedupe.
- `GET /v1/events`: inbox phân trang theo cursor, cô lập từng Google user.
- `GET /v1/status`: trạng thái AI, active/pending WebSub và event count.
- `DELETE /v1/account`: xóa dữ liệu cloud của user.
- Cron mỗi phút: đăng ký/gia hạn tối đa 75 channels, dọn event quá 30 ngày và record orphan.

## Deploy lần đầu

Yêu cầu Node 20+, pnpm, Cloudflare account và stable extension ID.

```bash
pnpm install
pnpm exec wrangler login
pnpm exec wrangler d1 create youtube-collections-cloud --config cloud/wrangler.jsonc
```

Copy `database_id` trả về vào `cloud/wrangler.jsonc`, sau đó cập nhật:

- `GOOGLE_CLIENT_IDS`: Chrome/Edge OAuth client IDs, phân tách bằng dấu phẩy.
- `PUBLIC_BASE_URL`: URL Worker production, không có path cuối.
- `EXTENSION_ORIGINS`: `chrome-extension://<stable-id>`, nhiều origin phân tách bằng dấu phẩy.
- `WORKERS_AI_MODEL`: mặc định `@cf/meta/llama-3.1-8b-instruct-fast`.
- `OPENAI_MODEL`: chỉ dùng khi cấu hình optional `OPENAI_API_KEY`.

Secrets không đặt trong `vars` và không commit:

```bash
pnpm exec wrangler secret put SESSION_SECRET --config cloud/wrangler.jsonc
pnpm exec wrangler secret put WEBSUB_SECRET --config cloud/wrangler.jsonc
pnpm cloud:migrate
pnpm cloud:deploy
```

Dùng hai random secrets độc lập, tối thiểu 32 bytes. Sau deploy, kiểm tra:

Nếu muốn dùng OpenAI thay Workers AI, thêm optional secret:

```bash
pnpm exec wrangler secret put OPENAI_API_KEY --config cloud/wrangler.jsonc
```

```bash
curl https://YOUR_WORKER.workers.dev/health
```

Response phải có `{"ok":true,...}`. Điền chính URL đó vào **Cloud API Base URL** trong extension, bấm **Xác minh Cloud API**, **Kiểm tra Cloud**, rồi **Đăng ký WebSub**. Production manifest phải chứa exact Worker origin trong `host_permissions`.

## Development local

```bash
cp cloud/.dev.vars.example cloud/.dev.vars
pnpm cloud:migrate:local
pnpm cloud:dev
```

Không commit `cloud/.dev.vars`. Callback WebSub production bắt buộc là HTTPS public; localhost chỉ dùng health/auth/API smoke test.

## Vận hành

- D1 `channel_subscriptions.state/error` cho biết lỗi đăng ký hub gần nhất.
- Với account 1.000 channels, API trả ngay sau khi enqueue; cron xử lý 75 channels/phút.
- WebSub lease được renew khi còn dưới 24 giờ.
- AI giới hạn 20 tag requests/phút và 4 organize requests/phút/user.
- Events được dedupe theo `(user_id, channel_id:video_id)` và giữ 30 ngày.
- Khi thay OAuth client hoặc extension ID, cập nhật cả `GOOGLE_CLIENT_IDS` và `EXTENSION_ORIGINS` rồi deploy lại.

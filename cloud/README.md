# YouTube Collections Cloud

Cloudflare Worker stateless backend cho AI Groups, AI Tags, AI Unsubscribe Suggestions. Backend hoàn toàn không sử dụng database (không tốn chi phí D1 Rows read) và không lưu Google access token; token chỉ được verify với Google rồi đổi thành session HMAC có thời hạn 1 giờ.

## Thành phần đã chạy thật

- `GET /health`: kiểm tra deployment Worker.
- `GET /v1/status`: kiểm tra trạng thái AI và model cấu hình.
- `POST /v1/auth/google`: verify Google OAuth audience, phát cloud session ngắn hạn.
- `POST /v1/ai/tags`: Workers AI JSON Mode mặc định; OpenAI Responses Structured Outputs là optional override.
- `POST /v1/ai/groups`: phân loại tối đa 1.200 channels, thu gọn prompt cho account lớn và validate lại mọi channel ID.
- `POST /v1/ai/unsubscribe-suggestions`: phân tích negative feedback để đề xuất unsubscribe channels.

## Deploy lần đầu

Yêu cầu Node 20+, pnpm, Cloudflare account và stable extension ID.

```bash
pnpm install
pnpm exec wrangler login
```

Cập nhật `cloud/wrangler.jsonc`:

- `GOOGLE_CLIENT_IDS`: Chrome/Edge OAuth client IDs, phân tách bằng dấu phẩy.
- `PUBLIC_BASE_URL`: URL Worker production, không có path cuối.
- `EXTENSION_ORIGINS`: `chrome-extension://<stable-id>`, nhiều Chrome/Edge origin phân tách bằng dấu phẩy. ID phải lấy từ chính bản đang load tại `chrome://extensions`/`edge://extensions`.
- `WORKERS_AI_MODEL`: mặc định `@cf/meta/llama-3.1-8b-instruct-fast`.
- `OPENAI_MODEL`: chỉ dùng khi cấu hình optional `OPENAI_API_KEY`.

Secrets không đặt trong `vars` và không commit:

```bash
pnpm exec wrangler secret put SESSION_SECRET --config cloud/wrangler.jsonc
pnpm cloud:deploy
```

Dùng random secret tối thiểu 32 bytes cho `SESSION_SECRET`.

Nếu muốn dùng OpenAI thay Workers AI, thêm optional secret:

```bash
pnpm exec wrangler secret put OPENAI_API_KEY --config cloud/wrangler.jsonc
```

Sau deploy, kiểm tra:

```bash
curl https://YOUR_WORKER.workers.dev/health
```

Response phải có `{"ok":true,...}`. Điền chính URL đó vào **Cloud API Base URL** trong extension, bấm **Xác minh Cloud API**, **Kiểm tra Cloud**.

## Development local

```bash
cp cloud/.dev.vars.example cloud/.dev.vars
pnpm cloud:dev
```

Không commit `cloud/.dev.vars`.

## Vận hành

- Backend chạy hoàn toàn stateless, không lưu trữ dữ liệu người dùng trên server và không có chi phí database read/write.
- AI giới hạn 20 tag requests/phút, 8 unsubscribe requests/phút và 4 organize requests/phút/user.
- Khi thay OAuth client hoặc extension ID, cập nhật cả `GOOGLE_CLIENT_IDS` và `EXTENSION_ORIGINS` rồi deploy lại.

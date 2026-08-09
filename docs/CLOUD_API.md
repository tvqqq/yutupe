# Cloud API contract

Contract này được implement tại `cloud/worker.ts` bằng Cloudflare Worker + D1. Extension chỉ gọi origin HTTPS mà người dùng đã nhập và cấp optional host permission.

## Health và status

`GET /health` public dùng để kiểm tra deployment. `GET /v1/status` yêu cầu auth và trả cấu hình AI, tổng WebSub active/pending cùng event count của user.

## Authentication

Nếu OAuth flow trả Google ID token, extension dùng token đó làm Bearer. Nếu Chrome Identity chỉ trả opaque access token, extension gọi một lần:

```http
POST /v1/auth/google
Content-Type: application/json

{"accessToken":"..."}
```

Backend phải:

1. Xác minh token trực tiếp với Google và kiểm tra OAuth audience/project.
2. Không log, lưu hoặc dùng access token để gọi YouTube/Drive.
3. Trả narrow backend session token:

```json
{"token":"cloud-session-token","expiresIn":3600}
```

Các endpoint sau nhận `Authorization: Bearer <id-token-or-cloud-session-token>`.

## AI tags

```http
POST /v1/ai/tags
```

Request:

```json
{"channel":{"id":"UC...","title":"...","description":"...","url":"..."}}
```

Response:

```json
{"tags":["Tech","AI"],"suggestedGroup":"Technology","confidence":0.91}
```

Backend dùng Workers AI binding mặc định. Nếu cấu hình `OPENAI_API_KEY`, backend chuyển sang OpenAI Responses API; extension không chứa AI provider secret.

## AI groups

```http
POST /v1/ai/groups
```

Request:

```json
{"channels":[{"id":"UC...","title":"...","description":"...","url":"..."}]}
```

Response:

```json
{"groups":[{"name":"Technology","icon":"💻","color":"#22d3ee","channelIds":["UC..."]}]}
```

Backend chỉ được trả channel ID có trong request. Extension validate lại IDs trước khi cập nhật groups.

## Register WebSub

```http
POST /v1/websub/subscriptions
{"channelIds":["UC...","UC..."]}
```

Response `202`: `{"registered":2,"queued":2}`. Request là snapshot đầy đủ: mapping cũ không còn trong danh sách sẽ bị bỏ. Cron xử lý hàng đợi và gia hạn lease trong nền.

Backend đăng ký topic `https://www.youtube.com/feeds/videos.xml?channel_id=CHANNEL_ID`, renew subscription và dedupe event.

## Event inbox

```http
GET /v1/events?cursor=<opaque>
```

Response:

```json
{
  "events":[
    {"id":"event-id","video":{"id":"video-id","title":"...","url":"https://www.youtube.com/watch?v=...","channelId":"UC...","channelTitle":"...","contentType":"video","discoveredAt":"2026-08-09T00:00:00Z"}}
  ],
  "cursor":"next-opaque-cursor"
}
```

Extension polls mỗi 5 phút khi có Cloud URL và Google session, merges event theo video ID và phát browser notification cho group tương ứng.

## Data deletion

`DELETE /v1/account` xóa users, channel mappings và event inbox của user đang xác thực.

## Production requirements

- HTTPS, CORS/extension-origin allowlist và rate limiting.
- Verify auth audience/issuer/expiry.
- D1 isolate records theo verified Google `sub`; Cloudflare chịu trách nhiệm encryption at rest của managed storage.
- Validate channel IDs, Atom XML và event size.
- Monitor `channel_subscriptions.state`, `attempts`, `last_error` và cron delivery failures.

Hướng dẫn deploy và secrets nằm tại `cloud/README.md`.

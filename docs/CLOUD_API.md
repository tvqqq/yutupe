# Cloud API contract

Contract này được implement tại `cloud/worker.ts` bằng Cloudflare Worker hoàn toàn stateless (không sử dụng database). Production extension chỉ gọi exact Worker origin được khai báo trong manifest.

## Health và status

`GET /health` public dùng để kiểm tra deployment. `GET /v1/status` yêu cầu auth và trả cấu hình AI (`ok: true`, `aiConfigured`, `aiModel`).

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
3. Trả narrow backend session token (HMAC-signed, stateless):

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

## AI Unsubscribe Suggestions

```http
POST /v1/ai/unsubscribe-suggestions
```

Request:

```json
{"signals":[{"channelId":"UC...","channelTitle":"...","rejectedCount":3,"cachedCount":5,"rejectedTitles":["..."]}]}
```

Response:

```json
{"recommendations":[{"channelId":"UC...","reason":"...","confidence":0.85}]}
```

## Production requirements

- HTTPS, CORS/extension-origin allowlist và in-memory rate limiting.
- Verify auth audience/issuer/expiry.
- Hoàn toàn stateless: không lưu thông tin người dùng hay truy vấn database, tối ưu chi phí và bảo mật tuyệt đối.

Hướng dẫn deploy và secrets nằm tại `cloud/README.md`.

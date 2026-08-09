# Developer handover

## Đã implement

| Module | Trạng thái |
|---|---|
| YouTube-native full workspace | Done; không còn popup entrypoint |
| DOM discovery + local feed | Done |
| Google OAuth | Done; manifest OAuth production + PKCE fallback |
| Subscription import | Done; pagination + channel details theo batch 50, không chờ feed từng channel |
| Progressive channel enrichment | Done; fetch chạy ngoài UI mutation queue, commit theo batch 10, trạng thái/retry lưu per-channel |
| Canonical channel migration | Done cho exact custom URL/handle aliases |
| YouTube API feed | Done; uploads playlist + video details; cache được bổ sung dần sau sync nhanh |
| Group feed priority | Done; sắp xếp bằng nút lên/xuống, Feed navbar đọc `Group.position` |
| Bulk unsubscribe thật | Done; preview, confirmation, sequential calls, per-item failure result |
| Drive appData push/pull | Done; manual snapshot sync |
| AI cloud client | Done theo configurable API contract |
| AI inference/backend | Done; Workers AI JSON Mode mặc định, optional OpenAI override, rate limit và output validation |
| WebSub client | Done; queued registration + 5-minute event polling |
| WebSub callback/backend | Done; Cloudflare Worker, D1 inbox, signed callback, cron renewal |
| Dead-channel detection | Pending |
| Nested groups/Deck | Pending |

## Security decisions

- OAuth access token lưu trong `browser.storage.session`, không lưu local hoặc gửi vào YouTube page context.
- Mọi Google API call chạy từ background service worker.
- Cloud origin production được giới hạn đúng Worker URL trong manifest; không dùng broad optional `https://*/*`.
- Cloud backend nhận ID token nếu có. Với Chrome opaque token, `/v1/auth/google` chỉ được phép verify rồi đổi sang narrow session token; không được lưu hoặc tái sử dụng Google access token.
- Unsubscribe chỉ chạy sau browser confirmation hiển thị exact channel names.
- Drive uses `appDataFolder`, không xin quyền đọc toàn bộ My Drive.
- Chrome stable ID là `behfooaigccbooibiabffaehejiagcbi`, sinh từ public key trong `.env.local`. Private key nằm tại `.keys/chrome-extension-private.pem` (Git ignored, mode 600) và phải được backup ngoài repository.

## Việc P0 tiếp theo

1. Cấu hình stable extension IDs và OAuth clients cho Chrome/Edge.
2. Manual OAuth smoke test bằng Google test user.
3. Kiểm tra import subscriptions với 10/100/1.000 channels và quota.
4. Test unsubscribe trên disposable test channel/account.
5. Deploy backend theo `cloud/README.md`, cấu hình secrets/origins rồi test AI/WebSub bằng Google test user.
6. Đổi Drive snapshot sync sang per-entity `updatedAt/deletedAt` tombstones trước auto-sync.
7. Thêm PNG icons/store artwork và OAuth/privacy verification.
8. Refactor `entrypoints/popup/App.tsx` sang `src/ui/DashboardApp.tsx`; file hiện được content workspace import lại và không tạo popup artifact.
9. Với tài khoản rất lớn, đo thời gian/quota của enrichment và bổ sung retry/backoff riêng cho lỗi 429/5xx.

## Known limitations

- Production OAuth không hoạt động nếu build thiếu `oauth2` manifest client ID/stable extension ID.
- PKCE fallback phụ thuộc OAuth client/redirect policy và không phải đường production khuyến nghị.
- Access token session hết hạn/restart yêu cầu connect lại; chưa lưu refresh token vì không muốn lưu credential dài hạn trong local storage.
- API feed giới hạn số channel mỗi lần refresh để kiểm soát quota.
- Sau Connect/Sync, metadata subscriptions xuất hiện trước và Groups dùng được ngay. `youtube-collections-enrichment` chỉ queue channel thiếu/stale (>24h), ưu tiên channel của group vừa tạo/gán, fetch ngoài mutation queue và atomic-commit kết quả.
- Mỗi channel có `enrichment.status`, `retryCount`, timestamps và `error`. Lỗi retry tối đa 3 lần với exponential backoff; exhausted errors được tính là settled để UI không quay vô hạn. Sync YouTube kế tiếp sẽ reset retry cho dữ liệu stale.
- Enrichment hiện lấy 1 video mới nhất/channel. Refresh Feed vẫn là luồng chủ động để lấy lịch sử sâu hơn.
- Drive pull là cloud-wins cho groups/channels/watched state; chưa merge đồng thời nhiều thiết bị.
- AI tags được apply ngay khi backend trả về; nên thêm preview/approve cho bulk AI.
- WebSub chỉ chạy end-to-end sau khi Worker/D1 được deploy lên HTTPS và secret đã cấu hình.
- `storage.local` vẫn ghi whole-state và video cache capped ở 8.000.
- DOM selector YouTube có thể thay đổi; sửa tập trung tại `src/youtube/parser.ts`.

## Verification hiện tại

Chạy trước handover/release:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm build:edge
pnpm cloud:check
```

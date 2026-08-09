# Developer handover

## Đã implement

| Module | Trạng thái |
|---|---|
| YouTube-native full workspace | Done; không còn popup entrypoint |
| DOM discovery + local feed | Done |
| Google OAuth | Done; manifest OAuth production + PKCE fallback |
| Subscription import | Done; pagination + batch channel details |
| Canonical channel migration | Done cho exact custom URL/handle aliases |
| YouTube API feed | Done; uploads playlist + video details |
| Bulk unsubscribe thật | Done; preview, confirmation, sequential calls, per-item failure result |
| Drive appData push/pull | Done; manual snapshot sync |
| AI cloud client | Done theo configurable API contract |
| WebSub client | Done; registration + 5-minute event polling |
| WebSub callback/backend | Not included; xem `CLOUD_API.md` |
| AI inference/backend | Not included; xem `CLOUD_API.md` |
| Dead-channel detection | Pending |
| Nested groups/Deck | Pending |

## Security decisions

- OAuth access token lưu trong `browser.storage.session`, không lưu local hoặc gửi vào YouTube page context.
- Mọi Google API call chạy từ background service worker.
- Cloud origin là optional permission và cần user grant.
- Cloud backend nhận ID token nếu có. Với Chrome opaque token, `/v1/auth/google` chỉ được phép verify rồi đổi sang narrow session token; không được lưu hoặc tái sử dụng Google access token.
- Unsubscribe chỉ chạy sau browser confirmation hiển thị exact channel names.
- Drive uses `appDataFolder`, không xin quyền đọc toàn bộ My Drive.

## Việc P0 tiếp theo

1. Cấu hình stable extension IDs và OAuth clients cho Chrome/Edge.
2. Manual OAuth smoke test bằng Google test user.
3. Kiểm tra import subscriptions với 10/100/1.000 channels và quota.
4. Test unsubscribe trên disposable test channel/account.
5. Triển khai backend theo `CLOUD_API.md`, sau đó test AI/WebSub end-to-end.
6. Đổi Drive snapshot sync sang per-entity `updatedAt/deletedAt` tombstones trước auto-sync.
7. Thêm PNG icons/store artwork và OAuth/privacy verification.
8. Refactor `entrypoints/popup/App.tsx` sang `src/ui/DashboardApp.tsx`; file hiện được content workspace import lại và không tạo popup artifact.

## Known limitations

- Production OAuth không hoạt động nếu build thiếu `oauth2` manifest client ID/stable extension ID.
- PKCE fallback phụ thuộc OAuth client/redirect policy và không phải đường production khuyến nghị.
- Access token session hết hạn/restart yêu cầu connect lại; chưa lưu refresh token vì không muốn lưu credential dài hạn trong local storage.
- API feed giới hạn số channel mỗi lần refresh để kiểm soát quota.
- Drive pull là cloud-wins cho groups/channels/watched state; chưa merge đồng thời nhiều thiết bị.
- AI tags được apply ngay khi backend trả về; nên thêm preview/approve cho bulk AI.
- WebSub backend chưa nằm trong repo nên Cloud actions sẽ báo lỗi cho tới khi URL hợp lệ được cấu hình.
- `storage.local` vẫn ghi whole-state và video cache capped ở 2.000.
- DOM selector YouTube có thể thay đổi; sửa tập trung tại `src/youtube/parser.ts`.

## Verification hiện tại

Chạy trước handover/release:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm build:edge
```

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
| Personalization Lab | Done; Likes API + Watch Later DOM signals, loại Shorts, kết quả dùng section/card giống Feed |
| YouTube quota optimization | Done; recent/latest qua channel RSS, `videos.list` batch 50, deep history chỉ khi user yêu cầu, quota circuit breaker + suggestion cache |
| Missing channel feed recovery | Done; Channels tab tách section chưa có `lastPublishedAt`, targeted RSS refresh bằng explicit `channelIds` |
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
- Content script catches fire-and-forget messaging failures, removes its DOM listeners/timers on WXT context invalidation, then reloads the YouTube tab once so Chrome injects the new extension build. Không bỏ auto-reload này nếu chưa có cơ chế reconnect tương đương; extension context cũ không thể gọi background mới.
- Latest-video enrichment và refresh thường dùng `feeds/videos.xml?channel_id=...` (không tính YouTube Data API quota). Metadata duration/views/live được hydrate bằng một `videos.list` cho tối đa 50 IDs; khi gặp `quotaExceeded`, circuit breaker lưu `youtubeQuotaBlockedUntil` đến nửa đêm Pacific và RSS tiếp tục chạy mà không thử metadata.
- `playlistItems.list` chỉ còn dùng cho lịch sử sâu khi user bấm Load thêm (>25/channel). Video metadata đã cache không bị gọi lại. Với khoảng 971 channels, một vòng latest enrichment giảm từ khoảng 971 `playlistItems.list` + ~20 `videos.list` xuống khoảng 20 `videos.list`.
- Personalization cache kết quả 6 giờ và Likes 24 giờ. Không tự gọi lại API mỗi lần user chuyển tab Gợi ý; khi quota cạn sẽ trả cache gần nhất.
- Cache sanitizer v2 chạy một lần khi đọc state sau upgrade: loại `Untitled video`, `Unknown channel`, title chỉ là duration, URL/video ID sai và mọi DOM recommendation không thuộc canonical `UC...` subscriptions khi API channels đã tồn tại. Parser chỉ nhận semantic title links (`#video-title-link`, `#video-title`, heading links), không còn fallback sang thumbnail watch anchors. Nhánh OAuth quota fallback vẫn dùng state đã sanitize.
- `REFRESH_YOUTUBE_FEED` hỗ trợ optional `channelIds`. Khi có danh sách này, background bỏ broad `youtubeSyncChannelLimit`, chỉ fetch đúng các channel được yêu cầu và cho phép canonical `UC...` channel dùng RSS ngay cả khi thiếu `uploadsPlaylistId`. Channels UI dùng contract này cho section “Chưa tải Feed”.
- YouTube Data API không cho đọc playlist Watch Later. Extension lấy Likes bằng `videos.list?myRating=like`, còn Watch Later được thu thập từ DOM khi user mở/scroll `youtube.com/playlist?list=WL`. UI Gợi ý hiển thị riêng số signal đã thu thập và link mở playlist khi chưa có dữ liệu.
- Search gợi ý không dùng deprecated `relatedToVideoId`; query được suy ra từ token có trọng số (Likes x2, Watch Later x1), sau đó lọc video seed. Data API không có cờ `isShort`, nên luồng này dùng heuristic long-form `> 180s` để không lọt Shorts dài tới 3 phút.

## Verification hiện tại

Chạy trước handover/release:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm build:edge
pnpm cloud:check
```

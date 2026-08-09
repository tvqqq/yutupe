# Developer handover

## Trạng thái tại thời điểm handover

- Typecheck: pass.
- Unit tests: 7/7 pass.
- Chrome MV3 production build: pass.
- Edge MV3 production build: pass.
- Repo ban đầu trống và hiện chưa được khởi tạo Git.

## Feature matrix

| Feature | Trạng thái | Ghi chú |
|---|---|---|
| CRUD groups | Done | Emoji, màu, custom image ≤ 200 KB |
| Một channel thuộc nhiều group | Done | Many-to-many qua `Group.channelIds` |
| Feed theo group | Done | Dữ liệu từ DOM YouTube đang hiển thị |
| Filter/sort | Done | Duration, type, watched, text, date/popularity |
| Mark/hide watched | Done | Extension-local state |
| Play all | Done/MVP | Dùng `watch_videos` URL và giới hạn 50 video |
| YouTube main/left-tab integration | Done/MVP | Shadow panel + injected sidebar button |
| Channel management | Partial | Groups, tags, sort và local cleanup đã có |
| Smart tags | Partial | Rule-based local; chưa phải LLM |
| Notifications | Partial | Chỉ khi YouTube đang mở và DOM phát hiện video |
| Dead channel detection | Skipped | Cần canonical channel ID và YouTube API |
| Bulk unsubscribe thật | Skipped | Cần OAuth scope, quota/rate limit và safety flow |
| Google Drive sync | Skipped | Cần OAuth + conflict/tombstone data model |
| Edge profile sync | Skipped | Chưa tách settings nhỏ sang `storage.sync` |
| WebSub notifications | Skipped | Cần backend callback công khai |
| Android/iOS/Firefox sync | Skipped | Chưa có client ngoài Chromium desktop |
| Nested groups | Skipped | Data model chưa có `parentId` |
| Deck/multi-column view | Skipped | Popup/panel hiện là một feed |

## Việc nên làm tiếp theo

### P0 — ổn định MVP trước private beta

1. Manual smoke test trên tài khoản YouTube thật với Chrome và Edge.
2. Thêm selector fixtures cho nhiều layout/locale YouTube.
3. Thêm PNG icon 16/32/48/128 và store artwork.
4. Thêm onboarding: yêu cầu mở Subscriptions và giải thích local scanning.
5. Thêm toast/undo rõ ràng khi hide video hoặc xóa local channel.
6. Thêm virtual list cho channel manager khi có >500 channel.
7. Giảm bundle bằng lazy-load popup tabs nếu store/performance audit yêu cầu.

### P1 — YouTube OAuth/Data API

Mục tiêu: nguồn subscription canonical và channel management thật.

1. Tạo Google Cloud project và enable YouTube Data API v3.
2. Thêm `identity` permission và OAuth client riêng cho Chrome/Edge.
3. Implement `YouTubeApiClient` phía background:
   - `subscriptions.list(mine=true)` để import toàn bộ subscriptions.
   - `channels.list` theo batch để lấy canonical ID, subscriber count và uploads playlist.
   - `playlistItems.list` để refresh feed tiết kiệm quota hơn search.
4. Migrate local channel URL ID sang canonical ID với alias table.
5. Bulk unsubscribe:
   - Preview exact channels.
   - Typed confirmation.
   - Queue tuần tự, throttle, progress và retry từng item.
   - Audit log local; không rollback giả nếu API đã delete thành công.
6. OAuth/public-app verification và privacy disclosure trước store release.

Không đặt API secret trong extension. API key công khai trong bundle không được xem là secret; mọi secret thực phải ở backend.

### P1 — Sync

1. Chuyển `Group.channelIds` thành `GroupChannel` entity.
2. Thêm `updatedAt`, `deletedAt` tombstone và `deviceId` cho mọi entity sync.
3. Tách repository thành `LocalRepository` và `SyncRepository`.
4. Dùng Google Drive `appDataFolder` làm cross-browser source of truth.
5. `storage.sync` chỉ dùng cho preference nhỏ; không lưu video cache/custom image lớn.
6. Merge theo entity; test offline edit ở hai device, delete conflict và schema migration.

### P2 — AI tags

1. Tạo backend endpoint có auth/rate limit.
2. Payload tối thiểu: channel ID, title, description, sample recent-video titles.
3. Response JSON schema: `{ tags, suggestedGroup, confidence, reason }`.
4. UI phải preview và yêu cầu approve; không tự động thay đổi hàng loạt.
5. Thêm consent, retention policy và tùy chọn opt-out.
6. Giữ local classifier làm fallback.

### P2 — Production notifications

1. Backend đăng ký WebSub theo canonical channel IDs cần theo dõi.
2. Callback validate event, dedupe `(channelId, videoId, updatedAt)`.
3. Extension đăng ký device token hoặc poll event inbox bằng alarm.
4. Notification policy: instant/digest/quiet hours per group.
5. Renewal job cho WebSub subscription và monitoring delivery failures.

### P2 — Dead channel detection

Không đặt tên trạng thái là “dead” tuyệt đối. Đề xuất:

- `active`: upload trong threshold.
- `inactive`: không upload X ngày do user cấu hình.
- `unavailable`: canonical ID không còn trả về sau retry.
- `unknown`: API thiếu quyền/quota hoặc subscriber count ẩn.

UI chỉ đề xuất review; không tự động unsubscribe.

## Known limitations/risks

- YouTube DOM thay đổi có thể làm discovery ngừng hoạt động. Kiểm tra `src/youtube/parser.ts` đầu tiên.
- Published date từ DOM là text tương đối; MVP sort “newest” chủ yếu dùng thời điểm discover.
- Shorts detection là heuristic dựa URL/duration.
- View count parser chưa bao phủ mọi locale.
- Uploaded icon lưu data URL chung với state; nhiều icon lớn có thể chạm quota local.
- `chrome.storage.local` whole-state writes chưa tối ưu cho hàng chục nghìn video.
- Import validation hiện mới kiểm tra schema version/cấu trúc cấp cao; cần schema validator trước public release.
- Notification MVP không chạy độc lập khi YouTube đóng.
- “Mark watched” không ghi vào YouTube watch history.
- `watch_videos` là integration URL và cần smoke test định kỳ; có thể thay bằng local queue/player coordinator.

## Điểm mở rộng trong code

- API/data source: thêm adapter cạnh `src/youtube/parser.ts`, không để component gọi fetch trực tiếp.
- Storage/sync: refactor `readState/writeState` trong `entrypoints/background.ts` thành repository trước khi thêm Drive.
- Message contract: mở rộng `src/domain/messages.ts` và luôn trả `AppResponse` có lỗi rõ ràng.
- Feed rule: giữ pure trong `src/domain/state.ts` để test được.
- UI tokens: thay đổi ở `src/ui/design-system.css`, tránh hard-code màu mới trong feature CSS.

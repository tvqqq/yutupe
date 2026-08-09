# YouTube Collections

Chrome/Edge Manifest V3 extension để nhóm subscriptions và xem focused feed. Toàn bộ giao diện chạy trực tiếp trong `youtube.com`; extension không còn popup riêng.

## Tính năng

- Workspace full-page dưới YouTube header, mở từ left sidebar, nút nổi hoặc toolbar icon.
- Groups, custom icon, many-to-many channel assignment và notifications per group.
- Feed theo group với search, duration/content type/watched filters và sorting.
- Local DOM discovery khi chưa đăng nhập API.
- Google OAuth, import toàn bộ subscriptions và canonical channel metadata.
- Feed thật từ uploads playlists, bổ sung duration/statistics từ YouTube Data API.
- Bulk unsubscribe thật có danh sách preview và xác nhận.
- Google Drive `appDataFolder` push/pull groups, channels và watched state.
- AI tags và WebSub event inbox qua configurable Cloud API.
- Import/export JSON và local notifications.

## Chạy local

```bash
pnpm install
pnpm dev
```

Build và kiểm tra:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm build:edge
```

Load `.output/chrome-mv3` tại `chrome://extensions` hoặc `.output/edge-mv3` tại `edge://extensions`.

## Google OAuth production setup

OAuth thật cần stable extension ID. Xem chi tiết trong [docs/GOOGLE_SETUP.md](docs/GOOGLE_SETUP.md).

```bash
WXT_GOOGLE_CLIENT_ID_CHROME="...apps.googleusercontent.com" \
WXT_EXTENSION_KEY_CHROME="public-extension-key" \
pnpm build
```

Chrome/Edge nên có OAuth client riêng. Nếu build chưa chứa manifest `oauth2`, Settings vẫn cung cấp PKCE fallback cho development, nhưng production phải dùng Chrome Extension OAuth client.

## Cách dùng

1. Mở `youtube.com` và bấm **YouTube Collections** ở sidebar hoặc toolbar.
2. Vào **Cài đặt → Google & Cloud integrations**.
3. Kết nối Google rồi chạy **Sync subscriptions** và **Refresh feed**.
4. Tạo group trong tab Groups và gán channel trong tab Channels.
5. Chọn nhiều channel → **Unsubscribe** để xem preview và xác nhận trước khi gọi API thật.
6. Dùng Push/Pull Drive để backup hoặc restore.

## Tài liệu

- [Kiến trúc](docs/ARCHITECTURE.md)
- [Google OAuth/API setup](docs/GOOGLE_SETUP.md)
- [Cloud API contract](docs/CLOUD_API.md)
- [Developer handover](docs/HANDOVER.md)
- [Testing checklist](docs/TESTING.md)
- [Privacy baseline](docs/PRIVACY.md)

## Giới hạn hiện tại

- Không có credential Google/backend trong repo; integration chỉ chạy sau khi developer cấu hình project tương ứng.
- Drive pull dùng cloud-wins snapshot, chưa có per-entity tombstone conflict resolution.
- WebSub callback và AI inference phải được triển khai ở backend theo contract.
- OAuth access token chỉ giữ trong `storage.session`; người dùng kết nối lại sau khi restart browser.
- Dead-channel classification và Deck view chưa hoàn thiện.

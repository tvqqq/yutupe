# YouTube Collections MVP

Chrome/Edge extension để nhóm các channel YouTube và xem feed tập trung theo group. MVP hoạt động local-first, chèn UI trực tiếp vào YouTube và không cần API key.

## MVP hiện có

- Tạo, sửa, xóa group; chọn emoji, màu hoặc upload custom icon.
- Một channel có thể nằm trong nhiều group.
- Tự thu thập channel/video đang hiển thị trên YouTube Home, Subscriptions và các feed tương thích.
- Feed tổng hoặc theo group ngay trong popup và panel chèn trên YouTube.
- Tìm kiếm, lọc theo độ dài/content type/watched và sort theo ngày, độ dài, lượt xem.
- Mark as watched, hide watched, hide video và Play all.
- Quản lý channel, gắn custom tags và smart-tag cục bộ.
- Thêm entry “YouTube Collections” vào left sidebar của YouTube.
- Notifications local cho group khi YouTube đang mở và phát hiện video mới.
- Import/export JSON, reset dữ liệu và light/dark mode.
- Một codebase build Manifest V3 cho Chrome và Edge.

Các tính năng cần hạ tầng hoặc quyền tài khoản đã được tách khỏi MVP và ghi cụ thể trong [docs/HANDOVER.md](docs/HANDOVER.md): YouTube OAuth/API, unsubscribe thật, AI cloud, Google Drive sync, WebSub notification, dead-channel verification và mobile/Firefox sync.

## Chạy local

Yêu cầu Node.js 20+ và pnpm.

```bash
pnpm install
pnpm dev
```

Build production:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm build:edge
```

Output:

- Chrome: `.output/chrome-mv3`
- Edge: `.output/edge-mv3`

Load unpacked trên Chrome:

1. Mở `chrome://extensions`.
2. Bật Developer mode.
3. Chọn **Load unpacked** và trỏ tới `.output/chrome-mv3`.
4. Mở hoặc reload `https://www.youtube.com`.

Trên Edge dùng `edge://extensions` và thư mục `.output/edge-mv3`.

## Cách dùng

1. Mở YouTube Home hoặc Subscriptions và cuộn trang để extension thu thập video/channel đang hiển thị.
2. Mở popup extension → **Groups** → tạo group.
3. Sang **Channels** và bấm các group để gán channel.
4. Xem feed theo group trong popup hoặc bấm nút nổi/entry sidebar trên YouTube.
5. Vào **Cài đặt** để bật hide-watched, notification local hoặc export backup.

## Scripts

| Script | Mục đích |
|---|---|
| `pnpm dev` | Chạy WXT development với Chrome |
| `pnpm dev:edge` | Chạy development với Edge |
| `pnpm typecheck` | TypeScript strict check |
| `pnpm test` | Unit tests bằng Vitest |
| `pnpm build` | Build Chrome MV3 |
| `pnpm build:edge` | Build Edge MV3 |
| `pnpm zip` | Tạo Chrome submission ZIP |
| `pnpm zip:edge` | Tạo Edge submission ZIP |

## Tài liệu

- [Kiến trúc](docs/ARCHITECTURE.md)
- [Developer handover và backlog](docs/HANDOVER.md)
- [Testing và release checklist](docs/TESTING.md)
- [Privacy baseline](docs/PRIVACY.md)

## Lưu ý

MVP đọc metadata từ DOM đang hiển thị, không đọc toàn bộ subscription account. Selector YouTube có thể thay đổi; toàn bộ logic parsing được tập trung trong `src/youtube/parser.ts` để dễ bảo trì.

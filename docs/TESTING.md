# Testing and release checklist

## Automated checks

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm build:edge
```

Unit tests hiện tập trung vào domain feed và metadata parser. Khi sửa selector hoặc sync, bổ sung fixture/test trước khi merge.

## Manual Chrome/Edge smoke test

1. Load unpacked build.
2. Mở YouTube Home và xác nhận nút nổi xuất hiện.
3. Xác nhận entry “YouTube Collections” xuất hiện ở left navigation đầy đủ hoặc mini guide.
4. Cuộn feed, mở popup và kiểm tra video/channel được discover mà không nhân bản.
5. Tạo group có emoji, màu và custom image.
6. Gán một channel vào hai group.
7. Kiểm tra filter duration/type/watched và sort.
8. Mark watched từ panel; popup phải cập nhật mà không reload.
9. Click video thật trên YouTube; video đã cache phải đổi watched state.
10. Export JSON, reset, import và đối chiếu groups/watched state.
11. Bật notification cho group, discovery thêm video mới và kiểm tra click notification.
12. Reload YouTube SPA qua nhiều route, bảo đảm không có nhiều sidebar button/panel host.
13. Test light/dark và zoom 80%/125%.

## YouTube layouts cần kiểm tra

- Home rich grid.
- `/feed/subscriptions`.
- Search results.
- Channel Videos tab.
- Watch page compact recommendations.
- Signed-out state.
- Left navigation expanded/collapsed.
- Vietnamese và English UI.

## Store readiness

- PNG icons và promotional artwork.
- Privacy policy URL.
- Permission justification cho `storage`, `notifications`, YouTube host permission.
- No remote code/eval.
- Version bump trong `package.json`.
- Chrome/Edge ZIP tạo từ clean checkout.
- Kiểm tra bundle không chứa `.env`, token hoặc test account data.

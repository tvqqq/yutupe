# Testing and release checklist

## Automated checks

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm build:edge
pnpm cloud:check
```

Unit tests hiện bao phủ domain feed, metadata parser và Drive snapshot apply.

## Manual Chrome/Edge smoke test

1. Load unpacked build.
2. Mở YouTube Home và xác nhận nút nổi xuất hiện.
3. Xác nhận entry “YouTube Collections” xuất hiện ở left navigation đầy đủ hoặc mini guide.
4. Cuộn feed, mở workspace trực tiếp trên YouTube và kiểm tra video/channel được discover mà không nhân bản.
5. Tạo group có emoji, màu và custom image.
6. Gán một channel vào hai group.
7. Kiểm tra filter duration/type/watched và sort.
8. Mark watched, đóng/mở workspace và xác nhận state được giữ.
9. Click video thật trên YouTube; video đã cache phải đổi watched state.
10. Export JSON, reset, import và đối chiếu groups/watched state.
11. Bật notification cho group, discovery thêm video mới và kiểm tra click notification.
12. Reload YouTube SPA qua nhiều route, bảo đảm không có nhiều sidebar button/panel host.
13. Test light/dark và zoom 80%/125%.
14. Với OAuth test project: connect, sync subscriptions và refresh API feed.
15. Với disposable account: unsubscribe một test channel và kiểm tra local cleanup.
16. Push Drive, sửa local, Pull Drive và xác nhận restore warning + kết quả.
17. Deploy staging Worker, kiểm tra `/health`, cấp optional Cloud origin và bấm **Kiểm tra Cloud**.
18. Chạy AI Groups, xác nhận mọi canonical channel ID chỉ thuộc một AI group và không có ID lạ.
19. Đăng ký WebSub; status phải chuyển dần từ pending sang active theo cron.
20. Gửi signed Atom fixture vào callback staging và xác nhận event xuất hiện sau **Đồng bộ events**.

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
- Permission justification cho `storage`, `identity`, `activeTab`, `alarms`, `notifications` và Google/YouTube hosts.
- No remote code/eval.
- Version bump trong `package.json`.
- Chrome/Edge ZIP tạo từ clean checkout.
- Kiểm tra bundle không chứa `.env`, token hoặc test account data.

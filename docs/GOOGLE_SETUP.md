# Google OAuth and API setup

## APIs và scopes

Enable trong cùng Google Cloud project:

- YouTube Data API v3.
- Google Drive API.

Scopes extension yêu cầu:

- `openid`
- `email`
- `https://www.googleapis.com/auth/youtube.force-ssl`
- `https://www.googleapis.com/auth/drive.appdata`

`youtube.force-ssl` cần cho đọc subscriptions và unsubscribe. `drive.appdata` chỉ truy cập hidden app-data folder, không đọc My Drive thông thường.

## Stable extension ID

1. Tạo/gán public extension key để unpacked build giữ cùng extension ID.
2. Load build và kiểm tra ID tại `chrome://extensions`.
3. Tạo OAuth Client type **Chrome Extension** với Item ID này.
4. Đặt client ID và public key vào environment khi build:

```bash
export WXT_GOOGLE_CLIENT_ID_CHROME="...apps.googleusercontent.com"
export WXT_EXTENSION_KEY_CHROME="..."
pnpm build
```

Lặp lại cho Edge với `WXT_GOOGLE_CLIENT_ID_EDGE` và `WXT_EXTENSION_KEY_EDGE` nếu store/build ID khác.

Không commit private signing key hoặc OAuth client secret. Chrome Extension OAuth client không cần client secret trong bundle.

## Development fallback

Nếu manifest không có `oauth2`, Settings cho phép nhập OAuth Client ID và dùng `launchWebAuthFlow` + PKCE. Redirect URL thực tế lấy từ `chrome.identity.getRedirectURL('google-oauth')`; URL này phải được client chấp nhận. Đây chỉ là fallback để thử nghiệm vì Google/Edge policy có thể khác theo client type.

## Verification

Trước public release:

- Cấu hình OAuth consent screen, test users và verified domains.
- Hoàn thành Google OAuth verification cho sensitive YouTube scope.
- Đảm bảo Chrome Web Store item ID trùng OAuth Chrome Extension client.
- Cập nhật privacy policy và permission justification.
- Test account không nằm trong source, JSON fixtures hoặc screenshots.

## Quota behavior

- Sync subscriptions gọi paginated `subscriptions.list`, rồi batch `channels.list` tối đa 50 ID/call.
- Refresh feed gọi `playlistItems.list` cho tối đa `youtubeSyncChannelLimit` channels và batch `videos.list`.
- Unsubscribe chạy tuần tự theo subscription ID; mỗi successful API call xóa channel khỏi local state.
- Không tự động retry unsubscribe để tránh action trùng/khó kiểm soát.

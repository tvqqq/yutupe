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

Chrome production key hiện được lưu local tại `.keys/chrome-extension-private.pem`; public key nằm trong `.env.local`. Hai đường dẫn này bị Git ignore. Extension ID được suy ra cố định là `behfooaigccbooibiabffaehejiagcbi`. Phải backup private key ở nơi an toàn; mất key đồng nghĩa không thể tái tạo cùng ID trên máy khác.
2. Load build và kiểm tra ID tại `chrome://extensions`.
3. Tạo OAuth Client type **Chrome Extension** với Item ID này.
4. Đặt client ID và public key vào environment khi build:

```bash
export WXT_GOOGLE_CLIENT_ID_CHROME="...apps.googleusercontent.com"
export WXT_EXTENSION_KEY_CHROME="..."
pnpm build
```

Edge và Firefox không hỗ trợ `identity.getAuthToken` theo cơ chế native của Chrome. Cả Edge và Firefox đều dùng `identity.launchWebAuthFlow` với OAuth implicit access-token response, `state` chống CSRF và redirect URI theo extension ID:

- **Edge**:
  ```text
  https://<EDGE_EXTENSION_ID>.chromiumapp.org/google-oauth
  ```
- **Firefox**:
  ```text
  https://9e0af50438f8e8068d4b91b6b9f9de0b4c2a5e04.extensions.allizom.org/google-oauth
  ```
  *(Firefox tự băm SHA-1 của extension ID `youtube-collections@extension.local` thành chuỗi hex `9e0af50438f8e8068d4b91b6b9f9de0b4c2a5e04`. Bạn cũng có thể mở Cài đặt trong extension để copy trực tiếp URI này)*

Tạo OAuth Client loại **Web application** riêng cho Edge / Firefox và thêm redirect URI tương ứng vào **Authorized redirect URIs**, sau đó đặt `WXT_GOOGLE_CLIENT_ID_EDGE` hoặc `WXT_GOOGLE_CLIENT_ID_FIREFOX`.

Chrome tự renew token bằng `identity.getAuthToken({ interactive: false })`. Edge và Firefox không nhận refresh token từ implicit flow nên extension thử flow `prompt=none` với tài khoản đã biết; chỉ hiện nút connect lại nếu Google không thể hoàn tất flow âm thầm.

Không commit private signing key hoặc OAuth client secret. Chrome Extension OAuth client không cần client secret trong bundle.

## Development fallback

Nếu manifest không có `oauth2`, Settings cho phép nhập OAuth Client ID và dùng cùng `launchWebAuthFlow` flow. Redirect URL thực tế lấy từ `browser.identity.getRedirectURL('google-oauth')`; URL này phải được client chấp nhận. Chrome production tiếp tục dùng manifest OAuth client + `getAuthToken`; Edge/Firefox nhận access token trực tiếp trong URL fragment vì không thể lưu `client_secret` an toàn trong extension.

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

# Privacy baseline

## Local data

`browser.storage.local` lưu channel/video metadata, groups, tags, custom icons, settings và watched/hidden state.

`browser.storage.session` lưu Google OAuth token và narrow Cloud API session token; chúng bị xóa khi browser session kết thúc. Token không nằm trong page DOM, JSON export hoặc Drive snapshot.

## External transfers

- Google APIs nhận OAuth access token để sync subscriptions/feed, unsubscribe và Drive appData.
- Configured Cloud API nhận channel title/description cho AI tags và event cursor cho WebSub inbox.
- Cloud API nhận Google ID token nếu có. Nếu Chrome trả opaque access token, `/v1/auth/google` phải chỉ verify rồi đổi sang narrow session token, không lưu hoặc sử dụng quyền Google API.

Cloud origin là optional host permission và phải được người dùng approve.

## Production requirements

- Privacy policy công khai và consent rõ cho OAuth, AI và sync.
- OAuth scope explanation, retention/deletion policy và revoke flow.
- Backend user isolation, encryption, rate limiting, audit logging và deletion endpoint.
- Không dùng AI metadata cho training nếu chưa có opt-in riêng.
- Watched state là của extension, không phải YouTube watch history.

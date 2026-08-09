# Privacy baseline

## MVP data flow

MVP không có backend và không gửi dữ liệu người dùng ra ngoài extension.

Dữ liệu lưu trong browser local storage:

- Tên/URL/thumbnail channel nhìn thấy trên trang YouTube.
- Metadata video nhìn thấy trên trang YouTube.
- Groups, tags, custom icons và settings do người dùng tạo.
- Watched/hidden state riêng của extension.

Custom icon phải nhỏ hơn 200 KB. Người dùng có thể export, import hoặc reset toàn bộ dữ liệu trong Settings.

## Before enabling cloud features

AI, Google Drive, YouTube OAuth hoặc notification backend không được bật cho production trước khi có:

- Privacy policy công khai.
- Consent theo feature.
- Danh sách scope và mục đích sử dụng.
- Retention/deletion policy.
- Backend access control, rate limiting và audit logging.
- Cơ chế disconnect/revoke và xóa dữ liệu cloud.

Không thu thập watch history chính thức của YouTube và không tuyên bố extension thay đổi YouTube watch history.

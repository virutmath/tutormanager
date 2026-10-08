# Cấu hình Brave Search cho GitHub Pages

GitHub Pages chỉ phục vụ file tĩnh. Ứng dụng gọi Brave qua Cloudflare Worker
vì Brave Search không chấp nhận preflight CORS trực tiếp từ trình duyệt.

## 1. Tạo Worker API riêng

Không chỉnh đè Worker `tutormanager` đang phục vụ trang web. Tạo Worker riêng:

1. Mở Cloudflare Dashboard → **Workers & Pages** → **Create** → **Create Worker**.
2. Đặt tên chính xác là `calorie-brave-search`, rồi nhấn **Deploy**.
3. Chọn **Edit code**, thay nội dung bằng toàn bộ file
   [`brave_search_worker.js`](./brave_search_worker.js), sau đó **Save and deploy**.
4. Trong **Settings → Variables and Secrets**, thêm biến môi trường:
   - Name: `ALLOWED_ORIGIN`
   - Value: `https://virutmath.github.io`
5. Lưu thay đổi và deploy lại nếu Dashboard yêu cầu.

Nếu GitHub Pages dùng custom domain, thay `ALLOWED_ORIGIN` bằng origin chính xác
của domain đó (chỉ gồm scheme và hostname, không có đường dẫn).

## 2. Cập nhật GitHub Pages

Ứng dụng đã cấu hình sẵn endpoint:

`https://calorie-brave-search.dangtrungkien89.workers.dev/search`

Tên Worker ở bước 1 tạo URL này với account subdomain hiện tại
`dangtrungkien89.workers.dev`. Nếu Cloudflare hiển thị account subdomain khác,
hãy cập nhật `BRAVE_SEARCH_WORKER_URL` trong `calorie_tracker.html`.

Commit/push `calorie_tracker.html` lên GitHub Pages. Không cần `wrangler.toml`
hoặc Wrangler CLI cho cách triển khai qua Dashboard.

## 3. Sử dụng

1. Mở trang GitHub Pages và vào **Cấu hình AI**.
2. Nhập Google AI Studio API key và Brave Search API key.
3. Bật **Tìm kiếm thông tin dinh dưỡng trên internet bằng Brave Search**.
4. Nhập mô tả sản phẩm hoặc chọn/chụp ảnh rồi phân tích.

Worker chỉ cho phép origin đã cấu hình, không lưu hoặc ghi log API key, và chỉ
chuyển tiếp tìm kiếm Brave. Brave key được giữ trong tab và gửi tới Worker mỗi
lần tìm kiếm; người sử dụng trình duyệt vẫn có thể xem key của chính họ.

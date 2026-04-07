Railway Firebase Dashboard v9 Pro Mobile PWA

Bản này nâng cấp từ v8, dành cho Railway + Firebase Realtime Database.

Tính năng mới:
- Alias bot trong admin
- Pin bot để luôn nổi lên đầu danh sách
- Detect bot chết / chậm nhịp / online theo heartbeat
- BXH bot theo: Lãi thực / % lãi thực / Lãi ngày
- Card bot hiển thị full thông tin hơn: balance, equity, lãi thực, %, lãi ngày, DD, orders, lots, volume, trạng thái, kết nối
- Chi tiết bot hiển thị full info ngay trong tab Bots
- Giao diện mobile kiểu app, màu tối chuyên nghiệp, animation nhẹ, chuyển tab mượt
- PWA: có manifest + service worker + icon, có thể Add to Home Screen
- Lịch tháng vẫn lưu theo lich_thang_YYYY_MM.json như bản trước
- Xóa bot qua admin Railway API vẫn giữ nguyên

Biến môi trường Railway:
- EA_TOKEN
- PANEL_TOKEN
- FIREBASE_DATABASE_URL
- FIREBASE_SERVICE_ACCOUNT_JSON

Deploy:
1. Upload toàn bộ folder này lên Railway
2. Set biến môi trường
3. Start command: npm start

File chính:
- server.js
- public/index.html
- public/manifest.webmanifest
- public/sw.js
- public/icon.svg

Ghi chú:
- Bot chết: > 30 giây không có heartbeat
- Bot chậm nhịp: 11-30 giây
- Bot online: <= 10 giây

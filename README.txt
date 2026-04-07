RAILWAY FULL BUNDLE
===================

Mục tiêu bản này:
- Chạy thẳng trên Railway bằng Express.
- Giữ nguyên API cho EA:
  /ea/heartbeat
  /ea/next
  /ea/ack
  /panel/summary
  /panel/cmd
- Thêm lịch tháng lưu dạng JSON động:
  /calendar/lich_thang_YYYY_MM.json

Biến môi trường Railway:
- EA_TOKEN=cua
- PANEL_TOKEN=07072000
- FIREBASE_DATABASE_URL=https://cua-caro-token-default-rtdb.asia-southeast1.firebasedatabase.app
- FIREBASE_SERVICE_ACCOUNT_JSON={...service account json một dòng...}

Cách deploy Railway:
1) Upload cả folder này lên GitHub hoặc kéo thẳng vào Railway.
2) Railway -> Variables -> thêm 4 biến ở trên.
3) Deploy.
4) EA dùng:
   BridgeURL = "https://YOUR-APP.up.railway.app"
   BridgeEaToken = "cua"

Kiểm tra nhanh:
- https://YOUR-APP.up.railway.app/health
- https://YOUR-APP.up.railway.app/ea/heartbeat?id=1&bot=Demo&symbol=XAUUSDm&ea_token=cua
- https://YOUR-APP.up.railway.app/panel/summary?token=07072000
- https://YOUR-APP.up.railway.app/calendar/lich_thang_2026_04.json

Ghi chú lịch tháng:
- JSON tháng được lưu bền vững trong Firebase tại calendarFiles/lich_thang_YYYY_MM
- Đồng thời server sẽ mirror ra file cache cục bộ nếu Railway còn instance hiện tại.
- Frontend ưu tiên ngày cũ từ lịch tháng JSON, còn ngày hiện tại vẫn lấy realtime từ bot.
- Khi bot gửi heartbeat, snapshot ngày hiện tại sẽ tự được cập nhật vào lịch tháng.

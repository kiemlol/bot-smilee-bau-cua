# Bot Smilee — Bầu cua trên Vercel + Vercel Postgres

Chơi trong chat Zalo, xu ảo. Luồng đã chốt: ảnh bàn -> chọn con (gõ tên/số) -> chọn mức cược -> GIF lắc -> tin nhắn kết quả liệt kê người trúng + số tiền (không gửi ảnh kết quả).

## Đã deploy thử (code + ảnh bàn)
- Webhook: `https://bot-smilee-bau-cua-smile-8c54.vercel.app/api/webhook` (dán link này vào ô Webhook URL trong màn hình Bot Smilee)
- Health: `https://bot-smilee-bau-cua-smile-8c54.vercel.app/api/health` — cho biết `db` đang là `postgres` hay `memory`, và đã có token Zalo chưa (không bao giờ in giá trị token).
- Ảnh bàn: `https://bot-smilee-bau-cua-smile-8c54.vercel.app/board.jpg`

## BẮT BUỘC TRƯỚC KHI TEST: tắt Deployment Protection
Deployment mới đang ở trạng thái READY nhưng bị Vercel Authentication chặn (mở link sẽ thấy trang "Protected by Vercel Authentication") — Zalo không qua được màn này nên webhook sẽ không tới server.
Khương vào Vercel Dashboard -> project `bot-smilee-bau-cua` -> Settings -> Deployment Protection -> tắt đi (Khương từng tắt cho project Zoo Pet rồi, làm y vậy). Sau đó mở lại `/api/health` bằng trình duyệt thường phải thấy JSON, không phải trang đăng nhập nữa.

## Khương cần làm trên Vercel Dashboard (Muse không tạo được Postgres store qua API)
1. Mở project -> Storage -> Create Database -> Postgres -> Create, rồi Connect tới project này. Vercel sẽ tự thêm `POSTGRES_URL` (và các biến liên quan) vào env.
2. Project -> Settings -> Environment Variables, thêm (Production):
   - `ZALO_BOT_TOKEN` = Bot Token trong màn hình Bot Smilee (dạng `id:secret`, KHÔNG gửi qua chat)
   - `ZALO_API_BASE_URL` = base URL của Zalo Bot API cho bot này (xem ghi chú bên dưới, không có dấu `/` cuối, không kèm tên method)
   - `ZALO_WEBHOOK_SECRET` = đúng chuỗi Secret Token Khương đặt trong màn hình Bot Smilee (8-256 ký tự)
   - `GIF_URL` = link GIF lắc. Tạm thời có thể dùng link Muse file (hết hạn 27/10/2026), về lâu dài phải đưa GIF vào deployment bằng git import (xem bên dưới).
   - `STARTING_BALANCE` (tùy chọn, mặc định 1000)
3. Deploy lại project (Deployments -> Redeploy) để env mới có hiệu lực, rồi kiểm tra `/api/health` phải báo `db: postgres`.

## Khương cần làm trên màn hình Bot Smilee
- Dán Webhook URL `https://bot-smilee-bau-cua-smile-8c54.vercel.app/api/webhook` vào ô Webhook URL, bấm Lưu thay đổi.
- Secret Token ở đó phải trùng `ZALO_WEBHOOK_SECRET` trên Vercel. Server sẽ từ chối request nào không có header `X-Bot-Api-Secret-Token` đúng giá trị đó.

## Về API gửi tin của Zalo — đã rõ base URL, còn 1 chỗ cần test thật
- Base URL: `https://bot-api.zaloplatforms.com` (nhiều SDK độc lập Go/Python/PHP đều ghi host này, kèm method `sendMessage {chat_id, text}` và `sendPhoto {chat_id, photo, caption}`). Code đã đặt sẵn host này làm mặc định; `ZALO_API_BASE_URL` chỉ cần đặt nếu muốn ghi đè.
- Webhook vào đúng dạng Go/Node SDK: `result.event_name`, `result.message.chat.id`, `text`, `from.display_name` — code đã parse đúng dạng này, cộng thêm dạng PHP (`chatId`, `user_text`) để dự phòng.
- Chưa xác minh: token gửi đi bằng header `Authorization: Bearer` hay gắn vào đường dẫn kiểu Telegram (`/bot<token>/sendMessage`). SDK chỉ cho thấy token truyền vào client, không lộ raw HTTP. Khi test thật, nếu trả 401 thì đó là chỗ đầu tiên cần đổi, và body lỗi sẽ nằm trong response webhook (trường `sent.error`).

## Về nút bấm
Nút bấm inline (`reply_markup`) CHƯA xác minh được là Zalo Bot API có hỗ trợ hay không, nên mặc định TẮT (`ZALO_KEYBOARD` không đặt).
Game vẫn chơi đủ bằng cách gõ: tên con (`Cua`), số (`2`), số tiền (`50`), `Xem xu`, `hủy`, `Bầu cua`.
Muốn thử nút: đặt `ZALO_KEYBOARD=1`, redeploy, nhắn thử — nếu Zalo không hiện nút hoặc báo lỗi, tắt lại là game vẫn chạy bằng gõ chữ.

## Vì sao GIF không nằm trong deployment này
Deploy qua API của Vercel bị giới hạn 1 argument ~128KB, file GIF 154KB không nhét chung được. Giải pháp lâu dài: đưa toàn bộ source (kể cả GIF) lên GitHub rồi import repo đó vào Vercel (git import) — lúc đó GIF sẽ ở `https://bot-smilee-bau-cua-smile-8c54.vercel.app/bau-cua-shake.gif` và không cần `GIF_URL` nữa. Đây là bước tiếp theo sau khi Khương test xong luồng bằng link tạm.

## Test không cần token Zalo
```bash
curl -X POST https://bot-smilee-bau-cua-smile-8c54.vercel.app/api/webhook \
  -H 'Content-Type: application/json' \
  -d '{"result":{"message":{"chat":{"id":"test-1"},"text":"Bầu cua","message_id":"t1"}}}'
```
Response sẽ chứa `replies` (bot sẽ gửi gì) và `sent` (lý do chưa gửi được nếu chưa có token) — dùng để kiểm tra logic trước khi nối Zalo thật.

## Database
Lần đầu có `POSTGRES_URL`, server tự tạo 3 bảng: `bau_cua_users` (số xu + ván đang đặt dở), `bau_cua_rounds` (lịch sử ván), `bau_cua_processed` (chống xử lý trùng 1 tin nhắn 2 lần).
Nếu chưa có `POSTGRES_URL`, server chạy bằng bộ nhớ tạm và `/api/health` báo `db: memory` — chỉ để test, KHÔNG dùng chơi thật vì Vercel reset là mất xu.

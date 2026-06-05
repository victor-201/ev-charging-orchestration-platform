/**
 * Kiosk Guest Sentinel
 *
 * KIOSK_GUEST_USER_ID — UUID dùng để định danh khách vãng lai sạc qua kiosk vật lý
 * mà không có tài khoản người dùng. Backend gán giá trị này thay vì NULL để đảm bảo
 * ràng buộc NOT NULL của cột user_id trong database.
 *
 * KIOSK_GUEST_PROFILE — Object hiển thị thay thế. Được inject vào userMap trước khi
 * render, không cần gọi API /users (sẽ không tìm thấy ID này trong bảng users).
 */
export const KIOSK_GUEST_USER_ID = '00000000-0000-4000-8000-000000000000';

export const KIOSK_GUEST_PROFILE = {
  fullName: 'Khách vãng lai',
  email: 'Sạc tại kiosk',
  phone: null,
} as const;

/**
 * Lọc bỏ KIOSK_GUEST_USER_ID khỏi danh sách cần tra cứu API.
 * Guest profile được inject thủ công, không tồn tại trong bảng users.
 */
export function filterGuestFromUserIds(ids: string[]): string[] {
  return ids.filter((id) => id !== KIOSK_GUEST_USER_ID);
}

/**
 * Inject kiosk guest vào userMap nếu danh sách IDs ban đầu chứa guest ID.
 * Gọi hàm này SAU khi đã build userMap từ API response.
 */
export function injectKioskGuest(
  ids: string[],
  map: Map<string, { fullName: string; email: string; phone: string | null }>,
): void {
  if (ids.includes(KIOSK_GUEST_USER_ID)) {
    map.set(KIOSK_GUEST_USER_ID, KIOSK_GUEST_PROFILE);
  }
}

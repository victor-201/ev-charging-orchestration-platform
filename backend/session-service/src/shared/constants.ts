/**
 * Shared Platform Constants
 *
 * KIOSK_GUEST_USER_ID — The sentinel UUID representing an anonymous walk-in
 * customer who charges directly at a physical kiosk without a user account.
 *
 * This value is assigned by CompositeAuthGuard when a request is authenticated
 * via the X-Kiosk-Key header instead of a user JWT. It allows all downstream
 * business logic to identify kiosk-initiated sessions without requiring
 * nullable user_id columns in the database.
 *
 * Usages:
 *   - session-service: StartSessionUseCase stores it as the session owner.
 *   - session-service: SessionController checks it to detect kiosk callers.
 *   - billing-service: SessionCompletedBillingConsumer skips wallet reconciliation for this user.
 *   - billing-service: CompositeAuthGuard assigns it when the kiosk key is valid.
 */
export const KIOSK_GUEST_USER_ID = '00000000-0000-4000-8000-000000000000';

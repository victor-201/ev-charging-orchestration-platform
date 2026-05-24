import 'package:mobile_app/core/constants/api_paths.dart';
import 'package:mobile_app/core/network/dio_client.dart';
import 'admin_response_dtos.dart';

/// Admin and System Operations API Stubs
///
/// Exposes typed wrapper stubs to invoke admin-level and system-restricted endpoints
/// on the EV Charging Orchestration backend services.
///
/// Scoped exclusively to administrative staff and system automation clients. Normal
/// customer clients must never invoke these wrappers directly.
///
/// Depends on: DioClient, ApiPaths
class AdminApiStubs {
  final DioClient _client;
  AdminApiStubs({required DioClient client}) : _client = client;

  // IAM Administrative Services

  /// Assigns a system-defined security role to a user.
  /// HTTP: POST /auth/roles/assign
  Future<RoleOperationDto> assignRole(String userId, String role) async {
    final r = await _client.post(ApiPaths.rolesAssign, data: {'userId': userId, 'role': role});
    return RoleOperationDto.fromJson(r.data as Map<String, dynamic>);
  }

  /// Revokes an assigned system-defined security role from a user.
  /// HTTP: POST /auth/roles/revoke
  Future<RoleOperationDto> revokeRole(String userId, String role) async {
    final r = await _client.post(ApiPaths.rolesRevoke, data: {'userId': userId, 'role': role});
    return RoleOperationDto.fromJson(r.data as Map<String, dynamic>);
  }

  /// Retrieves chronological audit logs detailing administrative changes for a specific user.
  /// HTTP: GET /users/:id/audit-log
  Future<List<AuditLogDto>> getUserAuditLogs(String userId) async {
    final r = await _client.get('/users/$userId/audit-log');
    final list = r.data as List<dynamic>;
    return list.map((e) => AuditLogDto.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// Permanently deletes a user account from the system registry.
  /// HTTP: DELETE /users/:id
  Future<void> deleteUser(String userId) => _client.delete(ApiPaths.deleteUser(userId));

  // Infrastructure Administrative Services

  /// Registers a newly deployed charging station within the infrastructure ledger.
  /// HTTP: POST /stations
  Future<StationAdminDto> createStation(Map<String, dynamic> data) async {
    final r = await _client.post(ApiPaths.stations, data: data);
    return StationAdminDto.fromJson(r.data as Map<String, dynamic>);
  }

  /// Updates profile metadata and geo-coordinates for an existing charging station.
  /// HTTP: PATCH /stations/:id
  Future<StationAdminDto> updateStation(String id, Map<String, dynamic> data) async {
    final r = await _client.patch(ApiPaths.stationById(id), data: data);
    return StationAdminDto.fromJson(r.data as Map<String, dynamic>);
  }

  /// Removes a charging station from the system network.
  /// HTTP: DELETE /stations/:id
  Future<void> deleteStation(String id) => _client.delete(ApiPaths.stationById(id));

  /// Attaches a physical charger unit to a designated charging station.
  /// HTTP: POST /stations/:id/chargers
  Future<ChargerAdminDto> addCharger(String stationId, Map<String, dynamic> data) async {
    final r = await _client.post(ApiPaths.stationChargers(stationId), data: data);
    return ChargerAdminDto.fromJson(r.data as Map<String, dynamic>);
  }

  /// Transitions a charger unit to a new operational status (e.g., Active, Maintenance).
  /// HTTP: PATCH /stations/:id/chargers/:cid/status
  Future<ChargerAdminDto> updateChargerStatus(String stationId, String chargerId, String status) async {
    final r = await _client.patch(ApiPaths.chargerStatus(stationId, chargerId), data: {'status': status});
    return ChargerAdminDto.fromJson(r.data as Map<String, dynamic>);
  }

  /// Computes estimated pricing parameters for an active charging scenario.
  /// HTTP: POST /stations/pricing/calculate
  Future<PricingCalculationDto> calculatePricing(Map<String, dynamic> data) async {
    final r = await _client.post(ApiPaths.pricingCalculate, data: data);
    return PricingCalculationDto.fromJson(r.data as Map<String, dynamic>);
  }

  /// Returns a complete list of current infrastructure billing rules and tariffs.
  /// HTTP: GET /stations/pricing-rules
  Future<List<PricingRuleDto>> getPricingRules() async {
    final r = await _client.get(ApiPaths.pricingRules);
    final list = r.data as List<dynamic>;
    return list.map((e) => PricingRuleDto.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// Establishes a new dynamic pricing rule for stations.
  /// HTTP: POST /stations/pricing-rules
  Future<PricingRuleDto> createPricingRule(Map<String, dynamic> data) async {
    final r = await _client.post(ApiPaths.pricingRules, data: data);
    return PricingRuleDto.fromJson(r.data as Map<String, dynamic>);
  }

  /// Modifies an active pricing rule structure.
  /// HTTP: PATCH /stations/pricing-rules/:ruleId
  Future<PricingRuleDto> updatePricingRule(String ruleId, Map<String, dynamic> data) async {
    final r = await _client.patch(ApiPaths.pricingRuleById(ruleId), data: data);
    return PricingRuleDto.fromJson(r.data as Map<String, dynamic>);
  }

  /// Deactivates a specific pricing rule, preventing further billing applications.
  /// HTTP: PATCH /stations/pricing-rules/:ruleId/deactivate
  Future<PricingRuleDto> deactivatePricingRule(String ruleId) async {
    final r = await _client.patch(ApiPaths.pricingRuleDeactivate(ruleId));
    return PricingRuleDto.fromJson(r.data as Map<String, dynamic>);
  }

  // Session Administrative Services

  /// Commands the platform to force terminate an active charging session on behalf of the customer.
  /// HTTP: POST /charging/admin/stop/:id
  Future<AdminStopSessionDto> adminStopSession(String sessionId) async {
    final r = await _client.post(ApiPaths.chargingAdminStop(sessionId));
    return AdminStopSessionDto.fromJson(r.data as Map<String, dynamic>);
  }

  /// Dispatches discrete telemetry points to the tracking buffer for validation.
  /// HTTP: POST /charging/telemetry/:id
  Future<TelemetryIngestDto> ingestTelemetry(String sessionId, Map<String, dynamic> data) async {
    final r = await _client.post(ApiPaths.chargingTelemetry(sessionId), data: data);
    return TelemetryIngestDto.fromJson(r.data as Map<String, dynamic>);
  }

  /// Queries the active session state of a designated charging unit.
  /// HTTP: GET /charging/charger/:chargerId/active
  Future<ChargerActiveSessionDto> getChargerActiveSession(String chargerId) async {
    final r = await _client.get(ApiPaths.chargerActiveSession(chargerId));
    return ChargerActiveSessionDto.fromJson(r.data as Map<String, dynamic>);
  }

  // Billing Administrative Services

  /// Initiates a transaction rollback and customer refund for a specific payment ID.
  /// HTTP: POST /payments/:id/refund
  Future<RefundDto> refundPayment(String paymentId) async {
    final r = await _client.post(ApiPaths.paymentRefund(paymentId));
    return RefundDto.fromJson(r.data as Map<String, dynamic>);
  }

  // Notification Administrative Services

  /// Retrieves a registry list of all registered mobile devices and push tokens.
  /// HTTP: GET /devices
  Future<List<DeviceDto>> getDevices() async {
    final r = await _client.get(ApiPaths.devices);
    final list = r.data as List<dynamic>;
    return list.map((e) => DeviceDto.fromJson(e as Map<String, dynamic>)).toList();
  }

  // Analytics Reports Services

  /// Pulls high-level aggregate system KPIs and operational status telemetry reports.
  /// HTTP: GET /analytics/system
  Future<SystemAnalyticsDto> getSystemAnalytics() async {
    final r = await _client.get(ApiPaths.analyticsSystem);
    return SystemAnalyticsDto.fromJson(r.data as Map<String, dynamic>);
  }

  /// Retrieves financial metrics representing platform revenue flow over selected periods.
  /// HTTP: GET /analytics/revenue
  Future<RevenueAnalyticsDto> getRevenueAnalytics() async {
    final r = await _client.get(ApiPaths.analyticsRevenue);
    return RevenueAnalyticsDto.fromJson(r.data as Map<String, dynamic>);
  }

  /// Retrieves utilization rates and statistics across charging stations.
  /// HTTP: GET /analytics/usage
  Future<UsageAnalyticsDto> getUsageAnalytics() async {
    final r = await _client.get(ApiPaths.analyticsUsage);
    return UsageAnalyticsDto.fromJson(r.data as Map<String, dynamic>);
  }

  /// Identifies peak load hours and grid consumption spikes across stations.
  /// HTTP: GET /analytics/peak-hours
  Future<PeakHoursDto> getPeakHoursAnalytics() async {
    final r = await _client.get(ApiPaths.analyticsPeakHours);
    return PeakHoursDto.fromJson(r.data as Map<String, dynamic>);
  }

  /// Collects analytical charts and session counters for a targeted user.
  /// HTTP: GET /analytics/users/:userId
  Future<SystemAnalyticsDto> getUserAnalytics(String userId) async {
    final r = await _client.get(ApiPaths.analyticsUser(userId));
    return SystemAnalyticsDto.fromJson(r.data as Map<String, dynamic>);
  }

  /// Pulls key reliability indexes and usage metrics for a designated station.
  /// HTTP: GET /analytics/stations/:stationId/metrics
  Future<StationMetricsDto> getStationMetrics(String stationId) async {
    final r = await _client.get(ApiPaths.analyticsStation(stationId));
    return StationMetricsDto.fromJson(r.data as Map<String, dynamic>);
  }

  /// Aggregates platform-wide dashboard indicators for operations centers.
  /// HTTP: GET /analytics/dashboard
  Future<DashboardDto> getDashboardAnalytics() async {
    final r = await _client.get(ApiPaths.analyticsDashboard);
    return DashboardDto.fromJson(r.data as Map<String, dynamic>);
  }

  // Telemetry System Ingestion Services

  /// Accepts a structured payload containing a batch list of telemetry events.
  /// HTTP: POST /telemetry/ingest
  Future<TelemetryIngestDto> ingestTelemetryBatch(Map<String, dynamic> data) async {
    final r = await _client.post(ApiPaths.telemetryIngest, data: data);
    return TelemetryIngestDto.fromJson(r.data as Map<String, dynamic>);
  }

  /// Forwards focused session metrics and updates to the active session buffer.
  /// HTTP: POST /telemetry/ingest/:id/:session
  Future<TelemetryIngestDto> ingestTelemetrySession(String id, String session, Map<String, dynamic> data) async {
    final r = await _client.post(ApiPaths.telemetryIngestSession(id, session), data: data);
    return TelemetryIngestDto.fromJson(r.data as Map<String, dynamic>);
  }

  // OCPP Gateway Integration Services

  /// Checks the connectivity and operational health status of the OCPP proxy gateway.
  /// HTTP: GET /ocpp/health
  Future<OcppHealthDto> getOcppHealth() async {
    final r = await _client.get(ApiPaths.ocppHealth);
    return OcppHealthDto.fromJson(r.data as Map<String, dynamic>);
  }
}

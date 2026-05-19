import 'package:dio/dio.dart';

void main() async {
  final dio = Dio(BaseOptions(
    headers: {
      'ngrok-skip-browser-warning': 'true',
    },
  ));
  
  try {
    final response = await dio.get('https://impeditive-incredible-jordy.ngrok-free.dev/api/v1/stations/55555555-0000-0000-0000-000000000011');
    final data = response.data;
    
    print('Raw data type: ${data.runtimeType}');
    
    final mapData = data is Map<String, dynamic>
          ? (data['data'] ?? data) as Map<String, dynamic>
          : <String, dynamic>{};
          
    print('MapData keys: ${mapData.keys}');
    print('Chargers raw: ${mapData['chargers']}');
    
    final chargerList = (mapData['chargers'] as List<dynamic>? ?? [])
        .map((c) {
          final json = c as Map<String, dynamic>;
          final connectors = json['connectors'] as List<dynamic>? ?? [];
          final firstConnectorType = connectors.isNotEmpty
              ? connectors[0]['connectorType']?.toString() ?? 'Other'
              : 'Other';
          print('Parsed connector type: $firstConnectorType');
          return firstConnectorType;
        })
        .toList();
        
    print('Charger list parsed count: ${chargerList.length}');
  } catch (e, stack) {
    print('Error: $e');
    print(stack);
  }
}

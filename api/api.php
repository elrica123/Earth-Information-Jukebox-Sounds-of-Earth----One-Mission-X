<?php
/**
 * Script de conexión y consulta a la NASA POWER API (Prediction of Worldwide Energy Resources)
 * Ejemplo: Obtiene datos diarios de temperatura (T2M) e insolación (ALLSKY_SFC_SW_DWN)
 * Coordenadas de ejemplo: Cuernavaca, Morelos, México (Lat: 18.92, Lon: -99.23)
 */

header('Content-Type: application/json; charset=utf-8');

// Parámetros de ubicación y fechas (puedes hacerlos dinámicos vía GET o POST)
$latitude  = $_GET['lat'] ?? '18.9200';
$longitude = $_GET['lon'] ?? '-99.2300';
$start     = $_GET['start'] ?? '20240101';
$end       = $_GET['end'] ?? '20240107';

// Parámetros científicos requeridos de la NASA POWER
// T2M: Temperatura a 2 metros (°C)
// ALLSKY_SFC_SW_DWN: Radiación solar de onda corta en superficie (kW/m²/día)
$parameters = 'T2M,ALLSKY_SFC_SW_DWN';
$community  = 'RE'; // Renewable Energy (Energías Renovables)
$format     = 'JSON';

// Construcción de la URL oficial del Endpoint de la NASA POWER
$url = sprintf(
    "https://power.larc.nasa.gov/api/temporal/daily/point?parameters=%s&community=%s&longitude=%s&latitude=%s&start=%s&end=%s&format=%s",
    $parameters,
    $community,
    $longitude,
    $latitude,
    $start,
    $end,
    $format
);

// Inicializar cURL para consumir la API
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_USERAGENT, 'EarthJukebox-PHP-Client/1.0');
curl_setopt($ch, CURLOPT_TIMEOUT, 15);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

// Validar la respuesta de la petición
if ($httpCode === 200 && $response) {
    $data = json_decode($response, true);
    
    // Opcional: Puedes extraer y estructurar los valores específicos para tu Jukebox
    echo json_encode([
        'status' => 'success',
        'coordinates' => [$latitude, $longitude],
        'parameters_fetched' => explode(',', $parameters),
        'raw_nasa_response' => $data
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

} else {
    echo json_encode([
        'status' => 'error',
        'message' => 'No se pudo establecer comunicación con la NASA POWER API',
        'http_code' => $httpCode,
        'curl_error' => $curlError
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
}
?>
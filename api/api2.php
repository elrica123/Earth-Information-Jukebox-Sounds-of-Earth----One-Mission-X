<?php
header('Content-Type: application/json; charset=utf-8');

$source = $_GET['source'] ?? 'eonet';

if ($source === 'eonet') {
    // NASA EONET API (Eventos Naturales)
    $url = "https://eonet.gsfc.nasa.gov/api/v3/events?limit=5";
} else {
    // NASA POWER API (Ejemplo de punto: Cuernavaca / México)
    $url = "https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M,ALLSKY_SFC_SW_DWN&community=RE&longitude=-99.23&latitude=18.92&start=20240101&end=20240107&format=JSON";
}

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_USERAGENT, 'EarthJukebox-PHP-Client');
curl_setopt($ch, CURLOPT_TIMEOUT, 10);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($httpCode === 200 && $response) {
    echo $response;
} else {
    echo json_encode([
        'status' => 'error',
        'message' => 'No se pudo conectar con la API de la NASA',
        'code' => $httpCode
    ]);
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>The Earth Information Jukebox · NASA Space Apps Challenge</title>
    <meta name="description" content="Explore NASA EONET natural events through generative sound and satellite imagery from NASA GIBS.">
    <meta name="color-scheme" content="light dark">

    <!-- PWA -->
    <meta name="theme-color" content="#f3eefb">
    <meta name="application-name" content="Earth Jukebox">
    <meta name="msapplication-TileColor" content="#150f26">
    <link rel="manifest" href="manifest.webmanifest">
    <link rel="icon" type="image/png" sizes="32x32" href="assets/icons/favicon-32.png">
    <link rel="apple-touch-icon" href="assets/icons/apple-touch-icon.png">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-title" content="Earth Jukebox">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;600;800&display=swap" crossorigin="anonymous">
    <link rel="stylesheet" href="assets/css/style.css?v=20261115-6">
    <script src="assets/js/theme.js?v=20261115-2"></script>
</head>
<body>
<a class="skip-link" href="#player">Skip to player</a>
<a class="skip-link" href="#shelf-title">Skip to record shelf</a>
<div class="bg" id="bg" aria-hidden="true"></div>

<header class="topbar">
    <div class="wrap topbar-in">
        <a class="brand" href="index.php"><span aria-hidden="true">🌍</span> One Mission X<span class="sr-only"> – Home</span></a>
        <span class="tagline">NASA Space Apps Challenge · The Earth Information Jukebox</span>
        <div class="topbar-actions">
            <span id="net-status" class="badge-warn" role="status" hidden>Offline</span>
            <button type="button" id="btn-install" class="btn-ghost" hidden><span aria-hidden="true">⬇</span> <span class="btn-label">Install app</span></button>
            <button type="button" id="btn-theme" class="btn-ghost" aria-pressed="false"><span aria-hidden="true" id="theme-icon">🌙</span> <span id="theme-label" class="btn-label">Switch to dark mode</span></button>
        </div>
    </div>
</header>

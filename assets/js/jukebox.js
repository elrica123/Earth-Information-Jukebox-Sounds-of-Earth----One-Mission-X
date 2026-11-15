// Earth Jukebox · The Earth Information Jukebox
// NASA EONET events, NASA GIBS imagery, and Web Audio sonification. Keyboard and screen reader accessible.
let audioCtx = null;
let sonifier = null;
let currentTrack = null;
let currentIndex = -1;
let isPlaying = false;
let isStarting = false;
let eonetTracks = [];
const eonetLayerCache = new Map();
let imageRequestId = 0;
const $ = id => document.getElementById(id);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const GIBS_WMS_URL = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi';
const GIBS_BASE_LAYER = 'MODIS_Terra_CorrectedReflectance_TrueColor';
const GIBS_FALLBACK_LAYERS = {
    wildfires: 'VIIRS_NOAA20_Thermal_Anomalies_375m_All',
    severeStorms: 'IMERG_Precipitation_Rate',
    volcanoes: 'MODIS_Terra_CorrectedReflectance_TrueColor',
    seaLakeIce: 'VIIRS_NOAA20_Sea_Ice',
    default: 'MODIS_Terra_CorrectedReflectance_TrueColor'
};

// Color, emoji, and English names for EONET categories
const CATEGORIES = {
    wildfires:    { c: '#ff8a2a', e: '🔥', group: 'Wildfires',        single: 'Wildfire' },
    severeStorms: { c: '#1fb6d4', e: '🌀', group: 'Severe storms',    single: 'Storm' },
    seaLakeIce:   { c: '#5b9bff', e: '🧊', group: 'Sea and lake ice', single: 'Ice event' },
    volcanoes:    { c: '#ff6a5a', e: '🌋', group: 'Volcanoes',        single: 'Volcano' },
    dustHaze:     { c: '#d9a441', e: '🌫️', group: 'Dust and haze',    single: 'Dust or haze event' },
    floods:       { c: '#3d8bfd', e: '🌊', group: 'Floods',           single: 'Flood' },
    drought:      { c: '#c98a4b', e: '☀️', group: 'Drought',          single: 'Drought' },
    earthquakes:  { c: '#b07cff', e: '📳', group: 'Earthquakes',      single: 'Earthquake' },
    landslides:   { c: '#a9825a', e: '⛰️', group: 'Landslides',       single: 'Landslide' },
    snow:         { c: '#8fd3ff', e: '❄️', group: 'Snow',             single: 'Snow event' },
    tempExtremes: { c: '#ff7a8a', e: '🌡️', group: 'Temperature extremes', single: 'Temperature extreme' },
    waterColor:   { c: '#2ec4b6', e: '💧', group: 'Water color',      single: 'Water color event' },
    manmade:      { c: '#9aa5b1', e: '🏭', group: 'Human-caused events', single: 'Human-caused event' }
};
const DEFAULT_CATEGORY = { c: '#7a5cff', e: '🌍', group: 'Other events', single: 'Natural event' };

function categoryInfo(event) {
    const cat = event.categories?.[0];
    const key = cat?.id || cat?.title || 'other';
    return { key, title: cat?.title || 'Natural event', ...(CATEGORIES[cat?.id] || DEFAULT_CATEGORY) };
}

function announce(message) {
    const region = $('sr-live');
    if (!region) return;
    region.textContent = '';
    setTimeout(() => { region.textContent = message; }, 60);
}

loadEonetEvents();
$('btn-refresh')?.addEventListener('click', () => loadEonetEvents(true));
$('btn-play')?.addEventListener('click', () => { if (!isPlaying && !$('btn-play').matches('[aria-disabled="true"]')) playTrack(); });
$('btn-stop')?.addEventListener('click', () => { if (isPlaying) { stopTrack(); announce('Playback stopped.'); } });
$('btn-prev')?.addEventListener('click', () => stepTrack(-1));
$('btn-next')?.addEventListener('click', () => stepTrack(1));

function stepTrack(delta) {
    if (!eonetTracks.length) return;
    const next = (currentIndex + delta + eonetTracks.length) % eonetTracks.length;
    selectIndex(next);
}

async function loadEonetEvents(showRefresh = false) {
    const status = $('eonet-status');
    const shelf = $('shelf');
    if (status) status.textContent = 'Connecting to NASA EONET…';
    if (shelf) { shelf.setAttribute('aria-busy', 'true'); if (!eonetTracks.length) shelf.innerHTML = '<p class="muted">Loading records…</p>'; }
    if (showRefresh) announce('Refreshing NASA EONET events.');

    try {
        const response = await fetch('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=10');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const fromCache = response.headers.get('X-SW-Cache') === '1';
        const data = await response.json();
        const events = Array.isArray(data.events) ? data.events : [];
        const previousId = currentTrack?.id;
        eonetTracks = events;
        renderShelf();
        if (!events.length) {
            if (status) status.textContent = 'NASA EONET has no open events right now.';
            return;
        }
        const keep = events.findIndex(event => event.id === previousId);
        if (keep >= 0) { currentIndex = keep; currentTrack = events[keep]; markPressed(); }
        else selectIndex(0);
        const message = fromCache
            ? `Offline: showing ${events.length} events saved from the last NASA EONET update.`
            : `Loaded ${events.length} open events directly from NASA EONET.`;
        if (status) status.textContent = message;
    } catch (error) {
        console.error('Error fetching NASA EONET:', error);
        const message = navigator.onLine === false
            ? 'Offline, and no saved events are available yet. Connect once to use the jukebox offline.'
            : 'Could not load NASA EONET events. Check your internet connection or select ‘Refresh events.’';
        if (status) status.textContent = message;
        if (!eonetTracks.length) renderShelf();
    }
}

function eventDetails(event) {
    const points = Array.isArray(event.geometry) ? event.geometry : [];
    const latest = points.length ? points[points.length - 1] : null;
    const observations = getEventObservations(event);
    const latestObservation = observations.at(-1);
    const coords = latestObservation ? [latestObservation.longitude, latestObservation.latitude] : null;
    const rawMagnitude = latestObservation?.magnitude ?? latest?.magnitudeValue ?? event.magnitudeValue;
    const magnitude = rawMagnitude === null || rawMagnitude === undefined ? NaN : Number(rawMagnitude);
    let frequency = null;
    let mappedValue = 'NASA EONET did not report a magnitude for this event';
    let mappingDescription = '';

    if (Number.isFinite(magnitude)) {
        const normalized = Math.min(1, Math.log1p(Math.max(0, magnitude)) / Math.log1p(1000));
        frequency = Math.round(110 * Math.pow(2, 1.1 + normalized * 1.5));
        const unit = latest?.magnitudeUnit ?? event.magnitudeUnit;
        mappedValue = `${magnitude}${unit ? ` ${unit}` : ''}`;
        mappingDescription = 'Sonification combines event magnitude, location, and timeline.';
    } else if (coords && Number.isFinite(Number(coords[1]))) {
        const latitude = Math.max(-90, Math.min(90, Number(coords[1])));
        frequency = Math.round(110 * Math.pow(2, 1.1 + ((latitude + 90) / 180) * 1.5));
        mappedValue = `Latitude ${latitude.toFixed(2)}°, longitude ${Number(coords[0]).toFixed(2)}°`;
        mappingDescription = 'Sonification combines event location and timeline.';
    }
    return { latest, coords, frequency, mappedValue, mappingDescription };
}

function categoryId(event) {
    return event.categories?.[0]?.id || event.categories?.[0]?.title || '';
}

// Square region around the event (in degrees) to avoid distorting the image
function findCoordinatesBounds(geometry) {
    if (!geometry || !Array.isArray(geometry.coordinates)) return null;
    const coordinates = [];
    const visit = value => {
        if (!Array.isArray(value)) return;
        if (value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) {
            coordinates.push([Number(value[0]), Number(value[1])]);
            return;
        }
        value.forEach(visit);
    };
    visit(geometry.coordinates);
    if (!coordinates.length) return null;

    const lons = coordinates.map(point => point[0]);
    const lats = coordinates.map(point => point[1]);
    const west = Math.min(...lons), east = Math.max(...lons);
    const south = Math.min(...lats), north = Math.max(...lats);
    const span = Math.max(east - west, north - south);
    const side = Math.min(160, Math.max(5, span * 1.36));
    let cx = (west + east) / 2, cy = (south + north) / 2;
    cx = Math.max(-180 + side / 2, Math.min(180 - side / 2, cx));
    cy = Math.max(-89.5 + side / 2, Math.min(89.5 - side / 2, cy));
    return [cx - side / 2, cy - side / 2, cx + side / 2, cy + side / 2];
}

async function getEonetGibsLayer(event) {
    const category = categoryId(event);
    const fallback = GIBS_FALLBACK_LAYERS[category] || GIBS_FALLBACK_LAYERS.default;
    if (!category) return { name: fallback, title: fallback };
    if (!eonetLayerCache.has(category)) {
        const request = fetch(`https://eonet.gsfc.nasa.gov/api/v3/layers/${encodeURIComponent(category)}`)
            .then(response => response.ok ? response.json() : null)
            .catch(() => null);
        eonetLayerCache.set(category, request);
    }
    const data = await eonetLayerCache.get(category);
    const layers = data?.categories?.flatMap(item => item.layers || []) || [];
    const gibsLayers = layers.filter(layer => /gibs\.earthdata\.nasa\.gov/i.test(layer.serviceUrl || ''));
    const categoryPatterns = {
        wildfires: /thermal.?anomal|fire.?temp|wildfire/i,
        severeStorms: /precipitation|cloud|reflectance|true.?color/i,
        volcanoes: /so2|sulfur|aerosol|reflectance|true.?color/i,
        seaLakeIce: /sea.?ice|ice.?surface|reflectance|true.?color/i,
        dustHaze: /dust|aerosol|air.?mass/i
    };
    const desiredLayer = categoryPatterns[category] || /reflectance|true.?color/i;
    const preferred = gibsLayers.find(layer => desiredLayer.test(`${layer.name} ${layer.title || ''}`));
    return preferred ? { name: preferred.name, title: preferred.title || preferred.name } : { name: fallback, title: fallback };
}

// Square NASA GIBS image URL for the event area
async function gibsImage(event, size) {
    const geometry = event.geometry?.length ? event.geometry[event.geometry.length - 1] : null;
    const bbox = findCoordinatesBounds(geometry);
    if (!bbox) return null;
    const layer = await getEonetGibsLayer(event);
    // GIBS imagery can lag by about a day, so avoid requesting dates after yesterday.
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    let date = (geometry?.date || new Date().toISOString()).slice(0, 10);
    if (date > yesterday) date = yesterday;
    const mapLayers = layer.name === GIBS_BASE_LAYER ? GIBS_BASE_LAYER : `${GIBS_BASE_LAYER},${layer.name}`;
    const params = new URLSearchParams({
        SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetMap',
        LAYERS: mapLayers, STYLES: '', FORMAT: 'image/png', TRANSPARENT: 'TRUE',
        SRS: 'EPSG:4326', BBOX: bbox.map(n => n.toFixed(4)).join(','), WIDTH: String(size), HEIGHT: String(size),
        TIME: date
    });
    return { url: `${GIBS_WMS_URL}?${params.toString()}`, layerTitle: layer.title, date };
}

// ---------- Record shelf ----------
function renderShelf() {
    const shelf = $('shelf');
    if (!shelf) return;
    shelf.setAttribute('aria-busy', 'false');
    if (!eonetTracks.length) {
        const p = document.createElement('p');
        p.className = 'muted';
        p.textContent = 'No records are available. Select ‘Refresh events.’';
        shelf.replaceChildren(p);
        clearTrack();
        return;
    }
    const groups = new Map();
    eonetTracks.forEach((event, index) => {
        const info = categoryInfo(event);
        if (!groups.has(info.key)) groups.set(info.key, { info, items: [] });
        groups.get(info.key).items.push({ event, index });
    });

    const sections = [];
    groups.forEach((group, key) => {
        const section = document.createElement('section');
        section.className = 'row';
        section.style.setProperty('--c', group.info.c);
        const headingId = `grp-${String(key).replace(/[^a-z0-9]/gi, '')}`;
        section.setAttribute('aria-labelledby', headingId);
        const heading = document.createElement('h3');
        heading.id = headingId;
        heading.textContent = `${group.info.group} (${group.items.length})`;
        const list = document.createElement('ul');
        list.className = 'shelf';
        group.items.forEach(({ event, index }) => list.append(buildDisc(event, index, group.info)));
        section.append(heading, list);
        sections.push(section);
    });
    shelf.replaceChildren(...sections);
}

function buildDisc(event, index, info) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'disc';
    button.dataset.index = String(index);
    button.setAttribute('aria-pressed', String(index === currentIndex));
    button.style.setProperty('--c', info.c);

    const mini = document.createElement('span');
    mini.className = 'mini';
    const image = document.createElement('img');
    image.alt = '';
    image.decoding = 'async';
    image.className = 'thumb';
    const emoji = document.createElement('span');
    emoji.className = 'mini-emoji';
    emoji.setAttribute('aria-hidden', 'true');
    emoji.textContent = info.e;
    mini.append(image, emoji);

    const kind = document.createElement('span');
    kind.className = 'sr-only';
    kind.textContent = `${info.single}: `;
    const title = document.createElement('span');
    title.className = 'disc-title';
    title.lang = 'en';
    title.textContent = event.title || 'Natural event';
    button.append(mini, kind, title);

    button.addEventListener('click', () => {
        selectIndex(index);
        if (window.matchMedia('(max-width: 959.98px)').matches) {
            $('player')?.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
        }
    });

    gibsImage(event, 160).then(result => {
        if (!result) return;
        image.onload = () => { image.classList.add('loaded'); emoji.hidden = true; };
        image.src = result.url;
    }).catch(() => {});

    item.append(button);
    return item;
}

function selectedDiscIntoView(button) {
    if (!button) return;
    button.scrollIntoView({
        block: 'nearest',
        inline: 'center',
        behavior: reduceMotion.matches ? 'auto' : 'smooth'
    });
    if (!reduceMotion.matches && typeof button.animate === 'function') {
        button.animate([
            { transform: 'translateY(7px) scale(.96)', filter: 'saturate(.8)' },
            { transform: 'translateY(-5px) scale(1.035)', filter: 'saturate(1.2)', offset: 0.62 },
            { transform: 'translateY(0) scale(1)', filter: 'saturate(1)' }
        ], { duration: 460, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
}

function markPressed() {
    document.querySelectorAll('#shelf button.disc').forEach(button => {
        button.setAttribute('aria-pressed', String(Number(button.dataset.index) === currentIndex));
    });
}

// ---------- Record selection ----------
function selectIndex(index) {
    const event = eonetTracks[index];
    if (!event) return;
    if (isPlaying) stopTrack();
    currentIndex = index;
    currentTrack = event;
    markPressed();

    const info = categoryInfo(event);
    const detail = eventDetails(event);
    const observations = getEventObservations(event);
    const previewPlan = observations.length ? buildPlaybackPlan(event, observations) : null;
    const previewSound = previewPlan ? mapObservationToSound(previewPlan, observations, observations[0], 0) : null;
    const player = $('player');
    player.style.setProperty('--c', info.c);
    $('bg')?.style.setProperty('--tint', info.c);

    $('display-category').textContent = `${info.e} ${info.single}`;
    $('display-title').textContent = event.title || 'Natural event';
    $('display-desc').textContent = event.description || '';
    $('display-desc').hidden = !event.description;
    $('display-mapping').textContent = observations.length
        ? `Sonification follows ${observations.length} ${observations.length === 1 ? 'observation' : 'observations'} in chronological order. Latitude and magnitude shape pitch, longitude pans the sound from left to right, and magnitude controls note duration.`
        : 'This event has no location and cannot be sonified.';
    $('display-value').textContent = observations.length ? observationValueText(observations[0]) : detail.mappedValue;
    $('display-freq').textContent = previewSound ? `${Math.round(previewSound.frequency)} Hz` : 'No data';
    $('cr-title').textContent = (event.title || 'Natural event').split(',')[0];
    $('cr-sub').textContent = `${event.title?.includes(',') ? event.title.split(',').slice(1).join(',').trim() + ' · ' : ''}NASA EONET · GIBS`;

    renderDetails(event, info, observations);
    renderAudioDetails(event, observations, previewPlan, 0, previewSound);
    setCover(event, info);
    updateControls();

    const disc = $('shelf')?.querySelector(`button[data-index="${index}"]`);
    if (disc) selectedDiscIntoView(disc);
    announce(`Record selected: ${event.title || 'Natural event'}, ${info.single}.${detail.frequency ? ' Press Play to listen.' : ' This event cannot be played because EONET provides no location or magnitude.'}`);
}

function clearTrack() {
    if (isPlaying) stopTrack();
    currentTrack = null;
    currentIndex = -1;
    $('display-title').textContent = 'No event selected';
    $('display-category').textContent = 'EONET';
    $('display-desc').textContent = 'Select an active event when data is available.';
    $('display-desc').hidden = false;
    $('display-mapping').textContent = '';
    $('display-value').textContent = '—';
    $('display-freq').textContent = '—';
    $('event-details').replaceChildren();
    $('audio-details-intro').textContent = 'Select an event to see how its NASA data shapes the sound.';
    $('audio-details').innerHTML = '<div><dt>Sound profile</dt><dd>Waiting for event data</dd></div>';
    updateControls();
}

function updateControls() {
    const canPlay = !!currentTrack && !!eventDetails(currentTrack).frequency && getEventObservations(currentTrack).length > 0;
    $('btn-play').setAttribute('aria-disabled', String(isPlaying || !canPlay));
    $('btn-stop').setAttribute('aria-disabled', String(!isPlaying));
    $('btn-play').classList.toggle('is-playing', isPlaying);
    $('btn-play').innerHTML = isPlaying
        ? '<span aria-hidden="true">♪</span> Playing'
        : '<span aria-hidden="true">▶</span> Play';
    const many = eonetTracks.length > 1;
    $('btn-prev').setAttribute('aria-disabled', String(!many));
    $('btn-next').setAttribute('aria-disabled', String(!many));
}

// ---------- Imagen de portada (NASA GIBS) ----------
async function setCover(event, info) {
    const image = $('cover-img');
    const caption = $('cover-caption');
    const label = $('vinyl-label');
    const requestId = ++imageRequestId;
    image.hidden = true;
    image.removeAttribute('src');
    image.alt = '';
    label.style.backgroundImage = '';
    caption.textContent = 'Finding NASA GIBS imagery for this event…';

    try {
        const result = await gibsImage(event, 640);
        if (requestId !== imageRequestId) return;
        if (!result) {
            caption.textContent = 'EONET did not provide a location for satellite imagery.';
            return;
        }
        image.onload = () => {
            if (requestId !== imageRequestId) return;
            image.hidden = false;
            image.alt = `NASA GIBS satellite image of the area around ‘${event.title || 'Natural event'}’, dated ${result.date}.`;
            label.style.backgroundImage = `url("${result.url}")`;
            caption.textContent = `NASA GIBS · MODIS true color + ${result.layerTitle} · date ${result.date} · EONET event area`;
        };
        image.onerror = () => {
            if (requestId !== imageRequestId) return;
            image.hidden = true;
            caption.textContent = navigator.onLine === false
                ? 'Offline: NASA GIBS satellite imagery is unavailable.'
                : `NASA GIBS has no imagery available for this layer or date (${result.date}).`;
        };
        image.src = result.url;
    } catch (error) {
        if (requestId === imageRequestId) caption.textContent = 'Could not fetch NASA GIBS imagery.';
        console.error('Error loading NASA GIBS imagery:', error);
    }
}

// ---------- Text details for all users and screen readers ----------
function formatCoords(lat, lon) {
    const ns = lat >= 0 ? 'north' : 'south';
    const eo = lon >= 0 ? 'east' : 'west';
    return `${Math.abs(lat).toFixed(2)}° ${ns}, ${Math.abs(lon).toFixed(2)}° ${eo}`;
}

function renderDetails(event, info, observations) {
    const dl = $('event-details');
    const rows = [];
    const add = (term, value) => {
        const wrap = document.createElement('div');
        const dt = document.createElement('dt');
        dt.textContent = term;
        const dd = document.createElement('dd');
        if (value instanceof Node) dd.append(value); else dd.textContent = value;
        wrap.append(dt, dd);
        rows.push(wrap);
    };
    add('Category', `${info.single} (${info.title})`);
    const last = observations.at(-1);
    if (last?.date && !Number.isNaN(Date.parse(last.date))) {
        const time = document.createElement('time');
        time.dateTime = last.date;
        time.textContent = new Date(last.date).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC';
        add('Latest observation', time);
    } else {
        add('Latest observation', 'Date unavailable');
    }
    add('Location', last ? formatCoords(last.latitude, last.longitude) : 'Unavailable');
    add('Recorded observations', String(observations.length));
    const sources = (event.sources || []).filter(source => /^https?:\/\//i.test(source.url || ''));
    if (sources.length) {
        const list = document.createElement('ul');
        sources.forEach(source => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = source.url;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.textContent = `Source ${source.id || ''}`.trim();
            const hint = document.createElement('span');
            hint.className = 'sr-only';
            hint.textContent = '  (opens in a new tab)';
            a.append(hint);
            li.append(a);
            list.append(li);
        });
        add('Official sources', list);
    }
    dl.replaceChildren(...rows);
}

// ---------- Playback ----------
async function playTrack() {
    if (!currentTrack || isPlaying || isStarting) return;
    isStarting = true;
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') await audioCtx.resume();
    } catch (error) {
        isStarting = false;
        announce('Your browser could not start audio. Please try again.');
        return;
    }
    isStarting = false;
    if (isPlaying) return;

    const observations = getEventObservations(currentTrack);
    if (!observations.length) return;
    const plan = buildPlaybackPlan(currentTrack, observations);

    const master = audioCtx.createGain();
    master.gain.value = 0.78;
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    const compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.01;
    compressor.release.value = 0.22;
    const delay = audioCtx.createDelay(1.2);
    delay.delayTime.value = plan.delay;
    const echoGain = audioCtx.createGain();
    echoGain.gain.value = 0.13;
    master.connect(compressor);
    compressor.connect(analyser);
    analyser.connect(audioCtx.destination);
    compressor.connect(delay);
    delay.connect(echoGain);
    echoGain.connect(analyser);

    sonifier = {
        ...plan, master, analyser, observations,
        step: 0, timer: null, activeVoices: new Set(),
        graphNodes: [master, compressor, analyser, delay, echoGain]
    };
    isPlaying = true;
    $('player').classList.add('playing');
    updateControls();
    $('audio-visualizer').setAttribute('aria-label', 'Audio waveform visualizer: playing');
    drawVisualizer();
    sonificationStep();
    announce(`Playing the sonification for ${currentTrack.title || 'this event'}.`);
}

function stopTrack() {
    if (sonifier) {
        clearTimeout(sonifier.timer);
        const now = audioCtx.currentTime;
        sonifier.activeVoices.forEach(voice => {
            voice.gains.forEach(gain => {
                try {
                    gain.gain.cancelScheduledValues(now);
                    gain.gain.setTargetAtTime(0.0001, now, 0.025);
                } catch (_) {}
            });
            voice.sources.forEach(source => { try { source.stop(now + 0.09); } catch (_) {} });
        });
        sonifier.graphNodes.forEach(node => { try { node.disconnect(); } catch (_) {} });
        sonifier = null;
    }
    isPlaying = false;
    $('player')?.classList.remove('playing');
    $('vinyl')?.style.setProperty('--glow', '0px');
    $('audio-visualizer')?.setAttribute('aria-label', 'Audio waveform visualizer: silent');
    if (currentTrack) {
        const observations = getEventObservations(currentTrack);
        const plan = observations.length ? buildPlaybackPlan(currentTrack, observations) : null;
        const preview = plan ? mapObservationToSound(plan, observations, observations[0], 0) : null;
        $('display-value').textContent = observations.length ? observationValueText(observations[0]) : eventDetails(currentTrack).mappedValue;
        $('display-freq').textContent = preview ? `${Math.round(preview.frequency)} Hz` : 'No data';
        renderAudioDetails(currentTrack, observations, plan, 0, preview);
    }
    updateControls();
    drawIdle();
}

function fetchLiveNasaData() { return loadEonetEvents(true); }

function hashString(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function getEventObservations(event) {
    const geometries = Array.isArray(event.geometry) ? event.geometry : [];
    const observations = geometries.map(geometry => {
        let coordinates = [];
        const visit = value => {
            if (!Array.isArray(value)) return;
            if (value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) {
                coordinates.push([Number(value[0]), Number(value[1])]);
                return;
            }
            value.forEach(visit);
        };
        visit(geometry.coordinates);
        if (!coordinates.length) return null;
        const longitude = coordinates.reduce((sum, point) => sum + point[0], 0) / coordinates.length;
        const latitude = coordinates.reduce((sum, point) => sum + point[1], 0) / coordinates.length;
        const rawMagnitude = geometry.magnitudeValue ?? event.magnitudeValue;
        const magnitude = rawMagnitude === null || rawMagnitude === undefined ? null : Number(rawMagnitude);
        return {
            date: geometry.date || '', longitude, latitude,
            magnitude: Number.isFinite(magnitude) ? Math.max(0, magnitude) : null,
            magnitudeUnit: geometry.magnitudeUnit || event.magnitudeUnit || ''
        };
    }).filter(Boolean);
    observations.sort((a, b) => Date.parse(a.date || 0) - Date.parse(b.date || 0));
    return observations;
}

function buildPlaybackPlan(event, observations) {
    const category = categoryId(event) || event.categories?.[0]?.title || 'event';
    const seed = hashString(`${category}:${event.id || event.title || ''}`);
    const scales = [
        [0, 2, 4, 7, 9],
        [0, 3, 5, 7, 10],
        [0, 2, 3, 7, 9, 10]
    ];
    const gaps = observations.slice(1).map((item, index) => Math.max(0,
        (Date.parse(item.date) - Date.parse(observations[index].date)) / 3600000
    )).filter(Number.isFinite);
    const sortedGaps = gaps.sort((a, b) => a - b);
    const medianGap = sortedGaps.length ? sortedGaps[Math.floor(sortedGaps.length / 2)] : 24;
    const densityFactor = 1 - Math.min(0.3, Math.log1p(observations.length - 1) * 0.06);
    const interval = Math.max(0.32, Math.min(1.25,
        (0.34 + Math.log1p(medianGap) / Math.log1p(720) * 0.78) * densityFactor
    ));
    return {
        seed,
        scale: scales[seed % scales.length],
        scaleName: ['bright pentatonic', 'minor pentatonic', 'blues-tinged pentatonic'][seed % scales.length],
        waveform: ['sine', 'triangle', 'sawtooth'][Math.floor(seed / 7) % 3],
        interval,
        medianGap,
        hasMeasuredGaps: sortedGaps.length > 0,
        delay: 0.19 + (seed % 5) * 0.035
    };
}

function mapObservationToSound(plan, observations, observation, step) {
    const magnitudes = observations.map(item => item.magnitude).filter(value => value !== null);
    const maxMagnitude = Math.max(1, ...magnitudes);
    const intensity = observation.magnitude === null
        ? 0.25 + Math.abs(observation.latitude) / 180 * 0.45
        : Math.min(1, Math.log1p(observation.magnitude) / Math.log1p(Math.max(1000, maxMagnitude)));
    const variation = seededUnit(plan.seed, step);
    const latitudePitch = (observation.latitude + 90) / 180;
    const scaleIndex = Math.floor((intensity * 4 + latitudePitch * 2 + variation * 2) % plan.scale.length);
    const octave = 2 + Math.floor(intensity * 2) + (step % 2);
    const midi = 36 + (plan.seed % 12) + octave * 12 + plan.scale[scaleIndex];
    const frequency = Math.max(55, Math.min(1760, 440 * Math.pow(2, (midi - 69) / 12)));
    const duration = 0.2 + intensity * 0.52;
    const pan = Math.max(-1, Math.min(1, observation.longitude / 180));
    const overtoneRatio = 1.48 + (plan.seed % 5) * 0.12;
    return {
        intensity, variation, latitudePitch, scaleIndex, octave, midi, frequency, duration, pan,
        peak: 0.045 + intensity * 0.055,
        overtoneRatio,
        overtoneType: variation > 0.62 ? 'triangle' : 'sine',
        filterType: variation > 0.5 ? 'bandpass' : 'lowpass',
        filterFrequency: 450 + intensity * 5400,
        filterQ: 0.7 + variation * 5,
        detune: (variation - 0.5) * 22,
        noisePeak: 0.008 + intensity * 0.045
    };
}

function midiNoteName(midi) {
    const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
    return `${names[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

function renderAudioDetails(event, observations, activePlan = null, activeStep = 0, activeSound = null, isActive = false) {
    const intro = $('audio-details-intro');
    const list = $('audio-details');
    if (!intro || !list) return;
    const rows = [];
    const add = (term, value, explanation) => rows.push({ term, value, explanation });

    if (!observations.length) {
        intro.textContent = 'This event has no usable geolocated observations, so the player cannot create data-driven notes for it.';
        add('Input data', 'No coordinates available', 'EONET geometries must include valid longitude and latitude values. The player skips observations without coordinates.');
        add('Sound generation', 'Unavailable for this event', 'Magnitude, date, or category alone cannot place a note in this sonification. The event can be refreshed when EONET provides geolocated observations.');
        add('Waveform display', 'Live audio signal', 'When a playable record is selected, this display shows the generated audio signal over time.');
        list.replaceChildren(...rows.map(createAudioDetailRow));
        return;
    }

    const plan = activePlan || buildPlaybackPlan(event, observations);
    const observationIndex = Math.max(0, Math.min(observations.length - 1, activeStep));
    const observation = observations[observationIndex];
    const sound = activeSound || mapObservationToSound(plan, observations, observation, observationIndex);
    const magnitudeCount = observations.filter(item => item.magnitude !== null).length;
    const units = [...new Set(observations.map(item => item.magnitudeUnit).filter(Boolean))];
    const currentDate = observation.date && !Number.isNaN(Date.parse(observation.date))
        ? new Date(observation.date).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC'
        : 'date unavailable';
    const panPosition = sound.pan < -0.08 ? 'left' : sound.pan > 0.08 ? 'right' : 'center';
    const variationLabel = sound.variation > 0.62 ? 'triangle overtone' : 'sine overtone';
    const magnitudesText = magnitudeCount
        ? `${magnitudeCount} of ${observations.length} observations include magnitude${units.length ? ` (${units.join(', ')})` : ''}`
        : 'No magnitudes reported; latitude sets a moderate fallback intensity.';

    intro.textContent = isActive
        ? `Now sounding observation ${observationIndex + 1} of ${observations.length} for ${event.title || 'this event'}. The values below update with each note.`
        : `A live explanation of how ${event.title || 'this event'} is converted into sound. Press Play to follow each observation.`;
    add('Event data', `${observations.length} geolocated observation${observations.length === 1 ? '' : 's'} · ${magnitudesText}`, 'Coordinates are averaged from the geometry points in each EONET observation. Valid observations are sorted by their UTC timestamp before playback.');
    add('Current observation', `${currentDate} · ${observation.latitude.toFixed(2)}° latitude · ${observation.longitude.toFixed(2)}° longitude`, 'This is the observation currently mapped, or the first observation preview when playback is stopped.');
    add('Pitch and note', `${midiNoteName(sound.midi)} · ${Math.round(sound.frequency)} Hz · ${plan.scaleName}`, `Latitude, event intensity, and a repeatable variation choose a note from this event’s ${plan.scaleName} scale. The event ID and category choose its root and octave range. The pitch is recalculated for every observation.`);
    add('Timbre', `${plan.waveform} fundamental + ${variationLabel}`, `The event’s category and ID select a ${plan.waveform} oscillator. A second oscillator adds a ${sound.overtoneType} overtone at ${(sound.overtoneRatio * sound.frequency).toFixed(0)} Hz, giving records a consistent signature while notes vary with the data.`);
    add('Dynamics', `${Math.round(sound.duration * 1000)} ms · ${Math.round(sound.intensity * 100)}% mapped intensity`, `Magnitude sets intensity on a logarithmic scale; when magnitude is missing, absolute latitude provides a fallback. Intensity controls the tone level (about ${Math.round(sound.peak * 100)}% gain), filtered-noise level (about ${Math.round(sound.noisePeak * 100)}%), and duration. Each note has a 25 ms attack and fades out.`);
    add('Stereo position', `${panPosition} · pan ${sound.pan.toFixed(2)}`, `Longitude maps linearly across the stereo field: −180° is left, 0° is center, and +180° is right. This observation is at ${observation.longitude.toFixed(2)}° longitude.`);
    add('Texture', `${sound.filterType} noise · ${Math.round(sound.filterFrequency)} Hz cutoff`, `A quiet filtered-noise layer adds texture. A repeatable per-note variation changes its filter type, cutoff, resonance (Q ${sound.filterQ.toFixed(1)}), and slight pitch detune (${sound.detune.toFixed(1)} cents).`);
    add('Mix and effects', `78% master level · 3:1 compression · ${Math.round(plan.delay * 1000)} ms echo`, 'A compressor at −18 dB helps keep the mix even. A short echo with 13% return adds space; its delay is selected from the event signature.');
    add('Rhythm', `About ${plan.interval.toFixed(2)} seconds base pace · ${observations.length} note${observations.length === 1 ? '' : 's'} per cycle`, plan.hasMeasuredGaps
        ? `Observations are played in chronological order. Their median timestamp gap (${plan.medianGap.toFixed(1)} hours) sets the base pace; a small repeatable swing varies each interval, and the observation count gently compresses dense sequences.`
        : 'Observations are played in chronological order. With no valid gap between timestamps to measure, the player uses a 24-hour default to set its base pace. A small repeatable swing varies each interval.');
    add('Waveform display', 'Live output signal', 'The oscilloscope shows the generated sound from the Web Audio analyser, not a plot of the NASA measurements. Its shape changes as the notes and timbres change.');
    list.replaceChildren(...rows.map(createAudioDetailRow));
}

function createAudioDetailRow({ term, value, explanation }) {
    const item = document.createElement('div');
    const heading = document.createElement('dt');
    heading.textContent = term;
    const detail = document.createElement('dd');
    const strong = document.createElement('strong');
    strong.textContent = value;
    const note = document.createElement('span');
    note.textContent = explanation;
    detail.append(strong, note);
    item.append(heading, detail);
    return item;
}

function sonificationStep() {
    if (!isPlaying || !sonifier || !audioCtx) return;
    const profile = sonifier;
    const observation = profile.observations[profile.step % profile.observations.length];
    const sound = mapObservationToSound(profile, profile.observations, observation, profile.step);
    playDataVoice(profile, sound);
    renderAudioDetails(currentTrack, profile.observations, profile, profile.step, sound, true);

    document.getElementById('display-value').textContent = observationValueText(observation);
    document.getElementById('display-freq').textContent = `${Math.round(sound.frequency)} Hz`;
    profile.step++;
    profile.timer = setTimeout(sonificationStep, profile.interval * (0.82 + sound.variation * 0.36) * 1000);
}

function seededUnit(seed, step) {
    let value = (seed + Math.imul(step + 1, 0x9e3779b1)) >>> 0;
    value ^= value >>> 16;
    value = Math.imul(value, 0x7feb352d);
    value ^= value >>> 15;
    return (value >>> 0) / 4294967295;
}

function observationValueText(observation) {
    return observation.magnitude === null
        ? `Lat ${observation.latitude.toFixed(2)}°, Lon ${observation.longitude.toFixed(2)}°`
        : `${observation.magnitude}${observation.magnitudeUnit ? ` ${observation.magnitudeUnit}` : ''}`;
}

function playDataVoice(profile, sound) {
    const context = audioCtx;
    const now = context.currentTime;
    const end = now + sound.duration;
    const panNode = context.createStereoPanner();
    panNode.pan.setValueAtTime(sound.pan, now);
    panNode.connect(profile.master);

    const toneEnvelope = context.createGain();
    const peak = sound.peak;
    toneEnvelope.gain.setValueAtTime(0.0001, now);
    toneEnvelope.gain.exponentialRampToValueAtTime(peak, now + 0.025);
    toneEnvelope.gain.exponentialRampToValueAtTime(0.0001, end);
    toneEnvelope.connect(panNode);

    const fundamental = context.createOscillator();
    fundamental.type = profile.waveform;
    fundamental.frequency.setValueAtTime(sound.frequency, now);
    fundamental.detune.setValueAtTime(sound.detune, now);
    fundamental.connect(toneEnvelope);

    const overtone = context.createOscillator();
    overtone.type = sound.overtoneType;
    overtone.frequency.setValueAtTime(sound.frequency * sound.overtoneRatio, now);
    const overtoneGain = context.createGain();
    overtoneGain.gain.setValueAtTime(0.26, now);
    overtone.connect(overtoneGain);
    overtoneGain.connect(toneEnvelope);

    const noiseBuffer = getNoiseBuffer(context);
    const noise = context.createBufferSource();
    noise.buffer = noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = sound.filterType;
    filter.frequency.setValueAtTime(sound.filterFrequency, now);
    filter.Q.value = sound.filterQ;
    const noiseEnvelope = context.createGain();
    noiseEnvelope.gain.setValueAtTime(0.0001, now);
    noiseEnvelope.gain.exponentialRampToValueAtTime(sound.noisePeak, now + 0.018);
    noiseEnvelope.gain.exponentialRampToValueAtTime(0.0001, now + sound.duration * 0.92);
    noise.connect(filter);
    filter.connect(noiseEnvelope);
    noiseEnvelope.connect(panNode);

    const voice = { sources: [fundamental, overtone, noise], gains: [toneEnvelope, noiseEnvelope], nodes: [panNode, overtoneGain, filter] };
    profile.activeVoices.add(voice);
    fundamental.onended = () => {
        voice.sources.forEach(source => { try { source.disconnect(); } catch (_) {} });
        voice.gains.forEach(gain => { try { gain.disconnect(); } catch (_) {} });
        voice.nodes.forEach(node => { try { node.disconnect(); } catch (_) {} });
        profile.activeVoices.delete(voice);
    };
    fundamental.start(now);
    overtone.start(now);
    noise.start(now);
    fundamental.stop(end + 0.02);
    overtone.stop(end + 0.02);
    noise.stop(end + 0.02);
}

function getNoiseBuffer(context) {
    if (getNoiseBuffer.cachedContext === context && getNoiseBuffer.cachedBuffer) return getNoiseBuffer.cachedBuffer;
    const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index++) data[index] = Math.random() * 2 - 1;
    getNoiseBuffer.cachedContext = context;
    getNoiseBuffer.cachedBuffer = buffer;
    return buffer;
}

// ---------- Visualizador ----------
function resizeVisualizer() {
    const canvas = $('audio-visualizer');
    if (!canvas) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
}

function waveColor() {
    return getComputedStyle($('player')).getPropertyValue('--c').trim() || '#25d8f2';
}

function drawIdle() {
    const canvas = $('audio-visualizer');
    if (!canvas) return;
    resizeVisualizer();
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2;
    ctx.strokeStyle = waveColor();
    ctx.globalAlpha = .45;
    ctx.beginPath();
    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
}

function drawVisualizer() {
    const canvas = $('audio-visualizer');
    const analyser = sonifier?.analyser;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext('2d');
    const vinyl = $('vinyl');
    const samples = new Uint8Array(analyser.fftSize);
    const color = waveColor();
    function frame() {
        if (sonifier?.analyser !== analyser) return; // Playback stopped or another record started.
        requestAnimationFrame(frame);
        resizeVisualizer();
        analyser.getByteTimeDomainData(samples);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.lineWidth = Math.max(2, canvas.height / 36);
        ctx.strokeStyle = color;
        ctx.beginPath();
        const slice = canvas.width / samples.length;
        let peak = 0;
        for (let index = 0; index < samples.length; index++) {
            const x = index * slice;
            const y = (samples[index] / 255) * canvas.height;
            peak = Math.max(peak, Math.abs(samples[index] - 128));
            if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        if (!reduceMotion.matches) vinyl.style.setProperty('--glow', `${Math.round(peak / 128 * 40)}px`);
    }
    frame();
}

window.addEventListener('resize', () => { if (!isPlaying) drawIdle(); });
window.addEventListener('orientationchange', () => { if (!isPlaying) drawIdle(); });
if (typeof ResizeObserver !== 'undefined' && $('audio-visualizer')) {
    new ResizeObserver(() => { if (!isPlaying) drawIdle(); }).observe($('audio-visualizer'));
}
drawIdle();

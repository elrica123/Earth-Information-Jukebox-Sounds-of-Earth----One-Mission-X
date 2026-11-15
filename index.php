<?php require_once 'includes/header.php'; ?>

<main id="main" class="wrap main">
    <div class="intro">
        <h1>The Earth Information Jukebox</h1>
        <p class="sub">Listen to our changing planet. Every NASA natural event becomes a record.</p>
        <p id="eonet-status" class="status" role="status">Connecting to NASA EONET…</p>
    </div>

    <!-- Screen reader announcements for selection and playback -->
    <div id="sr-live" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></div>

    <div class="layout">
        <!-- Record shelf: left on wide screens -->
        <aside class="shelf-col" aria-labelledby="shelf-title">
            <h2 id="shelf-title" tabindex="-1">Your shelf</h2>
            <p class="hint" id="shelf-hint">Up to 10 active NASA EONET events. Select a record to view it, then press Play to hear it.</p>
            <div id="shelf" aria-busy="true" aria-describedby="shelf-hint">
                <p class="muted">Loading records…</p>
            </div>
        </aside>

        <!-- Player -->
        <section class="stage" id="player" aria-labelledby="player-title" tabindex="-1">
            <h2 id="player-title" class="sr-only">Player</h2>
            <div class="stage-grid">
                <figure class="scene-wrap">
                    <div class="scene" id="scene">
                        <div class="vwrap" aria-hidden="true">
                            <div class="vinyl" id="vinyl"><span class="label" id="vinyl-label"></span></div>
                        </div>
                        <div class="cover" id="cover">
                            <div class="art" id="art" aria-hidden="true"></div>
                            <img id="cover-img" alt="" hidden decoding="async">
                            <div class="cr" aria-hidden="true"><b id="cr-title">Earth Information</b><span id="cr-sub">NASA EONET · GIBS</span></div>
                        </div>
                    </div>
                    <figcaption id="cover-caption" class="caption">A satellite image will appear when you select a record.</figcaption>
                </figure>

                <div class="info">
                    <span class="kind" id="display-category">EONET</span>
                    <h3 class="name" id="display-title" lang="en">Select a record</h3>
                    <p id="display-desc" class="desc" lang="en">Event details and its sound will appear here.</p>
                    <p id="display-mapping" class="desc"></p>

                    <dl class="nums">
                        <div><dt>Mapped value</dt><dd id="display-value">—</dd></div>
                        <div><dt>Synth frequency</dt><dd id="display-freq">—</dd></div>
                    </dl>

                    <canvas id="audio-visualizer" width="520" height="100" role="img" aria-label="Audio waveform visualizer: silent"></canvas>

                    <div class="btns" role="group" aria-label="Playback controls">
                        <button type="button" class="go" id="btn-play" aria-disabled="true"><span aria-hidden="true">▶</span> Play</button>
                        <button type="button" class="stop" id="btn-stop" aria-disabled="true"><span aria-hidden="true">■</span> Stop</button>
                        <button type="button" class="alt" id="btn-prev"><span aria-hidden="true">◀</span> Previous record</button>
                        <button type="button" class="alt" id="btn-next">Next record <span aria-hidden="true">▶</span></button>
                    </div>
                    <button type="button" class="btn-ghost refresh" id="btn-refresh"><span aria-hidden="true">🔄</span> Refresh events</button>
                </div>

                <section class="details" aria-labelledby="details-title">
                    <h3 id="details-title">Event details</h3>
                    <dl id="event-details" class="detail-grid"><div><dt>Status</dt><dd>No record selected</dd></div></dl>
                </section>

                <section class="audio-details" aria-labelledby="audio-details-title">
                    <div class="audio-details-heading">
                        <div>
                            <h3 id="audio-details-title">Audio details</h3>
                            <p id="audio-details-intro" class="audio-details-intro">Select an event to see how its NASA data shapes the sound.</p>
                        </div>
                        <span class="audio-details-badge" aria-hidden="true">♪</span>
                    </div>
                    <dl id="audio-details" class="audio-detail-grid">
                        <div><dt>Sound profile</dt><dd>Waiting for event data</dd></div>
                    </dl>
                </section>
            </div>
        </section>
    </div>

    <p class="note">Live data from NASA EONET. Sound responds to event magnitude, location, and observation timeline. Satellite imagery is provided by NASA GIBS.</p>
</main>

<?php require_once 'includes/footer.php'; ?>

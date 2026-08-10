export default function (view, params) {
    let statusTimer = null;
    let statusRequestInFlight = null;

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function describeError(error) {
        if (!error) return 'unknown error';
        if (typeof error === 'string') return error;
        if (error.message) return error.message;
        if (typeof error.status === 'number') {
            return `HTTP ${error.status}${error.statusText ? ' ' + error.statusText : ''}`;
        }
        return 'unknown error';
    }

    function formatNumber(value) {
        return value == null ? '—' : Number(value).toLocaleString();
    }

    function formatBytes(value) {
        if (value == null) return '—';
        const units = ['B', 'KiB', 'MiB', 'GiB'];
        let number = Number(value);
        let unit = 0;
        while (number >= 1024 && unit < units.length - 1) { number /= 1024; unit++; }
        return `${number.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
    }

    function formatPercent(value) {
        return value == null ? '—' : `${Number(value).toFixed(1)}%`;
    }

    function formatAge(ms) {
        if (ms == null || ms < 0) return '—';
        if (ms < 1000) return `${ms} ms`;
        return `${(ms / 1000).toFixed(1)} s`;
    }

    function metric(label, value, help) {
        const title = help ? ` title="${escapeHtml(help)}" aria-label="${escapeHtml(`${label}: ${value}. ${help}`)}"` : '';
        return `<div class="tvhMetric"${title}><span class="tvhMetricLabel">${escapeHtml(label)}</span><span class="tvhMetricValue">${escapeHtml(value)}</span></div>`;
    }

    function signalMetric(label, percent, absolute, unit, help) {
        const numericPercent = percent == null ? null : Math.max(0, Math.min(100, Number(percent)));
        const meter = numericPercent == null ? '' : `<div class="tvhMeter" role="progressbar" aria-label="${escapeHtml(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${numericPercent.toFixed(1)}"><span class="tvhMeterFill" style="width:${numericPercent.toFixed(1)}%"></span></div>`;
        const absoluteValue = absolute == null ? '' : ` (${Number(absolute).toFixed(1)} ${unit})`;
        const value = formatPercent(percent) + absoluteValue;
        const title = help ? ` title="${escapeHtml(help)}" aria-label="${escapeHtml(`${label}: ${value}. ${help}`)}"` : '';
        return `<div class="tvhMetric"${title}><span class="tvhMetricLabel">${escapeHtml(label)}</span><span class="tvhMetricValue">${escapeHtml(value)}</span>${meter}</div>`;
    }

    function sumStreamField(channel, field) {
        return (channel.Streams || []).reduce((total, stream) => total + Number(stream[field] || 0), 0);
    }

    function dropSummary(channel) {
        const queueI = Number(channel.QueueIDrops || 0);
        const queueP = Number(channel.QueuePDrops || 0);
        const queueB = Number(channel.QueueBDrops || 0);
        const queue = queueI + queueP + queueB;
        const mux = sumStreamField(channel, 'TimestampAnomalyDrops');
        const video = Number(channel.DamagedVideoDrops || 0);

        return {
            value: `${formatNumber(queue + mux + video)} total · queue ${formatNumber(queueI)}/${formatNumber(queueP)}/${formatNumber(queueB)} · mux ${formatNumber(mux)} · video ${formatNumber(video)}`,
            help: 'Dropped packets or frames. Queue is TVHeadend I/P/B frame drops, mux is plugin timestamp-safety drops, video is damaged inter-frame video withheld until a clean keyframe.'
        };
    }

    function videoDamageSummary(channel) {
        const age = channel.VideoDamageAgeMs == null ? '' : ` · ${formatAge(channel.VideoDamageAgeMs)}`;
        const reason = channel.LastVideoDamageReason ? ` · ${channel.LastVideoDamageReason}` : '';

        return {
            value: `${formatNumber(channel.VideoDamageEvents)} events · ${formatNumber(channel.DamagedVideoDrops)} drops${age}${reason}`,
            help: 'Times the plugin detected unsafe video and withheld frames until a clean random-access frame arrived.'
        };
    }

    function reconnectSummary(channel) {
        return {
            value: `${formatNumber(channel.ReconnectAttempts || 0)} normal · ${formatNumber(channel.SignalRecoveryAttempts || 0)} signal`,
            help: 'Normal reconnects plus reconnects triggered by tuner signal recovery.'
        };
    }

    function setRefreshState(page, busy) {
        const button = page.querySelector('#btnRefreshStatus');
        const label = button ? button.querySelector('span') : null;
        const tuners = page.querySelector('#activeTuners');
        if (button) {
            button.disabled = busy;
            button.setAttribute('aria-busy', busy ? 'true' : 'false');
        }
        if (label) label.textContent = busy ? 'Refreshing…' : 'Refresh';
        if (tuners) tuners.setAttribute('aria-busy', busy ? 'true' : 'false');
    }

    function installControlTooltips(page) {
        const refreshButton = page.querySelector('#btnRefreshStatus');
        if (refreshButton) {
            refreshButton.title = 'Refresh live plugin and tuner status now. Status also refreshes automatically every five seconds.';
            refreshButton.setAttribute('aria-label', 'Refresh live plugin and tuner status');
        }

        const rebuildButton = page.querySelector('#btnRebuildChannels');
        if (rebuildButton) {
            rebuildButton.setAttribute('aria-label', 'Rebuild the channel list from TVHeadend');
        }

        const clearImageCacheButton = page.querySelector('#btnClearChannelImageCache');
        if (clearImageCacheButton) {
            clearImageCacheButton.setAttribute('aria-label', 'Clear and re-download all cached channel logos');
        }
    }

    function renderStatus(page, status) {
        const runningChannels = Array.isArray(status.RunningChannels) ? status.RunningChannels : Array.isArray(status.Producers) ? status.Producers : [];
        const serverStatus = status.Connected
            ? `${status.Server || 'not configured'} · Connected · ${status.ServerVersion || 'unknown version'} · HTSP ${status.HtspProtocolVersion == null ? 'unknown' : status.HtspProtocolVersion}`
            : `${status.Server || 'not configured'} · Disconnected`;
        page.querySelector('#statusUpdated').textContent = `Updated ${new Date(status.GeneratedUtc).toLocaleTimeString()}`;
        page.querySelector('#statusSummary').innerHTML =
            metric('Plugin version', status.PluginVersion || 'unknown') +
            metric('TVHeadend server', serverStatus) +
            metric('Streaming method', status.StreamingMethod || 'legacy/default') +
            metric('Running Channels', String(status.RunningChannelCount ?? status.ActiveProducerCount ?? 0));

        const container = page.querySelector('#activeTuners');
        const expandedSubscriptions = new Set(Array.from(container.querySelectorAll('details[open][data-subscription-id]'), details => details.dataset.subscriptionId));
        if (!runningChannels.length) {
            container.innerHTML = '<div class="tvhEmpty">No active HTSP tuner subscriptions. Start a live channel to populate runtime signal and stream statistics.</div>';
            container.setAttribute('aria-busy', 'false');
            return;
        }

        container.setAttribute('aria-busy', 'false');
        container.innerHTML = runningChannels.map(channel => {
            const drops = dropSummary(channel);
            const videoDamage = videoDamageSummary(channel);
            const reconnects = reconnectSummary(channel);
            const lockClass = channel.HasLock ? 'tvhBadgeGood' : 'tvhBadgeBad';
            const stateClass = channel.State === 'streaming' ? 'tvhBadgeGood' : channel.State === 'recovering' ? 'tvhBadgeWarn' : '';
            const streamRows = (channel.Streams || []).map(stream => `<tr>
                <td>${stream.Index}</td><td>0x${Number(stream.Pid || 0).toString(16).toUpperCase()}</td>
                <td>${escapeHtml(stream.Codec || 'unknown')}</td><td>${escapeHtml(stream.Language || '—')}</td>
                <td>${escapeHtml(stream.Title || '—')}</td><td>${formatNumber(stream.Packets)}</td>
                <td>${formatBytes(stream.Bytes)}</td><td>${formatNumber(stream.RandomAccessFrames)}</td>
                <td title="Resets are detected timeline jumps. Drops are mux packets rejected because their timestamps were unsafe. AUD is the number of H.264/H.265 access unit delimiters inserted.">resets ${formatNumber(stream.TimestampDiscontinuities)} · drops ${formatNumber(stream.TimestampAnomalyDrops)} · AUD ${formatNumber(stream.AudInsertions)}</td>
            </tr>`).join('');

            return `<section class="tvhRunningChannel">
                <div class="tvhRunningChannelTitle"><h3>${escapeHtml(channel.Service || `Channel ${channel.ChannelId}`)}</h3>
                    <div class="tvhBadgeGroup"><span class="tvhBadge ${stateClass}">${escapeHtml(channel.State || 'unknown')}</span><span class="tvhBadge ${lockClass}">${channel.HasLock ? 'LOCK' : 'NO LOCK'}</span>${channel.AwaitingCleanVideo ? '<span class="tvhBadge tvhBadgeWarn">waiting for clean video</span>' : ''}</div>
                </div>
                <div class="tvhStatusSummary">
                    ${metric('Adapter', channel.Adapter || '—', 'TV tuner adapter reported by TVHeadend.')}
                    ${metric('Network / mux', [channel.Network, channel.Mux].filter(Boolean).join(' · ') || '—', 'Broadcast network and multiplex currently feeding this stream.')}
                    ${signalMetric('Signal', channel.SignalPercent, channel.SignalDbm, 'dBm', 'Tuner signal strength. Higher is better.')}
                    ${signalMetric('SNR', channel.SnrPercent, channel.SnrDb, 'dB', 'Signal-to-noise ratio. Higher means a cleaner signal.')}
                    ${metric('BER / UNC', `${formatNumber(channel.Ber)} / ${formatNumber(channel.Unc)}`, 'Bit errors and uncorrected blocks from the tuner. Lower is better; UNC growth usually means damaged input.')}
                    ${metric('Drops', drops.value, drops.help)}
                    ${metric('Video damage', videoDamage.value, videoDamage.help)}
                    ${metric('Queue', `${formatNumber(channel.QueuePackets)} packets · ${formatBytes(channel.QueueBytes)}`, 'TVHeadend subscription queue depth currently reported for this live stream.')}
                    ${metric('Last mux packet', formatAge(channel.LastMuxPacketAgeMs), 'Time since the plugin last received a playable mux packet. Large values can mean a stalled stream.')}
                    ${metric('Viewers / readers', `${channel.SharedPlaybackCount || 0} / ${channel.ActiveReaderCount || 0}`, 'Shared playback sessions and active HTTP readers attached to this running channel.')}
                    ${metric('Reconnects', reconnects.value, reconnects.help)}
                    ${metric('Startup cache', `${channel.KeyframeStartupReady ? 'ready' : 'waiting'} · ${formatBytes(channel.StartupCacheBytes)}`, 'Buffered startup data used so new viewers can begin on a clean keyframe.')}
                    ${metric('HTSP id', `#${channel.SubscriptionId || 0} · ${channel.ChannelId || ''}`, 'Client-assigned HTSP subscription id. It increments on reconnect; it is not the active subscription count.')}
                </div>
                <details data-subscription-id="${Number(channel.SubscriptionId || 0)}"><summary>Stream statistics (${(channel.Streams || []).length})</summary>
                    <div class="tvhTableWrap" tabindex="0" role="region" aria-label="Stream statistics for ${escapeHtml(channel.Service || `channel ${channel.ChannelId}`)}"><table class="tvhTable"><caption class="tvhSrOnly">Per-stream packet, keyframe, and event statistics</caption><thead><tr><th scope="col">Index</th><th scope="col">PID</th><th scope="col">Codec</th><th scope="col">Language</th><th scope="col">Title</th><th scope="col">Packets</th><th scope="col">Bytes</th><th scope="col">Keyframes</th><th scope="col">Events</th></tr></thead><tbody>${streamRows}</tbody></table></div>
                </details>
            </section>`;
        }).join('');
        container.querySelectorAll('details[data-subscription-id]').forEach(details => { details.open = expandedSubscriptions.has(details.dataset.subscriptionId); });
    }

    function loadStatus(page, showLoading) {
        if (statusRequestInFlight) return statusRequestInFlight;
        const announcer = page.querySelector('#statusAnnouncer');
        if (showLoading) {
            page.querySelector('#statusUpdated').textContent = 'Refreshing runtime information…';
            if (announcer) announcer.textContent = 'Refreshing TVHeadend runtime information.';
        }
        setRefreshState(page, true);
        statusRequestInFlight = ApiClient.ajax({
            type: 'GET',
            url: ApiClient.getUrl('TVHeadEnd/Status'),
            dataType: 'json'
        }).then(status => {
            renderStatus(page, status);
            if (showLoading && announcer) announcer.textContent = 'TVHeadend runtime information refreshed.';
        }).catch(error => {
            page.querySelector('#statusUpdated').textContent = 'Unable to load runtime status';
            if (announcer) announcer.textContent = 'Unable to load TVHeadend runtime status.';
            page.querySelector('#activeTuners').innerHTML = `<div class="tvhEmpty" role="alert">Status endpoint failed: ${escapeHtml(describeError(error))}</div>`;
        }).finally(() => {
            statusRequestInFlight = null;
            setRefreshState(page, false);
        });
        return statusRequestInFlight;
    }

    function setChannelActionBusy(page, busy) {
        ['btnRebuildChannels', 'btnClearChannelImageCache'].forEach(id => {
            const button = page.querySelector('#' + id);
            if (button) button.disabled = busy;
        });
    }

    function runChannelAction(page, url, confirmMessage, busyMessage) {
        if (confirmMessage && !window.confirm(confirmMessage)) return Promise.resolve(null);
        const resultEl = page.querySelector('#channelActionResult');
        setChannelActionBusy(page, true);
        if (resultEl) resultEl.textContent = busyMessage;
        Dashboard.showLoadingMsg();
        return ApiClient.ajax({
            type: 'POST',
            url: ApiClient.getUrl(url),
            dataType: 'json'
        }).catch(error => {
            if (resultEl) resultEl.textContent = `Failed: ${describeError(error)}`;
            throw error;
        }).finally(() => {
            setChannelActionBusy(page, false);
            Dashboard.hideLoadingMsg();
            loadStatus(page, false);
        });
    }

    function startStatusPolling(page) {
        stopStatusPolling();
        loadStatus(page, true);
        statusTimer = setInterval(() => loadStatus(page, false), 5000);
    }

    function stopStatusPolling() {
        if (statusTimer) { clearInterval(statusTimer); statusTimer = null; }
    }

    installControlTooltips(view);

    view.addEventListener('viewshow', function () {
        startStatusPolling(this);
    });

    view.addEventListener('viewhide', stopStatusPolling);
    view.querySelector('#btnRefreshStatus').addEventListener('click', () => loadStatus(view, true));

    const rebuildChannelsButton = view.querySelector('#btnRebuildChannels');
    if (rebuildChannelsButton) {
        rebuildChannelsButton.addEventListener('click', function () {
            runChannelAction(
                view,
                'TVHeadEnd/Channels/Rebuild',
                'Rebuild channels from TVHeadend? This reconnects to TVHeadend and may briefly interrupt active streams.',
                'Rebuilding channels…'
            ).then(result => {
                if (!result) return;
                const resultEl = view.querySelector('#channelActionResult');
                if (!resultEl) return;
                const removedText = result.RemovedChannelCount > 0
                    ? ` Removed ${result.RemovedChannelCount} channel(s) no longer on TVHeadend.`
                    : '';
                resultEl.textContent = (result.QueuedJellyfinTask
                    ? `Rebuilt ${result.ChannelCount} channel(s) from TVHeadend and queued Jellyfin's "${result.QueuedJellyfinTask}" task.`
                    : `Rebuilt ${result.ChannelCount} channel(s) from TVHeadend. If new channels were added, also run Jellyfin's own Live TV guide/channel refresh under Dashboard → Scheduled Tasks to sync them.`) + removedText;
            }).catch(() => {});
        });
    }

    const clearChannelImageCacheButton = view.querySelector('#btnClearChannelImageCache');
    if (clearChannelImageCacheButton) {
        clearChannelImageCacheButton.addEventListener('click', function () {
            runChannelAction(
                view,
                'TVHeadEnd/Channels/ClearImageCache',
                'Clear all cached channel logos and re-download them from TVHeadend?',
                'Clearing channel logo cache…'
            ).then(result => {
                if (!result) return;
                const resultEl = view.querySelector('#channelActionResult');
                if (resultEl) resultEl.textContent = `Cleared ${result.ImagesPurged} cached logo file(s) for ${result.ChannelCount} channel(s) and re-downloaded them from TVHeadend.`;
            }).catch(() => {});
        });
    }
}

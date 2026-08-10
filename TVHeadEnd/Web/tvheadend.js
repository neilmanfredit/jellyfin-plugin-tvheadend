const TVHclientConfigurationPageVar = {
    pluginUniqueId: '541072f6-f018-4c48-bcbc-ef80734c0df7'
};

export default function (view, params) {
    const bytesPerMiB = 1024 * 1024;
    const defaultQueueDepthBytes = 10 * bytesPerMiB;
    const maxQueueDepthMiB = 20;

    function describeError(error) {
        if (!error) return 'unknown error';
        if (typeof error === 'string') return error;
        if (error.message) return error.message;
        if (typeof error.status === 'number') {
            return `HTTP ${error.status}${error.statusText ? ' ' + error.statusText : ''}`;
        }
        return 'unknown error';
    }

    function getStreamingMethod(config) {
        return config.StreamingMethod || 'Htsp';
    }

    function intValue(element, fallback, min, max) {
        const parsed = parseInt(element.value, 10);
        const value = Number.isFinite(parsed) ? parsed : fallback;
        return Math.max(min, Math.min(max, value));
    }

    function queueDepthBytesToMiB(bytes) {
        const value = Math.max(0, Math.min(maxQueueDepthMiB * bytesPerMiB, Number(bytes || 0)));
        return (value / bytesPerMiB).toFixed(2).replace(/\.?0+$/, '');
    }

    function loadQueueDepth(element, bytes) {
        const value = Number.isFinite(bytes) ? bytes : defaultQueueDepthBytes;
        element.dataset.bytes = String(value);
        element.value = queueDepthBytesToMiB(value);
    }

    function saveQueueDepth(element) {
        if (element.value === queueDepthBytesToMiB(Number(element.dataset.bytes))) {
            return Number(element.dataset.bytes);
        }

        const parsed = parseFloat(element.value);
        const mib = Number.isFinite(parsed) ? Math.max(0, Math.min(maxQueueDepthMiB, parsed)) : defaultQueueDepthBytes / bytesPerMiB;
        return Math.round(mib * bytesPerMiB);
    }

    function priorityValue(value) {
        return [0, 1, 2, 3, 4, 6].includes(Number(value)) ? Number(value) : 2;
    }

    function loadConfig(page, config) {
        const values = config || {};
        page.querySelector('#txtTVH_ServerName').value = values.TVH_ServerName || '';
        loadTimeZones(page.querySelector('#txtTVH_TimeZoneId'), page.querySelector('#tvhTimeZones'), values.TVH_TimeZoneId || '');
        page.querySelector('#txtHTTP_Port').value = Number.isFinite(values.HTTP_Port) ? values.HTTP_Port : 9981;
        page.querySelector('#chkUseHttps').checked = values.UseHttps === true;
        page.querySelector('#txtHTSP_Port').value = Number.isFinite(values.HTSP_Port) ? values.HTSP_Port : 9982;
        page.querySelector('#txtWebRoot').value = values.WebRoot || '/';
        page.querySelector('#txtUserName').value = values.Username || '';
        page.querySelector('#txtPassword').value = values.Password || '';
        page.querySelector('#txtPriority').value = priorityValue(values.Priority);
        loadProfiles(page, values.Profile || '');
        page.querySelector('#txtPrePadding').value = Number.isFinite(values.Pre_Padding) ? values.Pre_Padding : 0;
        page.querySelector('#txtPostPadding').value = Number.isFinite(values.Post_Padding) ? values.Post_Padding : 0;
        page.querySelector('#selChannelType').value = values.ChannelType || 'Ignore';
        page.querySelector('#chkHideRecordingsChannel').checked = values.HideRecordingsChannel === true;
        page.querySelector('#selStreamingMethod').value = getStreamingMethod(values);
        page.querySelector('#chkForceDeinterlace').checked = values.ForceDeinterlace === true;
        loadQueueDepth(page.querySelector('#txtHTSPQueueDepth'), values.HTSPQueueDepth);
        page.querySelector('#txtHTSPInitialTuneBufferMs').value = Number.isFinite(values.HTSPInitialTuneBufferMs) ? values.HTSPInitialTuneBufferMs : 0;
        page.querySelector('#txtHTSPStallTimeoutSeconds').value = Number.isFinite(values.HTSPStallTimeoutSeconds) ? values.HTSPStallTimeoutSeconds : 15;
        page.querySelector('#chkHTSPFilterControlStreams').checked = values.HTSPFilterControlStreams === true;
        page.querySelector('#chkHTSPSignalRecoveryEnabled').checked = values.HTSPSignalRecoveryEnabled !== false;
        page.querySelector('#txtHTSPSignalLockLossSeconds').value = Number.isFinite(values.HTSPSignalLockLossSeconds) ? values.HTSPSignalLockLossSeconds : 3;
        page.querySelector('#txtHTSPSignalUncBurstThreshold').value = Number.isFinite(values.HTSPSignalUncBurstThreshold) ? values.HTSPSignalUncBurstThreshold : 5;
        page.querySelector('#txtHTSPSignalIdrWaitSeconds').value = Number.isFinite(values.HTSPSignalIdrWaitSeconds) ? values.HTSPSignalIdrWaitSeconds : 3;
        page.querySelector('#txtHTSPSignalRecoveryMaxReconnects').value = Number.isFinite(values.HTSPSignalRecoveryMaxReconnects) ? values.HTSPSignalRecoveryMaxReconnects : 2;
        page.querySelector('#txtHTSPSignalRecoveryCooldownSeconds').value = Number.isFinite(values.HTSPSignalRecoveryCooldownSeconds) ? values.HTSPSignalRecoveryCooldownSeconds : 15;
        page.querySelector('#chkHTSPEnableStreamSharing').checked = values.HTSPEnableStreamSharing !== false;
        page.querySelector('#chkHTSPKeyframeStartupEnabled').checked = values.HTSPKeyframeStartupEnabled !== false;
        page.querySelector('#chkHTSPHealthLoggingEnabled').checked = values.HTSPHealthLoggingEnabled !== false;
        page.querySelector('#txtHTSPHealthLogIntervalSeconds').value = Number.isFinite(values.HTSPHealthLogIntervalSeconds) ? values.HTSPHealthLogIntervalSeconds : 30;
        page.querySelector('#chkHTSPSignalHealthLoggingEnabled').checked = values.HTSPSignalHealthLoggingEnabled !== false;
        page.querySelector('#chkHTSPDetailedDiagnostics').checked = values.HTSPDetailedDiagnostics === true;
        updateDependentState(page);
    }

    function loadProfiles(page, selectedProfile) {
        const select = page.querySelector('#txtProfile');
        const status = page.querySelector('#profileStatus');
        const setOptions = profiles => {
            select.options.length = 0;
            select.add(new Option('Default', ''));
            profiles.forEach(profile => select.add(new Option(profile.Name, profile.Id || profile.Name)));
            const selected = profiles.find(profile => profile.Id === selectedProfile || profile.Name === selectedProfile);
            if (selected) select.value = selected.Id || selected.Name;
            else if (selectedProfile) {
                select.add(new Option(`${selectedProfile} (unavailable)`, selectedProfile));
                select.value = selectedProfile;
            }
        };

        setOptions([]);
        select.disabled = true;
        return ApiClient.ajax({ type: 'GET', url: ApiClient.getUrl('TVHeadEnd/Profiles'), dataType: 'json' })
            .then(profiles => {
                const items = Array.isArray(profiles) ? profiles : [];
                setOptions(items);
                status.textContent = `${items.length + 1} recording profile${items.length ? 's' : ''} loaded from TVHeadend.`;
            })
            .catch(response => {
                status.textContent = response?.status === 403
                    ? 'TVHeadend denied DVR profile access. Enable Basic recorder access and allow the required DVR configuration for the configured user.'
                    : 'Profiles could not be loaded; the saved selection is retained.';
            })
            .finally(() => { select.disabled = false; });
    }

    function installControlTooltips(page) {
        const fallbackTooltips = {
            chkHideRecordingsChannel: 'Hide the synthetic TVHeadend Recordings channel from Jellyfin channel lists.'
        };

        page.querySelectorAll('.checkboxContainer input[type="checkbox"]').forEach(input => {
            const container = input.closest('.checkboxContainer');
            const label = input.closest('label');
            const description = container ? container.querySelector('.fieldDescription') : null;
            const labelText = label ? label.textContent.replace(/\s+/g, ' ').trim() : '';
            const tooltip = (description && description.textContent.replace(/\s+/g, ' ').trim())
                || fallbackTooltips[input.id]
                || `Toggle ${labelText || input.id}.`;

            input.title = tooltip;
            if (label) label.title = tooltip;

            if (description) {
                if (!description.id) description.id = `${input.id}Description`;
                input.setAttribute('aria-describedby', description.id);
            }
        });

        const saveButton = page.querySelector('.TVHclientConfigurationForm button[type="submit"]');
        if (saveButton) {
            saveButton.title = 'Save all TVHeadend plugin settings shown on this page.';
            saveButton.setAttribute('aria-label', 'Save TVHeadend plugin settings');
        }

        const resetButton = page.querySelector('#btnResetDefaults');
        if (resetButton) {
            resetButton.title = 'Reset TVHeadend plugin settings to their default values, keeping hostname, username, and password.';
            resetButton.setAttribute('aria-label', 'Reset TVHeadend plugin settings to defaults, keeping hostname, username, and password');
        }
    }

    function updateDependentState(page) {
        const recoveryEnabled = page.querySelector('#chkHTSPSignalRecoveryEnabled').checked;
        const recovery = page.querySelector('#signalRecoverySettings');
        recovery.classList.toggle('tvhDependentDisabled', !recoveryEnabled);
        recovery.querySelectorAll('input').forEach(input => { input.disabled = !recoveryEnabled; });

        const healthEnabled = page.querySelector('#chkHTSPHealthLoggingEnabled').checked;
        const health = page.querySelector('#healthIntervalContainer');
        health.classList.toggle('tvhDependentDisabled', !healthEnabled);
        health.querySelector('input').disabled = !healthEnabled;
    }

    function loadTimeZones(input, list, selected) {
        const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
        if (selected && !zones.includes(selected)) { zones.unshift(selected); }
        list.textContent = '';
        zones.forEach(zone => list.appendChild(new Option(zone, zone)));
        input.value = selected || '';
    }

    installControlTooltips(view);

    view.addEventListener('viewshow', function () {
        Dashboard.showLoadingMsg();
        const page = this;
        ApiClient.getPluginConfiguration(TVHclientConfigurationPageVar.pluginUniqueId).then(config => {
            loadConfig(page, config);
        }).catch(error => {
            console.error('[TVHclient] Failed to load TVHeadend plugin configuration', error);
            window.alert('Failed to load TVHeadend plugin settings: ' + describeError(error));
        }).finally(() => Dashboard.hideLoadingMsg());
    });

    view.querySelector('#chkHTSPSignalRecoveryEnabled').addEventListener('change', () => updateDependentState(view));
    view.querySelector('#chkHTSPHealthLoggingEnabled').addEventListener('change', () => updateDependentState(view));
    view.querySelector('#btnResetDefaults').addEventListener('click', function () {
        if (!window.confirm('Reset TVHeadend plugin settings to defaults? Hostname, username, and password will be kept.')) return;
        Dashboard.showLoadingMsg();
        ApiClient.ajax({
            type: 'POST',
            url: ApiClient.getUrl('TVHeadEnd/Configuration/ResetDefaults'),
            dataType: 'json'
        }).then(config => {
            loadConfig(view, config);
        }).catch(error => {
            console.error('[TVHclient] Failed to reset TVHeadend plugin configuration', error);
            window.alert('Failed to reset TVHeadend plugin settings: ' + describeError(error));
        }).finally(() => Dashboard.hideLoadingMsg());
    });

    view.querySelector('.TVHclientConfigurationForm').addEventListener('submit', function (e) {
        e.preventDefault();
        Dashboard.showLoadingMsg();
        const form = this;
        ApiClient.getPluginConfiguration(TVHclientConfigurationPageVar.pluginUniqueId).then(config => {
            config.TVH_ServerName = form.querySelector('#txtTVH_ServerName').value.trim();
            config.TVH_TimeZoneId = form.querySelector('#txtTVH_TimeZoneId').value.trim();
            config.HTTP_Port = intValue(form.querySelector('#txtHTTP_Port'), 9981, 1, 65535);
            config.UseHttps = form.querySelector('#chkUseHttps').checked;
            config.HTSP_Port = intValue(form.querySelector('#txtHTSP_Port'), 9982, 1, 65535);
            config.WebRoot = form.querySelector('#txtWebRoot').value.trim() || '/';
            config.Username = form.querySelector('#txtUserName').value;
            config.Password = form.querySelector('#txtPassword').value;
            config.Priority = priorityValue(form.querySelector('#txtPriority').value);
            config.Profile = form.querySelector('#txtProfile').value.trim();
            config.Pre_Padding = intValue(form.querySelector('#txtPrePadding'), 0, 0, 86400);
            config.Post_Padding = intValue(form.querySelector('#txtPostPadding'), 0, 0, 86400);
            config.ChannelType = form.querySelector('#selChannelType').value;
            config.HideRecordingsChannel = form.querySelector('#chkHideRecordingsChannel').checked;
            config.StreamingMethod = form.querySelector('#selStreamingMethod').value;
            config.ForceDeinterlace = form.querySelector('#chkForceDeinterlace').checked;
            config.HTSPQueueDepth = saveQueueDepth(form.querySelector('#txtHTSPQueueDepth'));
            config.HTSPInitialTuneBufferMs = intValue(form.querySelector('#txtHTSPInitialTuneBufferMs'), 0, 0, 3000);
            config.HTSPStallTimeoutSeconds = intValue(form.querySelector('#txtHTSPStallTimeoutSeconds'), 15, 0, 120);
            config.HTSPFilterControlStreams = form.querySelector('#chkHTSPFilterControlStreams').checked;
            config.HTSPSignalRecoveryEnabled = form.querySelector('#chkHTSPSignalRecoveryEnabled').checked;
            config.HTSPSignalLockLossSeconds = intValue(form.querySelector('#txtHTSPSignalLockLossSeconds'), 3, 1, 30);
            config.HTSPSignalUncBurstThreshold = intValue(form.querySelector('#txtHTSPSignalUncBurstThreshold'), 5, 1, 1000);
            config.HTSPSignalIdrWaitSeconds = intValue(form.querySelector('#txtHTSPSignalIdrWaitSeconds'), 3, 1, 15);
            config.HTSPSignalRecoveryMaxReconnects = intValue(form.querySelector('#txtHTSPSignalRecoveryMaxReconnects'), 2, 0, 10);
            config.HTSPSignalRecoveryCooldownSeconds = intValue(form.querySelector('#txtHTSPSignalRecoveryCooldownSeconds'), 15, 1, 300);
            config.HTSPEnableStreamSharing = form.querySelector('#chkHTSPEnableStreamSharing').checked;
            config.HTSPKeyframeStartupEnabled = form.querySelector('#chkHTSPKeyframeStartupEnabled').checked;
            config.HTSPHealthLoggingEnabled = form.querySelector('#chkHTSPHealthLoggingEnabled').checked;
            config.HTSPHealthLogIntervalSeconds = intValue(form.querySelector('#txtHTSPHealthLogIntervalSeconds'), 30, 5, 600);
            config.HTSPSignalHealthLoggingEnabled = form.querySelector('#chkHTSPSignalHealthLoggingEnabled').checked;
            config.HTSPDetailedDiagnostics = form.querySelector('#chkHTSPDetailedDiagnostics').checked;
            return ApiClient.updatePluginConfiguration(TVHclientConfigurationPageVar.pluginUniqueId, config);
        }).then(result => {
            Dashboard.processPluginConfigurationUpdateResult(result);
            loadProfiles(view, form.querySelector('#txtProfile').value.trim());
        }).catch(error => {
            console.error('[TVHclient] Failed to save TVHeadend plugin configuration', error);
            window.alert('Failed to save TVHeadend plugin settings: ' + describeError(error));
        }).finally(() => Dashboard.hideLoadingMsg());
        return false;
    });
}

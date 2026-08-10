using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using MediaBrowser.Model.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using TVHeadEnd.HTSP;
using TVHeadEnd.HTSP_Responses;

namespace TVHeadEnd
{
    public sealed class HtspStreamStatus
    {
        public int Index { get; set; }
        public int Pid { get; set; }
        public string Codec { get; set; }
        public string Language { get; set; }
        public string Title { get; set; }
        public long Packets { get; set; }
        public long Bytes { get; set; }
        public long RandomAccessFrames { get; set; }
        public long TimestampDiscontinuities { get; set; }
        public long TimestampAnomalyDrops { get; set; }
        public long AudInsertions { get; set; }
    }

    public sealed class HtspRunningChannelStatus
    {
        public string ChannelId { get; set; }
        public string PlaybackId { get; set; }
        public int SubscriptionId { get; set; }
        public string State { get; set; }
        public DateTime? OpenedUtc { get; set; }
        public string Adapter { get; set; }
        public string Service { get; set; }
        public string Network { get; set; }
        public string Mux { get; set; }
        public string Provider { get; set; }
        public int SharedPlaybackCount { get; set; }
        public int ActiveReaderCount { get; set; }
        public string SignalStatus { get; set; }
        public bool HasLock { get; set; }
        public int? SignalRaw { get; set; }
        public double? SignalPercent { get; set; }
        public double? SignalDbm { get; set; }
        public int? SnrRaw { get; set; }
        public double? SnrPercent { get; set; }
        public double? SnrDb { get; set; }
        public long? Ber { get; set; }
        public long? Unc { get; set; }
        public long? SignalAgeMs { get; set; }
        public long QueuePackets { get; set; }
        public long QueueBytes { get; set; }
        public long QueueDelayUs { get; set; }
        public long QueueIDrops { get; set; }
        public long QueuePDrops { get; set; }
        public long QueueBDrops { get; set; }
        public long? LastMuxPacketAgeMs { get; set; }
        public int ReconnectAttempts { get; set; }
        public int SignalRecoveryAttempts { get; set; }
        public bool AwaitingCleanVideo { get; set; }
        public long VideoDamageEvents { get; set; }
        public long DamagedVideoDrops { get; set; }
        public long? VideoDamageAgeMs { get; set; }
        public string LastVideoDamageReason { get; set; }
        public bool KeyframeStartupReady { get; set; }
        public long StartupCacheBytes { get; set; }
        public IReadOnlyList<HtspStreamStatus> Streams { get; set; }
    }

    public sealed class PluginRuntimeStatus
    {
        public DateTime GeneratedUtc { get; set; }
        public string PluginVersion { get; set; }
        public string StreamingMethod { get; set; }
        public string Server { get; set; }
        public bool Connected { get; set; }
        public string ServerVersion { get; set; }
        public int? HtspProtocolVersion { get; set; }
        public int RunningChannelCount { get; set; }
        public IReadOnlyList<HtspRunningChannelStatus> RunningChannels { get; set; }
        public int ActiveProducerCount => RunningChannelCount;
        public IReadOnlyList<HtspRunningChannelStatus> Producers => RunningChannels;
    }

    [ApiController]
    [Authorize(Policy = "RequiresElevation")]
    [Route("TVHeadEnd/Configuration")]
    public sealed class PluginConfigurationController : ControllerBase
    {
        [HttpPost("ResetDefaults")]
        public ActionResult ResetDefaults()
        {
            var plugin = Plugin.Instance;
            if (plugin == null)
            {
                return StatusCode(StatusCodes.Status500InternalServerError);
            }

            return Ok(plugin.ResetConfigurationToDefaults());
        }
    }

    [ApiController]
    [Authorize(Policy = "RequiresElevation")]
    [Route("TVHeadEnd/Status")]
    public sealed class PluginStatusController : ControllerBase
    {
        private readonly HTSConnectionHandler _connectionHandler;

        public PluginStatusController(HTSConnectionHandler connectionHandler)
        {
            _connectionHandler = connectionHandler;
        }

        [HttpGet]
        public ActionResult<PluginRuntimeStatus> GetStatus()
        {
            var configuration = Plugin.Instance?.Configuration;
            var runningChannels = HtspLiveStream.GetRunningChannelStatuses();
            var connection = _connectionHandler.GetConnectionStatus();
            return Ok(new PluginRuntimeStatus
            {
                GeneratedUtc = DateTime.UtcNow,
                PluginVersion = typeof(Plugin).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
                    ?? typeof(Plugin).Assembly.GetName().Version?.ToString()
                    ?? "unknown",
                StreamingMethod = configuration?.StreamingMethod ?? string.Empty,
                Server = configuration == null ? string.Empty : configuration.TVH_ServerName + ":" + configuration.HTSP_Port,
                Connected = connection.Connected,
                ServerVersion = connection.ServerVersion,
                HtspProtocolVersion = connection.ProtocolVersion,
                RunningChannelCount = runningChannels.Count,
                RunningChannels = runningChannels
            });
        }
    }

    [ApiController]
    [Route("TVHeadEnd/Recordings")]
    public sealed class PluginRecordingStreamController : ControllerBase
    {
        private readonly LiveTvService _liveTvService;

        public PluginRecordingStreamController(LiveTvService liveTvService)
        {
            _liveTvService = liveTvService;
        }

        [HttpGet("{recordingId}/{token}/Stream")]
        [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
        public async Task<IActionResult> GetStream(string recordingId, string token, CancellationToken cancellationToken)
        {
            // Jellyfin fetches remote channel media server-side without forwarding the user's authorization header.
            if (!_liveTvService.IsRecordingStreamTokenValid(recordingId, token))
            {
                return NotFound();
            }

            var streamUrl = await _liveTvService.GetRecordingStreamUrl(recordingId, cancellationToken).ConfigureAwait(false);
            return Redirect(streamUrl);
        }
    }

    [ApiController]
    [Authorize(Policy = "RequiresElevation")]
    [Route("TVHeadEnd/Profiles")]
    public sealed class PluginProfilesController : ControllerBase
    {
        private static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(10);
        private readonly HTSConnectionHandler _connectionHandler;

        public PluginProfilesController(HTSConnectionHandler connectionHandler)
        {
            _connectionHandler = connectionHandler;
        }

        [HttpGet]
        public async Task<ActionResult<IReadOnlyList<RecordingProfileInfo>>> GetProfiles(CancellationToken cancellationToken)
        {
            if (_connectionHandler.GetServerProtocolVersion() < 16)
            {
                return Ok(Array.Empty<RecordingProfileInfo>());
            }

            var request = new HTSMessage { Method = "getDvrConfigs" };
            var handler = new LoopBackResponseHandler();
            var sequence = _connectionHandler.SendMessage(request, handler);
            HTSMessage response;
            try
            {
                response = await handler.GetResponseAsync(cancellationToken, RequestTimeout).ConfigureAwait(false);
            }
            finally
            {
                _connectionHandler.RemoveResponseHandler(sequence);
            }

            if (response == null)
            {
                return StatusCode(StatusCodes.Status502BadGateway, "TVHeadend returned no DVR configuration response.");
            }

            if (response.getInt("noaccess", 0) != 0)
            {
                return StatusCode(
                    StatusCodes.Status403Forbidden,
                    "TVHeadend denied access to DVR configurations. Enable Basic recorder access and allow the required DVR configuration for this user.");
            }

            if (!response.containsField("dvrconfigs"))
            {
                return Ok(Array.Empty<RecordingProfileInfo>());
            }

            return Ok(response.getList("dvrconfigs")
                .OfType<HTSMessage>()
                .Select(config => new RecordingProfileInfo
                {
                    Id = config.getString("uuid", string.Empty),
                    Name = config.getString("name", string.Empty)
                })
                .Where(profile => !string.IsNullOrWhiteSpace(profile.Name))
                .GroupBy(profile => profile.Id ?? profile.Name, StringComparer.OrdinalIgnoreCase)
                .Select(group => group.First())
                .OrderBy(profile => profile.Name, StringComparer.OrdinalIgnoreCase)
                .ToArray());
        }
    }

    public sealed class RecordingProfileInfo
    {
        public string Id { get; set; }
        public string Name { get; set; }
    }

    public sealed class ChannelRebuildResult
    {
        public int ChannelCount { get; set; }
        public string QueuedJellyfinTask { get; set; }
    }

    public sealed class ChannelImageCachePurgeResult
    {
        public int ChannelCount { get; set; }
        public int ImagesPurged { get; set; }
    }

    [ApiController]
    [Authorize(Policy = "RequiresElevation")]
    [Route("TVHeadEnd/Channels")]
    public sealed class PluginChannelsController : ControllerBase
    {
        // ensureConnection/WaitForInitialLoadAsync fall back to a 15-minute timeout meant
        // for background startup sync. A synchronous admin button click needs a much
        // shorter bound so the browser's loading spinner can't hang for minutes if
        // TVHeadend is slow or unreachable.
        private static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(45);

        private readonly HTSConnectionHandler _connectionHandler;
        private readonly LiveTvService _liveTvService;
        private readonly ITaskManager _taskManager;
        private readonly ILogger<PluginChannelsController> _logger;

        public PluginChannelsController(
            HTSConnectionHandler connectionHandler,
            LiveTvService liveTvService,
            ITaskManager taskManager,
            ILogger<PluginChannelsController> logger)
        {
            _connectionHandler = connectionHandler;
            _liveTvService = liveTvService;
            _taskManager = taskManager;
            _logger = logger;
        }

        /// <summary>
        /// Forces a fresh HTSP connection so TVHeadend resends its full channel list, then
        /// re-derives Jellyfin's channel data from it and best-effort queues Jellyfin's own
        /// Live TV guide/channel scheduled task (if one can be unambiguously identified) so
        /// new/removed channels are reflected in Jellyfin's Live TV section without waiting
        /// for its normal schedule.
        /// </summary>
        [HttpPost("Rebuild")]
        public async Task<ActionResult<ChannelRebuildResult>> Rebuild(CancellationToken cancellationToken)
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(RequestTimeout);

            try
            {
                var result = await _connectionHandler.RebuildChannelsAsync(timeout.Token).ConfigureAwait(false);
                if (result == -1)
                {
                    return StatusCode(StatusCodes.Status504GatewayTimeout, "Timed out waiting for TVHeadend to resend the channel list.");
                }

                var channels = (await _liveTvService.GetChannelsAsync(timeout.Token).ConfigureAwait(false)).ToList();

                return Ok(new ChannelRebuildResult
                {
                    ChannelCount = channels.Count,
                    QueuedJellyfinTask = TryQueueGuideRefreshTask()
                });
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                return StatusCode(StatusCodes.Status504GatewayTimeout, "Timed out communicating with TVHeadend.");
            }
        }

        /// <summary>
        /// Deletes every cached channel logo regardless of retention/fingerprint and
        /// re-downloads them from TVHeadend, for when a logo needs to be force-refreshed
        /// without a full channel rebuild.
        /// </summary>
        [HttpPost("ClearImageCache")]
        public async Task<ActionResult<ChannelImageCachePurgeResult>> ClearImageCache(CancellationToken cancellationToken)
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(RequestTimeout);

            try
            {
                var purged = await _connectionHandler.PurgeChannelImageCacheAsync(timeout.Token).ConfigureAwait(false);
                var channels = (await _liveTvService.GetChannelsAsync(timeout.Token).ConfigureAwait(false)).ToList();

                return Ok(new ChannelImageCachePurgeResult
                {
                    ChannelCount = channels.Count,
                    ImagesPurged = purged
                });
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                return StatusCode(StatusCodes.Status504GatewayTimeout, "Timed out communicating with TVHeadend.");
            }
        }

        /// <summary>
        /// Jellyfin's Live TV channel/guide sync has no public force-refresh API, so this is
        /// a best-effort heuristic match against the server's own scheduled tasks. It only
        /// acts when exactly one candidate is found, and any failure here is logged and
        /// swallowed - the TVHeadend-side rebuild above already succeeded regardless.
        /// </summary>
        private string TryQueueGuideRefreshTask()
        {
            try
            {
                var candidates = _taskManager.ScheduledTasks
                    .Where(worker => worker.ScheduledTask is not null
                        && worker.Category != null
                        && worker.Category.Contains("live tv", StringComparison.OrdinalIgnoreCase)
                        && worker.Name != null
                        && (worker.Name.Contains("guide", StringComparison.OrdinalIgnoreCase)
                            || worker.Name.Contains("channel", StringComparison.OrdinalIgnoreCase)))
                    .ToList();

                if (candidates.Count != 1)
                {
                    return null;
                }

                _taskManager.QueueScheduledTask(candidates[0].ScheduledTask, new TaskOptions());
                return candidates[0].Name;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "[TVHclient] Could not queue Jellyfin's own channel/guide refresh task; the TVHeadend-side rebuild still succeeded");
                return null;
            }
        }
    }
}

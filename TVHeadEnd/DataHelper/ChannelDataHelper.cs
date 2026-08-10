using System;
using System.Collections;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using MediaBrowser.Controller.LiveTv;
using MediaBrowser.Model.LiveTv;
using Microsoft.Extensions.Logging;
using TVHeadEnd.HTSP;

namespace TVHeadEnd.DataHelper
{
    public class ChannelDataHelper
    {
        private readonly ILogger<ChannelDataHelper> _logger;
        private readonly Dictionary<long, HTSMessage> _data;
        private string _channelType4Other = "Ignore";

        public ChannelDataHelper(ILogger<ChannelDataHelper> logger)
        {
            _logger = logger;

            _data = new Dictionary<long, HTSMessage>();
        }

        public void SetChannelType4Other(string channelType4Other)
        {
            _channelType4Other = channelType4Other;
        }

        public void Clean()
        {
            lock (_data)
            {
                _data.Clear();
            }
        }

        public void Add(HTSMessage message)
        {
            lock (_data)
            {
                try
                {
                    long channelID = message.getLong("channelId");
                    if (_data.ContainsKey(channelID))
                    {
                        HTSMessage storedMessage = _data[channelID];
                        if (storedMessage != null)
                        {
                            foreach (KeyValuePair<string, object> entry in message)
                            {
                                if (storedMessage.containsField(entry.Key))
                                {
                                    storedMessage.removeField(entry.Key);
                                }
                                storedMessage.putField(entry.Key, entry.Value);
                            }
                        }
                        else
                        {
                            _logger.LogError("[TVHclient] ChannelDataHelper: updated data for channelID '{id}' but no initial data found", channelID);
                        }
                    }
                    else
                    {
                        // Channels without an assigned LCN (channelNumber 0/absent) are still
                        // valid, playable TVHeadend channels - don't silently drop them.
                        _data.Add(channelID, message);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "[TVHclient] ChannelDataHelper.Add: exception caught. HTSMessage: {m} ", message);
                }
            }
        }

        public long ResolveChannelId(string channelId)
        {
            if (uint.TryParse(channelId, out var numericId))
            {
                return numericId;
            }

            lock (_data)
            {
                foreach (var entry in _data)
                {
                    if (entry.Value.containsField("channelIdStr")
                        && string.Equals(entry.Value.getString("channelIdStr"), channelId, StringComparison.OrdinalIgnoreCase))
                    {
                        return entry.Key;
                    }
                }
            }

            throw new ArgumentException("Unknown TVHeadend channel identifier.", nameof(channelId));
        }

        public string GetExternalChannelId(long channelId)
        {
            lock (_data)
            {
                return _data.TryGetValue(channelId, out var message) && message.containsField("channelIdStr")
                    ? message.getString("channelIdStr")
                    : channelId.ToString(System.Globalization.CultureInfo.InvariantCulture);
            }
        }

        public Task<IEnumerable<ChannelInfo>> BuildChannelInfos(CancellationToken cancellationToken)
        {
            return Task.Factory.StartNew<IEnumerable<ChannelInfo>>(() =>
            {
                lock (_data)
                {
                    List<ChannelInfo> result = new List<ChannelInfo>();
                    foreach (KeyValuePair<long, HTSMessage> entry in _data)
                    {
                        if (cancellationToken.IsCancellationRequested)
                        {
                            _logger.LogDebug("[TVHclient] ChannelDataHelper.buildChannelInfos: call cancelled - returning partial list");
                            return result;
                        }

                        HTSMessage m = entry.Value;

                        try
                        {
                            ChannelInfo ci = new ChannelInfo();
                            ci.Id = m.containsField("channelIdStr") ? m.getString("channelIdStr") : "" + entry.Key;

                            ci.ImagePath = "";

                            if (m.containsField("channelIcon"))
                            {
                                ci.ImageUrl = m.getString("channelIcon");
                            }
                            if (m.containsField("channelName"))
                            {
                                string name = m.getString("channelName");
                                if (string.IsNullOrEmpty(name))
                                {
                                    continue;
                                }
                                ci.Name = m.getString("channelName");
                            }

                            if (m.containsField("channelNumber"))
                            {
                                int channelNumber = m.getInt("channelNumber");
                                ci.Number = "" + channelNumber;
                                if (m.containsField("channelNumberMinor"))
                                {
                                    int channelNumberMinor = m.getInt("channelNumberMinor");
                                    ci.Number = ci.Number + "." + channelNumberMinor;
                                }
                            }

                            Boolean serviceFound = false;
                            string detectedType = null;
                            if (m.containsField("services"))
                            {
                                IList tunerInfoList = m.getList("services");
                                if (tunerInfoList != null && tunerInfoList.Count > 0)
                                {
                                    HTSMessage firstServiceInList = (HTSMessage)tunerInfoList[0];
                                    if (firstServiceInList.containsField("providername"))
                                    {
                                        ci.ChannelGroup = firstServiceInList.getString("providername");
                                    }
                                    if (firstServiceInList.containsField("type"))
                                    {
                                        detectedType = firstServiceInList.getString("type").ToLower();
                                    }
                                }
                            }

                            switch (detectedType)
                            {
                                case "radio":
                                    ci.ChannelType = ChannelType.Radio;
                                    serviceFound = true;
                                    break;
                                case "sdtv":
                                case "hdtv":
                                case "fhdtv":
                                case "uhdtv":
                                    ci.ChannelType = ChannelType.TV;
                                    ci.IsHD = detectedType != "sdtv";
                                    serviceFound = true;
                                    break;
                                default:
                                    // Tagged "other", an unrecognized tag, or no service/type info
                                    // at all (e.g. no active service) - apply the admin's "Channels
                                    // tagged Other" preference instead of silently dropping the
                                    // channel outright.
                                    switch ((_channelType4Other ?? "Ignore").ToLower())
                                    {
                                        case "tv":
                                            _logger.LogDebug("[TVHclient] ChannelDataHelper: map unclassified channel to 'TV'. Detected tag: '{tag}'", detectedType ?? "none");
                                            ci.ChannelType = ChannelType.TV;
                                            serviceFound = true;
                                            break;
                                        case "radio":
                                            _logger.LogDebug("[TVHclient] ChannelDataHelper: map unclassified channel to 'Radio'. Detected tag: '{tag}'", detectedType ?? "none");
                                            ci.ChannelType = ChannelType.Radio;
                                            serviceFound = true;
                                            break;
                                        default:
                                            _logger.LogDebug("[TVHclient] ChannelDataHelper: unclassified channel will be ignored. Detected tag: '{tag}'", detectedType ?? "none");
                                            break;
                                    }

                                    break;
                            }

                            if (!serviceFound)
                            {
                                _logger.LogDebug("[TVHclient] ChannelDataHelper: unable to detect service-type (tvheadend tag) from service list. HTSMessage: {m}", m.ToString());
                                continue;
                            }

                            _logger.LogDebug("[TVHclient] ChannelDataHelper: adding channel: {m}", ci.Name);

                            result.Add(ci);
                        }
                        catch (Exception ex)
                        {
                            _logger.LogError(ex, "[TVHclient] ChannelDataHelper.BuildChannelInfos: exception caught. HTSMessage: {m}", m.ToString());
                        }
                    }
                    return result;
                }
            });
        }
    }
}

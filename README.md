# TvheadEndNew (Jellyfin TVHeadend Plugin Fork)

This repository is a fork of the official
[jellyfin/jellyfin-plugin-tvheadend](https://github.com/jellyfin/jellyfin-plugin-tvheadend)
plugin, packaged under its own plugin identity as **TvheadEndNew** (distinct
name and GUID from upstream). It adds local work aimed at newer Jellyfin
builds, more reliable HTSP playback, and better diagnostics.

Because it uses its own GUID, TvheadEndNew can be installed alongside the
official upstream TVHeadend plugin without conflict.

## What It Includes

- Jellyfin Live TV backed by TVHeadend channels, EPG data, timers, series
  timers, and recordings.
- TVHeadend recording management from Jellyfin, including DVR profiles,
  priorities, pre/post padding, and an optional synthetic "TVHeadend Recordings"
  channel.
- Streaming through HTSP, HTTP ticket URLs, or HTTP basic authentication.
- HTSP direct streaming with shared upstream subscriptions, independent buffered
  readers, clean-keyframe startup, optional initial tune buffering, and a silent
  stream watchdog.
- An in-plugin MPEG-TS muxer for HTSP payloads, including common video, audio,
  DVB subtitle, teletext, and private/fallback stream handling.
- Signal monitoring and recovery for HTSP streams, including lock/SNR/UNC
  tracking, damaged video withholding until a clean keyframe, and bounded
  reconnects.
- Two separate plugin pages, so live status polling never touches the
  settings form: **TVHeadend Configuration** (connection, HTSP, signal
  recovery, and channel maintenance settings) and **TVHeadend Status**
  (read-only runtime status and active tuners).
- Runtime status on the Status page: connection state, active tuners, reader
  counts, signal metrics, queue health, drops, reconnects, startup cache
  state, and per-stream packet/event counters, refreshed every 5 seconds.
- A "Channels" section on the Configuration page with two admin actions:
  "Rebuild channels" (reconnects to TVHeadend so it resends its full channel
  list, removes channels no longer present on TVHeadend, and best-effort
  queues Jellyfin's own Live TV guide/channel refresh task so newly added
  channels are picked up) and "Clear channel logo cache" (force re-downloads
  all cached channel logos, ignoring retention/fingerprint checks).
- Jellyfin 10.11 / .NET 9 packaging metadata, plus a Jellyfin 12.0 / .NET 10
  build for newer servers.

## Requirements

TvheadEndNew targets whatever Jellyfin actually ships. As of this writing
that's two lines — Jellyfin has no `11.x`; the project went straight from
`10.11.11` (its last `10.x` release) to `12.0` (currently `12.0-rc4`, not yet
stable):

| Jellyfin server        | Plugin version | targetAbi     | Built with              |
|-------------------------|-----------------|---------------|--------------------------|
| `12.0.x` (incl. RCs)    | `2.0.0.0`       | `12.0.0.0`    | `net10.0` SDK            |
| `10.11.x`               | `1.0.0.0`       | `10.11.0.0`   | `net9.0` SDK             |

The repository manifest publishes both versions; Jellyfin's plugin
catalogue automatically shows whichever one is ABI-compatible with your
server, so you always add the same repository URL regardless of which
Jellyfin version you run. TVHeadend itself needs HTTP and HTSP access
enabled.

`master` currently builds the `2.0.0.0` / Jellyfin 12 line. To build the
`1.0.0.0` / Jellyfin 10.11 line from source, check out the `v1.0.0.0` tag —
`master` no longer targets `net9.0`.

## Installation

### Via plugin repository (recommended)

1. In Jellyfin, go to **Dashboard → Plugins → Catalogue**.
2. Click **Manage Repositories**.
3. Click the **+** button to add a new repository.
4. Enter a name (e.g. `TvheadEndNew`) and this URL:

   ```text
   https://neilmanfredit.github.io/jellyfin-plugin-tvheadend/manifest.json
   ```

5. Click **Save**.
6. Return to **Dashboard → Plugins → Catalogue** and search for
   **TvheadEndNew** (Live TV category), install it, and restart Jellyfin.

Jellyfin filters the catalogue by ABI compatibility. The manifest currently
publishes two versions: `2.0.0.0` (`targetAbi 12.0.0.0`, for Jellyfin 12.x
servers) and `1.0.0.0` (`targetAbi 10.11.0.0`, for Jellyfin 10.11.x servers)
— your server will only see the one it's compatible with. Packaged releases
are published under
[Releases](https://github.com/neilmanfredit/jellyfin-plugin-tvheadend/releases).

### Manual build

```powershell
dotnet publish --configuration Release --output bin
```

Then copy the built `TVHeadEnd.dll` into Jellyfin's `plugins/tvheadend` folder
and restart Jellyfin.

## Configuration Notes

The settings page lets you configure the TVHeadend host, HTTP/HTSP ports, HTTPS,
web root, credentials, timezone, streaming method, recording profile, and HTSP
reliability options.

HTSP is the default streaming method in this fork. HTTP ticket/basic streaming is
still available when you want TVHeadend to provide the transport stream directly.

TVHeadend channels are only imported once their service type maps to TV or
Radio. Channels tagged "other" (or with no active service at all) are
controlled by the "Channels tagged Other" setting - set it to TV or Radio to
include them, or leave it as "Ignore" to exclude them.

## Building and Releasing

### Installing the .NET SDK

`master` targets `net10.0` (Jellyfin 12.0 ABI) and needs the .NET 10 SDK
plus the ASP.NET Core 10.0 runtime (pulled in transitively via
`Jellyfin.Controller`, and required to actually *run* anything built against
it, e.g. `TVHeadEnd.LifecycleChecks`). Building the `v1.0.0.0` tag
(Jellyfin 10.11 line) instead needs the .NET 9 SDK.

- **Arch / Manjaro**:

  ```bash
  sudo pacman -S dotnet-sdk-10.0 aspnet-runtime-10.0   # master (net10.0)
  sudo pacman -S dotnet-sdk-9.0                         # v1.0.0.0 tag (net9.0)
  ```

- **Debian / Ubuntu, Fedora, Windows, macOS**: follow Microsoft's official
  install instructions for your platform:
  [dotnet.microsoft.com/download](https://dotnet.microsoft.com/download) —
  or use the [dotnet-install script](https://learn.microsoft.com/dotnet/core/tools/dotnet-install-script)
  for a user-local install with no root/admin needed:

  ```bash
  curl -sSL https://dot.net/v1/dotnet-install.sh | bash -s -- --channel 10.0
  ```

Verify with `dotnet --list-sdks` and `dotnet --list-runtimes` — you should
see the matching SDK and (for `master`) `Microsoft.AspNetCore.App 10.0.x`.

### Build

```powershell
dotnet build
```

Packaged releases can be produced with
[Jellyfin Plugin Repository Manager](https://github.com/oddstr13/jellyfin-plugin-repository-manager)
using the included `build.yaml`.

Releases are also published manually:

1. `dotnet publish TVHeadEnd/TVHeadEnd.csproj --configuration Release --output bin`
2. Zip `TVHeadEnd.dll` from that output (e.g. `TvheadEndNew_<version>.zip`).
3. Create a GitHub release with the zip attached as a release asset, tagged
   `v<version>`.
4. Update `docs/manifest.json` with the new version's `sourceUrl` (the
   release asset URL), MD5 `checksum`, and `timestamp`, then push to `master`
   — GitHub Pages serves it from `/docs` automatically.

## Upstream

This fork is based on the Jellyfin TVHeadend plugin. For upstream issues,
documentation, and contribution guidelines, use the official repository:

[jellyfin/jellyfin-plugin-tvheadend](https://github.com/jellyfin/jellyfin-plugin-tvheadend)

## License

This plugin is distributed under the GNU General Public License v3.0. See
[LICENSE](./LICENSE).

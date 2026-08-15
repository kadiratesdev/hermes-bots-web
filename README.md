# Hermes Bots (Web Dashboard)

Bot Mode for the **Hermes web dashboard** (`hermes dashboard`). One sidebar tab — **Bots** — lists Hermes profiles as named agents, opens each bot’s chat, and manages that bot’s cron routines.

This is **not** the official desktop plugin. The desktop app still uses [NousResearch/Hermes-Bot-Mode](https://github.com/NousResearch/Hermes-Bot-Mode). The two SDKs are different; this package is the web-dashboard adapter.

## Install

Requires [Hermes Agent](https://github.com/NousResearch/hermes-agent) with the web dashboard.

```bash
git clone https://github.com/kadiratesdev/hermes-bots-web ~/.hermes/plugins/hermes-bots
hermes plugins enable hermes-bots
```

If the folder already exists (update):

```bash
git -C ~/.hermes/plugins/hermes-bots pull
```

Then **hard-refresh** the dashboard (`Ctrl+Shift+R`). If the **Bots** tab still does not appear, restart the dashboard process:

```bash
systemctl --user restart hermes-dashboard.service
# or: hermes dashboard --stop && hermes dashboard
```

The tab shows under the sidebar **Plugins** section (after Chat). Path: `/bots`.

User dashboard plugins must be in `plugins.enabled`. `hermes plugins enable hermes-bots` does that.

## What you get

- Roster of profiles as bots (avatar, description, active badge)
- **Sohbet aç** → `/chat?profile=<name>`
- **Yeni ajan** — create a profile (optional clone / no_skills)
- Edit description, delete (never `default`)
- Routines for the selected bot: list, create, pause, resume, trigger, delete

## Layout

```
~/.hermes/plugins/hermes-bots/
├── plugin.yaml                 # standalone plugin (no Python tools)
└── dashboard/
    ├── manifest.json           # tab: /bots, after chat
    └── dist/index.js           # IIFE — uses window.__HERMES_PLUGIN_SDK__
```

No build step. The dashboard loads the IIFE from `dashboard/dist/index.js`.

## License

MIT

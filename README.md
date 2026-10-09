# claude-code-mods

Four mods for [Claude Code](https://claude.com/claude-code) that show what is happening in a session without getting in your way:

| Mod | Where it shows | What it does |
| --- | --- | --- |
| [**Tokachu**](#tokachu-context-pet) (`context-pet`) | Band above the prompt | A pet that grows and turns from green to red as the context fills up |
| [**usage-meter**](#usage-meter) | Status line under the prompt | Your 5-hour and 7-day usage limits, with warnings at 80% and 95% |
| [**turn-notify**](#turn-notify) | Desktop notification | Tells you when a turn of one minute or more is done |
| [**changed-files**](#changed-files) | Side pane | The files that differ from HEAD, as `git diff` shows them, with added and removed lines |

The mods work together: each one uses a different part of the screen. You can install all of them or only the ones you want.

## Installation

You need a Claude Code version that supports mods (plugins with function hooks). The mods are tested with Claude Code 2.1.295.

Add the marketplace, then install the mods you want:

```bash
claude plugin marketplace add RenaudLavoisier/claude-code-mods

claude plugin install context-pet@claude-code-mods --scope user
claude plugin install usage-meter@claude-code-mods --scope user
claude plugin install turn-notify@claude-code-mods --scope user
claude plugin install changed-files@claude-code-mods --scope user
```

With `--scope user`, the mods load in every Claude Code session. In a session that is already open, run `/reload-plugins` to load them.

To get a new version:

```bash
claude plugin marketplace update claude-code-mods
claude plugin update context-pet@claude-code-mods   # same for the other mods
```

To remove a mod:

```bash
claude plugin uninstall context-pet@claude-code-mods
```

## Tokachu (context pet)

Tokachu lives above the prompt and eats your context. The more of the context window the conversation uses, the bigger and redder Tokachu gets.

```text
 /\___/\           Tokachu · 10% of context
(  ^_^  )          20k / 200k tokens
 \_____/           feeling great

 /\_____________/\   Tokachu · 70% of context
(       O_O       )  140k / 200k tokens
(                 )  bloated
(                 )
(                 )
 \_______________/
```

- **Size:** the body grows from 5 to 21 cells wide and gets up to 5 rows of belly. It never takes more rows than the space above the prompt allows.
- **Color:** a smooth gradient from green (`#20df20`) at 0%, through yellow (`#dfdf20`) at 50%, to red (`#df2020`) at 100%.
- **Face and mood:**

  | Context used | Face | Mood |
  | --- | --- | --- |
  | Less than 40% | `^_^` | feeling great |
  | 40% to 59% | `o_o` | well fed |
  | 60% to 79% | `O_O` | bloated |
  | 80% to 89% | `>_<` | about to burst |
  | 90% or more | `x_x` | about to explode, try /compact |

  While Claude works, the mood line shows `nom nom…`.
- **Updates:** after each API response, not only at the end of the turn. Subagents have their own context, so their requests do not feed Tokachu.
- **Alert:** when the context goes past 80%, a toast says `Tokachu ate too much: N% of context`.
- **`/clear`:** Tokachu goes back to its small, green size.
- **`/pet`:** hides or shows Tokachu (`Tokachu is taking a nap.` / `Tokachu is back.`).

## usage-meter

Shows your plan's usage limits in the status line under the prompt:

```text
limits 5h 42% (resets in 2h10) · 7d 82% (resets in 3d4h) ⚠
```

- **Windows:** `5h` (five-hour limit), `7d` (seven-day limit) and `spend` (spend limit), as Claude Code reports them.
- **Countdown:** the time until each window resets. It refreshes every minute, also when Claude is idle.
- **80%:** the window gets a `⚠` and a toast says, for example, `5h usage limit at 81%`.
- **95%:** a toast and a desktop notification.
- Each alert fires once per level. When the usage goes down again (for example, after a reset), the alerts are ready to fire again.
- The line appears only on plans with usage limits. It can stay empty until the first API response of the session.

## turn-notify

Sends a desktop notification when a turn of one minute or more ends, so you can do something else while Claude works.

```text
Claude Code
Done in 2m14s: The migration is ready and all tests pass.
```

- **Message:** `Done in <duration>: <first line of the answer>`. The first line is cleaned of Markdown marks and cut at 120 characters. If the turn fails, the message is `Turn failed after <duration>` (or `Turn refused after <duration>`).
- **Skipped:** turns that you cancel, turns shorter than one minute, and subagent turns.
- **Channel:** the notification uses the channel set in `/config` (Notifications). Your own `Notification` hooks also receive it.
- When Claude waits for a permission, Claude Code already sends its own notification, so this mod does not send a second one.

## changed-files

A side pane that lists the files that differ from `HEAD` in the session's git repository, as `git diff` and `git status` show them:

```text
+12 -3 app/src/core/tasks.py
+40 -0 app/tests/test_tasks.py added
+0 -25 app/legacy.py deleted
+8 -0 notes.md untracked
bin logo.png

5 files · +60 -28 · press a file to mention it
```

- **What it lists:** the staged and unstaged changes against `HEAD` (`git diff HEAD`), and the untracked files that `.gitignore` does not exclude. The list shows every change in the repository, whoever made it: Claude, you in your editor, or a shell command.
- **Counts:** `+N` lines added and `-N` lines removed, then `added`, `deleted` or `untracked` when the file is not only modified. `bin` marks a binary file, and `?` an untracked file that the mod did not count (over 4 MiB, or past the first 100 untracked files). Paths are relative to the session's directory.
- **Updates:** right after Claude runs `Edit`, `Write`, `NotebookEdit` or `Bash`, when you type `/changes`, and every 5 seconds while the pane is open. Git runs with `--no-optional-locks`, so these reads never block your own git commands.
- **Opening:** the pane opens once per session, the first time Claude changes a file while the repository has changes, if the terminal is 144 columns wide or more. In a narrower terminal, a message tells you to type `/changes`, which opens the pane at any width.
- **Mention a file:** press a file to insert `@path` in the prompt.
- **Outside a git repository:** the pane says `Not in a git repository.`

## Development

Each mod is a plugin folder:

```text
context-pet/
├── .claude-plugin/plugin.json   # name, version, description
├── hooks/hooks.json             # points to register.tsx
├── hooks/register.tsx           # the hooks
├── hooks/*.ts                   # pure helpers
├── types/index.d.ts             # the mod's state (when it has one)
└── tests/*.test.ts
```

To work on the mods, clone the repository and add the clone as a local marketplace. Claude Code reads a local marketplace in place, so `/reload-plugins` loads your changes without a reinstall:

```bash
git clone git@github.com:RenaudLavoisier/claude-code-mods.git
claude plugin marketplace add ./claude-code-mods
claude plugin install context-pet@claude-code-mods --scope user
```

Check and test a mod:

```bash
claude plugin validate ./context-pet
claude plugin test ./context-pet
```

Before you push a change, increase `version` in the mod's `plugin.json`, so that `claude plugin update` finds the new version.

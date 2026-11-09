# claude-code-mods

Six mods for [Claude Code](https://claude.com/claude-code) that show what is happening in a session without getting in your way:

| Mod | Where it shows | What it does |
| --- | --- | --- |
| [**Tokachu**](#tokachu-context-pet) (`context-pet`) | Band above the prompt | A pet that grows and turns from green to red as the context fills up |
| [**Quotachu**](#quotachu-usage-limit-pet) (`quotachu`) | Band above the prompt | A pet that shrinks as you use your 5-hour limit and turns red when you use it faster than time goes by |
| [**usage-meter**](#usage-meter) | Status line under the prompt | Your 5-hour and 7-day usage limits, with warnings at 80% and 95% |
| [**turn-notify**](#turn-notify) | Desktop notification | Tells you when a turn of one minute or more is done |
| [**changed-files**](#changed-files) | Side pane | The files that differ from HEAD, as `git diff` shows them, with added and removed lines |
| [**pr-checks**](#pr-checks) | Side pane | The GitHub checks of the current branch's pull request: failed, running, passed |

The mods work together: each one uses a different part of the screen, and the two panes show as tabs of the side pane. You can install all of them or only the ones you want.

## Installation

You need a Claude Code version that supports mods (plugins with function hooks). The mods are tested with Claude Code 2.1.295.

Add the marketplace, then install the mods you want:

```bash
claude plugin marketplace add RenaudLavoisier/claude-code-mods

claude plugin install context-pet@claude-code-mods --scope user
claude plugin install quotachu@claude-code-mods --scope user
claude plugin install usage-meter@claude-code-mods --scope user
claude plugin install turn-notify@claude-code-mods --scope user
claude plugin install changed-files@claude-code-mods --scope user
claude plugin install pr-checks@claude-code-mods --scope user
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
- **Other mods in the band:** Tokachu keeps what another mod draws in the band and shows it on its right, or under it when the band is too narrow.

## Quotachu (usage-limit pet)

Quotachu lives above the prompt and eats your 5-hour usage limit. It starts big and gets smaller as you use the limit. Its color says whether you use the limit faster than the window's time goes by.

```text
 (\_________/)    Quotachu · 5h 97% left
(     ^w^     )   5h 3% used / 4% of window · resets in 4h48
(             )   7d 41% used / 70% of window · resets in 2d2h
(             )   plenty of snacks
 \___________/

 (\___/)   Quotachu · 5h 12% left
(  >_<  )  5h 88% used / 61% of window · resets in 1h57
 \_____/   7d 63% used / 80% of window · resets in 1d9h
           starving, empty in ~25m
```

- **Size:** the body shrinks from 13 to 5 cells wide and from 2 rows of belly to none as the 5-hour limit goes from 0% to 100% used. It never takes more rows than the space above the prompt allows.
- **Pace:** the share of the limit used, against the share of the 5-hour window already gone. `30% used / 40% of window` is on pace.
- **Color:** green when the usage is at or behind the pace, yellow at 10 points ahead, red at 20 points ahead or more. These are the colors and gradient of Tokachu. Without a reset time, the share used drives the color.
- **Face and mood:**

  | 5-hour limit | Face | Mood |
  | --- | --- | --- |
  | At or behind the pace | `^w^` | plenty of snacks |
  | Up to 10 points ahead | `o_o` | nibbling fast |
  | More than 10 points ahead | `>_<` | starving, empty in ~N (when the limit runs out before the reset at the current rate) |
  | 100% used | `x_x` | out of snacks, back in N |

  While Claude works, the mood line shows `munch munch…`.
- **7-day limit:** one text line under the 5-hour one, when Claude Code reports it.
- **Updates:** when Claude Code measures the usage limits, and every minute, since the pace changes with time.
- **Alert:** when the 5-hour limit turns red, a toast says, for example, `Quotachu is starving: 5h limit at 80%, resets in 3h00`. It fires again only after the limit goes back to yellow or green.
- **No usage limits:** on a plan without usage limits, or until the first API response of the session, Quotachu draws nothing.
- **With Tokachu:** both pets share the band, side by side, or one under the other when the band is too narrow.
- **`/quotapet`:** hides or shows Quotachu (`Quotachu is taking a nap.` / `Quotachu is back.`).

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

A side pane that lists the tracked files that differ from `HEAD` in the session's git repository, as `git diff` and `git status` show them:

```text
+12 -3 app/src/core/tasks.py
+40 -0 app/tests/test_tasks.py added
+0 -25 app/legacy.py deleted
bin logo.png

4 files · +52 -28 · press a file to mention it
```

- **What it lists:** the staged and unstaged changes against `HEAD` (`git diff HEAD`). Untracked files are not listed: `git add` a new file to see it. The list shows every change in the repository, whoever made it: Claude, you in your editor, or a shell command.
- **Counts:** `+N` lines added and `-N` lines removed, then `added` or `deleted` when the file is not only modified. `bin` marks a binary file. Paths are relative to the session's directory.
- **Updates:** right after Claude runs `Edit`, `Write`, `NotebookEdit` or `Bash`, when you type `/changes`, and every 5 seconds while the pane is open. Git runs with `--no-optional-locks`, so these reads never block your own git commands.
- **Opening:** the pane opens once per session, the first time Claude changes a file while the repository has changes, if the terminal is 144 columns wide or more. In a narrower terminal, a message tells you to type `/changes`, which opens the pane at any width.
- **Mention a file:** press a file to insert `@path` in the prompt.
- **Outside a git repository:** the pane says `Not in a git repository.`

## pr-checks

A side pane that shows the GitHub checks of the pull request of the current git branch:

```text
PR #3021
feat(core): Log caller and force flags of task API launches
✓ 14 ✗ 1 ● 2 ○ 2

✗ Run linters
● Run unit tests
● Run functional tests
✓ Run Sonarqube analysis
…

↻ refresh
```

- **Requirements:** the [GitHub CLI](https://cli.github.com/) (`gh`), logged in with `gh auth login`. The mod runs `git branch --show-current`, `gh pr view` and `gh pr checks`.
- **What it lists:** every check, failed (`✗`) and cancelled (`⊘`) first, then running (`●`), passed (`✓`) and skipped (`○`). `PR #N` and each check name are links to GitHub.
- **Updates:** when the session starts, at the end of each turn, and when you press `↻ refresh`. In between, every 30 seconds while a check runs or after you change branch, else every 2 minutes.
- **Toast:** when the running checks are done, a toast says `PR #N: all checks passed` or `PR #N: N checks failed`.
- **Opening:** the pane opens once per session, the first time the branch has a pull request, if the terminal is 144 columns wide or more. In a narrower terminal, a message tells you to type `/pr-checks`, which opens the pane at any width.
- **`/pr-checks`:** opens the pane and lists every check with its link in the conversation, so you can ask Claude to fix a failing one.
- **No pull request:** the pane says `No pull request for branch <branch>.` If `gh` fails, the pane shows the error.

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

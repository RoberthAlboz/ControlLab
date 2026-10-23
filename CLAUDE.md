# ControlLab / ForgeLab — instruções para o agente

## Task observer (ativação)

Before the first tool call of any session — and before writing or
proposing a plan, not merely before executing one — invoke the
task-observer skill AND execute its Session Start Protocol (storage
check, frontmatter scan, review trigger). Loading the skill and running
the protocol are separate steps; a session that loads the file and stops
has activated nothing. Any turn that will involve a tool call counts; do
not classify the session as "too simple" from its opening message.
A step you did not run is reported before the answer, in one line — never
after it, where it reads as a suggestion. If the skill does not resolve on
this turn, say which probe told you so (the skill listing, or the skill
directory on disk), re-check the listing on every later turn that makes a
tool call, and run the protocol the first time it resolves — a "not
installed" verdict holds for one turn.

Select skills on the DECISION the request is about, not on the artefact it
arrived as. Name what the user is deciding, then match the installed skill
descriptions against that — a request handed over as a file to review
still needs the skill whose description names its subject.

After completing each task, list the observation records written this
session in the same turn and report a one-line summary from that listing
(ids and titles, or "none logged and why") — never from memory of
writing them. This is the activation backstop: it forces a look at the log,
so a session that silently skipped the protocol is discovered at the
first task boundary instead of never.

Paths are computed per machine, never hard-coded (this file is versioned
and runs on more than one computer). Every command below starts with
these two assignments, which resolve to the MAIN checkout even from inside
a git worktree (via the common git dir), so a worktree never shards the log:
  REPO="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
  WS="$HOME/.claude/projects/$(printf '%s' "$REPO" | sed 's/[^A-Za-z0-9]/-/g')"
$REPO is the repository root; $WS is the task-observer workspace (the
Claude Code project folder for this repo on the current machine). If
"$WS/skill-observations" does not exist, run the skill's workspace-creation
step there — a new machine starts with an empty log.

Loading a skill is not complete until you have queried the observation
log for OPEN observations naming it and read their bodies:
  REPO=...; WS=...; find "$WS/skill-observations/observation-log" -maxdepth 1 \
    -name '*.md' -exec grep -l "skill:.*<skill-name>" {} +
(<skill-name> is the bare name: drop a plugin: prefix, up to the last
colon. A qualified pattern misses every entry filed under the bare name
and reports a clean zero; the bare one matches both spellings.)
Apply their insights to the current work — meaning: let them change what
you do in THIS task. Editing the skill file, or writing the rule into any
other file a later session reads, is acting on the observation and waits
for the review. Run this at every skill load, however many skills load
in one session.

Where scripts run, the lookup and its checkpoint line are one command:
  REPO=...; WS=...; bash "$REPO/.claude/skills/task-observer/scripts/skill-load.sh" "$WS" <skill-name>
The Skill invocation and that call are ONE batch — emit them together,
one call per skill loaded, never the call in a later batch.

The task-observer workspace for this project is $WS (on this school
machine it resolves to
C:/Users/Dev_2o_Ano/.claude/projects/c--Users-Dev-2o-Ano-Documents-ControlLab).
Every path the skill uses derives from that root and nothing else:
  .../skill-observations/observation-log/   (the log)
  .../skill-observations/cross-cutting-principles.md
  .../skill-updates/                        (staging root)
  .../skill-updates/PENDING.md              (staging manifest)
Never resolve any of them from the current working directory. Never place
the workspace inside a skills-discovery directory. If more than one agent
works this project on one machine, $WS is the single shared location
there; each machine keeps its own log (logs do not travel with git).

The user's repositories live under the parent folder of $REPO.

A subagent dispatched by a session that already runs this protocol does
not run it again and does not write to the log; it reports what it
noticed and the controller writes it.

An observation file comes into being only through
  REPO=...; WS=...; bash "$REPO/.claude/skills/task-observer/scripts/new-observation.sh" <slug> "$WS"
which prints the path to write into. Never by copying another file's
header or counting a listing — including on the turn after a compaction.
Run these from Git Bash (the Bash tool), not PowerShell.

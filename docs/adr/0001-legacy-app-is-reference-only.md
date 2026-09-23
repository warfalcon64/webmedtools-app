# 0001. The legacy Java app is reference only, and goes when the MVP ships

Date: 2026-09-22

## Context
The first WebMedTools (2023) is a Vaadin 24.2 + Spring Boot 3.1 app on Java 21. The owner is renewing it and does not
expect to keep Java, but wants the old code at hand until the new version works.

## Decision
The renewed app lives at this repo's root. The legacy app stays in `Webmedtools/` (Maven project at
`Webmedtools/webmedtools-app/app/`), git-ignored in `.gitignore`. It is read for behaviour only. Both share one
GitHub repo, `warfalcon64/webmedtools-app`: `main` is the renewed app, and the old history is on `legacy-java`.

## Consequences
Nothing here edits, builds into or depends on `Webmedtools/`, and its uncommitted work in progress is left as it is.
Its local clone still tracks `origin/main`, which is now the renewed app, so never pull or push from it.
Once the renewed MVP is finished, `Webmedtools/` and its `.gitignore` line are deleted.

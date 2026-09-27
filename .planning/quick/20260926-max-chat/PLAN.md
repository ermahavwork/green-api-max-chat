# MAX chat — plan
Source: recruiter Google Drive React v5 assignment, read in viewer 2026-09-26.
1. Verify MAX v3 REST contract and resolve phone to canonical chatId.
2. React + TypeScript SPA: credentials, chat list/new phone chat, text send/receive.
3. HTTP notification queue: single sequential poll, apply then acknowledge, deduplicate, abort on logout, bounded backoff. No silent send retries.
4. MAX-inspired simple interface, desktop and mobile, keyboard access. Explicit offline demo, separate from real API.
5. Tests with isolated fake API, build, dependency/secret scans; live round trip only if user provides a dedicated MAX instance and approved recipient.
6. Public GitHub + Pages, local setup guide, screenshots, private PDF resume and ready email text. Do not send email.

Reference lock: official web.max.ru login, MAX purple/blue identity, light surfaces, two-pane messenger, rounded bubbles, 44px controls. No unrelated landing sections. Icons use own SVG primitives, system fonts. Research examples reviewed for metadata, no third-party application code reused.

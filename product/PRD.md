# Academic OS: Product Requirements Document

| | |
|---|---|
| **Product** | Academic OS, a desktop workspace for MBA students |
| **Status** | Built and in daily use by its builder; phased roadmap |
| **Primary user** | A full-time MBA student with a dense, frequently changing schedule |

---

## 1. Problem

MBA students juggle a weekly timetable that arrives as an emailed Excel file (with mid-week revisions), notes, tasks, attendance rules and project deadlines across several disconnected tools. Re-entering the timetable by hand every week takes time and invites mistakes, such as a missed class or a revision not caught.

## 2. User and jobs to be done

**Persona:** an MBA student taking 5–6 courses, with case competitions and club work on top.

| When I… | I want to… | So I can… |
|---|---|---|
| get the weekly timetable email | have my calendar update itself | stop copying classes by hand |
| get a revised timetable mid-week | see only the changed classes move | trust my calendar |
| sit in class | take structured notes fast, even offline | find them later by subject |
| plan my week | see classes, tasks and deadlines in one place | not miss anything |
| worry about attendance | see my % per subject | stay above the minimum |
| prepare for placements | practise SQL, Python and interview answers | improve without paid tools |

## 3. Goals and success metrics

| Goal | Metric | Target |
|---|---|---|
| Zero manual timetable entry | % of weekly timetables imported without edits | > 90% |
| Calendar trust | Revisions reflected in the calendar | Same day |
| Speed | Time for any click to show on screen | Instant (local), with no network wait |
| Reliability | Data lost after a crash or corruption | None (backups and self-repair) |
| Habit | Days per week the app is opened | Daily |

## 4. Requirements

| ID | Requirement | Priority |
|---|---|---|
| T1 | Import the timetable from the college email automatically and create calendar events | P0 |
| T2 | Handle mid-week revisions: remove the old event, add the new one | P0 |
| T3 | Manual `.xlsx` import as a fallback, with no AI involved | P0 |
| N1 | Folder-based notes with rich text, search and undo on delete | P0 |
| K1 | Tasks with due date and priority; two-way Google Tasks sync | P1 |
| A1 | Subjects found from the timetable; per-session attendance and a running % | P1 |
| P1 | Projects with deadline, team and stage, linked to a subject | P1 |
| G1 | News stories for group-discussion prep, with AI notes, on a capped schedule | P2 |
| L1 | Offline SQL and Python practice with automatic checking | P2 |
| W1 | Desktop widgets and a quick-capture shortcut | P2 |

**Non-functional:** works offline; no secret keys inside the desktop app; each user sees only their own data; stays within free tiers (Supabase, Gemini).

## 5. Out of scope (for now)

Native mobile app (a phone web app is planned), multi-user collaboration, LMS integrations.

## 6. Risks and how they're handled

| Risk | Mitigation |
|---|---|
| The timetable email format changes | Gemini handles format variation; the manual import is a fallback |
| Google sign-in tokens expire weekly while the Google app is in testing mode | A warning banner with renewal steps; publishing the app is a planned fix |
| The free Gemini quota is shared between features | Timetable import gets priority and retries; news gives up quietly |
| The local database gets corrupted | Health check on start, daily backups, one-click self-repair |
| Prompt injection through news headlines | The AI may only pick from a numbered list the server built; it never returns links |

## 7. Roadmap

1. Phone access as an installable web app (planned)
2. Publish the Google app, ending the weekly token renewals
3. Exam-mode view: deadlines, attendance risk and readings for the week

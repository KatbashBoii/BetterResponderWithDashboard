# Email Auto-Responder: browser dashboard

## Install (once)
1. Close the project in UiPath Studio.
2. Copy these into `C:\Users\nisht\OneDrive\Documents\UiPath\EmailAutoResponderCopy`, replacing files when asked:
   - `Main.xaml` (replaced)
   - `CheckKeywords.xaml` (replaced)
   - `UpdateDashboard.xaml` (new)
   - `dashboard\` folder (new, contains `index.html` and `data\`)
3. Open the project in Studio and run `Main.xaml` as usual.

While the bot runs, Studio's **Output** panel shows a line for every step (for example "Spam check done - no spam detected", "Priority checked - normal priority", "Important email directed to department: IT Department", "Personalised email sent to ...") and a summary at the end.
When the run finishes, the dashboard opens in your default browser. To open it at any time, double-click `dashboard\index.html`.
It refreshes itself every 2 seconds, so you never need to reload it.

## What the dashboard shows
| Tab | Contents |
|---|---|
| Live | Bot status, a checklist of every auto-responder feature with this-run and all-time counts, counts for this run and all time, the email being processed with each step ticked off, and a live feed of messages such as "Spam email detected" and "Urgent email replied" |
| Emails | Every email the bot read, with filters (outcome, department, sentiment, urgent/spam, run) and a search box. Click a row to see the original email, AI analysis, routing, the reply, the emails sent for it and a step log. Export CSV |
| Sent mail | Every email the bot sent from your Gmail account (the ones that arrive on your laptop): auto-replies, urgent replies, fallback replies, forwards and "Automation Complete" |
| Excel files | Both Excel files the bot uses, shown like Excel (column letters, real row numbers, sheet tabs at the bottom): `audit\audit table.xlsx` (the audit log, Sheet 1) and `KeywordsResponses.xlsx` (Sheet1, Spam, Urgent, Routing). The bot copies them in when it starts and copies the audit file again right after writing to it. Rows from the last run have orange row numbers. Search, sort, CSV download and an Open in Excel button. The Excel files themselves are unchanged and still written exactly as before |
| Bot history | One row per run: start time, duration, status, counts. Click a run to see its emails. Includes the runs already in `audit\audit table.xlsx`, and an "Import Excel audit…" button for newer rows |
| Rules | The Help Desk, Spam and Urgent keywords and the department routing that the bot read from `KeywordsResponses.xlsx` |
| Settings | Refresh speed, theme, default history range, show/hide Excel-imported rows, feed length |

## How it works
`UpdateDashboard.xaml` (one Invoke Code activity inside a Try Catch) is called at each step of `Main.xaml`.
It saves to `dashboard\data\bot-data.json`, plus `bot-data.js`, a copy the page can read straight from disk with no web server.
If writing ever fails, it logs a warning and the bot carries on.

- Turn off auto-open at the end: in Main.xaml, set the variable `openDashboardWhenDone` to `False`. To also open it when the run starts (to watch live), set `openDashboardOnStart` to `True`.
- Reset the history: delete the two files in `dashboard\data`.

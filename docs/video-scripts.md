# Video scripts

The scripts total about 10 minutes, at roughly 130 words per minute. Figures are from the live app with the default 09:50 cutoff; re-check them on screen before recording.

## Part 1: Customer presentation (target 4:30, hard max 5:00)

**[0:00, title screen / dashboard header]**
Your team buys power in the day-ahead market, one day before delivery. Whatever wind doesn't supply, you have to buy elsewhere, so every purchase relies on a wind forecast. This pilot answers two questions about January: which forecast did you actually have when you bought, and how far off was it?

**[0:30, decision strip]**
The key word is *actually*. The app recreates each purchase decision. For every delivery hour, it takes the latest national wind forecast published before the day-ahead auction closed, at 09:50 the day before. Anything published later is ignored, even if it was more accurate, because you didn't have it when you bought. For January, that was the 09:30 forecast every day.

**[1:10, KPI cards]**
Across 744 delivery hours, from 2 January to 1 February, every hour had both a forecast and an actual.
- The average miss was about 2,000 MW.
- More important is the direction. On average the forecast was **1,730 MW too high**, and too high on 28 of 31 days. In other words, less wind turned up than planned.
- In 8 hours out of 10, the error fell between −0.5 and +4.1 GW. That's the range to plan around, rather than the forecast alone.

**[2:00, forecast vs actual chart]**
Here's the month. The solid line is actual wind, and the dashed line is what you had at decision time. The dashed line sits above the solid one through most of the month. The shaded band shows where actual output landed in 80% of hours. I'll zoom into a week… and click an hour.

**[2:40, interval detail, then error charts]**
For this hour, the forecast came from the run published at 09:30 the day before, 19.5 hours ahead, and it was 6 GW too high. The error chart shows misses over time; red means the forecast was too high. The histogram shows the whole picture: most hours sit to the right of zero.

**[3:20, daily chart, click 11 Jan, table sorted by error]**
Some days are much worse than others. Clicking 11 January shows a day when the forecast was nearly 5 GW high all day. The table lists every hour; sorted by error, it surfaces the worst misses for review.

**[3:50, cutoff selector]**
You can also test your own timing. Using the earlier EPEX auction at 09:20 means relying on an older forecast, and the error grows slightly. At 15:30 it shrinks. The app always shows what was knowable at the time you choose.

**[4:15, close]**
This is a pilot on one month of national wind data. It measures forecast error in megawatts; it does not estimate cost, and it doesn't explain *why* the forecast ran high. Natural next steps are adding prices to put a pound figure on the error, testing whether the bias holds in other months, and extending to solar.

## Part 2: Technical review (target 4:45, hard max 5:00)

**[0:00, README architecture diagram]**
The app is a React frontend and a FastAPI backend on one origin; on Vercel the API runs as a Python function. The backend makes two upstream calls, FUELHH and WINDFOR stream, caches the raw data in memory, and serves one endpoint, `/api/analysis`. Every chart and table reads from that single response, so the views can't disagree.

**[0:35, data findings]**
I profiled the real payloads before writing the client.
- FUELHH is half-hourly average MW; January had 1,488 rows with no gaps.
- WINDFOR is **hourly**, with about 8 runs a day, each looking roughly 66 hours ahead.
- That resolution mismatch decides the join. I compare hourly: each forecast against the mean of the two half-hours in that hour. The alternative, using only the on-the-hour half-hour, moves MAE by under 1%.

**[1:15, selection.py]**
This is the core. `decision_cutoff` builds D-1 at 09:50 in Europe/London and converts it to UTC, so it handles clock changes. `select_day_ahead_forecasts` drops null values and anything published after each interval's own cutoff, then takes the latest remaining run. Conflicting values within one run are resolved the same way whatever the input order, and flagged.

**[1:55, service.py, forecast_publish_range]**
One real bug surfaced during development. My first sample fetch ended too early, and selection silently fell back to older runs. So the fetch window now runs from 4 days before the period to the end of the last D-1, and the docstring explains why.

**[2:20, metrics.py]**
Joining is done against a generated list of expected hours, so gaps appear as statuses, never as zeros. The metrics are MAE, RMSE, bias, coverage, linearly interpolated percentiles, and MAPE, which skips hours with low actual output. The error convention is forecast minus actual throughout.

**[2:50, elexon.py and main.py]**
The client validates every row. Bad rows are dropped and counted, and duplicate actuals keep the latest publish time. Timeouts, HTTP errors, rate limits and empty months all become a 503 with the reason. If data was already loaded, a failed refresh serves the cached data with a warning. Inputs are validated at the route, so bad input returns 422.

**[3:20, terminal: pytest, vitest]**
- 45 backend tests, all passing. They cover the cutoff boundary, both clock changes, duplicates, gaps, exact metric values and upstream failures, using a stub client.
- 8 frontend tests cover the loading, error, partial and empty states.
- Beyond the tests, I checked the live API's numbers against an independent script run on the same Elexon payloads, and they matched.

**[3:55, frontend code]**
One filter state in `App` drives a fetch hook, which cancels a superseded request when filters change. Times are UTC in the API and UK local in the UI. The chart colours were checked for colour-blindness, and forecast versus actual also differ by line style.

**[4:20, limitations]**
- The cache is per instance, so a serverless cold start costs about 1.5 seconds.
- The 80% range is in-sample.
- The bias is unexplained with this data.
- The Docker images still need a build check outside my sandbox, which couldn't reach Docker Hub.
- AI assistance is disclosed in the README.

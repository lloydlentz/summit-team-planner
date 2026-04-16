# summit-team-planner

A GitHub Pages-friendly client-side app to plan conference attendance for your team.

## Features

- Fetches sessions from the provided JSON endpoint
- Groups sessions by session type
- Filters sessions by day, time, and session type
- Tracks personal interest and personal attendance choices
- Tracks team attendance assignments per session
- Saves notes/comments per session
- Keeps endpoint and team-member editing controls in a collapsible Settings panel
- Persists planner data in browser `localStorage` (stateless hosting model)

## Usage

Open `index.html` (or host with GitHub Pages). The app will automatically load sessions from:

`https://slate-partners.technolutions.net/manage/query/run?id=8b7142c2-6c70-4109-9eeb-74d2494ba7c8&cmd=service&output=json&h=b0203357-4804-4c5d-8213-9e376263af44`

If loading fails in your environment, the page falls back to sample sessions so planning can still be demonstrated.

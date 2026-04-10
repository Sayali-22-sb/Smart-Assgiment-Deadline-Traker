# Smart Ass. tracker  — Smart Assignment Deadline Tracker

## Quick Start
```bash
pip install -r requirements.txt
cp .env.example .env        # add your ANTHROPIC_API_KEY
python app.py
```
Open http://localhost:5000 — click "Try Demo Account" to explore.

## Features
- Login / Register with session auth
- Course + Assignment CRUD (SQLite)
- AI Priority Ranking with written reasoning
- Day-by-day Study Planner
- Grade Impact Simulator (slider-based)
- Deadline Collision Detector + early-finish suggestions
- Group Project Subtask Coordinator
- Google Calendar Sync (UI)
- Weekly Productivity Dashboard

## Stack
Python · Flask · SQLite · SQLAlchemy · Anthropic Claude API · Vanilla JS · CSS

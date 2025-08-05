# AnkiWait

Chrome extension that enforces spaced repetition learning before allowing access to distracting websites.

## Why It Exists

Mindless browsing destroys productivity and focus. This extension turns procrastination triggers into learning opportunities by requiring users to complete Anki flashcard reviews before accessing time-wasting sites like social media.

## What Makes It Interesting

- **Behavioral psychology**: Cleverly hijacks the dopamine loop of social media addiction to reinforce learning habits
- **Seamless integration**: Works with existing Anki desktop application and card collections
- **Smart intervention**: Only blocks access when Anki reviews are actually due, avoiding unnecessary friction
- **Habit formation**: Creates positive associations between distraction impulses and productive learning

## Tech Stack

- **Platform**: Chrome Extension (Manifest V3)
- **Integration**: Anki desktop application communication
- **Storage**: Chrome extension local storage
- **UI**: Custom blocking pages with learning progress

## How to Run

```bash
git clone https://github.com/lancejohnson/AnkiWait.git
cd AnkiWait

# Load extension in Chrome
1. Open Chrome > Extensions > Developer mode
2. Click "Load unpacked"
3. Select the AnkiWait directory
4. Configure blocked websites in extension options
```

## Demo

Install extension and try visiting Reddit/Facebook when Anki reviews are due - you'll be redirected to complete flashcards first.

## Status

MVP - Functional prototype demonstrating the core behavioral intervention concept.

## Notes

Forked from <https://mindfulbrowsing.org> and modified to integrate with Anki's spaced repetition system. Represents a novel intersection of productivity tools and learning psychology.

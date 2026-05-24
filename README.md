# Heat Index

A mobile-friendly fitness scoring system for tracking strength, conditioning, and consistency across a deployed unit.

## Overview

Heat Index allows users to log performance across key events, convert results into points, and track a total fitness score over time. The system rewards improvement and well-rounded fitness across strength, grip, speed, and conditioning.

## Events

- Squat (3RM with allometric bodyweight scaling)
- Incline bench (3RM with allometric bodyweight scaling; women may use dumbbells)
- Pull-ups / dead-bar hang with allometric bodyweight and added-load scaling
- 40-meter dash
- 1.64-mile run or 2000m row

## Features

- Log qualifying PRs at any time (no single test day)
- Automatic score calculation  
- Leaderboard tracking  
- Simple, mobile-first interface  

## How to Use

1. Enter bodyweight and event results
2. Scores are calculated automatically  
3. Update qualifying PRs anytime — best results are retained

## Scoring

Each event is converted into points using a tiered system from Cub to Mamba. Only event scores achieved from May 1 through June 18, 2026 count. Squat, incline bench, and pull-ups / hang use allometric scaling so bodyweight matters without requiring heavier athletes to perform pound-for-pound more. Scores can continue above Mamba, and the final Heat Index score is the average of all five event scores. Run and row are alternatives, but row standards are intentionally tougher to prioritize running in heat and field conditions.

## Project Structure

```text
index.html              Page markup and Firebase script includes
src/styles.css          App styles
src/app.js              Scoring, Firebase, leaderboard, and UI logic
assets/icons/           App icons and touch icons
assets/images/          Route and champion images
assets/docs/            Source route PDF
site.webmanifest        PWA manifest
```

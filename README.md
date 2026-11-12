# Pit Wall

A browser game where you run a racing team. You never drive the car. You make the decisions, and the races play out from them.

- **Factory:** research upgrades to Aero, Engine, Chassis, Reliability and Tire Wear within a development budget cap. Safe projects always deliver. Bold ones gain more but can fail in testing.
- **Team:** sign drivers from a market of 30 (pace, racecraft, consistency, tire management, wet skill, morale, age), and hire a Technical Director, Head of Aero, Head of Engines, Race Engineer, Pit Crew Chief and Commercial Director. Each one changes how the game plays.
- **Sponsors:** deals pay per race, plus bonuses for goals like "finish in the top 6" or "beat Team X".
- **Race weekend:** pick a downforce setup for the circuit and a qualifying engine mode, check the weather radar, choose a tire strategy (the race engineer recommends one), then run the race live on a track map with a TV-style timing tower and broadcast banners. Call pit stops, tire compounds, push or save modes, and team orders while safety cars, rain (forecast a few laps ahead by the radar), crashes and breakdowns happen around you. A lap chart afterwards shows how the race unfolded.
- **Paddock decisions:** between races, deal with unhappy drivers, rivals poaching your staff, sponsor promo days, shady data offers and more. Every choice has a trade-off.
- **Real circuits:** 12 rounds on real track layouts (Sakhir, Spielberg, Monaco, Barcelona, Silverstone, Monza, Suzuka, Mexico City, Austin, Singapore, Spa, Abu Dhabi), each with its own character: tire wear, rain risk, how hard overtaking is, and whether it rewards aero, engine or chassis.
- **Seasons:** a mid-season rule change, prize money by championship position, contract renewals, driver aging, and new regulations each year.
- **Learn as you go:** a first-time walkthrough highlights each part of the game as you reach it, and a How to Play guide is always one tap away (the ? button).

You start as the slowest team on the grid. In testing, a sensible player scores first points in season one, reaches the top five in season two, and can win the title in season three.

Teams, drivers and sponsors are fictional. Unofficial fan game, not affiliated with Formula 1 or any team, driver or circuit.

Driver portraits were generated with Google Gemini and the car renders with ChatGPT, then cropped and cut out for the game (`img/`). All depicted drivers are invented characters.

Track outlines come from the open [f1-circuits](https://github.com/bacinger/f1-circuits) dataset by Tomislav Bacinger, used under the MIT License (see `licenses/`).

## Run it

No build step. Serve the folder and open it:

```bash
python3 -m http.server 8790
```

Then go to http://localhost:8790. Progress saves to the browser automatically.

## Files

- `js/tracks.js`: real circuit outlines
- `js/data.js`: teams, drivers, circuits, research tree
- `js/game.js`: career state, money, research, staff, drivers, sponsors, seasons
- `js/race.js`: qualifying, strategy presets, race simulation, track drawing
- `js/ui.js`: screens, input and sound
- `js/help.js`: first-time walkthrough and How to Play guide
- `css/style.css`: broadcast-style dark theme
- `img/drivers/`, `img/cars/`: AI-generated portraits and car renders

Built by vibe coding with Claude.

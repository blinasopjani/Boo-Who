# Boo Who?

**A 3D Halloween game powered by machine learning.** Hooded monsters walk out of a dark, dead forest toward your village gate. Ask up to four questions, turn over the monster cards that do not fit, and name the monster before it reaches the gate.

**[Play it here](https://blinasopjani.github.io/Boo-Who/)**

## Version 2 (in progress)

Boo Who? is turning into a 3D horror game. **Part 1: look and sound** is done:

- A dark, cold night with low ground fog, moonlight, film grain, a vignette and a slight projector flicker
- A real soundscape: wind, creaking trees, distant crows, footsteps that grow louder, a heartbeat when a monster is close and a sting when it is revealed (starts when you press Start)
- A specific horror setting: an abandoned village with one lit window, a crooked cemetery and a ruined chapel, a dead forest, a dark river under an old stone bridge, a swamp, a crypt and mountains on the horizon
- Human-shaped monsters built from free 3D models and animated in code: a rotting, blood-soaked zombie, a green-skinned witch, a see-through ghost, a pale caped vampire and a bandaged mummy
- Real 3D weapons (shovel, holy water, salt, garlic stake, fire torch) on the buttons and in your hands, with no emoji

**Part 2: questions and monster cards (Guess Who)** is done:

- You watch from behind your village gate, with its two lanterns and the Owl on the left post. The real monster walks down the path, hidden under dark rags and a hood. You have 4 questions, one per body part: face (rot), hands (blood), shadow (size) and eyes (glow colour). Click the body part or a question button: a spyglass zooms in, and only that part of the real monster comes into focus (face: the head, hands: arms and hands, shadow: legs and true size, eyes: the glow colour)
- Five monster cards sit at the bottom. Each card shows its monster's **rules**: for each question, the levels that monster can have (lit boxes). The answer is marked on every card, and cards that do not match turn over and say why (for example "Rot: not some")
- Fewer questions means more points, and the monster keeps walking, so every question costs time
- **The Owl** tells you the best question to ask next. If two cards still fit after all four questions, it tells you which monster is more common for those answers
- From night 3, **tricksters** break one of their own rules. A wrong guess on one costs nothing, and a right guess scores double
- Its own sounds for a right answer (rising bells) and a wrong one (a sour falling buzz), plus a glow pulse on each body part you ask about, a floating score, fireflies and lightning with thunder
- The disguised monster is drawn **blurred**, so its shape gives little away. Each answer brings only that part into focus (face, arms and hands, legs, eyes); the body, the cape and the witch's hat stay hidden until you pick a card
- Music that speeds up as the monster gets closer to the gate
- On Halloween the last monster is **the Monster King**: bigger, glowing red, worth triple points, and a wrong guess costs 2 lanterns
- A best scores table (top 5 and today's record) on the end screen, kept in your browser
- A streak multiplier (up to x5), a jump scare at every reveal, and a market at dawn (mend the gate, cheaper Owl, a sleeping draught that slows the next night)
- Earlier ideas (hair and aura clues, lantern oil, odds on the cards) were removed: the data showed hair and aura barely tell monsters apart, and players could not see why cards turned over

Next: more polish (a guided first night, lighter effects for older phones).

## How it plays

- 5 nights, each harder than the last, ending on Halloween
- 5 monsters: Zombie, Witch, Ghost, Vampire, Mummy, each with its own weapon
- 4 questions with 4 answer levels each: rot (none, little, some, lots), blood (clean, spots, stained, soaked), size (short, medium, tall, giant) and glow (green, grey, purple, white)
- **The rules on the cards** come from the data (notebook 04). For monsters that follow their rules, the four answers leave exactly one card 91% of the time
- The gate has 5 lanterns. A wrong card or a monster reaching the gate costs one. Lose them all and you lose. Survive Halloween and you win

Controls: click a body part or a question button to ask, keys 1 to 5 pick a card, O asks the Owl, P or Esc pauses. On a phone, tap. Works on desktop and phone.

## The machine learning behind it

The game is built on a real dataset of 37,497 labeled monsters.

| Step | What happened | Result |
| --- | --- | --- |
| Cleaning | Checked ranges, fixed 1 impossible value, kept natural outliers, encoded color | [cleaning report](reports/cleaning_report.md) |
| Model comparison | Logistic regression, random forest, LightGBM, neural network, 5-fold cross-validation | LightGBM wins |
| Final model | Tuned LightGBM, tested on 7,500 unseen monsters | **88.9% accuracy, 0.86 macro-F1** |
| The Owl | 6 small neural networks, one per number of clues shown | 40% right with no clues, 89% with all 6 |
| Any-order clues (v2) | 63 small neural networks, one for every set of clues you could find | best 4 clues (glow, height, rot, blood) reach 89% |
| Monster rules (v2) | 4 questions cut into 4 levels, each monster's rule = the levels at least 15% of it has | 72% of held-out monsters follow their rules; for them one card is left 91% of the time |
| Browser check | JavaScript Owl compared with Python on 6,000 predictions | identical answers |

Rot and blood turned out to be the most useful clues, then glow colour and size. Hair and aura add almost nothing, so the game does not ask about them. The monsters in the game are the 7,500 held-out test monsters, so the model has never seen them.

## Project structure

| Path | What it holds |
| --- | --- |
| `docs/index.html` | The game, published by GitHub Pages |
| `web/index.html` | Same game, open it from your computer with a double-click |
| `web/src/` | Game source: `page.html` (screens), `world.js` (3D forest and monsters), `game.js` (rules) |
| `web/build.py` | Bundles the source, model and monsters into one page |
| `web/js/oracle.js` | Runs the Owl's neural networks in the browser |
| `web/data/` | The Owl's weights and the game's monsters |
| `web/assets/models/` | The CC0 3D models (compressed GLB), built into the page by `web/build.py` |
| `notebooks/01_data_cleaning.ipynb` | Phase 1: data checks and cleaning |
| `notebooks/02_modeling.ipynb` | Phase 2: model comparison, tuning, Owl, exports |
| `notebooks/03_owl_any_clues.ipynb` | v2: one network per clue set (used by the Owl) |
| `notebooks/04_monster_rules.ipynb` | v2: the question levels and each monster's rules shown on the cards |
| `data/` | Original CSV files and cleaned versions |
| `submission.csv` | Predictions for the 12,503 unlabeled monsters |
| `reports/` | Cleaning report and all charts |

## Run it yourself

```
pip install -r requirements.txt
```

Then run the notebooks in order (01, 02, 03, then 04). Notebook 02 takes about 10 minutes and needs Node.js for the final browser check. After changing anything in `web/src/`, rebuild the game with `python web/build.py`.

## Credits

3D models: [Quaternius](https://quaternius.com), released under CC0 (free to use for any purpose). The models are taken from the Quaternius packs as converted to GLB in [trebeljahr/quaternius-showcase](https://github.com/trebeljahr/quaternius-showcase): characters (Casual2, Witch, Medieval, Suit, Farmer), survival and RPG items (shovel, torch, potion, bag), dead trees, rocks, mountains and medieval village buildings. The garlic stake, the gate, the graves, the bridge and the crypt are built in code.

## Built with

Python, pandas, scikit-learn, LightGBM, matplotlib, and three.js for the 3D world.

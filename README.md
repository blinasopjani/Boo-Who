# Boo Who?

**A 3D Halloween game powered by machine learning.** Monsters walk out of a dark, dead forest toward your village gate. Clues about each one appear as it gets closer. Figure out what it is and pick the right weapon before it reaches the gate.

**[Play it here](https://YOUR-USERNAME.github.io/boo-who/)** (replace YOUR-USERNAME with your GitHub username once Pages is on)

## Version 2 (in progress)

Boo Who? is turning into a 3D horror game. **Part 1: look and sound** is done:

- A dark, cold night with low ground fog, moonlight, film grain, a vignette and a slight projector flicker
- A real soundscape: wind, creaking trees, distant crows, footsteps that grow louder, a heartbeat when a monster is close and a sting when it is revealed (starts when you press Start)
- A specific horror setting: an abandoned village with one lit window, a crooked cemetery and a ruined chapel, a dead forest, a dark river under an old stone bridge, a swamp, a crypt and mountains on the horizon
- Human-shaped monsters built from free 3D models and animated in code: a rotting, blood-soaked zombie, a green-skinned witch, a see-through ghost, a pale caped vampire and a bandaged mummy
- Real 3D weapons (shovel, holy water, salt, garlic stake, fire torch) on the buttons and in your hands, with no emoji

**Part 2: the lantern and the monster cards** is done:

- You watch a hooded stranger walk down the path and search it with a lantern. Hold the light on a body part to find a clue: head for hair, eyes for glow color, face for rot, hands for blood, its shadow for height. Put the lantern out to see the aura
- Five monster cards sit at the bottom, like Guess Who. Every clue flips down the cards it rules out, so you see the answer narrow. Click a card (or keys 1 to 5) to name the monster
- The lantern burns oil while it is on. Oil left at dawn is bonus points, and the market sells refills
- The Owl no longer guesses for you. It marks the body part to look at next, and from night 3 it also warns you when a monster is a trickster
- The cards still face up show how likely each monster is, and the most likely one is marked. When only one card is left it glows
- Early nights use monsters whose clues clearly point to what they are. Tricksters come later and less often, and a wrong guess on a trickster costs no gate lantern (a right one scores double)
- A streak multiplier (up to x5) for right answers in a row, and a jump scare when the monster is revealed
- The screen is kept simple: a slim top bar (night, distance, gate, coins, score), one message line in the middle, and a dock at the bottom with the clues, the cards, the lantern and the Owl

Next: Part 3 (excitement and polish).

## How it plays

- 5 nights, each harder than the last, ending on Halloween
- 5 monsters: Zombie, Witch, Ghost, Vampire, Mummy, each with its own weapon
- 6 clues, found with the lantern in any order: hair, aura, glow color, height, rot and blood
- **The cards** are driven by a trained neural network: a card flips down when the model gives that monster under 6% with the clues you have found
- **The Owl** on the gate uses the same networks to tell you which clue would help most right now
- From night 3, **tricksters** appear: real monsters the model gets wrong
- The gate has 5 lanterns. Lose them all and you lose. Survive Halloween and you win

Controls: aim with the mouse, L or right-click turns the lantern off, keys 1 to 5 pick a card, O asks the Owl, P or Esc pauses. On a phone, drag to aim and tap the cards. Works on desktop and phone.

## The machine learning behind it

The game is built on a real dataset of 37,497 labeled monsters.

| Step | What happened | Result |
| --- | --- | --- |
| Cleaning | Checked ranges, fixed 1 impossible value, kept natural outliers, encoded color | [cleaning report](reports/cleaning_report.md) |
| Model comparison | Logistic regression, random forest, LightGBM, neural network, 5-fold cross-validation | LightGBM wins |
| Final model | Tuned LightGBM, tested on 7,500 unseen monsters | **88.9% accuracy, 0.86 macro-F1** |
| The Owl | 6 small neural networks, one per number of clues shown | 40% right with no clues, 89% with all 6 |
| Any-order clues (v2) | 63 small neural networks, one for every set of clues you could find | best 4 clues (glow, height, rot, blood) reach 89% |
| Browser check | JavaScript Owl compared with Python on 6,000 predictions | identical answers |

Blood and rot turned out to be the most useful clues, so they sit on the hands and face, where the light has to reach. The monsters in the game are the 7,500 held-out test monsters, so the model has never seen them.

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
| `notebooks/03_owl_any_clues.ipynb` | v2: one network per clue set, for the lantern and the cards |
| `data/` | Original CSV files and cleaned versions |
| `submission.csv` | Predictions for the 12,503 unlabeled monsters |
| `reports/` | Cleaning report and all charts |

## Run it yourself

```
pip install -r requirements.txt
```

Then run the notebooks in order (01, 02, then 03). Notebook 02 takes about 10 minutes and needs Node.js for the final browser check. After changing anything in `web/src/`, rebuild the game with `python web/build.py`.

## Credits

3D models: [Quaternius](https://quaternius.com), released under CC0 (free to use for any purpose). The models are taken from the Quaternius packs as converted to GLB in [trebeljahr/quaternius-showcase](https://github.com/trebeljahr/quaternius-showcase): characters (Casual2, Witch, Medieval, Suit, Farmer), survival and RPG items (shovel, torch, potion, bag), dead trees, rocks, mountains and medieval village buildings. The garlic stake, the gate, the graves, the bridge and the crypt are built in code.

## Built with

Python, pandas, scikit-learn, LightGBM, matplotlib, and three.js for the 3D world.

# Boo Who?

**A 3D Halloween game powered by machine learning.** Monsters walk out of a fairytale forest toward your village gate. Clues about each one appear as it gets closer. Figure out what it is and pick the right weapon before it reaches the gate.

**[Play it here](https://blinasopjani.github.io/Boo-Who-/)**

## How it plays

- 5 nights, each harder than the last, ending on Halloween
- 5 monsters: Zombie, Witch, Ghost, Vampire, Mummy, each with its own weapon
- 6 clues appear one by one: hair, aura, glow color, height, rot and blood
- **The Owl** on the gate is a trained neural network. Pay coins to ask it. It only sees the clues you see, so asking early gives a vaguer answer
- From night 3, **tricksters** appear: real monsters the model gets wrong
- The gate has 5 lanterns. Lose them all and you lose. Survive Halloween and you win

Controls: keys 1 to 5 pick a weapon, O asks the Owl, P or Esc pauses. Works on desktop and phone.

## The machine learning behind it

The game is built on a real dataset of 37,497 labeled monsters.

| Step | What happened | Result |
| --- | --- | --- |
| Cleaning | Checked ranges, fixed 1 impossible value, kept natural outliers, encoded color | [cleaning report](reports/cleaning_report.md) |
| Model comparison | Logistic regression, random forest, LightGBM, neural network, 5-fold cross-validation | LightGBM wins |
| Final model | Tuned LightGBM, tested on 7,500 unseen monsters | **88.9% accuracy, 0.86 macro-F1** |
| The Owl | 6 small neural networks, one per number of clues shown | 40% right with no clues, 89% with all 6 |
| Browser check | JavaScript Owl compared with Python on 6,000 predictions | identical answers |

Blood and rot turned out to be the most useful clues, so the game reveals them last. The monsters in the game are the 7,500 held-out test monsters, so the Owl has never seen them.

## Project structure

| Path | What it holds |
| --- | --- |
| `docs/index.html` | The game, published by GitHub Pages |
| `web/index.html` | Same game, open it from your computer with a double-click |
| `web/src/` | Game source: `page.html` (screens), `world.js` (3D forest and monsters), `game.js` (rules) |
| `web/build.py` | Bundles the source, model and monsters into one page |
| `web/js/oracle.js` | Runs the Owl's neural networks in the browser |
| `web/data/` | The Owl's weights and the game's monsters |
| `notebooks/01_data_cleaning.ipynb` | Phase 1: data checks and cleaning |
| `notebooks/02_modeling.ipynb` | Phase 2: model comparison, tuning, Owl, exports |
| `data/` | Original CSV files and cleaned versions |
| `submission.csv` | Predictions for the 12,503 unlabeled monsters |
| `reports/` | Cleaning report and all charts |

## Run it yourself

```
pip install -r requirements.txt
```

Then run the notebooks in order (01, then 02). Notebook 02 takes about 10 minutes and needs Node.js for the final browser check. After changing anything in `web/src/`, rebuild the game with `python web/build.py`.

## Built with

Python, pandas, scikit-learn, LightGBM, matplotlib, and three.js for the 3D world.

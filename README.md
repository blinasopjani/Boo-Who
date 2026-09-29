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
- **Tutorial:** the first monster of your first game is a step-by-step guide with a coach box that points at what to press. The monster waits while you ask about its face, see the cards flip, ask one more question and play the last card; the next monster waits until you press Start. Replay it from How to play
- Fewer questions means more points, and every question makes the monster walk 10% faster, so each one is a real choice
- From night 3 you get only 3 of the 4 questions per monster
- A wrong card is not the end: the monster rushes 10 m closer and you get one more try (half points if you then get it right). Wrong again, or too late, and the gate loses a lantern
- At streak x3 and above, monsters walk 10% faster until you make a mistake
- **The Owl** (a neural network running in your browser) tells you the best question to ask, and after your last question which card is most likely. After every monster you see what it would have guessed with the same questions, and the end screen scores You vs the Owl
- From night 3, **tricksters** break one of their own rules. A wrong guess on one costs nothing, and a right guess scores double
- Its own sounds for a right answer (rising bells) and a wrong one (a sour falling buzz), plus a glow pulse on each body part you ask about, a floating score, fireflies and lightning with thunder
- The disguised monster is drawn **blurred**, so its shape gives little away. Each answer brings only that part into focus (face, arms and hands, legs, eyes); the body, the cape and the witch's hat stay hidden until you pick a card
- Music that speeds up as the monster gets closer to the gate
- On Halloween the last monster is **the Monster King**: bigger, glowing red, worth triple points, with no second chance, and a wrong guess costs 2 lanterns
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
| The Owl's brain (notebook 05) | One neural network with masked inputs (11 → 64 → 32 → 5) for any set of the 4 questions, trained on 479,952 rows (every monster × 16 question sets) | as accurate as 16 separate gradient boosted models: 56% with 1 answer, 72% with 2, 83% with 3, 89% with 4 |
| Smart questions | Expected information gain for each question in all 625 answer states | with 2 questions 84% right vs 72% asking at random |
| Explanations | Exact Shapley values from the 16 question sets | prior + contributions = final probability |
| Deployment | Exported to ONNX with skl2onnx, run in the browser with ONNX Runtime Web (WebAssembly), JavaScript fallback | Python vs ONNX difference below 0.000001 |

Rot and blood turned out to be the most useful clues, then glow colour and size. Hair and aura add almost nothing, so the game does not ask about them. The monsters in the game are the 7,500 held-out test monsters, so the model has never seen them.

## Inside the Owl's brain (notebook 05)

The player only sees a helpful Owl. Behind it is one neural network, trained in Python and shipped to the browser.

**One network for any set of questions.** A player can answer any 0 to 4 of the questions, in any order. Instead of 16 separate models, the Owl is a single network (11 inputs → 64 → 32 → 5 monsters, 3,013 weights). Each input has a mask bit that says whether that question was asked. During training every monster appears 16 times, each copy hiding a different set of answers (479,952 rows in total).

![One masked network matches 16 specialist models](reports/figures/owl_models.png)

On 7,500 monsters it never saw, the single network is as accurate as 16 separate gradient boosted models (56%, 72%, 83% and 89% right with 1, 2, 3 and 4 answers) and better than logistic regression.

**Which question to ask.** The Owl recommends the question with the highest expected information gain: the one that should remove the most uncertainty (entropy, in bits) before the answer is known. The notebook works this out for all 625 possible answer states. Rot removes the most on its own (about 1 bit), then blood (0.9), size (0.4) and glow (0.4).

![Asking the most informative question first pays off](reports/figures/owl_questions.png)

With 2 questions, the smart Owl picks the right monster 84% of the time against 72% when asking at random. With 3 questions (the limit from night 3) it gets 88% against 84%.

**What gives each monster away.** Exact Shapley values (possible because the network can answer all 16 question sets) show how much each answer pushes the Owl towards the right monster. Vampires are given away mostly by their low rot, glow colour matters for Witches more than for any other monster, and Mummies are the hardest: no single answer pushes strongly towards them, and they are the monster the Owl gets wrong most often (mistaken for Witches, Zombies and Vampires).

![What gives each monster away](reports/figures/owl_shapley.png)

**Running it in the browser.** The trained network is exported to ONNX with skl2onnx (a 13 KB file) and runs in the game with ONNX Runtime Web (WebAssembly). If WebAssembly cannot load, the same weights run in plain JavaScript. Python, ONNX and the JavaScript version agree to better than 0.00001. In the game, the Owl's belief is also adjusted with Bayes' rule, because the game sends Zombies less often than the dataset has them.

## Project structure

| Path | What it holds |
| --- | --- |
| `docs/index.html` | The game, published by GitHub Pages |
| `web/index.html` | Same game, open it from your computer with a double-click |
| `web/src/` | Game source: `page.html` (screens), `world.js` (3D forest and monsters), `game.js` (rules) |
| `web/build.py` | Bundles the source, model and monsters into one page |
| `web/js/brain.js` | Runs the Owl's network in the browser (ONNX Runtime Web, with a JavaScript fallback), information gain and Shapley values |
| `web/js/oracle.js` | The first Owl networks (notebook 02) |
| `web/data/` | The Owl's model (`owl_brain.onnx`, `owl_brain.json`), the card rules and the game's monsters |
| `web/assets/models/` | The CC0 3D models (compressed GLB), built into the page by `web/build.py` |
| `notebooks/01_data_cleaning.ipynb` | Phase 1: data checks and cleaning |
| `notebooks/02_modeling.ipynb` | Phase 2: model comparison, tuning, Owl, exports |
| `notebooks/03_owl_any_clues.ipynb` | v2: one network per clue set (used by the Owl) |
| `notebooks/04_monster_rules.ipynb` | v2: the question levels and each monster's rules shown on the cards |
| `notebooks/05_owl_brain.ipynb` | v2: the Owl's brain: masked neural network, model comparison, information gain, Shapley values, ONNX export and parity check |
| `data/` | Original CSV files and cleaned versions |
| `submission.csv` | Predictions for the 12,503 unlabeled monsters |
| `reports/` | Cleaning report and all charts |

## Run it yourself

```
pip install -r requirements.txt
```

Then run the notebooks in order (01 to 05). Notebook 02 takes about 10 minutes and needs Node.js for the final browser check. After changing anything in `web/src/`, rebuild the game with `python web/build.py`.

## Credits

3D models: [Quaternius](https://quaternius.com), released under CC0 (free to use for any purpose). The models are taken from the Quaternius packs as converted to GLB in [trebeljahr/quaternius-showcase](https://github.com/trebeljahr/quaternius-showcase): characters (Casual2, Witch, Medieval, Suit, Farmer), survival and RPG items (shovel, torch, potion, bag), dead trees, rocks, mountains and medieval village buildings. The garlic stake, the gate, the graves, the bridge and the crypt are built in code.

## Built with

Python, pandas, scikit-learn, LightGBM, matplotlib, skl2onnx and ONNX Runtime (Python and Web) for the AI, and three.js for the 3D world.

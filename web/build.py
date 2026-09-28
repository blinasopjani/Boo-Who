"""Builds Boo Who? into single HTML files with the model and monsters inlined.

Outputs
  web/index.html                  full page to open from your computer (double-click)
  docs/index.html                 same page, served by GitHub Pages
  web/dist/boo_who_page.html  page body for publishing as a claude.ai artifact
Run from the project folder:  python web/build.py
"""
import base64
import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / 'web'

model = json.loads((WEB / 'data' / 'oracle_model.json').read_text())
monsters = json.loads((WEB / 'data' / 'monsters.json').read_text())
owl_any = json.loads((WEB / 'data' / 'owl_subsets.json').read_text())
prep = json.loads((ROOT / 'data' / 'clean' / 'preprocessing.json').read_text())
train = pd.read_csv(ROOT / 'data' / 'monster_train.csv')

classes, colors = model['classes'], model['colors']
rows = [[classes.index(m['class']), round(m['height'], 3), round(m['rottingFleshPct'], 3), round(m['bloodCoverage'], 3),
         round(m['aura'], 4), round(m['hairLength'], 3), colors.index(m['color']), int(m['trickster'])] for m in monsters]

lore = {
    'Zombie': 'Graveyard shambler. The most rot and the most blood.',
    'Witch': 'Swamp flyer. Half rotten, little blood, glows green or purple.',
    'Ghost': 'Shortest, brightest aura, almost no blood. Usually glows white.',
    'Vampire': 'Tallest, longest hair. Bloodstained but barely rotten.',
    'Mummy': 'Tall and rotten. The rarest monster and the hardest to read.',
}
color_share = (pd.crosstab(train['class'], train['color'], normalize='index') * 100).round(1)
journal = {c: {'lore': lore[c], 'means': prep['class_means'][c], 'colors': color_share.loc[c].to_dict()} for c in classes}

oracle_js = (WEB / 'js' / 'oracle.js').read_text().replace('export function', 'function')
MODEL_DIR = WEB / 'assets' / 'models'
USED_MODELS = ['Casual2', 'Witch', 'Medieval', 'Suit', 'Farmer', 'Shovel', 'Potion1_Filled', 'Bag', 'WoodenTorch_Fire',
               'CommonTree_Dead_1', 'CommonTree_Dead_3', 'BirchTree_Dead_2', 'Willow_Dead_1', 'Rock_Moss_2',
               'Bell_Tower', 'Mountain_Group_1', 'House_3', 'House_4']
model_data = {n: base64.b64encode((MODEL_DIR / f'{n}.glb').read_bytes()).decode() for n in USED_MODELS}

module = '\n'.join([
    "import * as THREE from 'three';",
    "import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';",
    "import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';",
    "import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';",
    "import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';",
    "import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';",
    "import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';",
    "import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';",
    'const MODEL_DATA = ' + json.dumps(model_data) + ';',
    oracle_js,
    'const ORACLE_MODEL = ' + json.dumps(model, separators=(',', ':')) + ';',
    'const OWL_ANY = ' + json.dumps(owl_any, separators=(',', ':')) + ';',
    'const MONSTER_ROWS = ' + json.dumps(rows, separators=(',', ':')) + ';',
    'const JOURNAL = ' + json.dumps(journal, separators=(',', ':')) + ';',
    (WEB / 'src' / 'world.js').read_text(),
    (WEB / 'src' / 'game.js').read_text(),
])
page = (WEB / 'src' / 'page.html').read_text().replace('/*__MODULE__*/', module)

(WEB / 'dist').mkdir(exist_ok=True)
(WEB / 'dist' / 'boo_who_page.html').write_text(page)
full = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '</head>\n<body>\n' + page + '\n</body>\n</html>\n')
(WEB / 'index.html').write_text(full)
(ROOT / 'docs').mkdir(exist_ok=True)
(ROOT / 'docs' / 'index.html').write_text(full)   # GitHub Pages serves this folder
print(f'index.html: {len(full) / 1024:.0f} KB ({sum(len(v) for v in model_data.values()) / 1024:.0f} KB of 3D models), {len(rows)} monsters, {len(model["stages"])} Oracle stages')

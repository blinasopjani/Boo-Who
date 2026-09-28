# Boo Who? · Phase 1 cleaning report

- Training monsters: 37,497 (all kept)
- Competition monsters: 12,503 (all kept)
- Features for the model: 9 (height, rottingFleshPct, bloodCoverage, aura, hairLength, color_green, color_grey, color_purple, color_white)

## Decisions

1. No missing values or duplicate rows in either file.
2. Train and comp ids overlap (both start at 1): files are kept separate and id is not a feature.
3. Classes are imbalanced (Zombie 40%, Mummy 10%): no resampling now; Phase 2 uses stratified splits, macro-F1 and class weights.
4. color has exactly 4 clean values (green, grey, purple, white) in both files; strong clue (79% of Ghosts are white).
5. Clipped percentages to 0-100: 1 train row changed (bloodCoverage -2.634 set to 0). Comp had none.
6. Outliers kept: extreme values are natural tails of a class (e.g. shortest monsters are all Ghosts); only 11 values are beyond 4 std and none are impossible.
7. Train and comp have the same distributions (all mean differences under 0.02 std): a model trained on train should work on comp.
8. No feature is redundant (highest correlation 0.56, height vs hairLength): all 5 numeric features kept.
9. color one-hot encoded into 4 columns (color_green, color_grey, color_purple, color_white).
10. Numeric features standardised with mean and std from train only, then applied to comp.

## Files created

- data/clean/train_clean.csv and comp_clean.csv: cleaned, color one-hot, original units
- data/clean/train_scaled.csv and comp_scaled.csv: same, numeric features standardised
- data/clean/preprocessing.json: scaler, ranges, class means (used by the game)
- reports/figures/: class_balance.png, color_by_class.png, features_by_class.png
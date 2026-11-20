# Style-level user study

**Question:** do people really rate Amazing and Astonishing sites higher than Basic and Good ones, and by how much?

This is the one part of Phase 8 that needs real people. Everything else (the sites, the data sheet, the analysis) is ready.

## 1. Who

- At least **15 people** who are not on the project team. More is better; 20 to 30 is comfortable.
- Mix of ages and comfort with computers. Students, family and friends of the team are fine, as long as they are not the builders.
- Nobody should be told which level they are looking at.

## 2. What they look at

Build the study sites (same content, only the style level changes):

```powershell
npm run registry:study-sites
```

This builds, under `sparc-ui/.generated/study/`, these sites:

| Site | Style levels |
|---|---|
| portfolio | basic, good, amazing, astonishing |
| landing | basic, good, amazing, astonishing |
| ecommerce | basic, good, amazing |
| booking | basic, good, amazing |

(Stores and booking sites stop at Amazing, so they have three levels.)

Each folder has a `dist/` you can host (for example drop it on Vercel) or preview on a laptop.
Give every site a random code (`A7`, `K2`, ...) in the link or the file name. Keep the table of code to level to yourselves, as the answer key.

## 3. How a session works (about 10 minutes)

1. Say: "I will show you some websites. Look around like you would on your own. Then give each one a number from 1 to 5 for **how good it looks and feels to use**."
2. Show the levels of one site **in a random order** for each person (use a shuffle; do not always show Basic first).
3. For each level, let them click around for about 30 seconds, then ask:
   - **Rating (1 to 5):** 1 = poor, 3 = okay, 5 = excellent.
   - Optional: "What did you like or dislike?" (one line).
4. Repeat for the other sites. Participants may rate any number of sites; **each person should rate every level of a site they rate**, so the comparison is fair.
5. Do not help, explain or react while they look.

Show phone-size and laptop-size to half the people each if you can, and write which in the comment column.

## 4. Write the answers down

One row per rating, in a CSV file (a template is in `docs/eval/ratings-template.csv`):

```csv
participant,site,style_level,rating,comment
p01,portfolio,basic,3,plain but clear
p01,portfolio,good,4,
p01,portfolio,amazing,5,loved the animations
```

Rules (the script checks them and tells you the line if something is wrong):

- `participant`: any short name or number. Not a real name.
- `site`: `portfolio`, `landing`, `ecommerce` or `booking`.
- `style_level`: `basic`, `good`, `amazing` or `astonishing`.
- `rating`: a whole number from 1 to 5.
- The same person rating the same site at the same level twice is an error.

## 5. Get the results

```powershell
npm run registry:study-report -- docs/eval/ratings.csv
```

You get:

- an **average, spread and 95% interval** per style level, and
- for every pair of levels, the **average difference** between the same person's ratings of the same site, an effect size, a p-value and the p-value after Holm's correction (six pairs are compared at once, so single p-values would look better than they are).

## 6. How to read it, and what to write

- A level is rated **reliably higher** than another when the adjusted p is below 0.05.
- With few people a real difference can look "not significant". Always write how many people and ratings the result is based on.
- Report the average per level even when the difference is small. "Amazing is liked 0.4 points more than Good (not reliable with 12 people)" is an honest result.
- Also compare with the size table in `docs/EVALUATION.md`: if Astonishing is liked only a little more but costs several times the download size, say so. That is the trade-off the style levels are about.

## 7. Ethics and honesty

- Tell people what it is for, that it takes about 10 minutes, and that they can stop at any time.
- Do not collect names, emails or photos. A participant code is enough.
- Do not delete low or odd ratings. Report them.
- This study measures looks and feel in a short look-around. It does not measure how easy it is to build a site with SPARC; that needs a different test (a person builds a site with the builder while timed).

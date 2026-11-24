# Iterative descriptors (RCDE): replay results

Module ranking for admin portals. 15 labelled portal requests, split in two halves: feedback is learned on one half and measured on the other (both ways, averaged). The simulated user keeps needed modules, removes unneeded ones and adds missing ones. Offline embedder, fixed clock: the replay gives the same numbers every time.

| Strategy | Round | Recall@5 | MRR | Precision | Recall | F1 | Different modules chosen |
|---|---|---|---|---|---|---|---|
| Static (today) | 0 | 1 | 0.965 | 0.664 | 1 | 0.798 | 19 |
| Static (today) | 1 | 1 | 0.965 | 0.664 | 1 | 0.798 | 19 |
| One-shot (learned once) | 0 | 1 | 0.965 | 0.664 | 1 | 0.798 | 19 |
| One-shot (learned once) | 1 | 1 | 0.965 | 0.664 | 1 | 0.798 | 19 |
| Iterative (RCDE) | 0 | 1 | 0.965 | 0.664 | 1 | 0.798 | 19 |
| Iterative (RCDE) | 1 | 1 | 0.965 | 0.664 | 1 | 0.798 | 19 |
| Iterative (RCDE) | 2 | 1 | 0.965 | 0.664 | 1 | 0.798 | 19 |
| Iterative (RCDE) | 3 | 1 | 0.965 | 0.664 | 1 | 0.798 | 19 |

Round 0 is before any feedback: it must equal the static row (cold start does no harm).

**Returning requests (upper bound).** The same kinds of requests come back, and feedback from every request is learned each round:

| Round | Recall@5 | MRR | Precision | Recall | F1 | Different modules chosen |
|---|---|---|---|---|---|---|
| 0 | 1 | 0.967 | 0.663 | 1 | 0.798 | 29 |
| 1 | 1 | 0.967 | 0.663 | 1 | 0.798 | 29 |
| 2 | 1 | 1 | 0.674 | 1 | 0.806 | 31 |
| 3 | 1 | 1 | 0.674 | 1 | 0.806 | 31 |

Precision = share of chosen modules the request really needs. "Different modules chosen" checks that evidence does not shrink the choice to a few favourites.

Limits: simulated users, not real ones; module ranking only (each room still has one standard component per style level, so component choice cannot change yet); a small labelled set.


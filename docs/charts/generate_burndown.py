"""
Zemen — Sprint Burn-Down Chart Generator
Run: python3 docs/charts/generate_burndown.py
"""

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import os

OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))

SPRINTS = [
    {
        "number": 1,
        "name": "Foundation & Authentication",
        "dates": "Week 1  (Mar 10 – Mar 14, 2025)",
        "total": 16,
        "items": [
            ("PB-01  Secure Auth",       5),
            ("PB-02  Google OAuth 2.0",  8),
            ("PB-03  Profile CRUD",      3),
        ],
        # Day 0 = sprint start (all points remaining)
        # Day 5 = sprint end  (0 remaining)
        # Pattern: Docker/schema done day 1, core auth day 2,
        #          Google OAuth struggled day 3, resolved day 4, profile day 5
        "actual": [16, 14, 9, 6, 3, 0],
    },
    {
        "number": 2,
        "name": "Date Conversion Engine & Event CRUD",
        "dates": "Week 2  (Mar 17 – Mar 21, 2025)",
        "total": 24,
        "items": [
            ("PB-04  Ethiopian–Gregorian Conversion", 8),
            ("PB-05  Event CRUD + Recurrence",         8),
            ("PB-06  Event Date Entry (Greg/Ethiopian)", 5),
            ("PB-07  Holiday Data Management",         3),
        ],
        # Conversion engine off-by-one issues caused day-2 slowdown;
        # CRUD moved fast; UI toggle done day 4
        "actual": [24, 22, 14, 9, 4, 0],
    },
    {
        "number": 3,
        "name": "Collaboration, Scheduling Engine, & Reminders",
        "dates": "Week 3  (Mar 24 – Mar 28, 2025)",
        "total": 55,
        "items": [
            ("PB-08  Role-Based Sharing",       8),
            ("PB-09  Optimistic Locking",      13),
            ("PB-10  Field-Level Diff",         8),
            ("PB-11  Smart Scheduling & Ranking", 13),
            ("PB-12  Ranked Slot Suggestions",  8),
            ("PB-13  Email Reminders",          5),
        ],
        # Heaviest sprint: sharing day 1, locking days 2-3,
        # scheduling algorithm days 3-4, ranking + reminders day 5
        "actual": [55, 47, 34, 20, 8, 0],
    },
    {
        "number": 4,
        "name": "Testing, UI Polish, & Deployment",
        "dates": "Week 4  (Mar 31 – Apr 4, 2025)",
        "total": 21,
        "items": [
            ("PB-14  Google Calendar Export",         5),
            ("PB-15  Pytest Suite (153 tests)",       8),
            ("PB-16  Postman Collection (126 tests)", 8),
        ],
        # Export done day 1; pytest written incrementally days 1-3;
        # Postman rerunnability fix day 3; polish + report days 4-5
        "actual": [21, 18, 13, 7, 3, 0],
    },
    {
        "number": 5,
        "name": "UI Polish & Recurrence Redesign",
        "dates": "Week 5  (Jun 9 – Jun 10, 2026)",
        "total": 26,
        "items": [
            ("PB-17  Calendar Tab Switch Reset",          3),
            ("PB-18  Apple-Style Repeat Section",        13),
            ("PB-19  Scroll Wheel Debug (3 iterations)", 5),
            ("PB-20  Dark Theme Dropdown Fix",            2),
            ("PB-21  UML & Burndown Updates",             3),
        ],
        # Condensed 2-day sprint (intensive UI session):
        # Day 1: tab-switch fix + full Repeat redesign scaffolding (13 pts delivered)
        # Day 2: scroll wheel debug iterations + dark theme fix + UML/burndown (13 pts)
        "actual": [26, 13, 0, 0, 0, 0],
    },
]

DAYS       = [0, 1, 2, 3, 4, 5]
DAY_LABELS = ["Day 0\n(Start)", "Day 1", "Day 2", "Day 3", "Day 4", "Day 5\n(End)"]

IDEAL_COL  = "#2980B9"
ACTUAL_COL = "#C0392B"
BG_COL     = "#FAFAFA"
TITLE_COL  = "#2C3E50"


def make_chart(sprint: dict, out_path: str) -> None:
    total  = sprint["total"]
    actual = sprint["actual"]
    ideal  = [total - (total / 5) * d for d in DAYS]

    fig, ax = plt.subplots(figsize=(10, 6))
    fig.patch.set_facecolor(BG_COL)
    ax.set_facecolor(BG_COL)

    # grid
    ax.yaxis.grid(True, color="#E0E0E0", linewidth=1, zorder=0)
    ax.set_axisbelow(True)

    # shaded regions
    ax.fill_between(DAYS, ideal, actual,
                    where=[a > i for a, i in zip(actual, ideal)],
                    alpha=0.12, color=ACTUAL_COL)
    ax.fill_between(DAYS, ideal, actual,
                    where=[a <= i for a, i in zip(actual, ideal)],
                    alpha=0.08, color=IDEAL_COL)

    # ideal line
    ax.plot(DAYS, ideal,
            color=IDEAL_COL, linewidth=2, linestyle="--",
            marker="o", markersize=5, zorder=3, label="Ideal burndown")

    # actual line
    ax.plot(DAYS, actual,
            color=ACTUAL_COL, linewidth=2.5, linestyle="-",
            marker="s", markersize=7, zorder=4, label="Actual remaining")

    # value labels on actual line
    for d, pts in zip(DAYS, actual):
        ax.annotate(
            f" {pts} pts",
            xy=(d, pts),
            xytext=(6, 4),
            textcoords="offset points",
            fontsize=9, color=ACTUAL_COL, fontweight="bold",
        )

    # backlog items box — placed INSIDE the chart, upper-right quadrant
    items_lines = [f"  {name}  ({pts} pts)" for name, pts in sprint["items"]]
    items_lines.append(f"\n  Total committed:  {total} pts")
    items_lines.append(f"  Total delivered:  {total} pts  ✓")
    box_text = "\n".join(items_lines)

    ax.text(
        0.98, 0.97, box_text,
        transform=ax.transAxes,
        fontsize=8.5, va="top", ha="right",
        family="monospace",
        color="#444444",
        bbox=dict(boxstyle="round,pad=0.5", facecolor="white",
                  edgecolor="#BBBBBB", alpha=0.9),
    )

    # axes
    ax.set_xlim(-0.25, 5.25)
    ax.set_ylim(-1, total * 1.12)
    ax.set_xticks(DAYS)
    ax.set_xticklabels(DAY_LABELS, fontsize=9.5)
    ax.set_ylabel("Story Points Remaining", fontsize=11, color=TITLE_COL)
    ax.set_xlabel("Sprint Day", fontsize=11, color=TITLE_COL, labelpad=8)
    ax.tick_params(colors=TITLE_COL, labelsize=9.5)
    for spine in ax.spines.values():
        spine.set_edgecolor("#CCCCCC")

    # title
    ax.set_title(
        f"Sprint {sprint['number']} Burn-Down Chart  —  "
        f"{sprint['name']}\n{sprint['dates']}",
        fontsize=12, fontweight="bold", color=TITLE_COL, pad=14,
    )

    ax.legend(loc="lower left", fontsize=9, framealpha=0.9,
              edgecolor="#CCCCCC")

    plt.tight_layout()
    fig.savefig(out_path, dpi=150, facecolor=BG_COL)
    plt.close(fig)
    print(f"  Saved → {out_path}")


if __name__ == "__main__":
    print("Generating Zemen sprint burn-down charts…")
    for sprint in SPRINTS:
        filename = f"sprint{sprint['number']}_burndown.png"
        out_path = os.path.join(OUTPUT_DIR, filename)
        make_chart(sprint, out_path)
    print(f"\nDone — {len(SPRINTS)} charts saved to {OUTPUT_DIR}")

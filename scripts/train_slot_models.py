#!/usr/bin/env python3
"""Reproducible, chronological slot forecasting. Python standard library only.

TRAIN: observed dates through 2026-09-30, never anything from Oct/Nov.
TEST: 2026-10-01 through 2026-11-25, reported without model selection.
The test can reveal past-day OBSERVATIONS to generate next-day features, but no
weights/hyperparameters are ever fitted or selected from October/November.
This predicts published roundtable target identifiers and an observed A-proxy,
NOT setting 6 and NOT source author "all rainbow" reports.
"""
from __future__ import annotations

import json
import math
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TRAIN_END = "2026-09-30"
TEST_START = "2026-10-01"
TEST_END = "2026-11-25"
GROUPS = {
    "カバネリ": (1001, 1002, 1003, 1004),
    "ヴヴヴ": (1005, 1006, 1007, 1008),
    "からくり2": (1009, 1010, 1011, 1012),
    "紫バラ": (1013, 1014, 1015, 1016, 1017),
}
SEAT_FEATURES = [
    "bias", "prior_machine_A_rate", "prior_seat_A_rate",
    "previous_seat_A", "recent_7_seat_A_rate", "previous_diff_clipped",
    "previous_games_clipped", "weekend", "day_5_or_9",
]
ROUND_FEATURES = [
    "log_smooth_historical_frequency", "same_as_previous",
    "neighbor_of_previous", "recent_7_frequency", "time_since_own_target",
    "same_as_two_events_ago",
]


def read(name):
    return json.loads((ROOT / "data" / name).read_text(encoding="utf-8"))


def bound(v, a, b):
    return min(b, max(a, v))


def sigmoid(v):
    if v < -25:
        return 1e-11
    if v > 25:
        return 1 - 1e-11
    return 1 / (1 + math.exp(-v))


def softmax(vals):
    mx = max(vals)
    ex = [math.exp(v - mx) for v in vals]
    z = sum(ex)
    return [e / z for e in ex]


def r(v, digits=4):
    return round(float(v), digits)


def train_binary_logit(examples):
    if len(examples) < 1000:
        raise RuntimeError("Too few pre-October seat-day training samples")
    d = len(examples[0][0])
    n = len(examples)
    rate = sum(y for _, y in examples) / n
    means = [0.0] + [sum(x[j] for x, _ in examples) / n for j in range(1, d)]
    stds = [1.0] + [
        max(.1, math.sqrt(sum((x[j] - means[j]) ** 2 for x, _ in examples) / n))
        for j in range(1, d)
    ]
    normalized = [
        ([1.0] + [(x[j] - means[j]) / stds[j] for j in range(1, d)], y)
        for x, y in examples
    ]
    w = [math.log(bound(rate, 1e-4, 1 - 1e-4) / (1 - bound(rate, 1e-4, 1 - 1e-4)))] + [0.0] * (d - 1)
    # Unchanged, pre-specified hyperparameters, never tuned on Oct-Nov results.
    for _ in range(80):
        grad = [0.0] * d
        for x, y in normalized:
            err = sigmoid(sum(a * b for a, b in zip(w, x))) - y
            for j in range(d):
                grad[j] += err * x[j]
        for j in range(d):
            grad[j] = grad[j] / n + (.06 * w[j] if j else 0)
            w[j] -= .45 * grad[j]
    return {"weights": w, "means": means, "stds": stds, "train_A_rate": rate,
            "method": "L2-regularized logistic regression", "epochs": 80, "l2": .06, "learning_rate": .45}


def binary_probability(model, xs):
    norm = [1.0] + [(xs[j] - model["means"][j]) / model["stds"][j] for j in range(1, len(xs))]
    return sigmoid(sum(w * x for w, x in zip(model["weights"], norm)))


def complete_daily_records():
    raw = read("records.json")
    dates = defaultdict(dict)
    for entry in raw:
        try:
            day = str(entry["date"])
            number = int(entry["number"])
            machine = str(entry.get("machine") or "").strip()
            diff = float(entry.get("diff") or 0)
            games = float(entry.get("games") or 0)
            if not (day[:4] == "2026" and 1 <= number <= 9999 and machine):
                continue
            date.fromisoformat(day)
        except (ValueError, TypeError, KeyError, OverflowError):
            continue
        dates[day][number] = {"number": number, "machine": machine, "diff": diff,
                              "games": games, "A": int(games >= 2000 and diff >= 1000)}
    # Exclude source scraping gaps, which are indistinguishable from non-targets.
    days = {d: entries for d, entries in dates.items() if len(entries) >= 400 and d <= datetime.now(timezone(timedelta(hours=9))).date().isoformat()}
    return dict(sorted(days.items()))


def seat_day_features(n, target_day, hist, machine_hits, machine_counts, seat_hits, seat_counts, global_hits, global_count):
    prior = hist.get(n, [])
    if not prior:
        return None
    last = prior[-1]
    machine = last["machine"]  # publicly knowable as of the preceding date
    base = (global_hits + 3) / (global_count + 20) if global_count else .15
    mc_rate = (machine_hits[machine] + 12 * base) / (machine_counts[machine] + 12)
    st_rate = (seat_hits[n] + 12 * base) / (seat_counts[n] + 12)
    return [
        1.0, mc_rate, st_rate, float(last["A"]),
        sum(item["A"] for item in prior[-7:]) / max(1, len(prior[-7:])),
        bound(last["diff"] / 5000, -1, 1),
        bound(last["games"] / 8000, 0, 1),
        float(date.fromisoformat(target_day).weekday() >= 5),
        float(int(target_day[-2:]) % 5 == 0 or int(target_day[-2:]) % 9 == 0),
    ]


def train_and_test_seat_proxy():
    days = complete_daily_records()
    history = defaultdict(list)
    machine_hits, machine_counts, seat_hits, seat_counts = Counter(), Counter(), Counter(), Counter()
    global_hits = global_count = 0
    train = []
    evaluation = defaultdict(list)
    train_days = test_days = 0
    for d, rows in days.items():
        eligible = []
        for n, today in rows.items():
            x = seat_day_features(n, d, history, machine_hits, machine_counts,
                                  seat_hits, seat_counts, global_hits, global_count)
            if x is not None:
                prev_machine = history[n][-1]["machine"]
                eligible.append({"number": n, "machine": prev_machine,
                                 "features": x, "y": today["A"]})
        if d <= TRAIN_END:
            train_days += 1
            train.extend((item["features"], item["y"]) for item in eligible)
        elif TEST_START <= d <= TEST_END:
            test_days += 1
            evaluation[d] = eligible
        for n, item in rows.items():
            machine = item["machine"]
            history[n].append(item)
            machine_hits[machine] += item["A"]
            machine_counts[machine] += 1
            seat_hits[n] += item["A"]
            seat_counts[n] += 1
            global_hits += item["A"]
            global_count += 1

    model = train_binary_logit(train)
    n_test = hits = 0
    logloss = brier = 0.0
    top10_hits = top10_size = random_baseline_expected = 0.0
    day_eval = []
    for d, items in sorted(evaluation.items()):
        if not items:
            continue
        preds = []
        for item in items:
            p = binary_probability(model, item["features"])
            y = item["y"]
            logloss -= y * math.log(max(1e-10, p)) + (1-y) * math.log(max(1e-10, 1-p))
            brier += (p-y)**2
            hits += y
            n_test += 1
            preds.append((p, item))
        preds.sort(key=lambda z:(-z[0], z[1]["number"]))
        take = preds[:10]
        n_hit = sum(row["y"] for _, row in take)
        top10_hits += n_hit
        top10_size += len(take)
        rate = sum(item["y"] for _, item in preds) / len(preds)
        random_baseline_expected += len(take) * rate
        day_eval.append({"date": d, "evaluated_seats": len(preds),
                         "top10_hits": n_hit, "A_rate_pct": r(100 * rate, 2)})
    if not n_test or not top10_size:
        raise RuntimeError("No independent Oct-Nov seat model test observations")
    last_date = max(days)
    forecast = max(date.fromisoformat(last_date) + timedelta(days=1),
                   (datetime.now(timezone(timedelta(hours=9))).date() + timedelta(days=1)))
    forecast_str = forecast.isoformat()
    last_rows = days[last_date]
    forecast_seats = []
    for n, row in last_rows.items():
        x = seat_day_features(n, forecast_str, history, machine_hits, machine_counts,
                              seat_hits, seat_counts, global_hits, global_count)
        if x:
            p = binary_probability(model, x)
            forecast_seats.append({"number": n, "machine": row["machine"],
                                   "A_proxy_probability": r(p, 5),
                                   "prior_day_diff": int(row["diff"]),
                                   "prior_day_games": int(row["games"])})
    forecast_seats.sort(key=lambda x:(-x["A_proxy_probability"], x["number"]))
    per_machine = defaultdict(list)
    for row in forecast_seats:
        per_machine[row["machine"]].append(row)
    machine_ranks = [
        {"machine": name, "seat_count": len(rows),
         "expected_A_seats": r(sum(row["A_proxy_probability"] for row in rows), 3),
         "average_A_proxy_probability": r(sum(row["A_proxy_probability"] for row in rows) / len(rows), 5),
         "numbers": [row["number"] for row in rows]}
        for name, rows in per_machine.items() if len(rows) >= 2
    ]
    machine_ranks.sort(key=lambda x:(-x["average_A_proxy_probability"], -x["expected_A_seats"], x["machine"]))
    base_p = model["train_A_rate"]
    baseline_loss = -(hits * math.log(base_p) + (n_test-hits)*math.log(1-base_p)) / n_test
    return {
        "target": "A proxy: same day diff >= +1000 coins AND games >= 2000, NOT setting 6",
        "model": {"type":model["method"], "features":SEAT_FEATURES,
                  "weights":[r(z,7) for z in model["weights"]],
                  "normalization_means":[r(z,6) for z in model["means"]],
                  "normalization_stds":[r(z,6) for z in model["stds"]],
                  "training_A_prevalence_pct":r(100*base_p,2),
                  "epochs":model["epochs"],"l2":model["l2"]},
        "training": {"days": train_days, "samples": len(train), "end": TRAIN_END},
        "test": {"days": test_days, "seat_predictions": n_test, "A_rate_pct":r(100*hits/n_test,2),
                 "log_loss":r(logloss/n_test,5),"brier":r(brier/n_test,5),
                 "constant_train_rate_baseline_log_loss":r(baseline_loss,5),
                 "top10_successes":int(top10_hits),"top10_predictions":int(top10_size),
                 "top10_precision_pct":r(100*top10_hits/top10_size,2),
                 "random_ranking_expected_top10_precision_pct":r(100*random_baseline_expected/top10_size,2),
                 "top10_lift":r(top10_hits/max(1e-10,random_baseline_expected),3),
                 "by_day":day_eval},
        "forecast": {"target_date":forecast_str,"input_last_complete_day":last_date,
                     "seat_top20":forecast_seats[:20],"machine_top15":machine_ranks[:15]},
    }


def round_features(pool, seat, candidates):
    k = len(candidates)
    n = len(pool)
    counts = Counter(p["number"] for p in pool)
    last = pool[-1]["number"] if pool else None
    two = pool[-2]["number"] if len(pool)>=2 else None
    last_occurrence = next((i for i,p in enumerate(reversed(pool),start=1)
                            if p["number"]==seat), 12)
    recent = [p["number"] for p in pool[-7:]]
    return [
        math.log((counts[seat]+2) / (n + 2*k)),
        float(seat == last),
        float(last is not None and abs(seat-last)==1),
        recent.count(seat) / max(len(recent),1),
        min(12,last_occurrence)/12,
        float(seat == two),
    ]


def train_softmax_group(examples):
    if len(examples) < 50:
        raise RuntimeError("Too few training roundtable events")
    cols = len(ROUND_FEATURES)
    w = [1.0] + [0.0]*(cols-1)
    for _ in range(250):
        grad=[0.0]*cols
        for xrows, chosen_idx in examples:
            probs=softmax([sum(a*b for a,b in zip(w,x)) for x in xrows])
            for j in range(cols):
                expected=sum(p*x[j] for p,x in zip(probs,xrows))
                grad[j] += expected-xrows[chosen_idx][j]
        for j in range(cols):
            grad[j] = grad[j]/len(examples) + .12*(w[j]-(1 if j==0 else 0))
            w[j] -= .28*grad[j]
    return w


def eval_roundtable():
    data=read("roundtable_targets.json")
    days=sorted(data["days"],key=lambda row:row["date"])
    history=defaultdict(list)
    train=[]
    test=[]
    train_days=set()
    test_days=set()
    for obs in days:
        d=obs["date"]
        # After the locked holdout, newly observed days can refresh the
        # prediction-state history, but never alter the pre-Oct fitted weights.
        for group, candidates in GROUPS.items():
            seat=obs.get("targets",{}).get(group)
            if seat not in candidates:
                continue
            previous=history[group]
            features=[round_features(previous,n,candidates) for n in candidates]
            row={"date":d,"group":group,"numbers":candidates,
                 "features":features,"actual":seat,
                 "n_before":len(previous)}
            if d<=TRAIN_END:
                train_days.add(d)
                if len(previous)>=4:train.append((features,candidates.index(seat)))
            elif TEST_START<=d<=TEST_END:
                test_days.add(d)
                test.append(row)
            # Visible past observation only; never refit coefficients in test.
            previous.append({"date":d,"number":seat})
    w=train_softmax_group(train)
    by_group=defaultdict(list)
    total_logloss=0
    correct_top1=correct_top2=n_total=0
    for row in test:
        logits=[sum(a*b for a,b in zip(w,x)) for x in row["features"]]
        probs=softmax(logits)
        indexed=sorted(range(len(probs)),key=lambda i:(-probs[i],row["numbers"][i]))
        truth=row["numbers"].index(row["actual"])
        correct_top1 += int(indexed[0]==truth)
        correct_top2 += int(truth in indexed[:2])
        total_logloss += -math.log(max(1e-10,probs[truth]))
        n_total += 1
        by_group[row["group"]].append({"date":row["date"],
                    "actual":row["actual"],"predicted_top1":row["numbers"][indexed[0]],
                    "top1_correct":bool(indexed[0]==truth),
                    "probability_of_actual":r(probs[truth],5)})
    group_metrics={}
    for group,candidates in GROUPS.items():
        rows=by_group.get(group,[])
        if not rows:continue
        good=sum(e["top1_correct"] for e in rows)
        log_loss=sum(-math.log(max(1e-10,e["probability_of_actual"])) for e in rows)/len(rows)
        group_metrics[group]={"tests":len(rows),"top1_hits":good,
             "top1_hit_rate_pct":r(100*good/len(rows),2),
             "uniform_hit_rate_pct":r(100/len(candidates),2),
             "log_loss":r(log_loss,4),
             "uniform_log_loss":r(math.log(len(candidates)),4)}
    ranked=[]
    for group,candidates in GROUPS.items():
        pool=history[group]
        values=[round_features(pool,n,candidates) for n in candidates]
        probs=softmax([sum(a*b for a,b in zip(w,features)) for features in values])
        previous=pool[-1] if pool else None
        for n,p in zip(candidates,probs):
            ranked.append({"group":group,"number":n,"score_probability":r(p,5),
                           "random_baseline_probability":r(1/len(candidates),5),
                           "previous_report_number":previous["number"] if previous else None,
                           "historical_reports":sum(item["number"]==n for item in pool),
                           "source":"data/roundtable_targets.json"})
    ranked.sort(key=lambda x:(-x["score_probability"],x["number"]))
    return {
        "target":"third-party roundtable published number, not confirmed settings",
        "model":{"type":"L2-regularized pooled conditional-softmax over four roundtable groups",
                 "features":ROUND_FEATURES,"weights":[r(z,7) for z in w],
                 "epochs":250,"l2":.12,"learning_rate":.28,
                 "training_warmup_events_per_group":4},
        "training":{"days":len(train_days),"examples":len(train),"end":TRAIN_END},
        "test":{"days":len(test_days),"group_predictions":n_total,
                "top1_hits":correct_top1,"top1_hit_rate_pct":r(100*correct_top1/max(1,n_total),2),
                "top2_hits":correct_top2,"top2_hit_rate_pct":r(100*correct_top2/max(1,n_total),2),
                "mean_log_loss":r(total_logloss/max(1,n_total),4),
                "uniform_mean_log_loss":r(sum(math.log(len(GROUPS[row["group"]])) for row in test)/max(1,n_total),4),
                "by_group":group_metrics,
                "by_group_daily":dict(by_group)},
        "forecast":{"last_labeled_date":max(p["date"] for pool in history.values() for p in pool),
                    "ranked_candidates":ranked,
                    "best_per_group":[next(x for x in ranked if x["group"]==g) for g in GROUPS]},
    }


def main():
    seat=train_and_test_seat_proxy()
    circle=eval_roundtable()
    now=datetime.now(timezone(timedelta(hours=9))).isoformat(timespec="seconds")
    result={
      "schema":1,"generated_at_jst":now,
      "split":{"train_through":TRAIN_END,"test_from":TEST_START,"test_through":TEST_END,
        "locked_test":True,
        "rules":[
         "No October or November labels are used to fit weights or choose hyperparameters.",
         "After November 25, new past-day observations only refresh forecast features; fitted coefficients and Oct-Nov test scores remain frozen.",
         "Walk-forward feature states may include earlier observed test dates, but never the target date or a later date.",
         "Machine identities on test dates are taken from the previous complete date, not that day's outcomes.",
         "Model outputs are historical associations; source mentions and high settings are NOT ground truth.",
        ]},
      "roundtable":circle,"seat_proxy":seat,
      "limitations":[
       "Roundtable training begins August 28, leaving only about 32 pre-October labeled days.",
       "Suika all-rainbow labels for pre-October are insufficient for a supervised all-rainbow machine classifier.",
       "A proxy is noisy and biased by machine volatility and visitor play; it is not setting 6 probability.",
       "No prediction constitutes a verified machine setting, profitability or guarantee.",
      ],
    }
    output=ROOT/"public"/"model_results.json"
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("TRAINING_TEST_REPORT",json.dumps({
      "train_end":TRAIN_END,"test_end":TEST_END,
      "roundtable_train_days":circle["training"]["days"],
      "roundtable_test_days":circle["test"]["days"],
      "roundtable_accuracy_pct":circle["test"]["top1_hit_rate_pct"],
      "roundtable_baseline_log_loss":circle["test"]["uniform_mean_log_loss"],
      "roundtable_log_loss":circle["test"]["mean_log_loss"],
      "roundtable_groups":circle["test"]["by_group"],
      "proxy_train_days":seat["training"]["days"],
      "proxy_train_samples":seat["training"]["samples"],
      "proxy_test_days":seat["test"]["days"],
      "proxy_test_samples":seat["test"]["seat_predictions"],
      "proxy_baseline_A_pct":seat["test"]["A_rate_pct"],
      "proxy_top10_precision_pct":seat["test"]["top10_precision_pct"],
      "proxy_top10_random_precision_pct":seat["test"]["random_ranking_expected_top10_precision_pct"],
      "proxy_top10_lift":seat["test"]["top10_lift"],
      "proxy_baseline_log_loss":seat["test"]["constant_train_rate_baseline_log_loss"],
      "proxy_log_loss":seat["test"]["log_loss"],
      "forecast_date":seat["forecast"]["target_date"],
      "forecast_top3_seats":seat["forecast"]["seat_top20"][:3],
      "forecast_top3_machines":seat["forecast"]["machine_top15"][:3],
      "forecast_roundtable":circle["forecast"]["best_per_group"],
    },ensure_ascii=False))


if __name__=="__main__":
    main()

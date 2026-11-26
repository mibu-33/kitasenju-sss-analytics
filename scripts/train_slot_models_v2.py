#!/usr/bin/env python3
"""V2 forecasting with pre-October-only model selection and locked Oct-Nov holdout.

All fitting and candidate selection occurs on July–September (roundtable:
August–September). October 1 through November 25 is an evaluation holdout ONLY.
After that date, observed prior-day history may be used for live features but
NEVER for parameter fitting or reselecting candidates. No claim of setting 6.
"""
from __future__ import annotations

import json
import math
import sys
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from scripts import train_slot_models as old

TRAIN_END=old.TRAIN_END
TEST_START=old.TEST_START
TEST_END=old.TEST_END
SEAT_FEATURES_V1=old.SEAT_FEATURES
SEAT_FEATURES=SEAT_FEATURES_V1+[
 "prior_seat_last3_A_rate",
 "prior_seat_last14_A_rate",
 "recent_machine_7days_A_rate",
 "recent_machine_7days_sample_fraction",
 "seat_games_last3_scaled",
 "seat_last_A_gap_capped",
 "seat_current_machine_tenure",
 "seat_recent_machine_change",
 "calendar_end5",
 "calendar_end9",
 "calendar_end0",
 "previous_machine_size_scaled",
]
ROUND_FEATURES=old.ROUND_FEATURES
CHOSEN_ALPHAS=[0.0,0.25,0.5,0.75,1.0]
V1_DIM=len(SEAT_FEATURES_V1)
assert V1_DIM == 9


def local_jst():
 return datetime.now(timezone(timedelta(hours=9)))


def enhanced_features(n,d,history,mach_hits,mach_totals,seat_hits,seat_totals,
                      global_hits,global_total,machine_recent,machine_size):
 prev=old.seat_day_features(n,d,history,mach_hits,mach_totals,seat_hits,seat_totals,global_hits,global_total)
 if prev is None:
  return None
 h=history[n]; last=h[-1]; mach=last["machine"]
 n7=machine_recent.get(mach,[])[-7:]
 m_hit=sum(a for a,b in n7)
 m_total=sum(b for a,b in n7)
 prior_p=(mach_hits[mach]+2)/(mach_totals[mach]+10)
 recent_m_p=(m_hit + 8*prior_p)/(m_total+8)
 gap=next((i for i,row in enumerate(reversed(h),1) if row["A"]),15)
 tenure=0
 for row in reversed(h):
  if row["machine"]!=mach:break
  tenure+=1
 recent_change=int(any(row["machine"]!=mach for row in h[-7:]))
 day=int(d[-2:])
 return prev+[
  sum(x["A"] for x in h[-3:])/len(h[-3:]),
  sum(x["A"] for x in h[-14:])/len(h[-14:]),
  recent_m_p,
  min(1.0,m_total/100),
  min(1.0,sum(x["games"] for x in h[-3:])/(8000*len(h[-3:]))),
  min(1.0,gap/15),
  min(1.0,tenure/14),
  float(recent_change),
  float(day%10==5),
  float(day%10==9),
  float(day%10==0),
  min(1.0,machine_size.get(mach,0)/20),
 ]


def build_rows():
 days=old.complete_daily_records()
 history=defaultdict(list)
 machine_daily=defaultdict(list)
 mach_hits,mach_totals,seat_hits,seat_totals=Counter(),Counter(),Counter(),Counter()
 global_hits=global_total=0
 records={}
 last_history=None
 for d,entries in days.items():
  dayrows=[]
  for n,today in entries.items():
   x=enhanced_features(n,d,history,mach_hits,mach_totals,seat_hits,seat_totals,
                      global_hits,global_total,machine_daily,last_history or {})
   if x is None:continue
   last_m=history[n][-1]["machine"]
   dayrows.append({"number":n,"machine":last_m,"x":x,"y":today["A"]})
  records[d]=dayrows
  by_m=defaultdict(lambda:[0,0])
  last_history=Counter(row["machine"] for row in entries.values())
  for n,row in entries.items():
   machine=row["machine"]
   history[n].append(row)
   mach_hits[machine]+=row["A"];mach_totals[machine]+=1
   seat_hits[n]+=row["A"];seat_totals[n]+=1
   global_hits+=row["A"];global_total+=1
   by_m[machine][0]+=row["A"];by_m[machine][1]+=1
  for m,counts in by_m.items():
   machine_daily[m].append(tuple(counts))
 return days,records,history,machine_daily,mach_hits,mach_totals,seat_hits,seat_totals,global_hits,global_total,last_history


def fitting(rows,version):
 sl=slice(0,V1_DIM) if version=="v1" else slice(None)
 return old.train_binary_logit([(r["x"][sl],r["y"]) for r in rows])


def weighted_prob(r,baseline,extended,alpha):
 p=old.binary_probability(baseline,r["x"][:V1_DIM])
 if alpha <= 0: return p
 q=old.binary_probability(extended,r["x"])
 return (1-alpha)*p+alpha*q


def score_days(grouped,baseline,extended,alpha,include_days=False):
 test_n=correct=top_hits=top_count=0
 loss=brier=random_top10=0.0
 by_day=[]
 for d,items in sorted(grouped.items()):
  if not items:continue
  candidates=[]
  for item in items:
   p=old.bound(weighted_prob(item,baseline,extended,alpha),1e-10,1-1e-10)
   y=item["y"]
   loss-=y*math.log(p)+(1-y)*math.log(1-p)
   brier+=(p-y)**2
   correct+=y;test_n+=1
   candidates.append((p,item))
  candidates.sort(key=lambda x:(-x[0],x[1]["number"]))
  count=min(10,len(candidates))
  take=candidates[:count]
  th=sum(x["y"] for _,x in take)
  top_hits+=th;top_count+=count
  rate=sum(x["y"] for _,x in candidates)/len(candidates)
  random_top10+=rate*count
  if include_days:
   by_day.append({"date":d,"evaluated_seats":len(candidates),"top10_hits":th,
                  "A_rate_pct":old.r(100*rate,2)})
 if test_n==0:raise RuntimeError("No model evaluation samples")
 result={"days":len(grouped),"seat_predictions":test_n,
  "A_rate_pct":old.r(100*correct/test_n,2),
  "log_loss":old.r(loss/test_n,5),"brier":old.r(brier/test_n,5),
  "top10_successes":int(top_hits),"top10_predictions":int(top_count),
  "top10_precision_pct":old.r(100*top_hits/top_count,2),
  "random_ranking_expected_top10_precision_pct":old.r(100*random_top10/top_count,2),
  "top10_lift":old.r(top_hits/max(random_top10,1e-10),3)}
 if include_days:result["by_day"]=by_day
 return result


def choose_blend(training_rows,validation_rows):
 train=[x for d,rows in training_rows.items() for x in rows]
 if len(train)<10000 or len(validation_rows)<10:
  raise RuntimeError("Insufficient pre-October internal validation for candidate selection")
 v1=fitting(train,"v1");v2=fitting(train,"v2")
 evaluated=[]
 for alpha in CHOSEN_ALPHAS:
  scored=score_days(validation_rows,v1,v2,alpha)
  evaluated.append({"blend_v2":alpha,"log_loss":scored["log_loss"],
    "top10_precision_pct":scored["top10_precision_pct"],"brier":scored["brier"]})
 # Lower log loss on September validation is the ONLY model-selection criterion.
 # Require >.0005 improvement to select more complexity over the simpler V1.
 best=min(evaluated,key=lambda z:(z["log_loss"],z["blend_v2"]))
 baseline=evaluated[0]
 chosen=best if best["log_loss"]<baseline["log_loss"]-.0005 else baseline
 return chosen,{"period":"2026-09-01 to 2026-09-30",
     "training_through":"2026-08-31","metric_for_selection":"September mean log loss",
     "complexity_guard_min_improvement":.0005,
     "candidates":evaluated,"chosen_v2_blend":chosen["blend_v2"]}


def train_and_test_seat_proxy():
 (days,allrows,history,machine_daily,mach_hits,mach_totals,seat_hits,
  seat_totals,global_hits,global_total,last_hist)=build_rows()
 trainrows={d:rows for d,rows in allrows.items() if d<=TRAIN_END}
 early={d:rows for d,rows in trainrows.items() if d<="2026-08-31"}
 sep={d:rows for d,rows in trainrows.items() if "2026-09-01"<=d<=TRAIN_END}
 held={d:rows for d,rows in allrows.items() if TEST_START<=d<=TEST_END}
 choice,validation=choose_blend(early,sep)
 alpha=choice["blend_v2"]
 train=[row for rows in trainrows.values() for row in rows]
 base=fitting(train,"v1")
 extended=fitting(train,"v2") if alpha>0 else None
 before=score_days(held,base,None,0)
 after=score_days(held,base,extended,alpha,True)
 after["previous_v1_model"]={"log_loss":before["log_loss"],"brier":before["brier"],
    "top10_precision_pct":before["top10_precision_pct"],"top10_successes":before["top10_successes"]}
 base_p=base["train_A_rate"]
 n,hits=after["seat_predictions"],round(n*after["A_rate_pct"]/100)
 after["constant_train_rate_baseline_log_loss"]=old.r(
   -(hits*math.log(base_p)+(n-hits)*math.log(1-base_p))/n,5)
 latest=max(days)
 target_date=max(date.fromisoformat(latest)+timedelta(days=1),local_jst().date()+timedelta(days=1)).isoformat()
 prior_day=days[latest]
 predictions=[]
 for n,row in prior_day.items():
  x=enhanced_features(n,target_date,history,mach_hits,mach_totals,seat_hits,seat_totals,
                       global_hits,global_total,machine_daily,last_hist or {})
  if x is None:continue
  candidate={"number":n,"machine":row["machine"],"x":x}
  p=weighted_prob(candidate,base,extended,alpha)
  predictions.append({"number":n,"machine":row["machine"],
    "A_proxy_probability":old.r(p,5),
    "prior_day_diff":int(row["diff"]),"prior_day_games":int(row["games"])})
 predictions.sort(key=lambda z:(-z["A_proxy_probability"],z["number"]))
 machines=defaultdict(list)
 for row in predictions:machines[row["machine"]].append(row)
 machine_ranks=[{"machine":name,"seat_count":len(rows),
   "expected_A_seats":old.r(sum(x["A_proxy_probability"] for x in rows),3),
   "average_A_proxy_probability":old.r(sum(x["A_proxy_probability"] for x in rows)/len(rows),5),
   "numbers":[x["number"] for x in rows]}
    for name,rows in machines.items() if len(rows)>=2]
 machine_ranks.sort(key=lambda z:(-z["average_A_proxy_probability"],-z["expected_A_seats"],z["machine"]))
 return {
  "target":"A proxy: same day diff >= +1000 coins AND games >= 2000, NOT setting 6",
  "model":{"type":"September-selected frozen V1+V2 probability blend" if alpha>0 else "September-validated baseline logistic",
    "features":SEAT_FEATURES if alpha>0 else SEAT_FEATURES_V1,
    "baseline_features":SEAT_FEATURES_V1,
    "version":"v2","blend_v2":alpha,
    "selection_rule":"September validation log loss, >0.0005 improvement before using enhanced model",
    "base_weights":[old.r(v,7) for v in base["weights"]],
    "enhanced_weights":[old.r(v,7) for v in extended["weights"]] if extended else None,
    "training_A_prevalence_pct":old.r(100*base_p,2)},
  "training":{"days":len(trainrows),"samples":len(train),"end":TRAIN_END,
    "validation":validation},
  "test":after,
  "forecast":{"target_date":target_date,"input_last_complete_day":latest,
    "seat_top20":predictions[:20],"machine_top15":machine_ranks[:15]}
 }


def round_internal_selection(observations):
 history=defaultdict(list)
 pretrain=[]
 validation=[]
 for obs in observations:
  d=obs["date"]
  if d>TRAIN_END:break
  for group,candidates in old.GROUPS.items():
   chosen=obs.get("targets",{}).get(group)
   if chosen not in candidates:continue
   past=history[group]
   rows=[old.round_features(past,n,candidates) for n in candidates]
   if d<="2026-09-18":
    if len(past)>=4:pretrain.append((rows,candidates.index(chosen)))
   elif "2026-09-19"<=d<=TRAIN_END:
    validation.append((rows,candidates.index(chosen)))
   past.append({"date":d,"number":chosen})
 if len(pretrain)<45 or len(validation)<25:raise RuntimeError("Too few August-September roundtable events")
 w=old.train_softmax_group(pretrain)
 scores=[]
 for blend in CHOSEN_ALPHAS:
  loss=0
  hits=0
  for xrows,correct in validation:
   probs=old.softmax([sum(a*b for a,b in zip(w,x)) for x in xrows])
   combined=[blend*p+(1-blend)/len(probs) for p in probs]
   loss-=math.log(max(1e-10,combined[correct]))
   hits+=int(max(range(len(combined)),key=lambda i:combined[i])==correct)
  scores.append({"blend_model":blend,"log_loss":old.r(loss/len(validation),5),
                 "top1_hit_rate_pct":old.r(100*hits/len(validation),2)})
 best=min(scores,key=lambda x:(x["log_loss"],x["blend_model"]))
 # Uniform fallback if validation score is indistinguishable from uniform.
 uniform=scores[0]
 chosen=best if best["log_loss"]<uniform["log_loss"]-.001 else uniform
 return chosen["blend_model"],{
  "period":"2026-09-19 to 2026-09-30","training_through":"2026-09-18",
  "metric_for_selection":"September log loss, uniform shrinkage",
  "chosen_model_weight":chosen["blend_model"],"candidates":scores,
  "validation_events":len(validation),
 }


def eval_roundtable():
 observations=sorted(old.read("roundtable_targets.json")["days"],key=lambda x:x["date"])
 shrink,cv=round_internal_selection(observations)
 # Fit ONLY on pre-Oct outcomes, then evaluate the locked October-November window.
 history=defaultdict(list);training=[];evaluation=[]
 train_days=set();test_days=set()
 for obs in observations:
  d=obs["date"]
  for group,candidates in old.GROUPS.items():
   seat=obs.get("targets",{}).get(group)
   if seat not in candidates:continue
   previous=history[group]
   xs=[old.round_features(previous,n,candidates) for n in candidates]
   row={"date":d,"group":group,"numbers":candidates,"features":xs,"actual":seat}
   if d<=TRAIN_END:
    train_days.add(d)
    if len(previous)>=4:training.append((xs,candidates.index(seat)))
   elif TEST_START<=d<=TEST_END:
    test_days.add(d);evaluation.append(row)
   previous.append({"date":d,"number":seat})
 fitted=old.train_softmax_group(training)
 by_group=defaultdict(list)
 hits=hits2=n=0;loss=baseline_loss=raw_loss=0.
 for row in evaluation:
  probs=old.softmax([sum(a*b for a,b in zip(fitted,x)) for x in row["features"]])
  mixed=[shrink*p+(1-shrink)/len(probs) for p in probs]
  indices=sorted(range(len(mixed)),key=lambda i:(-mixed[i],row["numbers"][i]))
  truth=row["numbers"].index(row["actual"])
  hits+=int(indices[0]==truth);hits2+=int(truth in indices[:2]);n+=1
  loss-=math.log(max(mixed[truth],1e-10))
  raw_loss-=math.log(max(probs[truth],1e-10))
  baseline_loss+=math.log(len(mixed))
  by_group[row["group"]].append({"date":row["date"],"actual":row["actual"],
   "predicted_top1":row["numbers"][indices[0]],"top1_correct":indices[0]==truth,
   "probability_of_actual":old.r(mixed[truth],5)})
 metrics={}
 for group,candidates in old.GROUPS.items():
  obs=by_group[group]
  if not obs:continue
  count=len(obs);hits_group=sum(x["top1_correct"] for x in obs)
  metrics[group]={"tests":count,"top1_hits":hits_group,
    "top1_hit_rate_pct":old.r(100*hits_group/count,2),
    "uniform_hit_rate_pct":old.r(100/len(candidates),2),
    "log_loss":old.r(sum(-math.log(max(x["probability_of_actual"],1e-10)) for x in obs)/count,4),
    "uniform_log_loss":old.r(math.log(len(candidates)),4)}
 candidate_rows=[]
 for group,candidates in old.GROUPS.items():
  past=history[group]
  xs=[old.round_features(past,n,candidates) for n in candidates]
  p=old.softmax([sum(a*b for a,b in zip(fitted,x)) for x in xs])
  for number,prob in zip(candidates,p):
   prob=shrink*prob+(1-shrink)/len(candidates)
   candidate_rows.append({"group":group,"number":number,"score_probability":old.r(prob,5),
    "random_baseline_probability":old.r(1/len(candidates),5),
    "previous_report_number":past[-1]["number"] if past else None,
    "historical_reports":sum(x["number"]==number for x in past),
    "source":"data/roundtable_targets.json"})
 candidate_rows.sort(key=lambda x:(-x["score_probability"],x["number"]))
 return {
  "target":"third-party roundtable published number, not confirmed settings",
  "model":{"type":"pre-October trained regularized pooled softmax with validation-selected uniform shrinkage",
    "features":ROUND_FEATURES,"weights":[old.r(x,7) for x in fitted],
    "uniform_shrinkage_model_weight":shrink,"selection":"9/19–9/30 preholdout only"},
  "training":{"days":len(train_days),"examples":len(training),"end":TRAIN_END,"validation":cv},
  "test":{"days":len(test_days),"group_predictions":n,
    "top1_hits":hits,"top1_hit_rate_pct":old.r(100*hits/n,2),
    "top2_hits":hits2,"top2_hit_rate_pct":old.r(100*hits2/n,2),
    "mean_log_loss":old.r(loss/n,4),
    "previous_v1_model_log_loss":old.r(raw_loss/n,4),
    "uniform_mean_log_loss":old.r(baseline_loss/n,4),
    "by_group":metrics,"by_group_daily":dict(by_group)},
  "forecast":{"last_labeled_date":max(x["date"] for x in observations),
    "ranked_candidates":candidate_rows,
    "best_per_group":[next(x for x in candidate_rows if x["group"]==group) for group in old.GROUPS]}
 }


def main():
 seat=train_and_test_seat_proxy()
 circ=eval_roundtable()
 result={
  "schema":2,"generated_at_jst":local_jst().isoformat(timespec="seconds"),
  "split":{"train_through":TRAIN_END,"test_from":TEST_START,"test_through":TEST_END,
   "locked_test":True,
   "model_selection_dates":"September 2026 only; never October or November",
   "rules":[
    "Every fit, blending choice and temperature shrinkage is selected using pre-October-only labels.",
    "The Oct-Nov holdout is read once for reporting after model selection; it is never used to select model parameters.",
    "Only previously observed dates are included in feature histories.",
    "Post-November-25 observations can refresh live features but cannot refit or retune model coefficients.",
    "Source report categories and A proxy never establish setting 6.",
   ]},
  "roundtable":circ,"seat_proxy":seat,
  "limitations":[
   "Roundtable training starts August 28 with only 32 pre-October labeled days.",
   "The October-November results have been examined in prior iterations; future unseen dates are needed for a fully independent post-development test.",
   "The 10–11 month scores are retrospective proxy prediction metrics, not a verifiable setting-6 prediction rate.",
   "Missing source reports are not counted as negative-setting outcomes.",
   "Machine-specific weekly changes, refurbishments and source reporting errors are not proven causal."
  ],
 }
 path=ROOT/"public"/"model_results.json"
 path.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 print("IMPROVED_MODEL_REPORT",json.dumps({
  "seat_training":seat["training"]["samples"],"seat_test":seat["test"]["seat_predictions"],
  "seat_preOct_choice":seat["training"]["validation"]["chosen_v2_blend"],
  "seat_test_v1_top10_pct":seat["test"]["previous_v1_model"]["top10_precision_pct"],
  "seat_test_v2_top10_pct":seat["test"]["top10_precision_pct"],
  "seat_test_v1_logloss":seat["test"]["previous_v1_model"]["log_loss"],
  "seat_test_v2_logloss":seat["test"]["log_loss"],
  "round_preOct_shrink_weight":circ["training"]["validation"]["chosen_model_weight"],
  "round_test_v1_logloss":circ["test"]["previous_v1_model_log_loss"],
  "round_test_v2_logloss":circ["test"]["mean_log_loss"],
  "round_test_top1_pct":circ["test"]["top1_hit_rate_pct"],
  "forecast_date":seat["forecast"]["target_date"],
  "forecast_seats":seat["forecast"]["seat_top20"][:3],
  "forecast_rounds":circ["forecast"]["best_per_group"],
 },ensure_ascii=False))


if __name__=="__main__":
 main()

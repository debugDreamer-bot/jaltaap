# Why a 40 °C heatwave rule misses Delhi's most dangerous days, and the AWS agent we built to fix it

> Draft for AWS Builder Center. Team DevCore: rewrite this in your own words and add your own
> photos and screenshots before publishing. Every number here comes from our repo and must stay
> exactly as computed (never round it up).

## The problem we saw

On 22 May 2026, news reports said several parts of Delhi crossed 46 °C. Delhi is not short of
plans: it has a Heat Action Plan with a 12:00–15:00 pause on outdoor construction work,
helplines, cooling zones, and lists of waterlogging hotspots for the monsoon.

The gap is the last mile. Warnings are city-wide and based on temperature alone. A construction
worker in Najafgarh or a delivery rider crossing three underpasses a day rarely hears about any of
it, in a language and at a level of detail they can act on.

_[Team: one paragraph about a person you spoke to or saw, in your own words.]_

## The humid-heat insight

Heatwaves in the plains are generally declared at 40 °C or more. But the body cools by
sweating, and sweat stops working when the air is humid. Lab work at Penn State puts the
critical wet-bulb temperature at roughly 30–31 °C in humid conditions, even for young, healthy
people. A 36 °C afternoon at 65 % humidity has a wet-bulb near 30 °C and never meets a 40 °C rule.

So JalTaap scores every hour by wet-bulb temperature **or** air temperature, whichever is
worse:

| Band | Wet-bulb | or | Temperature |
|---|---|---|---|
| RED | ≥ 30 °C | or | ≥ 44 °C |
| ORANGE | ≥ 28 °C | or | ≥ 40 °C |
| YELLOW | ≥ 25 °C | or | ≥ 37 °C |

It also adds one step for a hot night or the third hot day in a row, and one step for the
worker's own situation, such as heavy work or pregnancy.

We tested the idea on 2026 data. At Safdarjung, from 1 April to 31 July, Open-Meteo's
reanalysis shows that **11 days in 2026 were dangerous by humidity but never met a 40 °C heatwave
rule**. All 11 were in July.

![Backtest A chart](../backtests/outputs/heat_2026.png)

## What we built

JalTaap lives where workers already are: WhatsApp, in Hindi. You send a place name or a location
pin, and you get the hours when heavy work is safe, how often to drink water, and the nearest
cooling zone with a directions link. In the monsoon it warns about listed waterlogging hotspots
for the next three hours. A photo of a flooded underpass is checked by a vision model and lands
on the map, tagged with the agency that owns that spot.

## The architecture

![Architecture](architecture.png)

The rule we never broke: **the language model never computes risk.**

- **Risk lives in tested Python.** All of it is in a small Python package driven by a YAML file,
  with 126 unit tests.
- **The agent only phrases tool results.** A [Strands Agents](https://strandsagents.com/) agent
  on AWS Lambda has six tools that call that package, and replies in the user's language. Every
  reply that uses forecast data ends with the data's timestamp.
- **Webhooks only acknowledge.** WhatsApp and Telegram webhooks verify the request, deduplicate
  it and drop it on Amazon SQS, so a slow model never causes a timeout.
- **One scheduler feeds everything.** Amazon EventBridge Scheduler refreshes a 36-cell grid over
  Delhi every hour into DynamoDB. The map, the alerts and the agent all read the same numbers.
- **Photos must pass a strict check.** Amazon Bedrock checks each photo against a strict JSON
  schema; only a verdict with confidence of at least 0.7 changes the map.
- **One command deploys it all.** The whole backend is one AWS SAM template, plus Powertools for
  AWS Lambda for logs and metrics.

## Three things that fought back

1. **A single weather request for 36 points took 20 seconds.** Our first version asked
   Open-Meteo for the whole grid in one call. It worked in testing, then started timing out, and
   our retries pushed us into the free tier's rate limit. We now split the grid into six-point
   requests, three at a time, back off on HTTP 429, and keep the last good cache if the refresh
   fails.
2. **Lambda layers have a size limit.** The usual perceptual-hash library for spotting duplicate
   photos pulls in numpy and scipy, which nearly fills the 250 MB limit on its own next to the
   Strands layer. We wrote a 15-line difference hash with Pillow instead. Without Docker, we also
   build the layer from Linux wheels with a Makefile, so `sam build` works on a Mac.
3. **WhatsApp's 24-hour window.** Free-form messages reach a user only within 24 hours of their
   last message. Proactive heat alerts outside that window need approved templates, so alerts and
   the 05:30 daily brief are fixed templates, not model output. That is also cheaper and safer.

_[Team: swap in whatever actually fought you during deployment, for example Bedrock model access.]_

## Results, honestly

- **Humid heat.** At Safdarjung, 11 humid-heat days that a 40 °C rule would have missed (all
  data is modelled).
- **Day-ahead forecast.** 35 of 43 ORANGE-or-worse days were flagged a day ahead, and 9 of 44
  flags were false alarms. Both sides are modelled, so this is consistency, not proven skill.
- **The 9 July storm.** Model rain topped 100 mm in parts of Delhi. 3 of the 7 spots reported
  waterlogged in 2026 reached HIGH risk, but so did 3 unreported spots. We need official lists
  and timestamped reports before we can claim the waterlogging score works.
- **One surprise.** The reanalysis says 42 °C on 22 May, not the 46 °C in the news. We kept our
  thresholds and labelled the replay "modelled data" instead of tuning to the headline.

## What is next

- The IMD district-warning feed (the adapter is ready, pending access).
- The official hotspot lists, with every pin verified.
- SMS through DLT registration.
- Hindi voice notes with Amazon Transcribe and Polly.
- Any other city that publishes a hotspot list.

_[Team: links to the repo, live site and video.]_

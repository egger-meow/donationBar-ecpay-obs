# Beta Recruitment Draft Materials

Status: draft, unsent, 2026-07-11. Nobody has been contacted using this. Prepared per
[ROADMAP.md](../../ROADMAP.md) section 13 ("Beta recruitment") and section 17 action 9
("Recruit first five design partners, then expand to 10–20"). Edit before sending —
especially the bracketed placeholders — and send it yourself; this is drafting only.

## Screening checklist (use before inviting anyone)

Per ROADMAP.md section 13, a good candidate should clear all of these:

- [ ] Streams regularly (roadmap targets Twitch/YouTube, ~20–500 concurrent viewers)
- [ ] Already has some monetization (subs, existing tips/donations, sponsorships) —
      signals they'll actually configure a payment provider, not just try the overlay
- [ ] Based in Taiwan or otherwise ECPay-eligible (see
      [ECPAY_REQUIREMENTS.md](../subscription/ECPAY_REQUIREMENTS.md)) — a candidate who
      can't complete ECPay merchant setup can't exercise the thing being tested
- [ ] No engineer/technical co-host required to add an OBS Browser Source — the roadmap's
      target customer explicitly has "no engineer"
- [ ] Has an identifiable pain point with their current donation/alert setup (or none at
      all) — worth a sentence in your notes, it's what you'll ask about in the week-1
      check-in

## Outreach message draft (Traditional Chinese)

Fill in `[ ]` placeholders. Keep it short — this is an invite to a conversation, not a
pitch deck.

```
Hi [稱呼]，

我是 DonationBar 的開發者，這是一個給實況主用的斗內進度條 + OBS 疊加層工具，串接綠界
金流，讓觀眾贊助可以直接反映在直播畫面上。

想邀請你成為前幾位測試夥伴：
- 30 天免費使用，全程協助設定（綠界收款、OBS 疊加層）
- 不需要任何工程背景，我會全程陪同設定
- 交換條件是你願意用一次、提供真實回饋（大概第一週會跟你確認一次，之後看情況約訪談）

如果你最近在用其他斗內工具，或完全沒有斗內功能，都可以聊聊，我想了解真實的痛點在哪。

方便的話想約 15-20 分鐘聊聊，看合不合適，你這週或下週哪天比較方便？

[你的名字]
```

## Week-1 check-in question set

Per ROADMAP.md section 13 ("Observe onboarding; check in week one"):

1. 從收到邀請到看到第一筆測試捐款出現在畫面上，大概花了多久？中間卡在哪一步？
2. 綠界的設定步驟，有沒有哪裡覺得不清楚或想放棄？
3. OBS 疊加層加進去之後，畫面看起來符合預期嗎？（顏色、字型、透明背景）
4. 目前最想要但還沒有的功能是什麼？
5. 願意付多少錢繼續使用？（不要在這週問這題如果對方明顯還在猶豫要不要留下）

## Biweekly interview / exit process

Not yet drafted — ROADMAP.md section 13 calls for "interview biweekly and at exit" but
doesn't specify a question set beyond week one, and section 15–16 flags "low willingness
to pay" as a risk to watch for specifically. Draft this once the first 5 design partners
are recruited and the week-1 questions have been asked at least once, so the biweekly
questions can build on real answers instead of guessing what will matter.

## What this does not cover

- Actually contacting anyone — that's a real message to a real person and needs to come
  from you, not an automated agent.
- Legal terms of the "free 30 days for feedback" exchange — if this ever looks like a
  paid engagement in exchange for services, loop in whoever handles the
  [Legal/data baseline](../../ROADMAP.md) P0 row.
- Tracking who was contacted, when, or their responses — no CRM/spreadsheet exists in
  this repository for that; keep it wherever you already track outreach.

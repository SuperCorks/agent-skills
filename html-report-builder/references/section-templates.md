# Section templates

Copyable sections for reports, built from the components in `components.md`. Read only the ones you need: pick them from the catalogue in `templates.md`, copy the markup into your report, and replace the sample content (Harbor & Pine's checkout investigation) with yours. Keep each section's `id` unique, give it an `<h2>`, and delete any part you have nothing for.

Charts and diagrams are drawn by `report.mjs build` (see "Charts" and "Diagrams" in `components.md`); copy only the `figure` with its JSON or Mermaid source.

## 1. Key findings

The top of a findings report or brief: the verdict in a `.callout`, three to five `.tiles`, then three to five numbered `ol.keypoints`. A tone on a key point (`ok`, `risk`) marks good or bad news. A reader who stops here should know the answer.

```html
<section id="summary" data-toc="Key findings">
  <h2>Key findings</h2>
  <div class="callout risk"><p><b>Verdict:</b> the September theme release broke the card form on Safari for shoppers with a saved address. <b>Confidence: high.</b></p></div>
  <div class="tiles">
    <div class="tile risk"><span>Paid orders lost</span><b>~40 a day</b><small>Sep 12 to Sep 19</small></div>
    <div class="tile"><span>Shoppers affected</span><b>1 in 5</b><small>Safari with a saved address</small></div>
    <div class="tile ok"><span>Since the hotfix</span><b>-78%</b><small>daily card errors</small></div>
  </div>
  <ol class="keypoints">
    <li class="risk"><b>Theme 4.2 broke Safari autofill on the card form.</b> Errors rose from about 40 to 180 a day on September 12.</li>
    <li><b>Shipping cost appears only at payment,</b> so 45% of shoppers who reach shipping leave before paying.</li>
    <li class="ok"><b>The hotfix holds.</b> Errors are back to about 40 a day, but the express wallets are still missing.</li>
  </ol>
</section>
```

## 2. Decisions needed

Full-sentence questions with context, a `.rec`, the `.owner`, `.links` to the detail, and an empty `.answer`. When the reader types an answer, the card turns green and shows Answered, so the section doubles as the decision record.

```html
<section id="decisions" data-toc="Decisions">
  <h2>Decisions needed</h2>
  <article class="question" id="q1">
    <h3>Should the pilot run on 20% of mobile traffic rather than all traffic?</h3>
    <p>A smaller share protects holiday sales but takes about two weeks longer to show a 15% lift with confidence. This sets the phase 2 gate.</p>
    <p class="rec">Yes, 20%. A bad pilot then costs at most a fifth of mobile orders for a day.</p>
    <p class="owner">Dana Whitfield, CEO</p>
    <p class="links"><a href="#phases">Phase 2</a> · <a href="#risks">Holiday risk</a></p>
    <p class="answer"></p>
  </article>
  <article class="question" id="q2">
    <h3>Should payments stay on Shopify Payments during the pilot?</h3>
    <p>Changing provider would add a second variable to the pilot and a new contract.</p>
    <p class="rec">Yes. Keep Shopify Payments and add Shop Pay and Apple Pay on top.</p>
    <p class="owner">Finance</p>
    <p class="answer">Yes, keep Shopify Payments. (Finance, October 8)</p>
  </article>
</section>
```

## 3. Scope, non-goals, and assumptions

What is in and what is out side by side, then the assumptions across the full row (`.card.wide`). Plain lists in a card line up with its heading.

```html
<section id="scope" data-toc="Scope">
  <h2>Scope, non-goals, and assumptions</h2>
  <div class="grid">
    <div class="card"><h3>In scope</h3><ul class="pros"><li>Checkout on mobile and desktop web</li><li>Card, Shop Pay, and Apple Pay</li><li>Checkout tracking in GA4</li></ul></div>
    <div class="card"><h3>Not in scope</h3><ul class="cons"><li>The mobile app</li><li>Changing payment provider</li><li>Cart and product pages</li></ul></div>
    <div class="card wide"><h3>Assumptions</h3><ul><li>Shopify Plus stays the platform</li><li>Holiday code freeze starts December 1</li></ul></div>
  </div>
</section>
```

## 4. Findings and what they affect

Finding cards in order of severity, each with its evidence pills and a `ul.chips` of the pages, forms, or accounts it affects (chips also suit tags and values). Answer "which pages does this affect?" before the reader asks.

```html
<section id="findings" data-toc="Findings">
  <h2>Findings</h2>
  <article class="finding risk" id="f1">
    <h3>Theme 4.2 breaks the card form on Safari when an address is saved</h3>
    <p><span class="pill risk">High</span> <span class="pill observed">Observed</span> Confidence: high</p>
    <p>Safari's address autofill fills the hidden card-name field, and the payment frame rejects the form. Reproduced on Safari 18 on iPhone and Mac.</p>
    <ul class="chips"><li class="risk">/checkouts/*/payment</li><li class="risk">/checkouts/*/information</li><li>/cart (not affected)</li></ul>
  </article>
  <article class="finding warn" id="f2">
    <h3>Shipping cost first appears on the payment step</h3>
    <p><span class="pill warn">Medium</span> <span class="pill executed">Executed</span> Confidence: medium</p>
    <p>Test orders show the shipping line only after the address step; 45% of sessions leave between shipping and payment.</p>
    <ul class="chips"><li class="warn">/checkouts/*/shipping</li><li class="warn">/cart</li></ul>
  </article>
</section>
```

## 5. Source-of-truth matrix

Each metric against each system. A tone on a cell draws a mark (`ok` ✓, `warn` ◐, `risk` ✕, `info` ○) and the cell text always names the state, so meaning never rests on the mark or colour alone.

```html
<section id="truth" data-toc="Source of truth">
  <h2>Where each number is checked</h2>
  <div class="table-wrap"><table>
    <thead><tr><th>Metric</th><th>Shopify admin</th><th>GA4</th><th>Warehouse</th><th>Dashboard</th></tr></thead>
    <tbody>
      <tr><td>Checkout sessions</td><td class="info">Source of truth</td><td class="ok">Within 2%</td><td class="ok">Matches</td><td class="ok">Matches</td></tr>
      <tr><td>Paid orders</td><td class="info">Source of truth</td><td class="warn">9% low</td><td class="ok">Matches</td><td class="ok">Matches</td></tr>
      <tr><td>Payment errors</td><td class="info">Source of truth</td><td class="risk">Not tracked</td><td class="warn">Daily only</td><td class="risk">Missing</td></tr>
      <tr><td>Revenue</td><td class="info">Source of truth</td><td class="warn">6% low</td><td class="ok">Matches</td><td class="ok">Matches</td></tr>
    </tbody>
  </table></div>
</section>
```

## 6. Trend

A measure over time as a Plotly line: the threshold and the event that explains the change as `shapes`, their labels and the latest value as `annotations`. Hover shows every day. The heading states what changed; the caption names the measure and the period.

```html
<section id="trend" data-toc="Trend">
  <h2>Card errors jumped fourfold after theme 4.2 shipped</h2>
  <figure class="chart">
    <script type="application/json" data-hr-chart>{"data":[{"type":"scatter","mode":"lines","name":"Card errors","x":["2026-09-01","2026-09-02","2026-09-03","2026-09-04","2026-09-05","2026-09-06","2026-09-07","2026-09-08","2026-09-09","2026-09-10","2026-09-11","2026-09-12","2026-09-13","2026-09-14","2026-09-15","2026-09-16","2026-09-17","2026-09-18","2026-09-19","2026-09-20","2026-09-21","2026-09-22","2026-09-23","2026-09-24","2026-09-25","2026-09-26","2026-09-27","2026-09-28","2026-09-29","2026-09-30"],"y":[38,44,41,36,47,42,39,45,40,43,37,168,182,175,190,171,186,194,179,188,172,191,183,177,196,185,174,189,181,178],"hovertemplate":"%{y} card errors<extra></extra>"}],"layout":{"showlegend":false,"xaxis":{"tickformat":"%b %-d","hoverformat":"%a %b %-d","dtick":604800000},"yaxis":{"rangemode":"tozero"},"shapes":[{"type":"line","xref":"paper","x0":0,"x1":1,"y0":100,"y1":100,"line":{"color":"token:risk","width":1}},{"type":"line","yref":"paper","x0":"2026-09-11 22:00","x1":"2026-09-11 22:00","y0":0,"y1":1,"line":{"color":"token:muted","width":1}}],"annotations":[{"xref":"paper","x":0,"xanchor":"left","y":100,"yanchor":"bottom","text":"Alert threshold: 100 a day"},{"x":"2026-09-11 22:00","yref":"paper","y":1,"xanchor":"left","yanchor":"top","text":" Theme 4.2 released, Sep 11"},{"x":"2026-09-30","y":178,"xanchor":"left","text":" 178","font":{"color":"token:ink"}}]}}</script>
    <figcaption>Daily card errors at checkout, September 2026</figcaption>
  </figure>
</section>
```

## 7. Funnel

Counts that narrow step by step, with the share that continues at each step and the worst step in `token:risk`. Plotly's bundle has no funnel type, so draw centred horizontal bars: each bar's `base` is half the gap to the first bar.

```html
<section id="funnel" data-toc="Funnel">
  <h2>One in eight shoppers who start checkout pays</h2>
  <figure class="chart">
    <script type="application/json" data-hr-chart>{"data":[{"type":"bar","orientation":"h","y":["Started checkout","Entered shipping","Reached payment","Paid"],"x":[48200,29400,16300,5800],"base":[0.0,9400.0,15950.0,21200.0],"marker":{"color":["token:accent","token:accent","token:accent","token:risk"]},"text":["48,200","29,400 · 61% continue","16,300 · 55% continue","5,800 · 36% continue"],"textposition":"outside","cliponaxis":false,"width":0.62,"hovertemplate":"%{y}: %{text}<extra></extra>"}],"layout":{"showlegend":false,"height":230,"xaxis":{"visible":false,"range":[0,64000]},"yaxis":{"autorange":"reversed","showgrid":false,"showspikes":false}}}</script>
    <figcaption>Checkout sessions by step, July to September 2026</figcaption>
  </figure>
</section>
```

## 8. Mix by group

How each group splits into up to four parts, as stacked 100% bars (`barmode: "stack"`). Parts keep a fixed order and the series colours; Plotly hides a label that does not fit, and hover shows it. Put the totals at the end of each row and the numbers in a `details` table as the text view.

```html
<section id="mix" data-toc="Mix">
  <h2>Safari form errors became the main reason payments fail</h2>
  <figure class="chart">
    <script type="application/json" data-hr-chart>{"data":[{"type":"bar","orientation":"h","name":"Declined by bank","y":["July","August","September"],"x":[52,45,31],"texttemplate":"%{x}","textposition":"inside","insidetextanchor":"middle","hovertemplate":"%{x}"},{"type":"bar","orientation":"h","name":"Safari form error","y":["July","August","September"],"x":[18,27,46],"texttemplate":"%{x}","textposition":"inside","insidetextanchor":"middle","hovertemplate":"%{x}"},{"type":"bar","orientation":"h","name":"3-D Secure timeout","y":["July","August","September"],"x":[20,19,16],"texttemplate":"%{x}","textposition":"inside","insidetextanchor":"middle","hovertemplate":"%{x}"},{"type":"bar","orientation":"h","name":"Other","y":["July","August","September"],"x":[10,9,7],"texttemplate":"%{x}","textposition":"inside","insidetextanchor":"middle","hovertemplate":"%{x}"}],"layout":{"barmode":"stack","height":250,"bargap":0.3,"uniformtext":{"minsize":11,"mode":"hide"},"margin":{"r":110},"xaxis":{"range":[0,100],"ticksuffix":"%","showspikes":false},"yaxis":{"autorange":"reversed","showgrid":false,"showspikes":false},"annotations":[{"x":100,"y":"July","xanchor":"left","text":" 3,120 failed","font":{"color":"token:ink"}},{"x":100,"y":"August","xanchor":"left","text":" 3,480 failed","font":{"color":"token:ink"}},{"x":100,"y":"September","xanchor":"left","text":" 5,960 failed","font":{"color":"token:ink"}}]}}</script>
    <figcaption>Why payments fail, share of failed payments by month</figcaption>
  </figure>
  <details><summary>Show the numbers</summary><div class="table-wrap"><table>
    <thead><tr><th>Month</th><th class="num">Declined</th><th class="num">Safari form</th><th class="num">3-D Secure</th><th class="num">Other</th><th class="num">Failed payments</th></tr></thead>
    <tbody><tr><td>July</td><td class="num">52%</td><td class="num">18%</td><td class="num">20%</td><td class="num">10%</td><td class="num">3,120</td></tr>
    <tr><td>August</td><td class="num">45%</td><td class="num">27%</td><td class="num">19%</td><td class="num">9%</td><td class="num">3,480</td></tr>
    <tr><td>September</td><td class="num">31%</td><td class="num">46%</td><td class="num">16%</td><td class="num">7%</td><td class="num">5,960</td></tr></tbody>
  </table></div></details>
</section>
```

## 9. Against targets

Each measure as a bar from zero, the target as a line shape with its label, and misses in `token:risk`. Floating bars (a `base`) show ranges such as confidence intervals.

```html
<section id="targets" data-toc="Against targets">
  <h2>Two page types miss the 2.5-second load target on mobile</h2>
  <figure class="chart">
    <script type="application/json" data-hr-chart>{"data":[{"type":"bar","orientation":"h","y":["Home","Product","Collection","Cart"],"x":[4.8,3.9,2.3,1.9],"marker":{"color":["token:risk","token:risk","token:accent","token:accent"]},"text":["4.8 s","3.9 s","2.3 s","1.9 s"],"textposition":"inside","cliponaxis":false,"width":0.55,"hovertemplate":"%{x}<extra></extra>","insidetextanchor":"end","textfont":{"color":"#ffffff"}}],"layout":{"showlegend":false,"height":220,"xaxis":{"range":[0,6],"dtick":1,"ticksuffix":" s","showspikes":false},"yaxis":{"autorange":"reversed","showgrid":false,"showspikes":false},"shapes":[{"type":"line","x0":2.5,"x1":2.5,"yref":"paper","y0":0,"y1":1,"line":{"color":"token:ink","width":1.5}}],"annotations":[{"x":2.5,"yref":"paper","y":1,"xanchor":"left","yanchor":"bottom","text":" Target 2.5 s"}]}}</script>
    <figcaption>Largest contentful paint, mobile, 75th percentile</figcaption>
  </figure>
</section>
```

## 10. Timeline

An investigation or incident in order, as `ol.steps.timeline` with a `time` per step. Tones mark when things went wrong (`risk`) and when they were fixed (`ok`).

```html
<section id="timeline" data-toc="Timeline">
  <h2>What happened, in order</h2>
  <ol class="steps timeline">
    <li><time>Sep 11, 22:05</time><p>Theme 4.2 released with the new address form.</p></li>
    <li class="risk"><time>Sep 12, 09:00</time><p>Card errors reach 168 a day, up from about 40.</p></li>
    <li class="warn"><time>Sep 15</time><p>Support tickets start mentioning Safari.</p></li>
    <li><time>Sep 18</time><p>Red Krypton reproduces the error on Safari 18 with a saved address.</p></li>
    <li class="ok"><time>Sep 19, 11:30</time><p>Hotfix turns off autofill on the hidden field; errors fall within hours.</p></li>
  </ol>
</section>
```

## 11. Current versus target

Two step-by-step paths in a `.compare`: an `ol.flow` inside each side stacks vertically with arrows between steps. Tone the steps that change (`risk` today, `ok` in the target).

```html
<section id="current" data-toc="Current vs target">
  <h2>Today versus the target checkout</h2>
  <div class="compare">
    <figure class="before"><h3>Today</h3><ol class="flow"><li>Cart</li><li>Shipping address</li><li class="risk">Shipping cost appears</li><li>Card form (fails on Safari)</li></ol></figure>
    <figure class="after"><h3>Target</h3><ol class="flow"><li class="ok">Cart with shipping estimate</li><li class="ok">Shop Pay or Apple Pay</li><li>Order confirmed</li></ol></figure>
  </div>
</section>
```

## 12. Options compared

Options against criteria in a table: `col.recommended` and `th.recommended` tint the recommended column, cell tones draw marks, and the `.rec` under the table says why. Use `.options` cards above it when each option needs pros and cons.

```html
<section id="options" data-toc="Options">
  <h2>Options compared</h2>
  <div class="table-wrap"><table>
    <colgroup><col><col><col class="recommended"><col></colgroup>
    <thead><tr><th></th><th>A. Patch the theme</th><th class="recommended">B. Headless checkout</th><th>C. Replatform</th></tr></thead>
    <tbody>
      <tr><td>Fixes Safari errors</td><td class="warn">Until the next theme update</td><td class="ok">Yes</td><td class="ok">Yes</td></tr>
      <tr><td>Adds express wallets</td><td class="risk">No</td><td class="ok">Yes</td><td class="ok">Yes</td></tr>
      <tr><td>Keeps current apps</td><td class="ok">Yes</td><td class="ok">Yes</td><td class="risk">Rebuilt</td></tr>
      <tr><td>Risk to holiday sales</td><td class="ok">Low</td><td class="ok">Low</td><td class="risk">High</td></tr>
      <tr><td>Investment</td><td>$15K</td><td>$48K</td><td>$250K+</td></tr>
    </tbody>
  </table></div>
  <p class="rec">B. It fixes the cause and adds wallets for a fifth of the cost of replatforming, and the pilot can be switched off.</p>
</section>
```

## 13. Phases

Phases with an owner, the work that can run in parallel (`.lanes`), and the exit criterion that gates the next phase (`.gate` adds "Exit:"). Phases, not dates, unless dates were requested.

```html
<section id="phases" data-toc="Phases">
  <h2>Phases</h2>
  <ol class="steps">
    <li class="ok"><h3>Phase 1: Stop the errors</h3><p>Keep the hotfix and show shipping cost in the cart.</p><p class="owner">Red Krypton</p><p class="gate">card errors under 50 a day for a week</p></li>
    <li><h3>Phase 2: Pilot the headless checkout</h3><p>20% of mobile traffic, with Shop Pay and Apple Pay.</p>
      <div class="lanes"><div class="lane"><h4>Storefront (parallel)</h4><p>Checkout app and wallets.</p></div><div class="lane"><h4>Data (parallel)</h4><p>Checkout events in GA4 and the warehouse.</p></div></div>
      <p class="owner">Red Krypton, with Priya Shah for content</p><p class="gate">paid orders per session up 15%</p></li>
    <li><h3>Phase 3: Roll out</h3><p>All traffic, then retire the old checkout.</p><p class="owner">Red Krypton</p><p class="gate">two weeks without a checkout incident</p></li>
  </ol>
</section>
```

## 14. Architecture and data flow

A Mermaid `flowchart LR` with each layer as a subgraph, then a table of the systems. Mark new parts `:::new` (heavier green border, and start the label with +) and retired parts `:::retired` (dashed, struck through). Connect layer to layer when there are more than about eight parts.

```html
<section id="architecture" data-toc="Architecture">
  <h2>Architecture and data flow</h2>
  <figure class="diagram">
    <script type="text/x-mermaid" data-hr-diagram>flowchart LR
  subgraph storefront [Storefront]
    direction TB
    theme[Shopify theme]
    headless[+ Headless checkout]:::new
  end
  subgraph payments [Payments]
    direction TB
    spay[Shopify Payments]
    shoppay[+ Shop Pay]:::new
    applepay[+ Apple Pay]:::new
  end
  subgraph events [Events]
    direction TB
    csv[Nightly CSV]:::retired
    queue[+ Webhook queue]:::new
  end
  subgraph operations [Operations]
    direction TB
    netsuite[NetSuite]
    warehouse[Warehouse]
    klaviyo[Klaviyo]
  end
  storefront --> payments --> events --> operations</script>
    <figcaption>Order data after the pilot. + new · struck through: retired</figcaption>
  </figure>
  <div class="table-wrap"><table>
    <thead><tr><th>System</th><th>Role</th><th>Direction</th></tr></thead>
    <tbody><tr><td>Headless checkout</td><td>Collects address and payment</td><td>Writes orders to Shopify</td></tr>
    <tr><td>Webhook queue</td><td>Carries order events</td><td>Shopify to NetSuite and the warehouse</td></tr></tbody>
  </table></div>
</section>
```

## 15. QA and acceptance

The QA matrix with a status mark per check, then the acceptance `.checklist` with done items ticked.

```html
<section id="qa" data-toc="QA">
  <h2>QA and acceptance</h2>
  <div class="table-wrap"><table>
    <thead><tr><th>Check</th><th>How</th><th>Status</th></tr></thead>
    <tbody>
      <tr><td>Card payment with a saved address</td><td>Safari 18, iPhone and Mac</td><td class="ok">Pass</td></tr>
      <tr><td>Shop Pay end to end</td><td>Test order on iOS and Android</td><td class="warn">Android only</td></tr>
      <tr><td>Checkout events reach GA4</td><td>DebugView during a test order</td><td class="risk">Fail</td></tr>
      <tr><td>Rollback switch</td><td>Turn the pilot off in staging</td><td class="info">Not run</td></tr>
    </tbody>
  </table></div>
  <ul class="checklist">
    <li class="done">No card errors on Safari for seven days</li>
    <li>Shop Pay and Apple Pay work on iOS and Android</li>
    <li>GA4 and the warehouse agree on paid orders within 2%</li>
  </ul>
</section>
```

## 16. Risks and mitigations

Each risk with its likelihood and impact as pills, the mitigation, and the owner. Two to five risks; more belong in an appendix.

```html
<section id="risks" data-toc="Risks">
  <h2>Risks and mitigations</h2>
  <div class="table-wrap"><table>
    <thead><tr><th>Risk</th><th>Likelihood</th><th>Impact</th><th>Mitigation</th><th>Owner</th></tr></thead>
    <tbody>
      <tr><td>Pilot lowers conversion during the holidays</td><td><span class="pill warn">Medium</span></td><td><span class="pill risk">High</span></td><td>20% of traffic and a one-click switch back</td><td>Red Krypton</td></tr>
      <tr><td>A theme update breaks the hotfix</td><td><span class="pill warn">Medium</span></td><td><span class="pill warn">Medium</span></td><td>Safari test order before every release</td><td>Priya Shah</td></tr>
      <tr><td>Wallet setup waits on Apple domain approval</td><td><span class="pill ok">Low</span></td><td><span class="pill warn">Medium</span></td><td>Start verification in phase 1</td><td>Red Krypton</td></tr>
    </tbody>
  </table></div>
</section>
```

## 17. Screenshot review

Before and after screens with numbered `.pins` (each `span` placed at `--x` and `--y` from 0 to 1 across the image), then an ordered list that explains each number. Pins work on a screenshot `img` or a `.device` mockup.

```html
<section id="review" data-toc="Screenshot review">
  <h2>What changes on the payment screen</h2>
  <div class="compare">
    <figure class="before"><h3>Today</h3>
      <div class="pins">
        <img src="checkout-review.assets/payment-today.png" alt="Payment step today: card form with a verification error">
        <span style="--x:.08;--y:.36">1</span>
        <span style="--x:.08;--y:.73">2</span>
      </div>
    </figure>
    <figure class="after"><h3>Target</h3>
      <div class="pins">
        <img src="checkout-review.assets/cart-target.png" alt="Cart in the pilot: shipping estimate and wallet buttons">
        <span class="ok" style="--x:.08;--y:.36">3</span>
        <span class="ok" style="--x:.08;--y:.7">4</span>
      </div>
    </figure>
  </div>
  <ol>
    <li>Shipping cost appears for the first time on the payment step.</li>
    <li>The card form rejects Safari's autofilled name.</li>
    <li>The cart shows a shipping estimate before checkout starts.</li>
    <li>Express wallets skip the address and card forms.</li>
  </ol>
</section>
```

## 18. User story

One story per card: the trigger, a `.shots` strip of the screens in order (it scrolls sideways), the acceptance checklist, and a status pill.

```html
<section id="story" data-toc="User story">
  <h2>User stories</h2>
  <article class="card" id="story-1">
    <h3>A returning shopper pays with Shop Pay from the cart</h3>
    <p><small>Trigger: a signed-in shopper with a saved Shop Pay account opens the cart on mobile.</small> <span class="pill warn">Android only</span></p>
    <div class="shots">
      <figure><img src="checkout-review.assets/story-cart.png" alt="Cart with the Shop Pay button"><figcaption>1. Cart with the Shop Pay button</figcaption></figure>
      <figure><img src="checkout-review.assets/story-code.png" alt="Shop Pay one-time code"><figcaption>2. One-time code</figcaption></figure>
      <figure><img src="checkout-review.assets/story-review.png" alt="Review and pay"><figcaption>3. Review and pay</figcaption></figure>
      <figure><img src="checkout-review.assets/story-done.png" alt="Order confirmed"><figcaption>4. Confirmation</figcaption></figure>
    </div>
    <ul class="checklist"><li class="done">Shop Pay button appears above the fold</li><li>Payment completes without the card form on iOS</li></ul>
  </article>
</section>
```

## 19. Next steps

Who does what next, numbered, starting with what the reader must do: `ol.checklist` with the owner in `small`. A done step shows a check in place of its number.

```html
<section id="next" data-toc="Next steps">
  <h2>Next steps</h2>
  <ol class="checklist">
    <li class="done">Hotfix released and monitored <small>Red Krypton</small></li>
    <li>Answer question 1 on the pilot's share of traffic <small>Dana Whitfield, by October 24</small></li>
    <li>Start Apple Pay domain verification <small>Red Krypton</small></li>
    <li>Share theme release dates through December <small>Priya Shah</small></li>
  </ol>
</section>
```

## 20. Limits, definitions, and sources

What the evidence cannot show (a `.callout`), the terms a reader might not know (`dl.terms`), and where the numbers come from (`.sources`). Keep it last, and drop sources from client copies when asked.

```html
<section id="limits" data-toc="Limits and sources">
  <h2>Limits, definitions, and sources</h2>
  <div class="callout"><p><b>What this cannot show:</b> GA4 misses about 9% of paid orders, so conversion rates here come from Shopify, and lost revenue is an estimate at the September average order of $208.</p></div>
  <dl class="terms">
    <div><dt>Card error</dt><dd>A payment attempt the card form rejects before it reaches the bank.</dd></div>
    <div><dt>Paid orders per session</dt><dd>Paid orders divided by sessions that started checkout; the pilot's success measure.</dd></div>
    <div><dt>Headless checkout</dt><dd>A checkout page built outside the Shopify theme that still uses Shopify for orders and payments.</dd></div>
  </dl>
  <ul class="sources">
    <li>Shopify checkout report<small>Sessions by step, July to September 2026</small></li>
    <li>Shopify Payments error log<small>Failed payments by reason, July to September 2026</small></li>
    <li><a href="https://web.dev/articles/lcp">web.dev: Largest Contentful Paint</a><small>The 2.5-second target, checked October 2026</small></li>
  </ul>
</section>
```

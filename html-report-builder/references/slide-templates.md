# Slide templates

Copyable slides for decks, built from the components in `slides.md` and `components.md`. Read only the ones you need: pick them from the catalogue in `slides.md`, copy the markup, renumber the ids (`s1`, `s2`, ... in order), and replace the sample content (Red Krypton's checkout pilot for Harbor & Pine) with yours. Every slide is followed by its speaker notes; the notes here are placeholders.

Charts and diagrams are drawn by `report.mjs build` at the slide's size; copy only the `figure` with its JSON or Mermaid source. Check fit after building (see `slides.md`).

## 1. Cover

Who it is for, who it is from, and the promise in under ten words. A `p.footnotes` pins a confidentiality line to the bottom.

```html
<section class="slide cover" id="s1" data-toc="Cover">
  <p class="eyebrow">Red Krypton × Harbor &amp; Pine</p>
  <h1>Recover the sales checkout loses</h1>
  <p class="lede">Fix payment first, then decide how far to rebuild.</p>
  <dl class="meta"><div><dt>Prepared for</dt><dd>Dana Whitfield, CEO</dd></div><div><dt>Date</dt><dd>October 2026</dd></div></dl>
  <p class="footnotes">Confidential · for discussion only</p>
</section>
<aside class="notes"><p>Open with who this is for and the decision we need today.</p></aside>
```

## 2. Agenda

Numbered chapters with a one-line description each (`ol.agenda`), for decks over ten slides or ones read without a presenter. Repeat it as a chapter opener with `li.current` on the chapter that starts.

```html
<section class="slide" id="s2" data-toc="Agenda">
  <p class="eyebrow">Agenda</p>
  <h2>What we will cover in fifteen minutes</h2>
  <ol class="agenda">
    <li><b>Where checkout loses sales</b><small>The funnel and the payment drop</small></li>
    <li><b>What fixing it is worth</b><small>Ranges, not promises</small></li>
    <li><b>Three ways forward</b><small>Patch, headless, or replatform</small></li>
    <li><b>The path</b><small>Three gated phases</small></li>
    <li><b>Who does what</b><small>Owners on both sides</small></li>
    <li><b>What we need from you</b><small>One decision by October 24</small></li>
  </ol>
</section>
<aside class="notes"><p>Fifteen minutes, six parts; the decision is the last one.</p></aside>
```

## 3. Decision requested

The answer as slide two: a statement slide with the one-sentence ask and the three facts needed to say yes as `.tiles`.

```html
<section class="slide statement" id="s3" data-toc="Decision requested">
  <p class="eyebrow">Decision requested</p>
  <h2>Approve the checkout pilot by October 24.</h2>
  <div class="tiles">
    <div class="tile"><span>Decision</span><b>Approve pilot</b><small>phases 1 and 2</small></div>
    <div class="tile"><span>Investment</span><b>$48K</b><small>fixed fee</small></div>
    <div class="tile warn"><span>Deadline</span><b>Oct 24</b><small>clears the Dec 1 freeze</small></div>
  </div>
</section>
<aside class="notes"><p>If the meeting ended here, this is the message and the three facts behind it.</p></aside>
```

## 4. Big number

One figure carries the slide (`.bignum`, toned with `warn` or `risk`), with the reasons beside it in a `.grid.center` and the source in `.footnotes`.

```html
<section class="slide" id="s4" data-toc="Big number">
  <p class="eyebrow">Why now</p>
  <h2>Most shoppers who reach payment never pay</h2>
  <div class="grid center">
    <p class="bignum"><b>64%</b><span>of shoppers who reach payment leave without paying</span></p>
    <ol>
      <li>The card form fails on Safari when an address is saved.</li>
      <li>Shipping cost first appears on the payment step.</li>
      <li>There is no Shop Pay or Apple Pay.</li>
    </ol>
  </div>
  <p class="footnotes">Shopify checkout report, July to September 2026: 16,300 sessions reached payment.</p>
</section>
<aside class="notes"><p>Two in three shoppers who reach payment leave; the reasons are on the right.</p></aside>
```

## 5. Funnel

Counts that narrow step by step with the share that continues, as centred Plotly bars (each bar's `base` is half the gap to the first); the worst step in `token:risk`.

```html
<section class="slide" id="s5" data-toc="Funnel">
  <p class="eyebrow">Where buyers drop</p>
  <h2>One in eight shoppers who start checkout pays</h2>
  <figure class="chart">
    <script type="application/json" data-hr-chart>{"data":[{"type":"bar","orientation":"h","y":["Started checkout","Entered shipping","Reached payment","Paid"],"x":[48200,29400,16300,5800],"base":[0.0,9400.0,15950.0,21200.0],"marker":{"color":["token:accent","token:accent","token:accent","token:risk"]},"text":["48,200","29,400 · 61% continue","16,300 · 55% continue","5,800 · 36% continue"],"textposition":"outside","cliponaxis":false,"width":0.62,"hovertemplate":"%{y}: %{text}<extra></extra>"}],"layout":{"showlegend":false,"height":250,"xaxis":{"visible":false,"range":[0,64000]},"yaxis":{"autorange":"reversed","showgrid":false,"showspikes":false}}}</script>
    <figcaption>Checkout sessions by step, July to September 2026</figcaption>
  </figure>
  <p class="takeaway">Payment is the biggest drop, so the pilot starts there.</p>
</section>
<aside class="notes"><p>Read the drop at each step; payment loses the most, so the pilot starts there.</p></aside>
```

## 6. Part to whole

One stacked bar of up to four parts that add to 100%. Fold parts under about 7% into Other.

```html
<section class="slide" id="s6" data-toc="Part to whole">
  <p class="eyebrow">Revenue by channel</p>
  <h2>Nearly two thirds of revenue is mobile</h2>
  <figure class="chart">
    <script type="application/json" data-hr-chart>{"data":[{"type":"bar","orientation":"h","name":"Mobile web","y":["Revenue"],"x":[64],"texttemplate":"%{x}%","textposition":"inside","insidetextanchor":"middle","hovertemplate":"%{x}%"},{"type":"bar","orientation":"h","name":"Desktop","y":["Revenue"],"x":[29],"texttemplate":"%{x}%","textposition":"inside","insidetextanchor":"middle","hovertemplate":"%{x}%"},{"type":"bar","orientation":"h","name":"App","y":["Revenue"],"x":[7],"texttemplate":"%{x}%","textposition":"inside","insidetextanchor":"middle","hovertemplate":"%{x}%"}],"layout":{"barmode":"stack","height":170,"bargap":0.15,"uniformtext":{"minsize":14,"mode":"hide"},"xaxis":{"visible":false,"range":[0,100]},"yaxis":{"visible":false},"legend":{"y":1.05}}}</script>
    <figcaption>Revenue by channel, January to September 2026</figcaption>
  </figure>
  <p class="takeaway">Mobile checkout gets fixed first.</p>
</section>
<aside class="notes"><p>Mobile web is 64% of revenue, so mobile checkout goes first.</p></aside>
```

## 7. Trend

A measure over time from zero with an optional target line: the point in `token:accent`, the context in grey, and only the values that matter labelled.

```html
<section class="slide" id="s7" data-toc="Trend">
  <p class="eyebrow">Monthly conversion</p>
  <h2>Conversion has fallen five months in a row</h2>
  <figure class="chart">
    <script type="application/json" data-hr-chart>{"data":[{"type":"bar","x":["Apr","May","Jun","Jul","Aug","Sep"],"y":[2.9,2.7,2.5,2.3,2.1,1.9],"marker":{"color":["token:muted","token:muted","token:muted","token:muted","token:muted","token:accent"],"opacity":[0.35,0.35,0.35,0.35,0.35,1]},"text":["2.9%","","","","","1.9%"],"textposition":"inside","cliponaxis":false,"width":0.45,"hovertemplate":"%{x}: %{y}<extra></extra>","insidetextanchor":"end","textfont":{"color":["token:ink","token:ink","token:ink","token:ink","token:ink","#ffffff"]}}],"layout":{"showlegend":false,"height":250,"yaxis":{"range":[0,3.4],"ticksuffix":"%","dtick":1},"xaxis":{"showgrid":false},"shapes":[{"type":"line","xref":"paper","x0":0,"x1":1,"y0":3.0,"y1":3.0,"line":{"color":"token:ink","width":1.5}}],"annotations":[{"xref":"paper","x":1,"xanchor":"right","y":3.0,"yanchor":"bottom","text":"Target 3.0%"}]}}</script>
    <figcaption>Checkout conversion by month, 2026</figcaption>
  </figure>
  <p class="takeaway">Each month below target costs about $90K in sales.</p>
</section>
<aside class="notes"><p>Five months down; each month below target costs about $90K in sales.</p></aside>
```

## 8. Value ranges

Low-to-high estimates as floating Plotly bars (`base` is the low end), with the caveat in a `.callout` on the slide.

```html
<section class="slide" id="s8" data-toc="Value ranges">
  <p class="eyebrow">What it is worth</p>
  <h2>Fixing checkout is worth $0.6M–1.4M a year</h2>
  <figure class="chart">
    <script type="application/json" data-hr-chart>{"data":[{"type":"bar","orientation":"h","y":["Payment fixes","Shipping cost up front","Express wallets"],"base":[300,150,150],"x":[400,250,150],"marker":{"color":"token:accent"},"text":["$300K–700K","$150K–400K","$150K–300K"],"textposition":"outside","cliponaxis":false,"width":0.5,"hovertemplate":"%{y}: %{text}<extra></extra>"}],"layout":{"showlegend":false,"height":210,"xaxis":{"range":[0,900],"tickprefix":"$","ticksuffix":"K","showspikes":false},"yaxis":{"autorange":"reversed","showgrid":false,"showspikes":false}}}</script>
    <figcaption>Yearly value of each fix, low to high estimate</figcaption>
  </figure>
  <div class="callout warn"><p><b>Estimates:</b> based on September traffic. The pilot measures the real lift.</p></div>
</section>
<aside class="notes"><p>Ranges, not promises: the pilot measures the real lift.</p></aside>
```

## 9. Spectrum

Options placed between two extremes as a one-axis Plotly scatter: positions from 0 to 1, labels above or below their dot, and the recommended option larger and in `token:accent`.

```html
<section class="slide" id="s9" data-toc="Spectrum">
  <p class="eyebrow">How much to change</p>
  <h2>A headless checkout is the middle path</h2>
  <figure class="chart">
    <script type="application/json" data-hr-chart>{"data":[{"type":"scatter","mode":"markers+text","x":[0.04,0.45,0.96],"y":[0,0,0],"text":["A. Patch the theme<br>$15K","<b>B. Headless checkout</b><br>$48K pilot","C. Replatform<br>$250K+"],"textposition":["top right","bottom center","top left"],"marker":{"size":[16,22,16],"color":["token:muted","token:accent","token:muted"],"line":{"color":"token:surface","width":2}},"hovertemplate":"%{text}<extra></extra>","cliponaxis":false}],"layout":{"showlegend":false,"height":230,"hovermode":"closest","xaxis":{"visible":false,"range":[-0.04,1.04]},"yaxis":{"visible":false,"range":[-1.3,1.3],"showspikes":false},"shapes":[{"type":"line","x0":0,"x1":1,"y0":0,"y1":0,"layer":"below","line":{"color":"token:line","width":3}}],"annotations":[{"x":0,"y":-1.05,"xanchor":"left","yanchor":"top","text":"← Least change"},{"x":1,"y":-1.05,"xanchor":"right","yanchor":"top","text":"Most change →"}]}}</script>
    <figcaption>Three ways to fix checkout, from least to most change</figcaption>
  </figure>
  <p class="takeaway">B keeps everything that works and replaces only checkout.</p>
</section>
<aside class="notes"><p>A patch is cheap but temporary; a replatform is thorough but slow. B sits between.</p></aside>
```

## 10. Priority grid

A 2×2 (`.matrix`) of impact against effort, or likelihood against impact for risks. Quadrants go in reading order (top-left first); `data-x` and `data-y` label the axes, and a tone highlights the quadrant to act on.

```html
<section class="slide" id="s10" data-toc="Priority grid">
  <p class="eyebrow">Where to start</p>
  <h2>Three fixes are high impact and low effort</h2>
  <div class="matrix" data-x="Effort" data-y="Impact">
    <div class="ok"><h3>Quick wins</h3><ul><li>Show shipping cost in the cart</li><li>Add Shop Pay</li><li>Fix the Safari card form</li></ul></div>
    <div><h3>Big bets</h3><ul><li>Headless checkout</li><li>Saved carts across devices</li></ul></div>
    <div><h3>Fill-ins</h3><ul><li>Trust badges</li><li>Address autocomplete</li></ul></div>
    <div><h3>Not now</h3><ul><li>Custom payment gateway</li></ul></div>
  </div>
</section>
<aside class="notes"><p>Start with the top-left quadrant: high impact, low effort.</p></aside>
```

## 11. Option detail

One slide per option before the side-by-side: its numbers as `.tiles`, then what it is good for and the trade-off in a `.compare` whose headings replace the Before and After labels.

```html
<section class="slide" id="s11" data-toc="Option detail">
  <p class="eyebrow">Option B of 3</p>
  <h2>B. A headless checkout fixes payment first</h2>
  <div class="tiles">
    <div class="tile"><span>Investment</span><b>$48K</b><small>pilot, fixed fee</small></div>
    <div class="tile ok"><span>Risk to sales</span><b>Low</b><small>20% of traffic</small></div>
    <div class="tile"><span>Reversible</span><b>Yes</b><small>one switch back</small></div>
  </div>
  <div class="compare">
    <figure class="after"><h3>Good for Harbor &amp; Pine</h3><ul class="pros"><li>Keeps Shopify, apps, and reports</li><li>Proves the lift on 20% of traffic</li></ul></figure>
    <figure class="before"><h3>The trade-off</h3><ul class="cons"><li>A second front end to maintain</li><li>Theme edits need a developer</li></ul></figure>
  </div>
</section>
<aside class="notes"><p>What B is good for, and the trade-off, before the side-by-side.</p></aside>
```

## 12. Comparison

Options against criteria in a table of at most five rows: cell tones draw marks, and `col.recommended` tints the recommended column. Marks replace sentences, which keeps the slide under the word budget.

```html
<section class="slide" id="s12" data-toc="Comparison">
  <p class="eyebrow">Side by side</p>
  <h2>B gets most of the lift at a fifth of the cost</h2>
  <div class="table-wrap"><table>
    <colgroup><col><col><col class="recommended"><col></colgroup>
    <thead><tr><th></th><th>A. Patch</th><th class="recommended">B. Headless</th><th>C. Replatform</th></tr></thead>
    <tbody>
      <tr><td>Fixes payment errors</td><td class="warn">Partly</td><td class="ok">Yes</td><td class="ok">Yes</td></tr>
      <tr><td>Adds Shop Pay and Apple Pay</td><td class="risk">No</td><td class="ok">Yes</td><td class="ok">Yes</td></tr>
      <tr><td>Keeps current apps</td><td class="ok">Yes</td><td class="ok">Yes</td><td class="risk">Rebuilt</td></tr>
      <tr><td>Risk to holiday sales</td><td class="ok">Low</td><td class="ok">Low</td><td class="risk">High</td></tr>
      <tr><td>Investment</td><td>$15K</td><td>$48K</td><td>$250K+</td></tr>
    </tbody>
  </table></div>
</section>
<aside class="notes"><p>B matches the replatform on what matters at a fifth of the cost.</p></aside>
```

## 13. Open decisions

Each decision with its owner and status pill, in a table of at most five rows.

```html
<section class="slide" id="s13" data-toc="Open decisions">
  <p class="eyebrow">Open decisions</p>
  <h2>Four decisions shape the pilot</h2>
  <div class="table-wrap"><table>
    <thead><tr><th>Decision</th><th>Owner</th><th>Status</th></tr></thead>
    <tbody>
      <tr><td>Pilot gets 20% of mobile traffic</td><td>Dana Whitfield</td><td><span class="pill warn">Proposed</span></td></tr>
      <tr><td>Payments stay on Shopify Payments</td><td>Finance</td><td><span class="pill ok">Confirmed</span></td></tr>
      <tr><td>Who approves theme changes during the pilot</td><td>Marketing</td><td><span class="pill">Open</span></td></tr>
      <tr><td>Success means paid orders per session</td><td>Red Krypton</td><td><span class="pill warn">Proposed</span></td></tr>
    </tbody>
  </table></div>
  <p class="takeaway">We need the first answer before kickoff.</p>
</section>
<aside class="notes"><p>We need the first answer before kickoff; the others can follow in phase 1.</p></aside>
```

## 14. Gated phases

Phases, not dates, as cards in a `.grid.three`, each with its exit criterion pinned to the bottom of the card (`.gate`).

```html
<section class="slide" id="s14" data-toc="Gated phases">
  <p class="eyebrow">The path</p>
  <h2>Each phase must prove itself before the next</h2>
  <div class="grid three">
    <div class="card"><h3>Phase 1 · Fix payment</h3><p>Safari card form, and shipping cost shown in the cart.</p><p class="gate">payment drop below 50%</p></div>
    <div class="card"><h3>Phase 2 · Pilot</h3><p>Headless checkout on 20% of mobile traffic.</p><p class="gate">paid orders per session up 15%</p></div>
    <div class="card"><h3>Phase 3 · Roll out</h3><p>All traffic, then retire the old checkout.</p><p class="gate">two weeks without an incident</p></div>
  </div>
</section>
<aside class="notes"><p>Each phase has to pass its exit test before the next one starts.</p></aside>
```

## 15. Current versus future

Two paths side by side: an `ol.flow` inside each side of a `.compare`, with the changed steps toned.

```html
<section class="slide" id="s15" data-toc="Current vs future">
  <p class="eyebrow">The experience</p>
  <h2>Shoppers see the full price two steps earlier</h2>
  <div class="compare">
    <figure class="before"><h3>Today</h3><ol class="flow"><li>Cart</li><li>Shipping address</li><li class="risk">Shipping cost appears</li><li>Payment</li></ol></figure>
    <figure class="after"><h3>With the pilot</h3><ol class="flow"><li class="ok">Cart with shipping estimate</li><li class="ok">Shop Pay or Apple Pay</li><li>Order confirmed</li></ol></figure>
  </div>
</section>
<aside class="notes"><p>Shoppers see the full price in the cart instead of at payment.</p></aside>
```

## 16. Architecture

A Mermaid flowchart with each layer as a subgraph, connected layer to layer so it stays readable at slide size. New parts `:::new` with a +, retired parts `:::retired`.

```html
<section class="slide" id="s16" data-toc="Architecture">
  <p class="eyebrow">How it fits together</p>
  <h2>The pilot swaps one layer and keeps the rest</h2>
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
</section>
<aside class="notes"><p>Only the checkout layer changes; Shopify, payments, and the warehouse stay.</p></aside>
```

## 17. Team

People with their role and what they own: `.card.person` in a `.grid.three`, with `data-initials` or a photo as the card's first child.

```html
<section class="slide" id="s17" data-toc="Team">
  <p class="eyebrow">Who does what</p>
  <h2>One owner on each side keeps decisions moving</h2>
  <div class="grid three">
    <div class="card person" data-initials="DW"><h3>Dana Whitfield</h3><p><small>CEO, Harbor &amp; Pine</small></p><p>Approves scope and each phase gate.</p></div>
    <div class="card person" data-initials="PS"><h3>Priya Shah</h3><p><small>E-commerce manager</small></p><p>Owns theme content, promotions, and testing.</p></div>
    <div class="card person" data-initials="SC"><h3>Simon Corcos</h3><p><small>Fractional CTO, Red Krypton</small></p><p>Owns the plan, the weekly demo, and the numbers.</p></div>
  </div>
  <p class="takeaway">We meet weekly, and no decision waits more than two days.</p>
</section>
<aside class="notes"><p>One owner on each side; we meet weekly.</p></aside>
```

## 18. Offer and terms

The headline price (`.bignum`) beside the terms (`dl.terms`), labelled as a proposal. Drop the big number when the fee is for discussion.

```html
<section class="slide" id="s18" data-toc="Offer and terms">
  <p class="eyebrow">Proposal for discussion</p>
  <h2>A fixed-fee pilot, then an optional retainer</h2>
  <div class="grid center">
    <p class="bignum"><b>$48K</b><span>fixed fee for phases 1 and 2</span></p>
    <dl class="terms">
      <div><dt>Phase 3</dt><dd>$9K a month, optional</dd></div>
      <div><dt>Payment</dt><dd>Half at kickoff, half at the phase 2 gate</dd></div>
      <div><dt>Bonus</dt><dd>$10K if paid orders per session rise 15%</dd></div>
      <div><dt>Ending</dt><dd>Either side, with 30 days' notice</dd></div>
    </dl>
  </div>
</section>
<aside class="notes"><p>A fixed fee for phases 1 and 2, then an optional retainer.</p></aside>
```

## 19. Closing ask

One sentence the audience can say yes to on the `divider`, the next steps as `ol.checklist`, and a contact row (`dl.meta`).

```html
<section class="slide divider" id="s19" data-toc="Closing ask">
  <p class="eyebrow">Next steps</p>
  <h2>Approve the pilot by October 24.</h2>
  <ol class="checklist">
    <li>Harbor &amp; Pine confirms the pilot's share of traffic.</li>
    <li>Red Krypton gets staff access to Shopify and GA4.</li>
    <li>Kickoff on Monday, October 27.</li>
  </ol>
  <dl class="meta"><div><dt>Contact</dt><dd>Simon Corcos, Red Krypton</dd></div></dl>
</section>
<aside class="notes"><p>Close on the approval and the three steps after it.</p></aside>
```

## 20. Sources

An appendix slide after the ask, with a `.sources` list. For one or two sources, use `.footnotes` on the slide itself instead.

```html
<section class="slide" id="s20" data-toc="Sources">
  <p class="eyebrow">Appendix</p>
  <h2>Every number in this deck has a source</h2>
  <ul class="sources">
    <li>Shopify checkout report<small>Sessions by step, July to September 2026</small></li>
    <li>GA4 conversion by month<small>April to September 2026, all devices</small></li>
    <li><a href="https://baymard.com/lists/cart-abandonment-rate">Baymard Institute checkout benchmark</a><small>Industry abandonment rates, checked October 2026</small></li>
    <li>Red Krypton test orders<small>Safari 18 on iPhone and Mac, September 2026</small></li>
  </ul>
</section>
<aside class="notes"><p>Where every number in the deck comes from.</p></aside>
```

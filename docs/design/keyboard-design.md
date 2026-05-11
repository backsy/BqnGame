The keyboard problem is real and worth taking seriously — it's the single biggest UX risk on phone, because every interaction goes through it.

Why each approach you've considered has the friction it does:

Search-by-name fixes you to English and breaks the wordless ethos. It also requires the user to know the name, which is exactly what they're trying to learn. Self-defeating for the primary audience.

Slash-prefix shortcuts (like \rev for ⌽) work in desktop editors but are bad on phone — they require switching keyboards (alpha to glyph) and remembering mnemonics. Same problem as search: you have to know the name first.

One flat glyph keyboard runs out of space. BQN has ~50 primitives plus modifiers. Phone screens fit maybe 20-25 buttons at thumb-tappable size. You can't show them all at once.

What's actually worked in similar problems:

The closest analogues are math input keyboards (Desmos, MyScript, MathType) and emoji pickers. Both face the "many symbols, small screen, no good text fallback" problem.

Emoji pickers solved it with categorized tabs: a row of category icons at top, swipe between pages. Recent/frequent at the front. Search as escape hatch but rarely needed once familiar. Crucially, each category is a visual grouping you learn spatially — emoji users don't read "smileys" as a word, they tap the smiley icon.

Desmos solved it with modal keyboards: separate keyboard for numbers, separate for functions, toggle between them. The toggle is one tap and persistent.

A hybrid that probably fits your case:

Two keyboards, swappable with one tap:

1. Glyph keyboard — the BQN primitives, organized by visual/semantic groups. Each group is a tab or page with maybe 8-12 glyphs. Groups follow the motion vocabulary you're already building: structural (rotate, reverse, transpose), filtering (take, drop, filter), arithmetic, reduction (fold, scan), higher-order modifiers, etc. The same grouping that organizes your animations organizes the keyboard. This is a real win — it means learning the keyboard layout is learning the conceptual structure of the language.
2. Number/text keyboard — standard. For literals, variable names, comments. The system keyboard might even suffice here; you don't have to build it.

One toggle button switches between them. State is per-cursor-position or per-context if you can detect it (e.g. inside string literals, default to text).

The grouping is where the design work actually is. "Categorized" only helps if the categories are intuitive. Two ways to organize:

- By what they do (motion family): rotates and reverses together, takes and drops together, folds and scans together. Matches your animation vocabulary. This is probably right.
- By where they appear in code (syntax role): functions vs modifiers vs combinators. Matches BQN's own grammar. Also coherent.

These mostly agree but not entirely. I'd lean toward the motion-family grouping because it reinforces the visual learning. The keyboard becomes another instance of the same conceptual map.

Recent/frequent as a first tab is worth doing — it's how mature users actually want to work, and it makes the keyboard feel responsive to use rather than static.

One more idea worth considering: the glyphs animate in the keyboard itself. Tiny preview animations on each button, either always-on (subtle, looping) or on long-press. This solves a specific problem: a user who's forgotten what ⌽ does can long-press to see the rotate motion before committing. The keyboard is then also a reference. No words needed. Performance cost is real but manageable for ~50 glyphs.

This is probably your most distinctive UX move if you can pull it off — no other programming keyboard does this because no other language has the property that its operations are inherently animatable. You'd be exploiting a property unique to your design space.

Practical sequencing: start with a flat keyboard for an MVP, observe what's used most, derive groups from actual usage rather than a-priori categorization. You'll discover that some glyphs cluster naturally (the user reaching for one tends to reach for another nearby). The grouping that emerges from use will be better than any you design on paper.

The bigger frame: the keyboard isn't an input mechanism, it's a map of the language. Same as the puzzle progression and the animation vocabulary — every surface of the tool teaches the same conceptual structure from a different angle. If the keyboard layout is arbitrary, you're wasting a teaching surface. If it mirrors the motion families, every tap reinforces what every animation already taught.

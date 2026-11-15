# Wellness journal sentiment dataset

As of 2026-11-15, this lexicon is used only by the server's `web/journal-analysis.mjs` as internal
context for MUSE. Its generated module is excluded from public assets and the offline shell; there
is no user-facing sentiment panel. See [current journal contract](../../../docs/JOURNAL.md).

Source: https://github.com/cjhutto/vaderSentiment, revision `44fc044cd877310ee8278a0eadf34bcd50d41d06`, retrieved 2026-11-14.

`vader_lexicon.txt` is the upstream human-rated sentiment lexicon, not a collection of private journal entries. Each line contains a term, mean sentiment rating, rating standard deviation and individual ratings. Copyright C.J. Hutto; MIT license retained in LICENSE.txt. Reference: Hutto & Gilbert (2014), VADER: A Parsimonious Rule-based Model for Sentiment Analysis of Social Media Text.

Run `node scripts/build-sentiment.mjs` to produce the server term-to-mean-rating lookup, count, source revision and SHA-256 provenance. The journal uses a custom, transparent lexicon heuristic with a three-token negation window, simple intensity modifiers and mixed-tone detection. It is NOT the full VADER algorithm and has not been validated for astronaut wellness or clinical assessment. Sarcasm, quotations, context, other languages and compound expressions may be misread. No matched words produces “Not enough signal,” never an inference that the author is neutral.

Analysis runs only on the server for dated text explicitly submitted when saving or retrying a
reflection. The imperfect label and score are transient internal MUSE context; they are not returned
to either client or stored by the journal reflection endpoint. Guest/native text and public feedback
persist on the device; account text and public feedback persist in D1/SQLite. No sentiment-based
alerts, diagnoses or risk scores are generated. Both clients use the same MUSE journal contract.

Version 2 adds app-authored slang/spelling aliases, dictionary-checked repeated-letter normalization, and contextual handling of 'im cooked'. Explanations show original wording and the normalized term. Exact known terms are preserved; unknown strings are not assigned a score merely for having repeated letters. This is limited slang support, not general language understanding.

## Required MUSE reflection
Every new save requests MUSE through the configured website. Context includes the selected entry
and up to 11 earlier entries within 14 days, including positives and repeated wording. Entries 1–2
receive a brief acknowledgement and question; 3+ unlock collective suggestions. Internal sentiment
and provider reasoning remain behind the API. Only public feedback is returned and persisted.

The astronaut demo uses three server-owned fictional entries and real MUSE; it never accesses
personal journal storage. `META_API_KEY` remains a server runtime secret, never bundled in clients.
See [JOURNAL.md](../../../docs/JOURNAL.md) for the complete current contract and privacy limits.

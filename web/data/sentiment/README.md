# Wellness journal sentiment dataset

Source: https://github.com/cjhutto/vaderSentiment, revision `44fc044cd877310ee8278a0eadf34bcd50d41d06`, retrieved 2026-11-14.

`vader_lexicon.txt` is the upstream human-rated sentiment lexicon, not a collection of private journal entries. Each line contains a term, mean sentiment rating, rating standard deviation and individual ratings. Copyright C.J. Hutto; MIT license retained in LICENSE.txt. Reference: Hutto & Gilbert (2014), VADER: A Parsimonious Rule-based Model for Sentiment Analysis of Social Media Text.

Run `node scripts/build-sentiment.mjs` to produce the browser term-to-mean-rating lookup, count, source revision and SHA-256 provenance. The journal uses a custom, transparent lexicon heuristic with a three-token negation window, simple intensity modifiers and mixed-tone detection. It is NOT the full VADER algorithm and has not been validated for astronaut wellness or clinical assessment. Sarcasm, quotations, context, other languages and compound expressions may be misread. No matched words produces “Not enough signal,” never an inference that the author is neutral.

Analysis runs locally on saved entries. Journal text is not sent to the server, AI providers, sync API or NASA. Existing entries receive the same analysis at render time; their text is unchanged. Disabling the analysis checkbox hides sentiment feedback. No sentiment-based alerts, diagnoses or risk scores are generated. This integration is for the website journal; the native iOS theme summarizer remains separate.

Version 2 adds app-authored slang/spelling aliases, dictionary-checked repeated-letter normalization, and contextual handling of 'im cooked'. Explanations show original wording and the normalized term. Exact known terms are preserved; unknown strings are not assigned a score merely for having repeated letters. This is limited slang support, not general language understanding.

## Optional MUSE reflection
The separate Send this entry to MUSE button explicitly sends one entry (maximum 2,000 characters) through the server to Meta Muse Spark. No history, crew data or local scores are attached. The response is no-store and rendered as text, not HTML. The app does not persist the AI response. Local lexicon analysis remains on-device. META_API_KEY is a Sites runtime secret, never bundled. Request limits and provider timeouts apply.

# Video cards and teleprompter

Two self-contained pages for the take (no external resources): `cards.html` holds the title card, the limits card, the closing card and a route diagram; `teleprompter.html` holds the spoken words from `wiki/video-script.md` with a beat clock and a total clock.

## Serve

From this directory:

    python3 -m http.server 8790 --bind 127.0.0.1

Then open http://127.0.0.1:8790/cards.html and http://127.0.0.1:8790/teleprompter.html. Opening the files directly (file://) works too; the URL card parameter is the only thing that may not update in that case.

## Keys, cards.html

- space, right arrow, enter: next card; left arrow: previous card
- 1, 2, 3, 4: jump to the title card, the limits card, the closing card, the route diagram; the same number again replays the card's animation
- down arrow, up arrow: on the diagram, step through the route in order (highlights one step, dims the rest); up past the start shows everything again
- f: full screen; h: hide or show the key hint (the hint also hides as soon as any key is pressed)
- `?card=N` in the URL opens at card N with the hint hidden, for a second display or a screenshot

## Keys, teleprompter.html

- space: start or pause both clocks
- right arrow: next beat (the beat clock restarts, the total clock keeps running); left arrow: previous beat
- 0 to 9: jump to a beat; key 9 lands on beat 10 (beat 9 is not recorded)
- r: reset both clocks; h: hide or show the hint

The bar under the header is the beat clock against the beat's budget; it turns amber at 80 percent and red at 100 percent. There is no auto-scroll: the builder clicks in the app while speaking, so the beat changes by hand.

## How the cards are recorded

Record the browser window full screen, one card at a time: open cards.html in its own Chrome window, press f for full screen, press the card's number, start the screen recording, press the number again to replay the fade, let it hold, stop. Card 1 is beat 0, card 2 and card 3 are beat 10 (limits, then closing). The diagram (card 4) is optional B-roll for the proof wait in beat 4 and is not in the shot list.

Alternative: put the card page on a second display and capture that display while the voice is recorded with the main take. Either way the cards are cut in during the edit; the app take does not include them.

Export at 1080p; the pages are laid out as a 16:9 stage that fills the window at any resolution, type scales with the window.

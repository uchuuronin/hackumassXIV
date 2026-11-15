# Demo sites

Made-up websites for showing Milo reliably. All data is fake. Nothing is bought, booked or sent.

```
node sites/serve.mjs
```

| Address | What it is |
| --- | --- |
| http://localhost:4173/shop/ | Pennywhistle Home, a small shop: home, basket, checkout, thank-you |
| http://localhost:4173/clinic/ | Fernbrook Family Clinic: home, sign in with a code, a four-step booking |
| http://localhost:4174/ | The adverts, on a second address so they count as "another website" |
| http://localhost:4173/hard/ | Maple Street Gazette, a news page that is hard to read on purpose: faint grey writing, icon-only buttons, a scrolling line of news, a flashing banner, a video with no captions, no language set and zoom blocked. For "Make this page easier" |

## What is on them, and which feature it is for

| On the page | Where | For |
| --- | --- | --- |
| Tiny grey links (11px) | Top bar and footer of both sites | Tremor filter, click steadying, dwell click |
| Icon-only buttons with no name: search, basket, remove | Shop header and basket | Choice labels; the page map flags these labels as guesses |
| Three "remove" buttons that look the same | Shop basket | Labels that say which item each one removes |
| "Continue shopping" and "Checkout" that look alike | Shop basket | "What do I click?" |
| A fake "Download" advert in a frame from another address | Shop home | Fake-button check, page signals |
| A fake "Continue" button that is a picture linking to another address | Shop basket, between the two real buttons | Fake-button check |
| Small dropdowns | Basket quantity, clinic reason and time | Big Pick |
| The browser's date box | Clinic booking, step 2 | Big Pick |
| The site's own tiny calendar (`?look=2`) | Clinic booking, step 2 | Big Pick's fallback: the helper guides instead |
| A delivery form, half with autofill hints and half without | Shop checkout | Fill in my details |
| Card number, expiry and security code | Shop checkout | "Type this yourself"; never filled, never kept |
| A total, and a crossed-out old price | Shop | Key-word highlighting |
| A pre-ticked trial that renews at $12.99 a month | Shop checkout | Pay Pause ("does it renew?") |
| Express delivery chosen for you | Shop checkout | "Choose yours" step; questions about choices |
| Social Security number at a shop (`?tricky=1`) | Shop checkout | Over-Ask Alert |
| A session countdown (`?timeout=90`) | Shop checkout, clinic booking | Timeout warning |
| Steps that change without the page reloading | Clinic booking and sign-in | The page map rebuilding itself |
| A password, then a 6-digit code "sent to your phone" | Clinic sign-in | Sign-in guidance |
| Unfriendly error messages ("Invalid OTP. Authentication failed.") | Clinic sign-in | Plain words |
| A redesign: new layout, wording and ids (`?look=2`) | Both | Recorded tasks that still find their buttons |

## Switches

Add to any address. They are remembered for the tab.

- `?look=2` shows the redesigned site, and `?look=1` goes back.
- `?tricky=1` makes the shop checkout ask for too much.
- `?timeout=90` ends the session after 90 seconds, with a countdown for the last 45.
- `?reset=1` forgets all of the above, the basket and the booking.

The clinic's sign-in takes any email and password. The code is shown on the "demo phone" on the page.

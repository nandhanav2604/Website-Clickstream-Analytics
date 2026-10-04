# Gold Tables — Schema Reference

The four tables Power BI reads. Column names and types below were read from the
Parquet files themselves; descriptions follow the code that builds them
(`jobs/gold.py`, from `jobs/silver.py`).

| File | Grain (one row per…) | Rows* |
| --- | --- | --- |
| `data/gold/funnel_daily.parquet` | date × funnel step | 10 |
| `data/gold/product_performance.parquet` | product | 12 |
| `data/gold/session_summary.parquet` | session | 20 |
| `data/gold/user_features.parquet` | signed-in user | 20 |

\*As of the 4 Oct 2026 build: 317 events, 3 Oct demo plus one 26 Sep test
session.

**Refresh.** `make pipeline` (bronze → silver → gold) rewrites all four files
completely. Each table is one file at a fixed name, so point Power BI at the
file, not the folder.

**Conventions**

- **Times are UTC.** `timestamp[us, tz=UTC]` arrives in Power BI as
  Date/Time/Timezone. Add 5:30 for IST.
- **Dates are UTC calendar dates.** A session at 00:15 IST belongs to the
  previous UTC day.
- **Ratios are fractions from 0 to 1, rounded to 4 decimal places.** Format as
  % in Power BI; don't multiply by 100.
- **Money is ₹ as `double`.** Only cart checkouts carry an amount (see
  `cart_purchase_amount`).
- **`user_id` is a pseudonym.** It's 12 hex characters derived from the
  shopper's mobile number, and never the number itself. **`anonymous_id`** is a
  browser, not a person. Read the data-quality section before counting either.
- **Type mapping:** `int32`/`int64` → Whole number · `double` → Decimal ·
  `string` → Text · `bool` → True/False · `date32[day]` → Date.
- **Nulls:** the Parquet schema marks most columns nullable, which is a Spark
  default. In the current data, only the two columns noted below ever contain
  nulls.

## funnel_daily

Session-based funnel. Each row counts the sessions that **started** on
`event_date` and reached that step.

| Column | Type | Meaning |
| --- | --- | --- |
| `event_date` | date32[day] | UTC date the session started. |
| `step_order` | int32 | 1–5. Sort the funnel by this. |
| `step` | string | `Session started`, `Viewed shop`, `Interacted with a product`, `Added to cart or bought`, `Purchased`. |
| `sessions` | int64 | Sessions that started that day and reached this step. |
| `pct_of_sessions` | double | `sessions` ÷ step 1's `sessions` on the same date. |
| `pct_of_previous_step` | double | `sessions` ÷ previous step's `sessions` on the same date. **Null for step 1.** |

Step definitions (per session):

| Step | Reached when the session has… |
| --- | --- |
| 2 Viewed shop | a `shop_page_view` |
| 3 Interacted with a product | a `like`, `dislike`, `add_to_cart` or `buy_now` |
| 4 Added to cart or bought | an `add_to_cart` or `buy_now` |
| 5 Purchased | a `buy_now` or `cart_purchase` |

Steps are **not strict subsets**. Buy now skips the cart, and a cart filled in
one session can be bought in a later one. A later step can therefore exceed an
earlier one, and `pct_of_previous_step` can go above 1.

## product_performance

All-time interactions per product. Every row is a product from the storefront
catalogue (`script.js`); there are 12.

| Column | Type | Meaning |
| --- | --- | --- |
| `product_id` | int32 | Catalogue id, 1–12. |
| `product_name` | string | e.g. `Nike Air Sprint`. |
| `brand` | string | `Nike`, `Adidas`, `Puma`, `New Balance`. |
| `likes` | int64 | `like` events. Not reduced when a like is later removed. |
| `dislikes` | int64 | `dislike` events. Not reduced when a dislike is later removed. |
| `reactions_removed` | int64 | `reaction_removed` events (a like or dislike undone). Currently 0 for every product. |
| `add_to_cart` | int64 | `add_to_cart` events. |
| `remove_from_cart` | int64 | `remove_from_cart` events. |
| `buy_now_purchases` | int64 | Completed single-item purchases (Buy now → Place order). |
| `unique_visitors` | int64 | Distinct browsers (`anonymous_id`) that interacted with the product. |
| `unique_users` | int64 | Distinct signed-in users (`user_id`) that interacted with it. Can exceed `unique_visitors`; see data quality. |
| `first_interaction` | timestamp (UTC) | Earliest event for this product. |
| `last_interaction` | timestamp (UTC) | Latest event for this product. |
| `like_rate` | double | `likes ÷ (likes + dislikes)`. **Null when both are 0** (none currently). |
| `net_cart_adds` | int64 | `add_to_cart − remove_from_cart`. Not current cart contents: checkouts don't subtract. |

There is no per-product revenue, and no cart sales per product. A
`cart_purchase` event records only an item count and a total, not which
products were bought, so only `buy_now_purchases` can be attributed to a
product. Events don't carry price or category; join a product table in Power BI
if you need them.

## session_summary

One row per session. A session is a run of events from one browser
(`anonymous_id`) with no gap longer than 30 minutes, the same rule the
storefront uses.

| Column | Type | Meaning |
| --- | --- | --- |
| `session_key` | string | **Primary key.** 16 hex chars: hash of `anonymous_id` + `session_start`. Stable across rebuilds unless an earlier event for that session arrives late. |
| `anonymous_id` | string | Browser that produced the session. |
| `user_id` | string | **One** of the users seen in the session: the alphabetically first, not the first to log in. See `user_count`. |
| `user_count` | int32 | Distinct `user_id`s in the session. More than 1 means a shared browser. |
| `session_start` | timestamp (UTC) | First event. |
| `session_end` | timestamp (UTC) | Last event. |
| `session_date` | date32[day] | UTC date of `session_start`. Same as `funnel_daily.event_date`. |
| `duration_seconds` | int64 | `session_end − session_start`. 0 for a one-event session; time after the last event isn't counted. |
| `event_count` | int64 | Events in the session. |
| `entry_page` | string | Page of the first event: `index.html` or `shoes.html`. |
| `client_session_count` | int64 | Distinct storefront `session_id`s inside this session. Currently 1 everywhere, so the storefront's and the pipeline's sessions agree. |
| `shop_page_view_count` | int64 | `shop_page_view` events. |
| `filter_applied_count` | int64 | `filter_applied` events. **Inflated; see data quality.** |
| `filters_cleared_count` | int64 | `filters_cleared` events. |
| `like_count` | int64 | `like` events. |
| `dislike_count` | int64 | `dislike` events. |
| `add_to_cart_count` | int64 | `add_to_cart` events. |
| `remove_from_cart_count` | int64 | `remove_from_cart` events. |
| `view_cart_count` | int64 | `view_cart` events (cart drawer opened). |
| `buy_now_count` | int64 | Completed Buy now purchases. |
| `cart_purchase_count` | int64 | Completed cart checkouts. |
| `cart_purchase_amount` | double | ₹ total of this session's cart checkouts. Buy now amounts aren't included, because Buy now events carry no amount. |
| `viewed_shop` | bool | `shop_page_view_count > 0`. |
| `interacted_with_product` | bool | Any like, dislike, add to cart or Buy now. |
| `added_to_cart_or_bought` | bool | Any add to cart or Buy now. |
| `purchased` | bool | Any Buy now or cart checkout. |
| `abandoned_cart` | bool | Added to cart **and** made no purchase of any kind in the session. |

## user_features

One row per signed-in user (`user_id`). Event counts are exact per user.
Session features credit a shared session to **every** user in it.

| Column | Type | Meaning |
| --- | --- | --- |
| `user_id` | string | **Primary key.** Pseudonymised id (12 hex chars). |
| `first_seen` | timestamp (UTC) | User's first event. |
| `last_seen` | timestamp (UTC) | User's last event. |
| `events` | int64 | User's events. |
| `active_days` | int64 | Distinct UTC dates with an event. Currently 1 for everyone. |
| `devices` | int64 | Distinct browsers (`anonymous_id`) the user appeared on. |
| `age_group` | string | Self-reported at login, taken from the user's latest event: `under_18`, `18_25`, `26_40`, `41_60`, `60_plus`. |
| `gender` | string | Self-reported at login, taken from the user's latest event: `male`, `female`, `other`, `prefer_not_to_say`. |
| `filters_applied` | int64 | `filter_applied` events. **Inflated; see data quality.** |
| `likes` | int64 | `like` events. |
| `dislikes` | int64 | `dislike` events. |
| `add_to_cart` | int64 | `add_to_cart` events. |
| `remove_from_cart` | int64 | `remove_from_cart` events. |
| `buy_now_purchases` | int64 | Completed Buy now purchases. |
| `cart_purchases` | int64 | Completed cart checkouts. |
| `cart_purchase_amount` | double | ₹ total of the user's cart checkouts (Buy now not included). |
| `purchases` | int64 | `buy_now_purchases + cart_purchases`. |
| `sessions` | int64 | Sessions this user appears in. |
| `avg_session_seconds` | double | Mean `duration_seconds` of those sessions, 1 decimal place. |
| `converted_sessions` | int64 | Those sessions with `purchased = true`, including purchases made by another user in a shared session. |
| `session_conversion_rate` | double | `converted_sessions ÷ sessions`. |
| `favourite_brand` | string | Brand of most of the user's product events; ties broken alphabetically. |

There's no name column. Real names exist only in the raw (bronze) layer.

## Data quality — read before building

1. **`filter_applied` is about half false: 43 of 88.** Liking or disliking a
   product re-renders the grid through the same code path as filtering, which
   sends a `filter_applied` 2–63 ms after every `like`/`dislike`. In this
   data, all 43 reactions produced one, so **45 are genuine**. This inflates
   `session_summary.filter_applied_count` and `user_features.filters_applied`.
   Gold holds only counts, so it can't separate them. Subtract the session's
   or user's `like_count + dislike_count` for a corrected figure. The false
   events also repeat whatever filters were active, which skews any
   filter-value analysis built from silver. The storefront bug is known and
   not yet fixed.
2. **The 74% conversion reflects instructed users, not shoppers.** It's 14 of
   19 sessions on 3 Oct, and 15 of 20 including the single 26 Sep test
   session. Demo participants were asked to try the checkout, so treat
   conversion and purchase figures as a test of the flow, not as demand.
   Filter `session_date = 2026-10-03` to drop the test session.
3. **`anonymous_id` counts browsers; `user_id` counts people: 17 vs 20.** In 3
   sessions two or three people shared one browser, and one person used two
   devices. Use `user_id` for people and `anonymous_id` for browsers. Don't
   count people with `session_summary.user_id`, because it holds only one
   user per session.
4. **`abandoned_cart` is 3 of 18 cart sessions (17%).** 18 sessions added to
   cart: 11 checked out the cart, 4 bought only via Buy now, and 3 bought
   nothing. Only those 3 are abandoned.

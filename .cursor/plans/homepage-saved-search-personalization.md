# Homepage saved-search personalization

## Locked decisions
- Preferences stored as existing `SavedSearch` records (multiple per user; create / apply / delete)
- Filters combine with **AND**; empty field = any
- Filters: price min–max, property type(s), city (region/city picker), communities (typeahead multi-select)
- Active search filters **all homepage rails** (incl. Sold + Open Houses)
- **See all (A):** while personalized, rail “See all” opens `/search` **with the same query params**
- Header/hero **typed search** can still browse full inventory; banner clarifies state
- Persistent awareness banner + **Show all listings** restores default homepage

## Data model
Extend `SavedSearch`:
- `isHomepageActive Boolean @default(false)`
- At most one active per user (API clears others when activating)

Query JSON shape:
```ts
{
  minPrice?: string;
  maxPrice?: string;
  propertyTypes?: string[];
  city?: string;
  communities?: string[];
}
```

Extend listing search to accept `communities` (OR) and `propertyTypes` (IN).

## UX surfaces

### Homepage — Personalized listings
Button for signed-in customers → modal (price, types, city, multi community, name) → Save as SavedSearch (optionally auto-apply).

### Awareness banner
When active: “Homepage customized · {name}” + “Only listings matching your saved search — not all of Houzzat.”
Actions: **Show all listings**, **Change**, link to `/account/searches`.

### Account → Saved searches
**Apply to homepage**, Open, Delete; badge “On homepage” on active.

### Homepage data + See all
All rails filtered by active search. See all builds `/search?` from active query. Empty rails: “No matches for your search.”

### Search
From See all / Apply: filtered + banner. Fresh header search: full results; banner can say homepage is still customized.

## Implementation order
1. Schema + activate API + search provider multi filters
2. Personalize modal + save
3. Banner + account Apply
4. Homepage rails + See all (option A)

## Out of scope
- Alert delivery, pre-construction public UI, agent/admin homepage personalization

# Data model conventions

## Status

Accepted

## Context

Sign conventions, money representation and split storage are expensive to
change once code and data exist, so they are fixed before building.

## Decision

- Amounts are stored as integer cents in the single home currency (CAD).
- Expenses are negative and income is positive. A credit card balance is
  negative when money is owed. Importers normalise each bank's convention to
  this on the way in.
- Every transaction has one or more split lines. Category and amount live on
  the lines; an unsplit transaction has exactly one line, and line amounts
  sum to the transaction amount. Reports query lines only.
- A transfer is two linked transactions, one per account, excluded from
  spending and income reports.
- The raw bank description is stored unchanged. The cleaned payee is a
  separate field set by rules or by hand, so rules can be re-run safely.
- Fields edited by hand are tracked, and rules never overwrite them.
- Starter categories are Mint's top-level groups, trimmed, each with a few
  children, fully editable: Auto & Transport, Bills & Utilities, Food &
  Dining, Groceries, Health & Fitness, Home, Income, Shopping, Travel,
  Entertainment, Fees, Gifts & Donations, Kids, Personal Care, Taxes,
  Transfer, Uncategorized.

## Consequences

- Sums are exact and reports use one uniform query shape.
- Unsplit transactions pay a small cost of one extra row.
- Importers carry the burden of sign normalisation and need tests per format.

## Starter category children

Added by migration 3. Children inherit the parent kind, nesting is one level
deep, and names are unique across the whole tree. `Groceries`, `Transfer` and
`Uncategorized` have no children. Property Tax lives only under Home and
Hobbies only under Shopping.

- Auto & Transport: Gas & Fuel, Parking, Public Transit, Ride Share, Auto
  Insurance, Service & Parts, Vehicle Registration
- Bills & Utilities: Electricity, Natural Gas, Water & Sewer, Internet, Mobile
  Phone, TV & Streaming Bundles, Home Insurance
- Food & Dining: Restaurants, Coffee Shops, Fast Food, Bars & Alcohol, Food
  Delivery
- Health & Fitness: Doctor & Dental, Pharmacy, Vision, Gym & Sports, Health
  Insurance
- Home: Rent, Mortgage, Furnishings, Home Improvement, Lawn & Garden, Home
  Services, Property Tax
- Income: Paycheque, Bonus, Interest, Reimbursement, Tax Refund, Other Income
- Shopping: Clothing, Electronics & Software, Books & Media, Hobbies, Online
  Shopping
- Travel: Flights, Hotels & Lodging, Rental Car, Vacation Activities
- Entertainment: Movies & Events, Music, Games, Subscriptions
- Fees: Bank Fees, Interest Charges, Late Fees, Annual Fees
- Gifts & Donations: Gifts, Charity
- Kids: Childcare, School & Supplies, Activities, Toys
- Personal Care: Hair & Beauty, Spa & Massage, Laundry
- Taxes: Income Tax, Other Taxes

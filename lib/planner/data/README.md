# Currency region data

`currencies.json` is a reduced Unicode CLDR 49 supplemental currencyData extract, reviewed 2026-11-04. Source: https://github.com/unicode-org/cldr-json/blob/main/cldr-json/cldr-core/supplemental/currencyData.json.

`regions` selects the current tender currency for each region on the review date. `codes` retains recognized CLDR currency codes for legacy records. Names and fraction digits use the runtime's Intl/ICU data. Refresh after currency transitions; do not use this mapping as an exchange-rate source. Changing currency clears the spending amount instead of converting it.

Derived from Unicode CLDR data, Copyright © Unicode, Inc. Distributed under the Unicode License v3: https://www.unicode.org/license.txt.

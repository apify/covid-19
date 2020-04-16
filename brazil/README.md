# Coronavirus (COVID-19) Brazil Data

Grabs information from https://covid.saude.gov.br/ and exports as JSON data

The latest information can be found in https://api.apify.com/v2/key-value-stores/TyToNta7jGKkpszMZ/records/LATEST?disableRedirect=true and historical information on https://api.apify.com/v2/datasets/3S2T1ZBxB9zhRJTBB/items?format=json&clean=1

Actor ready-to-use on the Apify platform is available in https://apify.com/pocesar/covid-brazil

URL is being actualized every 30 minutes (not 5 minutes like other COVID actors).

## BREAKING CHANGE 2.0:

The government took the page with official statistics down, on http://plataforma.saude.gov.br/novocoronavirus/. The old data had suspicious cases and not infected data. The new version of the data have only infected and deaths. The following fields are gone: `suspiciousCases`, `testedNotInfected`, `suspiciousCasesByRegion`, `testedNotInfectedByRegion`. There's a new field called `version` that is effectively a tag for the version of the data. If it changes, the version will change.


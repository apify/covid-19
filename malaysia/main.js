const Apify = require('apify')
const httpRequest = require('@apify/http-request')
const LATEST = 'LATEST'
 
Apify.main(async () => {
  const kvStore = await Apify.openKeyValueStore('COVID-19-MY')
  const dataset = await Apify.openDataset('COVID-19-MY-HISTORY')

  // get worldometerData and assign it to respective variable
  const { body: worldometerDataRaw } = await httpRequest({
    url:
      'https://api.apify.com/v2/key-value-stores/SmuuI0oebnTWjRTUh/records/LATEST?disableRedirect=true',
    json: true
  })

  let malaysia = worldometerDataRaw.regionData.find(c => c.country === 'Malaysia')
  const infected = malaysia.totalCases
  const deceased = malaysia.totalDeaths
  const recovered = malaysia.totalRecovered
  const activeCases = malaysia.activeCases
  const tested = malaysia.totalTests
  const critical = malaysia.seriousCritical

  const now = new Date()

  const result = {
    infected,
    deceased,
    recovered,
    activeCases,
    tested,
    critical,
    sourceUrl: 'https://www.worldometers.info/coronavirus/',
    lastUpdatedAtApify: new Date(
      Date.UTC(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        now.getHours(),
        now.getMinutes()
      )
    ).toISOString(),
    readMe: 'https://apify.com/zuzka/covid-my'
  }

  console.log(result)

  // Push the data
  let latest = await kvStore.getValue(LATEST)
  if (!latest) {
    await kvStore.setValue('LATEST', result)
    latest = result
  }
  delete latest.lastUpdatedAtApify
  const actual = Object.assign({}, result)
  delete actual.lastUpdatedAtApify

  if (JSON.stringify(latest) !== JSON.stringify(actual)) {
    await dataset.pushData(result)
  }

  await kvStore.setValue('LATEST', result)
  await Apify.pushData(result)

  console.log('Done.')
})
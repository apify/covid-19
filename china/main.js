const Apify = require('apify')
const httpRequest = require('@apify/http-request')
const LATEST = 'LATEST'

Apify.main(async () => {
  const kvStore = await Apify.openKeyValueStore('COVID-19-CHINA')
  const dataset = await Apify.openDataset('COVID-19-CHINA-HISTORY')

  // get worldometerData and assign it to respective variable
  const { body: worldometerDataRaw } = await httpRequest({
    url:
      'https://api.apify.com/v2/key-value-stores/SmuuI0oebnTWjRTUh/records/LATEST?disableRedirect=true',
    json: true
  })

  let china = worldometerDataRaw.regionData.find(c => c.country === 'China')
  const infected = china.totalCases
  const deceased = china.totalDeaths
  const recovered = china.totalRecovered
  const activeCases = china.activeCases
  const tested = china.totalTests
  const critical = china.seriousCritical

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
    readMe: 'https://apify.com/katerinahronik/covid-china'
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

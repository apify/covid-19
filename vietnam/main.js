const Apify = require('apify')
const moment = require('moment-timezone')
const _ = require('lodash')

// const { log } = Apify.utils
// log.setLevel(log.LEVELS.WARNING)

const LATEST = 'LATEST'

Apify.main(async () => {
  const sourceUrl = 'https://static.pipezero.com/covid/data.json'
  const kvStore = await Apify.openKeyValueStore('COVID-19-VIETNAM')
  const dataset = await Apify.openDataset('COVID-19-VIETNAM-HISTORY')

  const bodyResponse = (await Apify.utils.requestAsBrowser({ url: sourceUrl }))
    .body
  const vietnamStats = JSON.parse(bodyResponse).total.internal
  const vietnamTodayStats = JSON.parse(bodyResponse).today.internal
  const vietnamOverviewStats = JSON.parse(bodyResponse).overview
  const vietnamLocationsStats = JSON.parse(bodyResponse).locations

  const data = {
    infected: vietnamStats.cases,
    recovered: vietnamStats.recovered,
    treated: vietnamStats.treating,
    died: vietnamStats.death,
    infectedToday: vietnamTodayStats.cases,
    recoveredToday: vietnamTodayStats.recovered,
    treatedToday: vietnamTodayStats.treating,
    diedToday: vietnamTodayStats.death,
    overview: vietnamOverviewStats,
    locations: vietnamLocationsStats,
    sourceUrl,
    lastUpdatedAtApify: moment()
      .utc()
      .second(0)
      .millisecond(0)
      .toISOString(),
    readMe: 'https://apify.com/dtrungtin/covid-vi'
  }

  console.log(data)

  // Compare and save to history
  const latest = (await kvStore.getValue(LATEST)) || {}
  if (
    !_.isEqual(
      _.omit(data, 'lastUpdatedAtApify'),
      _.omit(latest, 'lastUpdatedAtApify')
    )
  ) {
    await dataset.pushData(data)
  }

  await kvStore.setValue(LATEST, data)
  await Apify.pushData(data)
})

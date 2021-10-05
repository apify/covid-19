const Apify = require('apify')
const LATEST = 'LATEST'

Apify.main(async () => {
  const kvStore = await Apify.openKeyValueStore('COVID-19-TURKEY')
  const dataset = await Apify.openDataset('COVID-19-TURKEY-HISTORY')

  const url = 'https://covid19.saglik.gov.tr/'

  console.log('Launching Puppeteer...')
  const browser = await Apify.launchPuppeteer()

  console.log(`Opening page ${url}...`)
  const page = await browser.newPage()
  await page.goto(url)
  const results = await page.evaluate(() => {
    const json = sondurumjson

    const tested = json[0].toplam_test
    const infected = json[0].toplam_hasta
    const deceased = json[0].toplam_vefat
    const recovered = json[0].toplam_iyilesen
    const critical = json[0].agir_hasta_sayisi
    const ICU = json[0].toplam_yogun_bakim
    const dailyTested = json[0].gunluk_test
    const dailyInfected = json[0].gunluk_vaka
    const dailyDeceased = json[0].gunluk_vefat
    const dailyRecovered = json[0].gunluk_iyilesen

    const [day, month, year] = json[0].tarih.split('.')
    const date = new Date(`${month}.${day}.${year}`)

    const now = new Date()

    const toInt = str => Number(str.replace('.', '').replace('.', ''))

    const result = {
      infected: toInt(infected),
      deceased: toInt(deceased),
      recovered: toInt(recovered),
      tested: toInt(tested),
      critical: toInt(critical),
      ICU: toInt(ICU),
      dailyTested: toInt(dailyTested),
      dailyInfected: toInt(dailyInfected),
      dailyDeceased: toInt(dailyDeceased),
      dailyRecovered: toInt(dailyRecovered),
      sourceUrl: 'https://covid19.saglik.gov.tr/?_Dil=2',
      lastUpdatedAtApify: new Date(
        Date.UTC(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          now.getHours(),
          now.getMinutes()
        )
      ).toISOString(),
      lastUpdatedAtSource: date.toISOString(),
      readMe: 'https://apify.com/tugkan/covid-tr'
    }

    console.log(result)
    return result
  })

  // Push the data
  let latest = await kvStore.getValue(LATEST)
  if (!latest) {
    await kvStore.setValue('LATEST', results)
    latest = results
  }
  delete latest.lastUpdatedAtApify
  const actual = Object.assign({}, results)
  delete actual.lastUpdatedAtApify

  if (JSON.stringify(latest) !== JSON.stringify(actual)) {
    await dataset.pushData(results)
  }

  await kvStore.setValue('LATEST', results)
  await Apify.pushData(results)

  console.log('Done.')
})

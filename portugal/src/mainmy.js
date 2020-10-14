const Apify = require('apify')

const LATEST = 'LATEST'
const now = new Date()
const { log } = Apify.utils

async function waitForContentToLoad (page) {
  const query = "document.querySelectorAll('full-container full-container')"

  return page.waitForFunction(
    `!!${query}[1] && !!${query}[6] && !!${query}[2] && !!${query}[4] && !!${query}[19] && !!${query}[8] && !!${query}[15]` +
      ` && !!${query}[1].innerText.includes('ACTIVOS')` +
      ` && !!${query}[6].innerText.includes('CONFIRMADOS')` +
      ` && !!${query}[2].innerText.includes('RECUPERADOS')` +
      ` && !!${query}[4].innerText.includes('ÓBITOS')` +
      // ` && !!${query}[19].innerText.includes('AMOSTRAS')` +
      ` && !!${query}[19].querySelector('text')` +
      // ` && !!${query}[4].innerText.includes('Suspeitos')` +
      ` && !!${query}[8].innerText.includes('Dados relativos ao boletim da DGS')` +
      ` && !!${query}[15].innerText.includes('Casos por Região de Saúde')` +
      ` && !!${query}[15].innerHTML.includes('<nav class="feature-list">')`,
    { timeout: 45 * 1000 }
  )
}

Apify.main(async () => {
  const url =
    'https://esriportugal.maps.arcgis.com/apps/opsdashboard/index.html#/acf023da9a0b4f9dbb2332c13f635829'

  const kvStore = await Apify.openKeyValueStore('COVID-19-PORTUGAL')
  const dataset = await Apify.openDataset('COVID-19-PORTUGAL-HISTORY')

  const requestList = new Apify.RequestList({ sources: [{ url }] })
  await requestList.initialize()

  let criticalErrors = 0

  const crawler = new Apify.PuppeteerCrawler({
    requestList,
    useApifyProxy: true,
    puppeteerPoolOptions: {
      retireInstanceAfterRequestCount: 1
    },
    handlePageTimeoutSecs: 90,
    launchPuppeteerFunction: () => {
      const options = { useApifyProxy: true, useChrome: true }
      // if (Apify.isAtHome()) {
      //     options.headless = true;
      //     options.stealth = true;
      // }
      return Apify.launchPuppeteer(options)
    },
    gotoFunction: async ({ page, request }) => {
      await Apify.utils.puppeteer.blockRequests(page, {
        urlPatterns: [
          '.jpg',
          '.jpeg',
          '.png',
          '.svg',
          '.gif',
          '.woff',
          '.pdf',
          '.zip',
          '.pbf',
          '.woff2',
          '.woff'
        ]
      })
      return page.goto(request.url, { timeout: 1000 * 30 })
    },
    handlePageFunction: async ({ page, request }) => {
      log.info(`Handling ${request.url}`)

      await Apify.utils.puppeteer.injectJQuery(page)
      log.info('Waiting for content to load')

      await waitForContentToLoad(page)

      log.info('Content loaded')

      const extracted = await page.evaluate(async () => {
        async function strToInt (str) {
          return parseInt(str.replace(/( |,)/g, ''), 10)
        }

        const fullContainer = $('full-container full-container').toArray()

        const date = $(fullContainer[8])
          .find('g')
          .last()
          .text()
          .trim()
        // const suspicious = await strToInt(
        //   $(fullContainer[4]).find("g").last().text().trim()
        // );
        const active = await strToInt(
          $(fullContainer[1])
            .find('g')
            .last()
            .text()
            .trim()
            .replace(/\D/g, '')
        )
        const infected = await strToInt(
          $(fullContainer[6])
            .find('g')
            .last()
            .text()
            .trim()
            .replace(/\D/g, '')
        )
        const recovered = await strToInt(
          $(fullContainer[2])
            .find('g')
            .last()
            .text()
            .trim()
            .replace(/\D/g, '')
        )
        const deceased = await strToInt(
          $(fullContainer[4])
            .find('g')
            .last()
            .text()
            .trim()
            .replace(/\D/g, '')
        )
        const tested = await strToInt(
          $(fullContainer[19])
            .find('g')
            .last()
            .text()
            .trim()
            .replace(/\D/g, '')
        )

        const spans = $(fullContainer[15])
          .find('nav.feature-list span[id*="ember"]')
          .toArray()

        const infectedByRegion = []
        for (const span of spans) {
          const text = $(span)
            .text()
            .trim()
          const [value] = text.match(/(\d|,)+/g)
          infectedByRegion.push({
            value: await strToInt(value.replace(/ |,/g, '')),
            region: text.replace(/(\d|,)+/g, '').trim()
          })
        }

        return {
          date,
          active,
          infected,
          tested,
          recovered,
          deceased,
          // suspicious,
          infectedByRegion
        }
      })

      const sourceDate = new Date(formatDate(extracted.date))
      delete extracted.date

      // ADD:  infected, tested, recovered, deceased, suspicious, infectedByRegion
      const data = {
        ...extracted
      }

      // ADD: infectedByRegion, lastUpdatedAtApify, lastUpdatedAtSource
      data.country = 'Portugal'
      data.historyData =
        'https://api.apify.com/v2/datasets/f1Qd4cMBzV1E0oRNc/items?format=json&clean=1'
      data.sourceUrl =
        'https://covid19.min-saude.pt/ponto-de-situacao-atual-em-portugal/'
      data.lastUpdatedAtApify = new Date(
        Date.UTC(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          now.getHours(),
          now.getMinutes()
        )
      ).toISOString()
      // data.lastUpdatedAtSource = new Date(
      //   Date.UTC(
      //     sourceDate.getFullYear(),
      //     sourceDate.getMonth(),
      //     sourceDate.getDate(),
      //     sourceDate.getHours(),
      //     sourceDate.getMinutes()
      //   )
      // ).toISOString();
      // data.lastUpdatedAtSource = sourceDate.toISOString()

      data.readMe = 'https://apify.com/onidivo/covid-pt'

      console.log(data)

      // Push the data
      let latest = await kvStore.getValue(LATEST)
      if (!latest) {
        await kvStore.setValue('LATEST', data)
        latest = Object.assign({}, data)
      }
      delete latest.lastUpdatedAtApify
      const actual = Object.assign({}, data)
      delete actual.lastUpdatedAtApify

      const { itemCount } = await dataset.getInfo()
      if (
        JSON.stringify(latest) !== JSON.stringify(actual) ||
        itemCount === 0
      ) {
        await dataset.pushData(data)
      }

      await kvStore.setValue('LATEST', data)
      await Apify.pushData(data)

      log.info('Data saved.')
    },
    handleFailedRequestFunction: ({ requst, error }) => {
      criticalErrors++
    }
  })
  await crawler.run()
  if (criticalErrors > 0) {
    throw new Error('Some essential requests failed completely!')
  }
  log.info('Done.')
})

function formatDate (date) {
  const arr = date
    .replace(/(\n)/g, '')
    .trim()
    .split('/')
  // ["10", "13", "2020 1:00 odpoledne"]
  const month = arr[1]
  const day = arr[0]
  const year = arr[2].split(' ')[0]
  const time = arr[2].split(' ')[1]
  let am = 'AM'
  if (arr[2].split(' ')[2] === 'odpoledne') {
    am = 'PM'
  }

  const arra = [month, day, year, time, am]

  const [a, b, ...others] = [...arra]
  return Array.from([b, a, ...others]).join(' ')
}

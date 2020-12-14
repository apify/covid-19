const Apify = require('apify')

const LATEST = 'LATEST'
const now = new Date()
const { log } = Apify.utils

async function waitForContentToLoad(page) {
  const query = "document.querySelector('full-container')"
  return page.waitForFunction(
    `!!${query}` +
    `&& !!${query}.innerText.match(/ACTIVOS\\n*\\t*\\r*[0-9,]+/g)` +
    `&& !!${query}.innerText.match(/CONFIRMADOS\\n*\\t*\\r*[0-9,]+/g)` +
    `&& !!${query}.innerText.match(/RECUPERADOS\\n*\\t*\\r*[0-9,]+/g)` +
    `&& !!${query}.innerText.match(/ÓBITOS\\n*\\t*\\r*[0-9,]+/g)` +
    `&& !!${query}.innerText.match(/Total de Testes.*\\n*\\t*\\r*[0-9,]+/g)` +
    `&& !!${query}.innerText.match(/Dados relativos ao boletim da DGS.*\\n*\\t*\\r*[0-9,]+/g)` +
    `&& !!${query}.innerText.match(/Casos por Região de Saúde\\n*\\t*\\r*[0-9,]+/g)` +
    `&& !!${query}.innerHTML.includes('<nav class="feature-list">')`,
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
          ".jpg",
          ".jpeg",
          ".png",
          ".svg",
          ".gif",
          ".woff",
          ".pdf",
          ".zip",
          ".pbf",
          ".woff2",
          ".woff",
        ],
      });
      return page.goto(request.url, { timeout: 1000 * 60 });
    },
    handlePageFunction: async ({ page, request }) => {
      log.info(`Handling ${request.url}`)

      await Apify.utils.puppeteer.injectJQuery(page)
      log.info('Waiting for content to load')

      await waitForContentToLoad(page)

      log.info('Content loaded')

      const extracted = await page.evaluate(async () => {
        async function strToInt(str) {
          return parseInt(str.replace(/( |,)/g, ''), 10)
        }

        const date = $('full-container:contains(Dados relativos ao boletim da DGS)').last()
          .find('g')
          .last()
          .text()
          .trim();

        const active = await strToInt(
          $('full-container:contains(ACTIVOS)').last()
            .find('g')
            .last()
            .text()
            .trim()
            .replace(/\D/g, '')
        )
        const infected = await strToInt(
          $('full-container:contains(CONFIRMADOS)').last()
            .find('g')
            .last()
            .text()
            .trim()
            .replace(/\D/g, '')
        )
        const recovered = await strToInt(
          $('full-container:contains(RECUPERADOS)').last()
            .find('g')
            .last()
            .text()
            .trim()
            .replace(/\D/g, '')
        )
        const deceased = await strToInt(
          $('full-container:contains(ÓBITOS)').last()
            .find('g')
            .last()
            .text()
            .trim()
            .replace(/\D/g, '')
        )
        const tested = await strToInt(
          $('full-container:contains(Total de Testes (PCR + Antigénio))').last()
            .find('g')
            .last()
            .text()
            .trim()
            .replace(/\D/g, '')
        )

        const spans = $('full-container:contains(Casos por Região de Saúde)').last()
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
      const splited = extracted.date.split('/');
      const sourceDate = new Date(`${splited[1]}/${splited[0]}/${splited[2]}`);
      delete extracted.date;

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
      data.lastUpdatedAtSource = new Date(
        Date.UTC(
          sourceDate.getFullYear(),
          sourceDate.getMonth(),
          sourceDate.getDate(),
          sourceDate.getHours(),
          sourceDate.getMinutes()
        )
      ).toISOString();

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
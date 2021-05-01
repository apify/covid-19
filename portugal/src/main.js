const Apify = require('apify')

const LATEST = 'LATEST'
const now = new Date()
const { log } = Apify.utils

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
    handlePageTimeoutSecs: 145,
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
      return page.goto(request.url, { timeout: 1000 * 120 });
    },
    handlePageFunction: async ({ page, request }) => {
      log.info(`Handling ${request.url}`)

      log.info('Waiting for content to load');
      await page.waitForFunction(`!!document.querySelector(\'full-container\') 
      && !!document.querySelector(\'full-container\').innerText.match(/ACTIVOS(\\n| )+[0-9.]+/g)
      && !!document.querySelector(\'full-container\').innerText.match(/RECUPERADOS(\\n| )+[0-9.]+/g)
      && !!document.querySelector(\'full-container\').innerText.match(/ÓBITOS(\\n| )+[0-9.]+/g)
      && !!document.querySelector(\'full-container\').innerText.match(/CONFIRMADOS(\\n| )+[0-9.]+/g)
      && !!document.querySelector(\'full-container\').innerText.match(/Testes \\(PCR \\+ Antigénio\\)(\\n| )+[0-9.]+/g)
      && !!document.querySelector(\'full-container\').innerText.match(/Dados relativos ao boletim da DGS de:(\\n| )+[0-9.]+/g)
      && !!document.querySelector('.feature-list')`, { timeout: 1000 * 120 });

      log.info('Content loaded');

      await Apify.utils.puppeteer.injectJQuery(page);

      log.info('Extracting and processing data...');

      const data = await page.evaluate(async () => {
        const toNumber = (str) => parseInt(str.replace(/\D+/g, ''));
        const toString = (str) => str.replace(/\d+|\.+/g, '').trim();

        return {
          active: toNumber($('full-container:contains(ACTIVOS)').last().text()),
          infected: toNumber($('full-container:contains(CONFIRMADOS)').last().find('text').eq(1).text()),
          tested: toNumber($('full-container:contains(Testes (PCR + Antigénio))').last().find('text').eq(1).text()),
          recovered: toNumber($('full-container:contains(RECUPERADOS)').last().find('text').eq(1).text()),
          deceased: toNumber($('full-container:contains(ÓBITOS)').last().find('text').eq(1).text()),
          newlyInfected: toNumber($('full-container:contains(CONFIRMADOS)').last().find('text').eq(2).text()),
          newlyRecovered: toNumber($('full-container:contains(RECUPERADOS)').last().find('text').eq(2).text()),
          newlyDeceased: toNumber($('full-container:contains(ÓBITOS)').last().find('text').eq(2).text()),
          infectedByRegion: $('.feature-list').last().find('.feature-list-item').toArray().map(div => {
            const text = $(div).find('p').text();
            return {
              region: toString(text),
              infected: toNumber(text),
            }
          }),
          reportingDay: $('full-container:contains(Dados relativos ao boletim da DGS de)').last().text().match(/[0-9]+\/[0-9]+\/[0-9]+/g)[0]
        }
      });

      const [d, m, y] = data.reportingDay.split('/')
      const sourceDate = new Date(`${m}/${d}/${y}`);
      delete data.reportingDay;

      data.country = 'Portugal';
      data.historyData = 'https://api.apify.com/v2/datasets/f1Qd4cMBzV1E0oRNc/items?format=json&clean=1';
      data.sourceUrl = 'https://covid19.min-saude.pt/ponto-de-situacao-atual-em-portugal/';
      data.lastUpdatedAtApify = new Date(
        Date.UTC(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          now.getHours(),
          now.getMinutes()
        )
      ).toISOString();
      data.lastUpdatedAtSource = new Date(
        Date.UTC(
          sourceDate.getFullYear(),
          sourceDate.getMonth(),
          sourceDate.getDate(),
          sourceDate.getHours(),
          sourceDate.getMinutes()
        )
      ).toISOString();
      data.readMe = 'https://apify.com/onidivo/covid-pt';


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
    handleFailedRequestFunction: async ({ requst, error }) => {
      log.error(error);
      await Apify.pushData({
        '#request': requst,
        '#error': error
      });
      criticalErrors++;
    }
  })
  await crawler.run()
  if (criticalErrors > 0) {
    throw new Error('Some essential requests failed completely!')
  }
  log.info('Done.')
})
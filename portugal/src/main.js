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

      log.info('Waiting for content to load')
      const responses = await Promise.all([
        page.waitForResponse(request => request.url().match(/where=ARSNome.*Nacional.*spatialRel=esriSpatialRelIntersects.*resultRecordCount=50/g)),
        page.waitForResponse(request => request.url().match(/where=1.*1.*spatialRel=esriSpatialRelIntersects.*Total_Amostras_Novas/g)),
        page.waitForResponse(request => request.url().match(/where=ARSNome.*Nacional.*AND.*ARSNome.*Estrangeiro.*spatialRel=esriSpatialRelIntersects/g)),
      ]);
      log.info('Content loaded, Processing and savind data...')

      const { features: allData } = await responses[0].json();
      const { features: testesData } = await responses[1].json();
      const { features: regionData } = await responses[2].json();

      const allDatalastRecord = allData[0].attributes;
      const sourceDate = new Date(allDatalastRecord.Data_ARS);

      const data = {
        active: allDatalastRecord.Activos_ARS,
        infected: allDatalastRecord.ConfirmadosAcumulado_ARS,
        tested: testesData[0].attributes.value,
        recovered: allDatalastRecord.Recuperados_ARS,
        deceased: allDatalastRecord.Obitos_ARS,
        newlyInfected: allDatalastRecord.VarConfirmados_ARS,
        newlyDeceased: allDatalastRecord.VarObitos_ARS,
        newlyRecovered: allDatalastRecord.VarRecuperados_ARS,
        suspicious: allDatalastRecord.Suspeitos_ARS,
        infectedByRegion: regionData.map(({ attributes: {
          ARSNome, ConfirmadosAcumulado_ARS, ConfirmadosNovos_ARS, Recuperados_ARS, RecuperadosNovos_ARS,
          Obitos_ARS, ObitosNovos_ARS, Suspeitos_ARS, Activos_ARS }
        }) => {
          return {
            active: Activos_ARS,
            infected: ConfirmadosAcumulado_ARS,
            recovered: Recuperados_ARS,
            deceased: Obitos_ARS,
            suspicious: Suspeitos_ARS,
            newlyInfected: ConfirmadosNovos_ARS,
            newlyDeceased: ObitosNovos_ARS,
            newlyRecovered: RecuperadosNovos_ARS,
            value: ConfirmadosAcumulado_ARS,
            region: ARSNome
          }
        }),
        country: 'Portugal',
        historyData: 'https://api.apify.com/v2/datasets/f1Qd4cMBzV1E0oRNc/items?format=json&clean=1',
        sourceUrl: 'https://covid19.min-saude.pt/ponto-de-situacao-atual-em-portugal/',
        lastUpdatedAtApify: new Date(
          Date.UTC(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            now.getHours(),
            now.getMinutes()
          )
        ).toISOString(),
        lastUpdatedAtSource: new Date(
          Date.UTC(
            sourceDate.getFullYear(),
            sourceDate.getMonth(),
            sourceDate.getDate(),
            sourceDate.getHours(),
            sourceDate.getMinutes()
          )
        ).toISOString(),
        readMe: 'https://apify.com/onidivo/covid-pt'
      }

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
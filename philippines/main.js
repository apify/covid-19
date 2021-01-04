// main.js
const Apify = require('apify');
const { log } = Apify.utils;

const LATEST = "LATEST";
const now = new Date();
const sourceUrl = 'https://endcov.ph/dashboard/';

const toNumber = (str) => parseInt(str.replace(/\D+/g, ''), 10);

Apify.main(async () => {
  log.info('Starting actor.');

  const kvStore = await Apify.openKeyValueStore("COVID-19-PH");
  const dataset = await Apify.openDataset("COVID-19-PH-HISTORY");

  const requestQueue = await Apify.openRequestQueue();

  await requestQueue.addRequest({
    url: sourceUrl,
  })

  log.debug('Setting up crawler.');
  const cheerioCrawler = new Apify.CheerioCrawler({
    requestQueue,
    maxRequestRetries: 5,
    handlePageTimeoutSecs: 60,
    useApifyProxy: true,
    useSessionPool: true,
    handlePageFunction: async ({ request, body }) => {
      log.info(`Processing ${request.url}`);
      log.info(`Processing and saving data.`);

      const confirmed = body.match(/(?<=confirmed.*=).*'/g)[0];
      const recovered = body.match(/(?<=recovered.*=).*'/g)[0];
      const dead = body.match(/(?<=dead.*=).*'/g)[0];
      const active = body.match(/(?<=active.*=).*'/g)[0];
      const unique = body.match(/(?<=unique.*=).*'/g)[0];
      const tested = body.match(/(?<=tested.*=).*'/g)[0];

      const data = {
        infected: toNumber(confirmed),
        tested: toNumber(tested),
        recovered: toNumber(recovered),
        deceased: toNumber(dead),
        activeCases: toNumber(active),
        unique: toNumber(unique),
        country: "Philippines",
        historyData: "https://api.apify.com/v2/datasets/sFSef5gfYg3soj8mb/items?format=json&clean=1",
        sourceUrl,
        lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
        // lastUpdatedAtSource: lastUpdatedAtSourceText,
        readMe: "https://apify.com/katerinahronik/covid-philippines"
      }
      console.log(data)
      // Push the data
      let latest = await kvStore.getValue(LATEST);
      if (!latest) {
        await kvStore.setValue('LATEST', data);
        latest = data;
      }
      delete latest.lastUpdatedAtApify;
      const actual = Object.assign({}, data);
      delete actual.lastUpdatedAtApify;

      if (JSON.stringify(latest) !== JSON.stringify(actual)) {
        await dataset.pushData(data);
      }

      await kvStore.setValue('LATEST', data);
      await Apify.pushData(data);

      console.log('Done.');

    },
    handleFailedRequestFunction: async ({ request }) => {
      console.log(`Request ${request.url} failed many times.`);
      console.dir(request)
    },
  });
  // Run the crawler and wait for it to finish.
  log.info('Starting the crawl.');
  await cheerioCrawler.run();
  log.info('Actor finished.');
});
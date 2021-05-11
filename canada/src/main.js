const Apify = require('apify');
const SOURCE_URL = 'https://www.canada.ca/en/public-health/services/diseases/2019-novel-coronavirus-infection.html';
const LATEST = 'LATEST';
const {log, requestAsBrowser} = Apify.utils;

Apify.main(async () => {
    const { notificationEmail, doErrorCheck = true } = await Apify.getInput();
    const requestQueue = await Apify.openRequestQueue();
    const kvStore = await Apify.openKeyValueStore('COVID-19-CAD');
    const dataset = await Apify.openDataset("COVID-19-CAD-HISTORY");
    await requestQueue.addRequest({ url: 'https://health-infobase.canada.ca/src/data/covidLive/covid19.csv'});

    if (notificationEmail) {
        await Apify.addWebhook({
            eventTypes: ['ACTOR.RUN.FAILED', 'ACTOR.RUN.TIMED_OUT'],
            requestUrl: `https://api.apify.com/v2/acts/mnmkng~email-notification-webhook/runs?token=${Apify.getEnv().token}`,
            payloadTemplate: `{"notificationEmail": "${notificationEmail}", "eventType": {{eventType}}, "eventData": {{eventData}}, "resource": {{resource}} }`,
        });
    }
    const proxyConfiguration = await Apify.createProxyConfiguration();

    const crawler = new Apify.BasicCrawler({
        requestQueue,
        handleRequestFunction: async ({ request }) => {
            const response = await requestAsBrowser({
                url: request.url,
                proxyUrl: proxyConfiguration.newUrl(),
            });
            const lines = response.body.split(/\r?\n/);
            let totalInfected = undefined;
            let totalDeceased = undefined;
            const infectedByRegion = [];
            const tempByRegion = [];
            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',');
                tempByRegion[values[0]] =
                  {
                      "region": values[1],
                      "infectedCount": values[5],
                      "deceasedCount": values[7]
                  };
                if (values[0]) {
                    totalInfected = values[5];
                    totalDeceased = values[7];
                }
            }
            for (const item of tempByRegion) {
                if (item) {
                    infectedByRegion.push(item);
                }
            }

            const data = {
                infected: parseInt(totalInfected, 10),
                tested: undefined,
                deceased: parseInt(totalDeceased, 10),
                infectedByRegion,
                country: 'Canada',
                moreData: 'https://api.apify.com/v2/key-value-stores/fabbocwKrtxSDf96h/records/LATEST?disableRedirect=true',
                historyData: 'https://api.apify.com/v2/datasets/ji95MgtBVgGJF7XcP/items?format=json&clean=1',
                SOURCE_URL,
                lastUpdatedAtApify: new Date(new Date().toUTCString()).toISOString(),
                readMe: 'https://apify.com/lukass/covid-cad',
            };

            // Compare and save to history
            const latest = await kvStore.getValue(LATEST);
            if (latest) {
                delete latest.lastUpdatedAtApify;
            }
            const actual = Object.assign({}, data);
            delete actual.lastUpdatedAtApify;
            await Apify.pushData(data);

            if (JSON.stringify(latest) !== JSON.stringify(actual)) {
                log.info('Data did change :( storing new to dataset.');
                await dataset.pushData(data);
            }

            if (doErrorCheck && ((latest.infected - 10) > data.infected || (latest.deceased - 10) > data.deceased)) {
                log.error('Latest data are high then actual - probably wrong scrap');
                process.exit(1);
            }

            await kvStore.setValue(LATEST, data);
            log.info('Data stored, finished.')
        },
        handleFailedRequestFunction: async ({request}) => {
            console.log(`Request ${request.url} failed twice.`);
        },
    });

    log.info('CRAWLER -- start');
    await crawler.run();
    log.info('CRAWLER -- finish');
});

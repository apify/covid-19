// This is the main Node.js source code file of your actor.

// Include Apify SDK. For more information, see https://sdk.apify.com/
const Apify = require('apify');
const { log } = Apify.utils;

const LATEST = 'LATEST';

Apify.main(async () => {

    const kvStore = await Apify.openKeyValueStore('COVID-19-RUSSIA');
    const dataset = await Apify.openDataset('COVID-19-RUSSIA-HISTORY');

    const requestList = new Apify.RequestList({
        sources: [
            { url: 'https://covid19.rosminzdrav.ru/wp-json/api/mapdata/' },
        ],
    });
    await requestList.initialize();

    const crawler = new Apify.CheerioCrawler({
        requestList,
        maxRequestRetries: 5,
        handlePageTimeoutSecs: 60,
        additionalMimeTypes: ['application/json'],
        // This function will be called for each URL to crawl.
        handlePageFunction: async ({ request, json, $ }) => {
            console.log(`Processing ${request.url}...`);
            const now = new Date();
            const data = {};
            const { Items: items } = json;

            data.infected = items.reduce((sum, val) => sum += val.Confirmed, 0);
            data.tested = items.pop().Observations;
            data.recovered = items.reduce((sum, val) => sum += val.Recovered, 0)
            data.deceased = items.reduce((sum, val) => sum += val.Deaths, 0)

            data.infectedByRegion = items.splice(0, items.length).map(item => {
                return {
                    region: item.LocationName,
                    isoCode: item.IsoCode,
                    infected: item.Confirmed,
                    recovered: item.Recovered,
                    deceased: item.Deaths
                }
            })

            data.country = 'Russia';
            data.historyData = 'https://api.apify.com/v2/datasets/5JO5GL1h8Qv1CnG0m/items?format=json';
            data.sourceUrl = 'https://covid19.rosminzdrav.ru/';
            data.lastUpdatedAtApify = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString();
            data.lastUpdatedAtSource = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString();
            data.readMe = "https://apify.com/krakorj/covid-russia";

            // Push the data
            let latest = await kvStore.getValue(LATEST);
            if (!latest) {
                await kvStore.setValue('LATEST', data);
                latest = Object.assign({}, data);
            }
            delete latest.lastUpdatedAtApify;
            const actual = Object.assign({}, data);
            delete actual.lastUpdatedAtApify;

            const { itemCount } = await dataset.getInfo();
            if (JSON.stringify(latest) !== JSON.stringify(actual) || itemCount === 0) {
                await dataset.pushData(data);
            }

            await kvStore.setValue('LATEST', data);
            await Apify.pushData(data);

            log.info('Data saved.');
        },

        // This function is called if the page processing failed more than maxRequestRetries+1 times.
        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed twice.`);
        },
    });

    await crawler.run();

    console.log('Crawler finished.');
});



// main.js
const Apify = require('apify');
const cheerio = require('cheerio');
const { requestAsBrowser, log } = Apify.utils;

const LATEST = "LATEST";
const now = new Date();
const sourceUrl = 'https://corona.ihio.gov.ir/';

Apify.main(async () => {

    log.info('Starting actor.');

    const kvStore = await Apify.openKeyValueStore("COVID-19-IRAN");
    const dataset = await Apify.openDataset("COVID-19-IRAN-HISTORY");

    const requestQueue = await Apify.openRequestQueue();
    await requestQueue.addRequest({
        url: sourceUrl,
        headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
            'Cookie': 'dnn_IsMobile=False; SplashPageView=true; language=fa-IR'
        },
    })
    const basicCrawler = new Apify.BasicCrawler({
        requestQueue,
        useApifyProxy: true,
        maxRequestRetries: 5,
        requestTimeoutSecs: 60,
        handleRequestFunction: async ({ request }) => {
            const { url, headers } = request;
            const response = await requestAsBrowser({
                url,
                headers: { ...headers },
                ignoreSslErrors: false,
                followRedirect: false,
            });
            const $ = cheerio.load(response.body);

            log.info('Processing and saving data.')

            const $values = $("div.MainContainercounter div.mainCounternew h2").toArray();
            if ($values.length !== 4) throw new Error('Page content changed');


            const activeCases = parseInt($($values[1]).text().replace(/( |,)/g, ''));
            const recovered = parseInt($($values[2]).text().replace(/( |,)/g, ''));
            const deceased = parseInt($($values[3]).text().replace(/( |,)/g, ''));
            const newCases = parseInt($($values[0]).text().replace(/( |,)/g, ''));

            const data = {
                activeCases,
                recovered,
                deceased,
                newCases,
                infected: activeCases + recovered + deceased,
                // ADD: country, historyData, sourceUrl, lastUpdatedAtSource, lastUpdatedAtApify, readMe
                country: 'Iran',
                historyData: 'https://api.apify.com/v2/datasets/PJEXhmQM0hkN8K3BK/items?format=json&clean=1',
                sourceUrl,
                lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
                lastUpdatedAtSource: 'N/A',
                readMe: 'https://apify.com/onidivo/covid-ir',
            };

            console.log(data);

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
        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed many times.`);
            console.dir(request)
        },
    })

    log.debug('Setting up crawler.');

    // Run the crawler and wait for it to finish.
    log.info('Starting the crawl.');
    await basicCrawler.run();
    log.info('Actor finished.');
});


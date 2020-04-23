const Apify = require('apify');
const cheerio = require('cheerio');

const { log } = Apify.utils;
const sourceUrl = 'https://www.fhi.no/en/id/infectious-diseases/coronavirus/daily-reports/daily-reports-COVID19/';
const LATEST = 'LATEST';

Apify.main(async () => {
    const requestQueue = await Apify.openRequestQueue();
    const kvStore = await Apify.openKeyValueStore('COVID-19-NORWAY');
    const dataset = await Apify.openDataset('COVID-19-NORWAY-HISTORY');

    await requestQueue.addRequest({ url: sourceUrl });
    const crawler = new Apify.CheerioCrawler({
        requestQueue,
        useApifyProxy: true,
        apifyProxyGroups: ['SHADER'],
        handlePageTimeoutSecs: 60 * 2,
        handlePageFunction: async ({ $ }) => {
            log.info('Page loaded.');
            const now = new Date();

            const infectedByRegion = $('table').filter((i,el) => $(el).text().toLowerCase().includes('agder')).find('tr').map((i,el) => ({
                region: $($(el).find('td').get(0)).text().trim(),
                infectedCount: parseInt($($(el).find('td').get(1)).text().trim().replace(/\D/g,''),10),
            })).get().filter(val => val.region !== 'County')

            const infected = infectedByRegion.reduce((sum,val) => sum+=val.infectedCount,0);

            const data = {
                infected,
                deaths: parseInt($('html').text().match(/\d+ deaths/)[0].replace(' deaths',''),10),
                tested: parseInt($('html').text().match(/\d+ \d+ have been tested/)[0].replace(/have been tested| /g,''),10),
                infectedByRegion,
                sourceUrl,
                lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
                readMe: 'https://apify.com/tugkan/covid-no',
            };

            // Compare and save to history
            const latest = await kvStore.getValue(LATEST) || {};
            delete latest.lastUpdatedAtApify;
            const actual = Object.assign({}, data);
            delete actual.lastUpdatedAtApify;

            await Apify.pushData({...data});

            if (JSON.stringify(latest) !== JSON.stringify(actual)) {
                log.info('Data did change :( storing new to dataset.');
                await dataset.pushData(data);
            }

            await kvStore.setValue(LATEST, data);
            log.info('Data stored, finished.');
        },

        // This function is called if the page processing failed more than maxRequestRetries+1 times.
        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed twice.`);
        },
    });

    // Run the crawler and wait for it to finish.
    await crawler.run();

    console.log('Crawler finished.');
});

const Apify = require('apify');

const { log } = Apify.utils;
const sourceUrl = 'https://www.fhi.no/en/id/infectious-diseases/coronavirus/daily-reports/daily-reports-COVID19/';
const LATEST = 'LATEST';
const toNumber = (str) => parseInt(str.replace(/\D/g, ""));


Apify.main(async () => {
    const requestQueue = await Apify.openRequestQueue();
    const kvStore = await Apify.openKeyValueStore('COVID-19-NORWAY');
    const dataset = await Apify.openDataset('COVID-19-NORWAY-HISTORY');

    await requestQueue.addRequest({
        url: 'https://www.fhi.no/sv/smittsomme-sykdommer/corona/',
        userData: {
            label: 'INFECTED&TESTED'
        }

    });

    const crawler = new Apify.CheerioCrawler({
        requestQueue,
        useApifyProxy: true,
        apifyProxyGroups: ['SHADER'],
        handlePageTimeoutSecs: 60 * 2,
        additionalMimeTypes: ['application/json'],
        handlePageFunction: async ({ request, $, json }) => {
            log.info(`Getting ${request.userData.label} cases from ${request.url} `)
            const { label } = request.userData;

            switch (label) {
                case 'INFECTED&TESTED':
                    const infected = toNumber($('.fhi-key-figure-number').eq(1).text());
                    const tested = toNumber($('.fhi-key-figure-number').eq(0).text());
                    requestQueue.addRequest({
                        url: 'https://www.fhi.no/en/id/infectious-diseases/coronavirus/daily-reports/daily-reports-COVID19/',
                        userData: {
                            label: 'DEATHS', infected, tested
                        }
                    })
                    break;
                case 'DEATHS':
                    log.info('Processing and saving data')

                    const sourceDate = new Date($('.fhi-date').first().find('time').last().attr('datetime'));
                    delete request.userData.label;
                    const deaths = parseInt($('tbody').eq(1).find('tr td').last().text());
                    const now = new Date();

                    const data = {
                        ...request.userData,
                        recovered: 'N/A',
                        deaths,
                        sourceUrl,
                        country: 'Norway',
                        historyData: 'https://api.apify.com/v2/datasets/6tpTe4Z2TBePRWYti/items?format=json&clean=1',
                        lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
                        lastUpdatedAtSource: new Date(Date.UTC(sourceDate.getFullYear(), sourceDate.getMonth(), sourceDate.getDate(), sourceDate.getHours(), sourceDate.getMinutes())).toISOString(),
                        readMe: 'https://apify.com/tugkan/covid-no',
                    };

                    // Compare and save to history
                    const latest = await kvStore.getValue(LATEST) || {};
                    delete latest.lastUpdatedAtApify;
                    const actual = Object.assign({}, data);
                    delete actual.lastUpdatedAtApify;

                    await Apify.pushData({ ...data });

                    if (JSON.stringify(latest) !== JSON.stringify(actual)) {
                        log.info('Data did change :( storing new to dataset.');
                        await dataset.pushData(data);
                    }

                    await kvStore.setValue(LATEST, data);
                    log.info('Data stored, finished.');
            }
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

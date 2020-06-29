const Apify = require('apify');
const httpRequest = require('@apify/http-request')
const cheerio = require('cheerio');
const { log } = Apify.utils;

const sourceUrl = 'https://www.ssi.dk/sygdomme-beredskab-og-forskning/sygdomsovervaagning/c/covid19-overvaagning';
const LATEST = 'LATEST';

const toInt = (num) => Number(num.replace(/\D/g, ''));
const now = new Date();

Apify.main(async () => {
    const kvStore = await Apify.openKeyValueStore('COVID-19-DENMARK');
    const dataset = await Apify.openDataset('COVID-19-DENMARK-HISTORY');

    log.info(`Getting data, URL: ${sourceUrl}`);
    const { body } = await httpRequest({ url: sourceUrl });
    const $ = cheerio.load(body);

    log.info('Processing and saving data...')

    const $firstColumn = $('tbody').eq(1).find('tr:nth-child(2) td');
    const $secondColumn = $('tbody').eq(1).find('tr:nth-child(3) td');

    const srcDate = new Date($('section:contains(Senest redigeret den)').text().match(/(?<=den)[^]+$/g)[0])

    const result = {
        infected: toInt($($firstColumn).eq(3).text()),
        recovered: toInt($($firstColumn).eq(4).text()),
        deceased: toInt($($firstColumn).eq(5).text().split(' ')[0]),
        tested: toInt($($firstColumn).eq(2).text()),
        tests: toInt($($firstColumn).eq(1).text()),
        newlyInfected: toInt($($secondColumn).eq(3).text()),
        newlyRecovered: toInt($($secondColumn).eq(4).text()),
        newlyDeceased: toInt($($secondColumn).eq(5).text()),
        newlyTested: toInt($($secondColumn).eq(2).text()),
        country: 'Denmark',
        historyData: 'https://api.apify.com/v2/datasets/Ugq8cNqnhUSjfJeHr/items?format=json&clean=1',
        sourceUrl: 'https://www.ssi.dk/sygdomme-beredskab-og-forskning/sygdomsovervaagning/c/covid19-overvaagning',
        lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
        lastUpdatedAtSource: new Date(Date.UTC(srcDate.getFullYear(), srcDate.getMonth(), srcDate.getDate(), srcDate.getHours(), srcDate.getMinutes())).toISOString(),
        readMe: 'https://apify.com/tugkan/covid-dk'
    };

    let latest = await kvStore.getValue(LATEST);
    if (!latest) {
        await kvStore.setValue('LATEST', result);
        latest = result;
    }
    delete latest.lastUpdatedAtApify;
    const actual = Object.assign({}, result);
    delete actual.lastUpdatedAtApify;

    if (JSON.stringify(latest) !== JSON.stringify(actual)) {
        await dataset.pushData(result);
    }

    await kvStore.setValue('LATEST', result);
    await Apify.pushData(result);
    log.info('Data saved')
}
);

// actor before the change of source URL on 20/05/2020

// const Apify = require('apify');

// const { log } = Apify.utils;
// const sourceUrl = 'https://www.ssi.dk/aktuelt/sygdomsudbrud/coronavirus';
// const LATEST = 'LATEST';

// Apify.main(async () => {
//     const requestQueue = await Apify.openRequestQueue();
//     const kvStore = await Apify.openKeyValueStore('COVID-19-DENMARK');
//     const dataset = await Apify.openDataset('COVID-19-DENMARK-HISTORY');

//     await requestQueue.addRequest({ url: sourceUrl });
//     const crawler = new Apify.CheerioCrawler({
//         requestQueue,
//         useApifyProxy: true,
//         apifyProxyGroups: ['SHADER'],
//         handlePageTimeoutSecs: 60 * 2,
//         handlePageFunction: async ({ $ }) => {
//             log.info('Page loaded.');
//             const now = new Date();

//             const tested = parseInt($($($($(".rte table tbody tr")).get(0)).find("td").get(1)).text().replace(',','').replace('.','').match(/\d+/), 10)
//             const infected = parseInt($($($($(".rte table tbody tr")).get(0)).find("td").get(2)).text().replace(',','').replace('.','').match(/\d+/), 10)
//             const recovered = parseInt($($($($(".rte table tbody tr")).get(0)).find("td").get(3)).text().replace(',','').replace('.','').match(/\d+/), 10)
//             const deceased = parseInt($($($($(".rte table tbody tr")).get(0)).find("td").get(4)).text().replace(',','').replace('.','').match(/\d+/), 10)

//             const data = {
//                 tested,
//                 infected,
//                 recovered,
//                 deceased,
//                 sourceUrl,
//                 lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
//                 readMe: 'https://apify.com/tugkan/covid-dk',
//             };

//             // Compare and save to history
//             const latest = await kvStore.getValue(LATEST) || {};
//             delete latest.lastUpdatedAtApify;
//             const actual = Object.assign({}, data);
//             delete actual.lastUpdatedAtApify;

//             await Apify.pushData({...data});

//             if (JSON.stringify(latest) !== JSON.stringify(actual)) {
//                 log.info('Data did change :( storing new to dataset.');
//                 await dataset.pushData(data);
//             }

//             await kvStore.setValue(LATEST, data);
//             log.info('Data stored, finished.');
//         },

//         // This function is called if the page processing failed more than maxRequestRetries+1 times.
//         handleFailedRequestFunction: async ({ request }) => {
//             console.log(`Request ${request.url} failed twice.`);
//         },
//     });

//     // Run the crawler and wait for it to finish.
//     await crawler.run();

//     console.log('Crawler finished.');
// });

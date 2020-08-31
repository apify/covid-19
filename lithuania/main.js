
const Apify = require('apify');
const cheerio = require('cheerio');
const sourceUrl = 'http://sam.lrv.lt/lt/naujienos/koronavirusas';
const { log, requestAsBrowser } = Apify.utils;
const LATEST = 'LATEST';

const toNumber = (str) => parseInt(str.replace(/\D+/g, ''), 10);

Apify.main(async () => {

    const kvStore = await Apify.openKeyValueStore("COVID-19-LITHUANIA");
    const dataset = await Apify.openDataset("COVID-19-LITHUANIA-HISTORY");

    const requestList = await Apify.openRequestList('my-list', [
        { url: sourceUrl },
    ]);

    const basicCrawler = new Apify.BasicCrawler({
        requestList,
        maxRequestRetries: 1,
        requestTimeoutSecs: 60,
        handleRequestFunction: async ({ request }) => {
            const { url } = request;
            log.info(`Processsing ${url}`);

            const response = await requestAsBrowser({ url });

            const $ = cheerio.load(response.body);

            const infected = $('#module_Structure > div.wrapper > div.main_content.clearfix > div:nth-child(3) > div.text > ul > li:nth-child(1) > strong').text();
            const deceased = $('#module_Structure > div.wrapper > div.main_content.clearfix > div:nth-child(3) > div.text > ul:nth-child(5) > li:nth-child(4) > b').text();
            const recovered = $("#module_Structure > div.wrapper > div.main_content.clearfix > div:nth-child(3) > div.text > ul > li:nth-child(6) > strong").text();
            const newInfected = $("#module_Structure > div.wrapper > div.main_content.clearfix > div:nth-child(3) > div.text > ul:nth-child(5) > li:nth-child(3) > b").text();
            const isolated = $('div.text ul').eq(0).find('li').last().find('strong').text();
            const connectedDeaths = $('#module_Structure > div.wrapper > div.main_content.clearfix > div:nth-child(3) > div.text > ul > li:nth-child(5) > strong').text();
            const stillSick = $('#module_Structure > div.wrapper > div.main_content.clearfix > div:nth-child(3) > div.text > ul > li:nth-child(2) > b').text();
            const now = new Date();

            const result = {
                infected: toNumber(infected),
                recovered: toNumber(recovered),
                deceased: toNumber(deceased),
                newInfected: toNumber(newInfected),
                isolated: toNumber(isolated),
                connectedDeaths: toNumber(connectedDeaths),
                stillSick: toNumber(stillSick),
                sourceUrl: 'http://sam.lrv.lt/lt/naujienos/koronavirusas',
                lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
                readMe: 'https://apify.com/dtrungtin/covid-lt'
            };
            console.log(result);

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
        },
        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed many times.`);
            console.dir(request);
        },
    });

    // Run the crawler and wait for it to finish.
    log.info("Starting the crawl.");
    await basicCrawler.run();
    log.info("Actor finished.");
});

// old actor

// const Apify = require('apify');
// const moment = require('moment-timezone');
// const _ = require('lodash');

// const { log } = Apify.utils;
// log.setLevel(log.LEVELS.WARNING);

// const LATEST ='LATEST';

// Apify.main(async () => {
//     const sourceUrl = 'http://sam.lrv.lt/lt/naujienos/koronavirusas';
//     const kvStore = await Apify.openKeyValueStore("COVID-19-LITHUANIA");
//     const dataset = await Apify.openDataset("COVID-19-LITHUANIA-HISTORY");

//     const requestList = new Apify.RequestList({
//         sources: [
//             { url: sourceUrl },
//         ],
//     });
//     await requestList.initialize();

//     const crawler = new Apify.CheerioCrawler({
//         requestList,
//         maxRequestRetries: 1,
//         handlePageTimeoutSecs: 60,

//         handlePageFunction: async ({ request, $ }) => {
//             log.info(`Processing ${request.url}...`);

//             const data = {
//                 country: 'Lithuania',
//                 sourceUrl,
//                 lastUpdatedAtApify: moment().utc().second(0).millisecond(0).toISOString(),
//                 readMe: "https://apify.com/dtrungtin/covid-lt",
//             };
//             const textUls = $('.text > ul');
//             const [confirmed] = $('.text > ul > li:nth-child(1)').text().match(/\d+/);
//             const [t, died] = $('.text > ul > li:nth-child(4)').text().match(/\d+/g);
//             const [tested] = textUls.eq(1).find(' > li:nth-child(2)').text().match(/\d+/);
//             data.confirmedCases = parseInt(confirmed);
//             data.testedCases = parseInt(tested);
//             data.numberOfDeaths = parseInt(died);

//             // Compare and save to history
//             const latest = await kvStore.getValue(LATEST) || {};
//             if (!_.isEqual(_.omit(data, 'lastUpdatedAtApify'), _.omit(latest, 'lastUpdatedAtApify'))) {
//                 await dataset.pushData(data);
//             }

//             await kvStore.setValue(LATEST, data);
//             await Apify.pushData(data);
//         },

//         handleFailedRequestFunction: async ({ request }) => {
//             log.info(`Request ${request.url} failed twice.`);
//         },
//     });

//     await crawler.run();

//     log.info('Crawler finished.');
// });
